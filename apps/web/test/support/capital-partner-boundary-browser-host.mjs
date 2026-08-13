import { TENANT_PROTOCOL_CATALOG } from "../../../../packages/api-contract/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../../modules/authentication/src/authentication-context.js";
import { DomainError } from "../../../../packages/domain/src/index.js";
import {
  createTenantHttpServer,
  createTenantWebAssetHandler
} from "../../../tenant-api/src/index.js";

const csrfToken = "capital_partner_browser_qa_csrf_token_000000001";
const profileId = "capital_partner_browser_qa";
const tenantId = "tenant_capital_partner_browser_qa";
const actorId = "actor_capital_partner_browser_qa";
const WORKSPACE_SCENARIOS = new Set([
  "single",
  "empty",
  "multiple",
  "denied",
  "stale"
]);
const CATALOG_SCENARIOS = new Map([
  ["complete", null],
  ["missing-self", "pilotReadCapitalPartnerSelf"],
  ["missing-inbox", "pilotReadCapitalPartnerPassportInbox"],
  ["missing-portfolio", "pilotReadCapitalPartnerPortfolio"],
  ["missing-facility", "pilotReadCapitalPartnerFacility"]
]);
const DELAYABLE_OPERATIONS = new Set([
  "pilotReadCapitalPartnerSelf",
  "pilotReadCapitalPartnerPassportInbox",
  "pilotReadCapitalPartnerPortfolio"
]);

let workspaceScenario =
  process.env.IPO_ONE_BROWSER_QA_CAPITAL_PARTNER_SCENARIO ?? "single";
let catalogScenario =
  process.env.IPO_ONE_BROWSER_QA_CAPITAL_PARTNER_CATALOG_SCENARIO ?? "complete";
if (!WORKSPACE_SCENARIOS.has(workspaceScenario)) {
  throw new Error("invalid_browser_qa_capital_partner_workspace_scenario");
}
if (!CATALOG_SCENARIOS.has(catalogScenario)) {
  throw new Error("invalid_browser_qa_capital_partner_catalog_scenario");
}

let browserSessionActive = true;
let operationDelay = null;
let syntheticOfferStatus = "none";
const operationAudit = [];
const authenticationAudit = [];
const scenarioAudit = [];
const catalogAudit = [];
const catalogScenarioAudit = [];
const operationDelayAudit = [];

const applications = Object.freeze({
  first: Object.freeze({
    resource: Object.freeze({
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_browser_qa_alpha"
    }),
    reviewContext: Object.freeze({
      creditIntentId: "credit_intent_browser_qa_alpha",
      artifactHash: `0x${"a".repeat(64)}`,
      artifactVersion: 1
    }),
    summary: Object.freeze({
      claimCount: 4,
      purpose: "private_credit_review",
      issuedAt: "2026-08-12T10:00:00.000Z",
      expiresAt: "2026-08-30T10:00:00.000Z"
    })
  }),
  second: Object.freeze({
    resource: Object.freeze({
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_browser_qa_bravo"
    }),
    reviewContext: Object.freeze({
      creditIntentId: "credit_intent_browser_qa_bravo",
      artifactHash: `0x${"b".repeat(64)}`,
      artifactVersion: 1
    }),
    summary: Object.freeze({
      claimCount: 3,
      purpose: "private_credit_review",
      issuedAt: "2026-08-11T09:00:00.000Z",
      expiresAt: "2026-08-29T09:00:00.000Z"
    })
  }),
  stale: Object.freeze({
    resource: Object.freeze({
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_browser_qa_alpha"
    }),
    reviewContext: Object.freeze({
      creditIntentId: "credit_intent_browser_qa_alpha",
      artifactHash: `0x${"c".repeat(64)}`,
      artifactVersion: 2
    }),
    summary: Object.freeze({
      claimCount: 4,
      purpose: "private_credit_review",
      issuedAt: "2026-08-13T10:00:00.000Z",
      expiresAt: "2026-08-30T10:00:00.000Z"
    })
  })
});

function sendJson(response, requestId, value, { status = 200 } = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    "x-request-id": requestId
  });
  response.end(body);
}

function protocolResult(operationId, response) {
  return {
    operationId,
    replayed: false,
    response: structuredClone(response),
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function selfView() {
  return {
    resource: { resourceType: "capital_partner_profile", resourceId: profileId },
    profile: {
      capitalPartnerId: profileId,
      displayName: "Northstar Synthetic Capital"
    },
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_self_view.v1"
  };
}

function inboxView() {
  const items = workspaceScenario === "empty"
    ? []
    : workspaceScenario === "multiple"
      ? [applications.first, applications.second]
      : workspaceScenario === "stale"
        ? [applications.stale]
        : [applications.first];
  return {
    items: structuredClone(items),
    count: items.length,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  };
}

function syntheticOfferView() {
  const withdrawn = syntheticOfferStatus === "withdrawn";
  return {
    creditOfferId: "capital_partner_offer_browser_qa_alpha",
    creditOfferHash: `0x${"1".repeat(64)}`,
    termsHash: `0x${"2".repeat(64)}`,
    creditIntentId: applications.first.reviewContext.creditIntentId,
    subjectId: "subject_capital_partner_browser_qa_alpha",
    riskDecisionId: "risk_decision_capital_partner_browser_qa_alpha",
    capitalPartnerId: profileId,
    capitalPartnerOperatorId: actorId,
    creditPassportArtifactId: applications.first.resource.resourceId,
    creditPassportArtifactHash: applications.first.reviewContext.artifactHash,
    creditPassportArtifactVersion: applications.first.reviewContext.artifactVersion,
    passportVerificationHash: `0x${"3".repeat(64)}`,
    underwritingSnapshotHash: `0x${"4".repeat(64)}`,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    facilityLimitMinor: "10000",
    approvedPrincipalMinor: "10000",
    perDrawCapMinor: "10000",
    annualRateBps: 1200,
    originationFeeMinor: "0",
    repaymentFrequency: "monthly",
    installmentCount: 2,
    firstPaymentAt: "2026-09-12T11:00:00.000Z",
    maturityAt: "2026-10-12T11:00:00.000Z",
    permittedPurposeCode: "working_capital",
    conditions: [
      "passport_current_at_acceptance",
      "authority_current_at_acceptance",
      "no_adverse_obligation_at_acceptance"
    ],
    undrawnRevocationRule: "capital_partner_before_acceptance",
    disclosureRef: "terms:capital-partner:browser-qa",
    termsVersion: "credit_terms.v2",
    validUntil: "2026-08-30T10:00:00.000Z",
    reasonCodes: ["capital_partner_underwritten"],
    sandboxOnly: true,
    productionFundsApproved: false,
    status: withdrawn ? "withdrawn" : "offered",
    ...(withdrawn ? { closedAt: "2026-08-13T11:05:00.000Z" } : {}),
    createdAt: "2026-08-13T11:00:00.000Z",
    updatedAt: withdrawn
      ? "2026-08-13T11:05:00.000Z"
      : "2026-08-13T11:00:00.000Z",
    schemaVersion: "credit_offer.v2"
  };
}

function portfolioView() {
  const timestamp = "2026-08-13T11:00:00.000Z";
  return {
    profile: {
      capitalPartnerId: profileId,
      organizationRef: "urn:ipo.one:synthetic-capital-partner:northstar",
      displayName: "Northstar Synthetic Capital",
      operatorActorId: actorId,
      tenantId,
      status: "active",
      invitationOnly: true,
      sameTenantOnly: true,
      sandboxOnly: true,
      productionFundsAuthority: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: timestamp,
      profileHash: `0x${"d".repeat(64)}`,
      schemaVersion: "capital_partner_profile.v1"
    },
    portfolio: {
      capitalPartnerId: profileId,
      authoredOfferCount: syntheticOfferStatus === "none" ? 0 : 1,
      activeOfferCount: syntheticOfferStatus === "offered" ? 1 : 0,
      activeFacilityCount: 0,
      completedFacilityCount: 0,
      committedMinor: "0",
      availableMinor: "0",
      utilizedMinor: "0",
      outstandingMinor: "0",
      repaidMinor: "0",
      overdueMinor: "0",
      writtenOffMinor: "0",
      offers: syntheticOfferStatus === "none" ? [] : [(({
        creditOfferId,
        creditIntentId,
        creditPassportArtifactId,
        subjectId,
        assetId,
        facilityLimitMinor,
        approvedPrincipalMinor,
        status,
        validUntil,
        updatedAt
      }) => ({
        creditOfferId,
        creditIntentId,
        creditPassportArtifactId,
        subjectId,
        assetId,
        facilityLimitMinor,
        approvedPrincipalMinor,
        status,
        validUntil,
        updatedAt
      }))(syntheticOfferView())],
      facilities: [],
      asOf: timestamp,
      sandboxOnly: true,
      productionFundsMoved: false,
      portfolioHash: `0x${"e".repeat(64)}`,
      schemaVersion: "capital_partner_portfolio.v1"
    },
    schemaVersion: "tenant_capital_partner_portfolio_view.v1"
  };
}

function resultFor(command) {
  if (workspaceScenario === "denied") {
    throw new DomainError(
      "authorization_denied",
      "The requested Capital Partner workspace is unavailable or access is denied."
    );
  }
  if (command.operationId === "pilotReadCapitalPartnerSelf") {
    return protocolResult(command.operationId, selfView());
  }
  if (command.operationId === "pilotReadCapitalPartnerPassportInbox") {
    return protocolResult(command.operationId, inboxView());
  }
  if (command.operationId === "pilotReadCapitalPartnerPortfolio") {
    if (
      command.resource?.resourceType !== "capital_partner_profile" ||
      command.resource.resourceId !== profileId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested Capital Partner resource is unavailable or access is denied."
      );
    }
    return protocolResult(command.operationId, portfolioView());
  }
  if (command.operationId === "pilotAuthorCapitalPartnerOffer") {
    if (
      workspaceScenario !== "single" ||
      command.resource?.resourceType !== "credit_passport_artifact" ||
      command.resource.resourceId !== applications.first.resource.resourceId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested Capital Partner application is unavailable or access is denied."
      );
    }
    syntheticOfferStatus = "offered";
    return protocolResult(command.operationId, {
      offer: syntheticOfferView(),
      capitalPartner: {
        capitalPartnerId: profileId,
        displayName: "Northstar Synthetic Capital"
      },
      fundsAuthority: false,
      schemaVersion: "tenant_capital_partner_offer_authored.v1"
    });
  }
  if (command.operationId === "pilotTransitionCapitalPartnerOffer") {
    if (
      command.resource?.resourceType !== "credit_offer" ||
      command.resource.resourceId !== "capital_partner_offer_browser_qa_alpha" ||
      syntheticOfferStatus !== "offered"
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested Capital Partner Offer is unavailable or access is denied."
      );
    }
    const previousStatus = syntheticOfferStatus;
    syntheticOfferStatus = "withdrawn";
    return protocolResult(command.operationId, {
      offer: syntheticOfferView(),
      schemaVersion: "tenant_capital_partner_offer_transitioned.v1"
    });
  }
  throw new DomainError(
    "authorization_denied",
    "The browser QA fixture exposes no authority for this operation."
  );
}

async function serveAuthentication({ request, response, url, requestId }) {
  if (
    request.method === "GET" &&
    url.pathname === "/__qa__/capital-partner-workspace-scenario"
  ) {
    const nextScenario = url.searchParams.get("value") ?? "";
    if (!WORKSPACE_SCENARIOS.has(nextScenario)) {
      throw new DomainError(
        "invalid_tenant_command_payload",
        "QA Capital Partner workspace scenario is invalid."
      );
    }
    const previousScenario = workspaceScenario;
    workspaceScenario = nextScenario;
    scenarioAudit.push({ from: previousScenario, to: nextScenario });
    sendJson(response, requestId, {
      workspaceScenario,
      schemaVersion: "capital_partner_browser_qa_workspace_scenario.v1"
    });
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/__qa__/capital-partner-catalog-scenario"
  ) {
    const nextScenario = url.searchParams.get("value") ?? "";
    if (!CATALOG_SCENARIOS.has(nextScenario)) {
      throw new DomainError(
        "invalid_tenant_command_payload",
        "QA Capital Partner catalog scenario is invalid."
      );
    }
    const previousScenario = catalogScenario;
    catalogScenario = nextScenario;
    catalogScenarioAudit.push({ from: previousScenario, to: nextScenario });
    sendJson(response, requestId, {
      catalogScenario,
      missingOperationId: CATALOG_SCENARIOS.get(catalogScenario),
      schemaVersion: "capital_partner_browser_qa_catalog_scenario.v1"
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__qa__/operation-delay") {
    const operationId = url.searchParams.get("operationId") ?? "";
    const milliseconds = Number(url.searchParams.get("milliseconds"));
    if (
      !DELAYABLE_OPERATIONS.has(operationId) ||
      !Number.isSafeInteger(milliseconds) ||
      milliseconds < 100 ||
      milliseconds > 3_000
    ) {
      throw new DomainError(
        "invalid_tenant_command_payload",
        "QA delay must name an allowed read and be between 100 and 3000 milliseconds."
      );
    }
    operationDelay = { operationId, milliseconds };
    operationDelayAudit.push({ event: "configured", operationId, milliseconds });
    sendJson(response, requestId, {
      operationDelay: structuredClone(operationDelay),
      oneShot: true,
      schemaVersion: "capital_partner_browser_qa_operation_delay.v1"
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__qa__/reset-audit") {
    operationAudit.length = 0;
    authenticationAudit.length = 0;
    scenarioAudit.length = 0;
    catalogAudit.length = 0;
    catalogScenarioAudit.length = 0;
    operationDelayAudit.length = 0;
    operationDelay = null;
    syntheticOfferStatus = "none";
    sendJson(response, requestId, {
      reset: true,
      schemaVersion: "capital_partner_browser_qa_audit_reset.v1"
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__qa__/operation-audit") {
    const operationIds = operationAudit.map(({ operationId }) => operationId);
    const readCount = operationAudit.filter(({ kind }) => kind === "query").length;
    const mutationCount = operationAudit.filter(({ kind }) => kind !== "query").length;
    sendJson(response, requestId, {
      workspaceScenario,
      catalogScenario,
      operationIds,
      readCount,
      mutationCount,
      operations: structuredClone(operationAudit),
      scenarioTransitions: structuredClone(scenarioAudit),
      catalogRequests: structuredClone(catalogAudit),
      catalogScenarioTransitions: structuredClone(catalogScenarioAudit),
      operationDelay: operationDelay ? structuredClone(operationDelay) : null,
      operationDelayEvents: structuredClone(operationDelayAudit),
      authenticationRequests: structuredClone(authenticationAudit),
      sessionActive: browserSessionActive,
      realFundsEnabled: false,
      schemaVersion: "capital_partner_browser_qa_operation_audit.v1"
    });
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/tenant/v1/catalog" &&
    url.search === ""
  ) {
    if (!browserSessionActive) {
      throw new DomainError(
        "authentication_rejected",
        "The browser QA Capital Partner session is signed out."
      );
    }
    const missingOperationId = CATALOG_SCENARIOS.get(catalogScenario);
    const operations = TENANT_PROTOCOL_CATALOG.operations.filter(
      (operation) => operation.operationId !== missingOperationId
    );
    catalogAudit.push({
      scenario: catalogScenario,
      missingOperationId,
      operationCount: operations.length
    });
    sendJson(response, requestId, { ...TENANT_PROTOCOL_CATALOG, operations });
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
    authenticationAudit.push({ event: "logout_complete", sessionActive: false });
    sendJson(response, requestId, {
      schemaVersion: "ipo_one_logout_result.v1",
      status: "logged_out"
    });
    return true;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/auth/v1/login" &&
    url.searchParams.size === 1 &&
    url.searchParams.get("provider") === "google"
  ) {
    authenticationAudit.push({ event: "oidc_login_started", sessionActive: false });
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
    authenticationAudit.push({ event: "oidc_login_completed", sessionActive: true });
    response.writeHead(303, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      location: "/#capital-partners",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId
    });
    response.end();
    return true;
  }
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") {
    return false;
  }
  const body = {
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: browserSessionActive,
    sessionAuthenticationMethod: browserSessionActive ? "oidc_pkce_bff" : null,
    oidcProviders: ["google"],
    walletAuthentication: false,
    supportedChains: ["eip155:84532", "eip155:1952"],
    boundary:
      "Authentication proves invited Capital Partner presence; pricing, funds, custody, withdrawal, and lifecycle mutation authority remain separate."
  };
  sendJson(response, requestId, body);
  return true;
}

const authenticationTime = new Date().toISOString();
const authenticationContext = createAuthenticationContext({
  tenantId,
  actorId,
  actorType: ActorType.HUMAN,
  clientId: "client_capital_partner_browser_qa",
  credentialId: "credential_capital_partner_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: [
    "capital_partner.offer.create.own",
    "capital_partner.offer.manage.own",
    "capital_partner.portfolio.read.own",
    "capital_partner.facility.read.own"
  ],
  roles: ["capital_partner_operator"],
  tokenJtiHash: "token_jti_hash_capital_partner_browser_qa_000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: authenticationTime,
  authTime: authenticationTime,
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

const host = createTenantHttpServer({
  environment: "development",
  credentialSource: "local_test",
  gateway: {
    async execute(command) {
      const operation = TENANT_PROTOCOL_CATALOG.operations.find(
        (candidate) => candidate.operationId === command.operationId
      );
      operationAudit.push({
        operationId: command.operationId,
        kind: operation?.kind ?? "unknown",
        scenario: workspaceScenario,
        resource: command.resource ? structuredClone(command.resource) : null
      });
      if (operationDelay?.operationId === command.operationId) {
        const delay = operationDelay;
        operationDelay = null;
        operationDelayAudit.push({
          event: "started",
          operationId: command.operationId,
          milliseconds: delay.milliseconds
        });
        await new Promise((resolve) => setTimeout(resolve, delay.milliseconds));
        operationDelayAudit.push({
          event: "completed",
          operationId: command.operationId,
          milliseconds: delay.milliseconds
        });
      }
      return structuredClone(resultFor(command));
    }
  },
  async resolveAuthenticationContext({ request }) {
    if (!browserSessionActive) {
      throw new DomainError(
        "authentication_rejected",
        "The browser QA Capital Partner session is signed out."
      );
    }
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_capital_partner_browser_qa_csrf");
    }
    return authenticationContext;
  },
  async createNetworkContext() {
    return Object.freeze({ source: "capital_partner_browser_qa" });
  },
  serveAuthentication,
  serveWebAsset: createTenantWebAssetHandler({
    csrfTokenProvider: async () => csrfToken,
    workspaceNameProvider: async () => "capitalPartner"
  })
});

const address = await host.listen();
process.stdout.write(`${JSON.stringify({
  url: `http://${address.host}:${address.port}/#capital-partners`,
  fixture: "capital_partner_browser_qa.v1",
  workspaceName: "capitalPartner",
  workspaceScenario,
  catalogScenario,
  sessionActive: true,
  mutationAuthority: "synthetic_fixture_only",
  realFundsEnabled: false
})}\n`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await host.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stop();
    process.exit(0);
  });
}

await new Promise(() => {});
