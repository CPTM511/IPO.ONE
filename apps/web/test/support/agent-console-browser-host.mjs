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

const csrfToken = "agent_console_browser_qa_csrf_token_00000000001";
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
activeMandate.capabilities = [
  "request_credit",
  "accept_credit_offer",
  "execute_sandbox_credit",
  "route_repayment"
];
const draftMandate = structuredClone(activeMandate);
draftMandate.status = "draft";
draftMandate.utilizedMinor = "0";
delete draftMandate.activatedAt;
let currentMandate = draftMandate;
let runtimeStage = "none";

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

let currentAgentObligation = null;

const evidenceResult = fixtureResult("pilotReadOwnObligationEvidence");
evidenceResult.response.obligationId = agentObligation.obligationId;
evidenceResult.response.asOf = "2026-07-31T05:00:00.000Z";
for (const item of evidenceResult.response.items) {
  item.aggregateId = agentObligation.obligationId;
  item.obligationId = agentObligation.obligationId;
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
    return protocolResult(command.operationId, {
      workspaceKind: "principal_controller",
      resources: [
        {
          resourceType: "subject",
          resourceId: activeMandate.subjectId,
          relationship: "controller"
        },
        {
          resourceType: "mandate",
          resourceId: activeMandate.mandateId,
          relationship: "controller"
        },
        ...(runtimeStage !== "none"
          ? [{
              resourceType: "obligation",
              resourceId: agentObligation.obligationId,
              relationship: "controller"
            }]
          : [])
      ],
      hasMore: false,
      serverTruth: true,
      schemaVersion: "tenant_workspace_resume_view.v1"
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
    return protocolResult(command.operationId, {
      obligation: currentAgentObligation ?? agentObligation,
      asOf: "2026-07-31T05:00:00.000Z",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_owned_obligation_view.v1"
    });
  }
  if (command.operationId === "pilotReadOwnObligationEvidence") {
    return structuredClone(evidenceResult);
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
  capabilities: TENANT_PROTOCOL_CATALOG.operations
    .filter((operation) => operation.actorTypes.includes("human"))
    .map((operation) => operation.requiredCapability),
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
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") return false;
  const body = JSON.stringify({
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: true,
    oidcProviders: [],
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
    runtime: "/local/v1/reference-agent/runtime",
    runtimeStep: "/local/v1/reference-agent/runtime-step"
  }),
  async handle({ url, readJson, sendJson }) {
    if (url.pathname === this.routes.application) {
      return sendJson(200, {
        status: "offer_ready",
        mandateId: activeMandate.mandateId,
        subjectId: activeMandate.subjectId,
        offerReceipt,
        sandboxOnly: true,
        productionFundsMoved: false,
        credentialEnteredBrowser: false,
        schemaVersion: "local_reference_agent_application_result.v1"
      });
    }
    if (url.pathname === this.routes.runtimeStep) {
      const input = await readJson();
      if (input.action === "accept_offer") {
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
        runtimeStage = "evidence_read";
        return sendJson(200, {
          status: "evidence_read",
          mandateId: activeMandate.mandateId,
          subjectId: activeMandate.subjectId,
          obligationId: agentObligation.obligationId,
          evidence: evidenceResult.response,
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
      return sendJson(200, {
        status: "evidence_read",
        mandateId: activeMandate.mandateId,
        subjectId: activeMandate.subjectId,
        obligationId: agentObligation.obligationId,
        evidenceEventCount: evidenceResult.response.items.length,
        lifecycle: {
          schemaVersion: "local_agent_reference_workflow_result.v1",
          status: "evidence_read",
          sandboxOnly: true,
          productionFundsMoved: false,
          workflowReceipt: lifecycleReceipt,
          evidence: evidenceResult.response
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
      return structuredClone(resultFor(command));
    }
  },
  resolveAuthenticationContext: async ({ request }) => {
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
    workspaceNameProvider: async () => "controller"
  })
});

const address = await host.listen();
console.log(`AGENT_CONSOLE_BROWSER_QA_URL=http://${address.host}:${address.port}/#agent-console`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
