import { readFile } from "node:fs/promises";
import {
  TENANT_PROTOCOL_CATALOG
} from "../../../../packages/api-contract/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../../modules/authentication/src/authentication-context.js";
import {
  createTenantHttpServer,
  createTenantWebAssetHandler
} from "../../../tenant-api/src/index.js";
import { DomainError } from "../../../../packages/domain/src/index.js";

const csrfToken = "agent_console_browser_qa_csrf_token_00000000001";
const recoveryScenario =
  process.env.IPO_ONE_BROWSER_QA_AGENT_RECOVERY_SCENARIO ?? "interactive";
let selectionScenario =
  process.env.IPO_ONE_BROWSER_QA_AGENT_SELECTION_SCENARIO ?? "single";
const SELECTION_SCENARIOS = new Set(["single", "empty", "multiple", "has-more"]);
if (!SELECTION_SCENARIOS.has(selectionScenario)) {
  throw new Error("invalid_browser_qa_agent_selection_scenario");
}
const RECOVERY_SCENARIOS = new Set([
  "interactive",
  "active-neither",
  "active-obligation-no-receipt",
  "active-exact-continuation",
  "draft-exact-continuation"
]);
if (!RECOVERY_SCENARIOS.has(recoveryScenario)) {
  throw new Error("invalid_browser_qa_agent_recovery_scenario");
}
const evidenceScenario =
  process.env.IPO_ONE_BROWSER_QA_EVIDENCE_SCENARIO ?? "complete";
const EVIDENCE_SCENARIOS = new Set([
  "complete",
  "partial",
  "fail-after-repayment-once",
  "slow-read"
]);
if (!EVIDENCE_SCENARIOS.has(evidenceScenario)) {
  throw new Error("invalid_browser_qa_evidence_scenario");
}
const EVIDENCE_READ_DELAY_MS = 250;
const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const offerFixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const obligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));

function fixtureResult(operationId) {
  return structuredClone(
    fixtures.validResults.find((result) => result.operationId === operationId)
  );
}

const bindingResult = fixtureResult("pilotReadAgentAccountBinding");
const activationResult = fixtureResult("pilotActivateSandboxMandate");
const activeMandate = structuredClone(activationResult.response.mandate);
const fixtureNow = Date.now();
const continuationExpiresAt = new Date(
  fixtureNow + (60 * 60 * 1_000)
).toISOString();
activeMandate.expiresAt = new Date(
  fixtureNow + (180 * 24 * 60 * 60 * 1_000)
).toISOString();
activeMandate.capabilities = [
  "request_credit",
  "accept_credit_offer",
  "execute_sandbox_credit",
  "route_repayment"
];
const draftMandate = structuredClone(activeMandate);
draftMandate.status = "draft";
draftMandate.utilizedMinor = "0";
delete draftMandate.activationAcknowledgement;
delete draftMandate.activatedAt;
let currentMandate = recoveryScenario.startsWith("active-")
  ? structuredClone(activeMandate)
  : structuredClone(draftMandate);
let runtimeStage = recoveryScenario === "active-obligation-no-receipt"
  ? "created"
  : "none";
let durableContinuationAvailable = new Set([
  "active-exact-continuation",
  "draft-exact-continuation"
]).has(recoveryScenario);
let failNextEvidenceRead = false;

const offerReceipt = structuredClone(offerFixtures.valid[0]);
offerReceipt.subjectId = activeMandate.subjectId;
offerReceipt.mandateId = activeMandate.mandateId;
offerReceipt.creditIntent.subjectId = activeMandate.subjectId;
offerReceipt.creditIntent.authorityType = "mandate";
offerReceipt.creditIntent.authorityId = activeMandate.mandateId;
offerReceipt.decision.subjectId = activeMandate.subjectId;
offerReceipt.decision.authorityType = "mandate";
offerReceipt.decision.authorityId = activeMandate.mandateId;
offerReceipt.offer.subjectId = activeMandate.subjectId;
offerReceipt.offer.approvedPrincipalMinor = "10000";
offerReceipt.offer.validUntil = new Date(
  fixtureNow + (6 * 60 * 60 * 1_000)
).toISOString();
offerReceipt.offer.firstPaymentAt = new Date(
  fixtureNow + (30 * 24 * 60 * 60 * 1_000)
).toISOString();
offerReceipt.offer.maturityAt = new Date(
  fixtureNow + (60 * 24 * 60 * 60 * 1_000)
).toISOString();

const controlledAgentActorId = "actor_agent_console_controlled_qa";
const continuationReceiptId =
  "continuation_receipt_agent_console_browser_qa_0001";
const continuationReceiptHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const supportedBrowserQaOperationIds = new Set([
  "pilotActivateSandboxMandate",
  "pilotReadAgentAccountBinding",
  "pilotReadMandate",
  "pilotReadOwnObligation",
  "pilotReadOwnObligationEvidence",
  "pilotReadWorkspaceResume"
]);
const browserQaOperationAudit = [];
const browserQaReferenceRouteAudit = [];
const browserQaAuthenticationAudit = [];
let browserSessionActive = true;

function exactContinuationReceiptView() {
  return {
    continuationReceiptId,
    receiptHash: continuationReceiptHash,
    subjectId: activeMandate.subjectId,
    mandateId: activeMandate.mandateId,
    creditOfferId: offerReceipt.offer.creditOfferId,
    creditOfferHash: offerReceipt.offer.creditOfferHash,
    offerAggregateVersion: 1,
    expiresAt: continuationExpiresAt,
    receipt: structuredClone(offerReceipt),
    serverTruth: true,
    schemaVersion: "workspace_continuation_receipt_view.v1"
  };
}

const lifecycleReceipt = structuredClone(obligationFixtures.valid[0]);
lifecycleReceipt.subjectId = activeMandate.subjectId;
lifecycleReceipt.mandateId = activeMandate.mandateId;
lifecycleReceipt.creditIntentId = offerReceipt.creditIntent.creditIntentId;
lifecycleReceipt.creditOfferId = offerReceipt.offer.creditOfferId;
const agentObligation = lifecycleReceipt.obligation;
agentObligation.subjectId = activeMandate.subjectId;
agentObligation.principalId = activeMandate.principalId;
agentObligation.authorityId = activeMandate.mandateId;
agentObligation.creditIntentId = offerReceipt.creditIntent.creditIntentId;
agentObligation.riskDecisionId = offerReceipt.decision.riskDecisionId;
agentObligation.creditOfferId = offerReceipt.offer.creditOfferId;
agentObligation.originalPrincipalMinor = "10000";
agentObligation.outstandingPrincipalMinor = "0";
agentObligation.totalRepaidMinor = "10000";
agentObligation.status = "fully_repaid";
agentObligation.oldestUnpaidInstallmentId = null;
for (const installment of agentObligation.installments) {
  installment.scheduledPrincipalMinor = "5000";
  installment.paidPrincipalMinor = installment.scheduledPrincipalMinor;
  installment.status = "paid";
}
lifecycleReceipt.repayment.appliedMinor = "10000";
lifecycleReceipt.repayment.requestedMinor = "10000";
lifecycleReceipt.repayment.appliedPrincipalMinor = "10000";
lifecycleReceipt.repayment.remainingPrincipalMinor = "0";
lifecycleReceipt.executionReceipt.amountMinor = "10000";

function agentObligationAt(stage) {
  const obligation = structuredClone(agentObligation);
  if (stage === "created") {
    obligation.executionStatus = "pending";
    obligation.status = "created";
    obligation.outstandingPrincipalMinor = "10000";
    obligation.totalRepaidMinor = "0";
    for (const key of [
      "sandboxExecutionReceiptId",
      "executedAt",
      "lastAccruedAt",
      "interestAccrualRemainder",
      "withdrawable"
    ]) delete obligation[key];
  } else if (stage === "executed") {
    obligation.executionStatus = "executed";
    obligation.status = "active";
    obligation.outstandingPrincipalMinor = "10000";
    obligation.totalRepaidMinor = "0";
  }
  if (stage !== "fully_repaid") {
    obligation.oldestUnpaidInstallmentId = obligation.installments[0].installmentId;
    for (const installment of obligation.installments) {
      installment.paidPrincipalMinor = "0";
      installment.status = "scheduled";
    }
  }
  return obligation;
}

let currentAgentObligation = runtimeStage === "created"
  ? agentObligationAt(runtimeStage)
  : null;

function agentObligationEvidence() {
  if (!currentAgentObligation) {
    throw new DomainError(
      "tenant_resource_unavailable",
      "The requested resource is not available."
    );
  }
  const obligationId = currentAgentObligation.obligationId;
  const acceptedAt = lifecycleReceipt.acceptance.acceptedAt;
  const events = [
    {
      eventType: "credit_offer_accepted",
      aggregateType: "credit_offer",
      aggregateId: lifecycleReceipt.acceptance.creditOfferId,
      aggregateVersion: 1,
      occurredAt: acceptedAt
    },
    {
      eventType: "obligation_created",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 1,
      occurredAt: new Date(new Date(acceptedAt).getTime() + 100).toISOString()
    }
  ];
  if (currentAgentObligation.executionStatus === "executed") {
    events.push({
      eventType: "obligation_sandbox_executed",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 2,
      occurredAt:
        currentAgentObligation.executedAt ?? "2026-07-16T12:02:00.000Z"
    });
  }
  if (BigInt(currentAgentObligation.totalRepaidMinor ?? "0") > 0n) {
    events.push({
      eventType: "repayment_posted",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 3,
      occurredAt: lifecycleReceipt.repayment.occurredAt
    });
  }
  const items = events.map((event, index) => ({
    evidenceId: `event_agent_browser_qa_${event.eventType}`,
    evidenceHash: `0x${(index + 1).toString(16).repeat(64)}`,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    obligationId,
    sourceFinality: "finalized",
    payloadHash: `0x${(index + 9).toString(16).repeat(64)}`,
    occurredAt: event.occurredAt,
    recordedAt: new Date(
      new Date(event.occurredAt).getTime() + 100
    ).toISOString(),
    schemaVersion: "obligation_evidence_summary.v1"
  }));
  return {
    obligationId,
    asOf: new Date(
      Math.max(
        new Date("2026-07-31T05:00:00.000Z").getTime(),
        new Date(items.at(-1).recordedAt).getTime() + 1_000
      )
    ).toISOString(),
    items,
    hasMore: false,
    schemaVersion: "tenant_owned_obligation_evidence_view.v1"
  };
}

function evidenceCursor(item) {
  return Buffer.from(
    JSON.stringify([item.recordedAt, item.evidenceId]),
    "utf8"
  ).toString("base64url");
}

function evidenceCursorIndex(items, cursor) {
  if (cursor === undefined) return 0;
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    decoded = null;
  }
  if (!Array.isArray(decoded) || decoded.length !== 2) {
    throw new DomainError(
      "tenant_resource_unavailable",
      "The requested resource is not available."
    );
  }
  const index = items.findIndex((item) =>
    item.recordedAt === decoded[0] && item.evidenceId === decoded[1]
  );
  if (index < 0) {
    throw new DomainError(
      "tenant_resource_unavailable",
      "The requested resource is not available."
    );
  }
  return index + 1;
}

function pagedAgentObligationEvidence({ cursor, limit = 25 } = {}) {
  const complete = agentObligationEvidence();
  const start = evidenceCursorIndex(complete.items, cursor);
  const pageLimit = evidenceScenario === "partial"
    ? Math.min(limit, 2)
    : limit;
  const items = complete.items.slice(start, start + pageLimit);
  const hasMore = start + items.length < complete.items.length;
  return {
    ...complete,
    items,
    hasMore,
    ...(hasMore && items.length > 0
      ? { nextCursor: evidenceCursor(items.at(-1)) }
      : {})
  };
}

function readAgentObligationEvidence(payload) {
  if (failNextEvidenceRead) {
    failNextEvidenceRead = false;
    throw new Error("browser_qa_evidence_read_failed_once");
  }
  return pagedAgentObligationEvidence(payload);
}

function protocolResult(operationId, response) {
  return {
    operationId,
    replayed: false,
    response,
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function resultFor(command) {
  if (command.operationId === "pilotReadWorkspaceResume") {
    const selectionResources = selectionScenario === "empty"
      ? []
      : [
          {
            resourceType: "subject",
            resourceId: activeMandate.subjectId,
            relationship: "controller"
          },
          {
            resourceType: "mandate",
            resourceId: activeMandate.mandateId,
            relationship: "controller"
          }
        ];
    return protocolResult(command.operationId, {
      workspaceKind: "principal_controller",
      resources: [
        ...selectionResources,
        ...(currentAgentObligation
          ? [{
              resourceType: "obligation",
              resourceId: currentAgentObligation.obligationId,
              relationship: "controller"
            }]
          : [])
      ],
      controlledAgentActorIds: selectionScenario === "empty"
        ? []
        : selectionScenario === "multiple"
          ? [controlledAgentActorId, "actor_agent_console_secondary_qa"]
          : [controlledAgentActorId],
      continuationReceipts: durableContinuationAvailable
        ? [exactContinuationReceiptView()]
        : [],
      hasMore: selectionScenario === "has-more",
      serverTruth: true,
      schemaVersion: "tenant_workspace_resume_view.v2"
    });
  }
  if (command.operationId === "pilotReadAgentAccountBinding") {
    return structuredClone(bindingResult);
  }
  if (command.operationId === "pilotReadMandate") {
    return protocolResult(command.operationId, {
      mandate: currentMandate,
      schemaVersion: "tenant_mandate_view.v1"
    });
  }
  if (command.operationId === "pilotActivateSandboxMandate") {
    currentMandate = structuredClone(activeMandate);
    return protocolResult(command.operationId, {
      mandate: currentMandate,
      activationEvidenceHash: activationResult.response.activationEvidenceHash,
      schemaVersion: "tenant_sandbox_mandate_activated.v1"
    });
  }
  if (command.operationId === "pilotReadOwnObligation") {
    if (
      !currentAgentObligation ||
      command.resource?.resourceId !== currentAgentObligation.obligationId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    return protocolResult(command.operationId, {
      obligation: currentAgentObligation,
      asOf: "2026-07-31T05:00:00.000Z",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_owned_obligation_view.v1"
    });
  }
  if (command.operationId === "pilotReadOwnObligationEvidence") {
    if (
      !currentAgentObligation ||
      command.resource?.resourceId !== currentAgentObligation.obligationId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    return protocolResult(
      command.operationId,
      readAgentObligationEvidence(command.payload)
    );
  }
  throw new Error(`unsupported_agent_console_qa_operation:${command.operationId}`);
}

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_agent_console_browser_qa",
  actorId: "actor_agent_console_founder_qa",
  actorType: ActorType.HUMAN,
  clientId: "client_agent_console_browser_qa",
  credentialId: "credential_agent_console_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: [...new Set(
    TENANT_PROTOCOL_CATALOG.operations
      .filter((operation) => supportedBrowserQaOperationIds.has(operation.operationId))
      .map((operation) => operation.requiredCapability)
  )],
  roles: ["principal_controller"],
  tokenJtiHash: "token_jti_hash_agent_console_browser_qa_0000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: "2026-07-24T13:46:27.622Z",
  authTime: "2026-07-24T13:46:27.622Z",
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

async function serveAuthentication({ request, response, url, requestId }) {
  if (request.method === "GET" && url.pathname === "/__qa__/selection-scenario") {
    const nextScenario = url.searchParams.get("value") ?? "";
    if (!SELECTION_SCENARIOS.has(nextScenario)) {
      throw new DomainError("invalid_tenant_command_payload", "QA selection scenario is invalid.");
    }
    selectionScenario = nextScenario;
    const body = JSON.stringify({
      selectionScenario,
      schemaVersion: "agent_console_browser_qa_selection_scenario.v1"
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end(body);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__qa__/operation-audit") {
    const operationIds = browserQaOperationAudit.map((entry) => entry.operationId);
    const body = JSON.stringify({
      selectionScenario,
      operationIds,
      readCount: operationIds.filter((operationId) => operationId.startsWith("pilotRead")).length,
      mutationCount: operationIds.filter((operationId) => !operationId.startsWith("pilotRead")).length,
      referenceAgentRequests: structuredClone(browserQaReferenceRouteAudit),
      authenticationRequests: structuredClone(browserQaAuthenticationAudit),
      sessionActive: browserSessionActive,
      schemaVersion: "agent_console_browser_qa_operation_audit.v1"
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end(body);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/auth/v1/logout") {
    if (
      request.headers["x-csrf-token"] !== csrfToken ||
      typeof request.headers["idempotency-key"] !== "string"
    ) {
      throw new DomainError(
        "authentication_rejected",
        "The browser QA logout boundary rejected the request."
      );
    }
    browserSessionActive = false;
    browserQaAuthenticationAudit.push({
      event: "logout_complete",
      method: request.method,
      pathname: url.pathname,
      sessionActive: browserSessionActive
    });
    const body = JSON.stringify({
      schemaVersion: "ipo_one_logout_result.v1",
      status: "logged_out"
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "set-cookie": [
        "__Host-ipo_one_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
        "__Host-ipo_one_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0"
      ],
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end(body);
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/auth/v1/login" &&
    url.searchParams.size === 1 &&
    url.searchParams.get("provider") === "google"
  ) {
    browserQaAuthenticationAudit.push({
      event: "oidc_login_started",
      method: request.method,
      pathname: url.pathname,
      sessionActive: browserSessionActive
    });
    response.writeHead(303, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      location: "/__qa__/oidc-complete",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end();
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/__qa__/oidc-complete" &&
    url.search === ""
  ) {
    browserSessionActive = true;
    browserQaAuthenticationAudit.push({
      event: "oidc_login_completed",
      method: request.method,
      pathname: url.pathname,
      sessionActive: browserSessionActive
    });
    response.writeHead(303, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      location: "/#request-credit",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end();
    return true;
  }
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") return false;
  const body = JSON.stringify({
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "local_no_funds",
    enabled: true,
    sessionActive: browserSessionActive,
    sessionAuthenticationMethod: browserSessionActive ? "oidc_pkce_bff" : null,
    oidcProviders: ["google"],
    walletAuthentication: false,
    supportedChains: ["eip155:84532", "eip155:1952"],
    boundary: "Authentication proves presence; internal policy and Mandates separately decide authority."
  });
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
  return true;
}

const serveReferenceAgent = Object.freeze({
  routes: Object.freeze({
    application: "/local/v1/reference-agent/application",
    continuation: "/local/v1/reference-agent/continuation",
    runtime: "/local/v1/reference-agent/runtime",
    runtimeStep: "/local/v1/reference-agent/runtime-step"
  }),
  async handle({ url, readJson, sendJson }) {
    browserQaReferenceRouteAudit.push({
      method: "authenticated_reference_route",
      pathname: url.pathname
    });
    if (url.pathname === this.routes.continuation) {
      if (!durableContinuationAvailable) {
        throw new DomainError(
          "workspace_continuation_unavailable",
          "No current server continuation receipt is available."
        );
      }
      return sendJson(200, {
        status: "offer_ready",
        mandateId: activeMandate.mandateId,
        subjectId: activeMandate.subjectId,
        continuationReceiptId,
        receiptHash: continuationReceiptHash,
        expiresAt: continuationExpiresAt,
        offerReceipt,
        serverTruth: true,
        sandboxOnly: true,
        productionFundsMoved: false,
        credentialEnteredBrowser: false,
        schemaVersion: "local_reference_agent_continuation_result.v1"
      });
    }
    if (url.pathname === this.routes.application) {
      durableContinuationAvailable = true;
      return sendJson(200, {
        status: "offer_ready",
        mandateId: activeMandate.mandateId,
        subjectId: activeMandate.subjectId,
        offerReceipt,
        continuationReceiptId,
        receiptHash: continuationReceiptHash,
        expiresAt: continuationExpiresAt,
        serverTruth: true,
        sandboxOnly: true,
        productionFundsMoved: false,
        credentialEnteredBrowser: false,
        schemaVersion: "local_reference_agent_application_result.v1"
      });
    }
    if (url.pathname === this.routes.runtimeStep) {
      const input = await readJson();
      if (input.action === "accept_offer") {
        durableContinuationAvailable = false;
        runtimeStage = "created";
        currentAgentObligation = agentObligationAt(runtimeStage);
        return sendJson(200, {
          status: "obligation_created",
          mandateId: activeMandate.mandateId,
          subjectId: activeMandate.subjectId,
          acceptance: lifecycleReceipt.acceptance,
          obligation: currentAgentObligation,
          receipt: {
            operationId: "pilotAcceptCreditOffer",
            requestId: "request-agent-console-browser-accept-01",
            replayed: false,
            responseSchemaVersion: "tenant_credit_offer_accepted.v1"
          },
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          credentialEnteredBrowser: false,
          schemaVersion: "local_reference_agent_runtime_step_result.v1"
        });
      }
      if (input.action === "execute_allowed_use") {
        runtimeStage = "executed";
        currentAgentObligation = agentObligationAt(runtimeStage);
        return sendJson(200, {
          status: "approved_use_executed",
          mandateId: activeMandate.mandateId,
          subjectId: activeMandate.subjectId,
          obligation: currentAgentObligation,
          executionReceipt: lifecycleReceipt.executionReceipt,
          principalLedgerTransactionId:
            lifecycleReceipt.principalLedgerTransactionId,
          receipt: {
            operationId: "pilotExecuteSandboxObligation",
            requestId: "request-agent-console-browser-execute-02",
            replayed: false,
            responseSchemaVersion: "tenant_sandbox_obligation_executed.v1"
          },
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          credentialEnteredBrowser: false,
          schemaVersion: "local_reference_agent_runtime_step_result.v1"
        });
      }
      if (input.action === "post_repayment") {
        runtimeStage = "fully_repaid";
        currentAgentObligation = agentObligationAt(runtimeStage);
        if (evidenceScenario === "fail-after-repayment-once") {
          failNextEvidenceRead = true;
        }
        return sendJson(200, {
          status: "repayment_posted",
          mandateId: activeMandate.mandateId,
          subjectId: activeMandate.subjectId,
          obligation: currentAgentObligation,
          repayment: lifecycleReceipt.repayment,
          receipt: {
            operationId: "pilotPostSandboxRepayment",
            requestId: "request-agent-console-browser-repay-03",
            replayed: false,
            responseSchemaVersion: "tenant_sandbox_repayment_posted.v1"
          },
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          credentialEnteredBrowser: false,
          schemaVersion: "local_reference_agent_runtime_step_result.v1"
        });
      }
      if (input.action === "read_evidence") {
        if (
          input.mandateId !== activeMandate.mandateId ||
          !currentAgentObligation ||
          input.obligationId !== currentAgentObligation.obligationId
        ) {
          throw new DomainError(
            "tenant_resource_unavailable",
            "The requested resource is not available."
          );
        }
        if (evidenceScenario === "slow-read") {
          await new Promise((resolve) =>
            setTimeout(resolve, EVIDENCE_READ_DELAY_MS)
          );
        }
        const evidence = readAgentObligationEvidence({ limit: 50 });
        runtimeStage = "evidence_read";
        return sendJson(200, {
          status: "evidence_read",
          mandateId: activeMandate.mandateId,
          subjectId: activeMandate.subjectId,
          obligationId: currentAgentObligation.obligationId,
          evidence,
          sandboxOnly: true,
          productionFundsMoved: false,
          withdrawable: false,
          credentialEnteredBrowser: false,
          schemaVersion: "local_reference_agent_runtime_step_result.v1"
        });
      }
      throw new Error("unsupported_agent_console_runtime_step");
    }
    if (url.pathname === this.routes.runtime) {
      runtimeStage = "evidence_read";
      currentAgentObligation = agentObligationAt("fully_repaid");
      const evidence = pagedAgentObligationEvidence({ limit: 50 });
      return sendJson(200, {
        status: "evidence_read",
        mandateId: activeMandate.mandateId,
        subjectId: activeMandate.subjectId,
        obligationId: currentAgentObligation.obligationId,
        evidenceEventCount: evidence.items.length,
        lifecycle: {
          schemaVersion: "local_agent_reference_workflow_result.v1",
          status: "evidence_read",
          sandboxOnly: true,
          productionFundsMoved: false,
          workflowReceipt: lifecycleReceipt,
          evidence
        },
        sandboxOnly: true,
        productionFundsMoved: false,
        credentialEnteredBrowser: false,
        schemaVersion: "local_reference_agent_runtime_result.v1"
      });
    }
    return false;
  }
});

const host = createTenantHttpServer({
  environment: "development",
  credentialSource: "local_test",
  gateway: {
    async execute(command) {
      browserQaOperationAudit.push({ operationId: command.operationId });
      if (
        evidenceScenario === "slow-read" &&
        command.operationId === "pilotReadOwnObligationEvidence"
      ) {
        await new Promise((resolve) => setTimeout(resolve, EVIDENCE_READ_DELAY_MS));
      }
      return structuredClone(resultFor(command));
    }
  },
  resolveAuthenticationContext: async ({ request }) => {
    if (!browserSessionActive) {
      throw new DomainError(
        "authentication_rejected",
        "The browser QA Principal session is signed out."
      );
    }
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_agent_console_qa_csrf");
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "agent_console_browser_qa" }),
  serveAuthentication,
  serveReferenceAgent,
  serveWebAsset: createTenantWebAssetHandler({
    csrfTokenProvider: async () => csrfToken,
    localAgentAccountProvider: async () =>
      "0x1111111111111111111111111111111111111111",
    workspaceNameProvider: async () => "controller"
  })
});

const address = await host.listen();
console.log(`AGENT_CONSOLE_BROWSER_QA_URL=http://${address.host}:${address.port}/#agent-console`);
console.log(`AGENT_CONSOLE_BROWSER_QA_RECOVERY_SCENARIO=${recoveryScenario}`);
console.log(`AGENT_CONSOLE_BROWSER_QA_SELECTION_SCENARIO=${selectionScenario}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
