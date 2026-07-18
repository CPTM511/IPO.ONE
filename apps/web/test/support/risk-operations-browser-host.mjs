import { TENANT_PROTOCOL_CATALOG } from "../../../../packages/api-contract/src/index.js";
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

const csrfToken = "risk_operations_browser_qa_csrf_token_000000001";
const portfolioId = "risk_portfolio_browser_qa";
const servicingQueueId = "servicing_queue_browser_qa";
const subjectId = "agent_subject_browser_qa";
let subjectFrozen = false;

function protocolResult(operationId, response) {
  return {
    operationId,
    replayed: false,
    response: structuredClone(response),
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function riskPortfolio() {
  return {
    portfolioId,
    asOf: "2026-07-17T08:30:00.000Z",
    subjects: {
      totalCount: 42,
      pendingCount: 3,
      activeCount: subjectFrozen ? 35 : 36,
      suspendedCount: subjectFrozen ? 3 : 2,
      closedCount: 1
    },
    creditLines: {
      totalCount: 28,
      requestedCount: 3,
      approvedCount: 21,
      rejectedCount: 2,
      frozenCount: subjectFrozen ? 2 : 1,
      closedCount: 1,
      limitMinor: "12500000",
      utilizedMinor: "4875000"
    },
    obligations: {
      totalCount: 34,
      openCount: 18,
      createdCount: 2,
      activeCount: 13,
      partiallyRepaidCount: 3,
      fullyRepaidCount: 11,
      overdueCount: 2,
      defaultedCount: 1,
      delinquentCount: 1,
      restructuredCount: 1,
      repurchasedCount: 0,
      writtenOffCount: 1,
      closedCount: 3,
      principalMinor: "9100000",
      outstandingPrincipalMinor: "3425000",
      accruedFeesMinor: "68500",
      repaidAmountMinor: "5240000",
      writtenOffPrincipalMinor: "85000",
      writtenOffInterestMinor: "6400",
      writtenOffFeesMinor: "1200"
    },
    assetExposures: [
      {
        assetId: "urn:ipo-one:sandbox-asset:usd-cent",
        creditLineCount: 20,
        approvedCreditLineCount: 16,
        frozenCreditLineCount: subjectFrozen ? 2 : 1,
        limitMinor: "9250000",
        utilizedMinor: "3675000",
        obligationCount: 25,
        openObligationCount: 14,
        overdueObligationCount: 2,
        defaultedObligationCount: 1,
        delinquentObligationCount: 1,
        restructuredObligationCount: 1,
        repurchasedObligationCount: 0,
        writtenOffObligationCount: 1,
        outstandingPrincipalMinor: "2675000",
        writtenOffPrincipalMinor: "85000"
      },
      {
        assetId: "urn:ipo-one:sandbox-asset:xlayer-usdc",
        creditLineCount: 8,
        approvedCreditLineCount: 5,
        frozenCreditLineCount: 0,
        limitMinor: "3250000",
        utilizedMinor: "1200000",
        obligationCount: 9,
        openObligationCount: 4,
        overdueObligationCount: 0,
        defaultedObligationCount: 0,
        delinquentObligationCount: 0,
        restructuredObligationCount: 0,
        repurchasedObligationCount: 0,
        writtenOffObligationCount: 0,
        outstandingPrincipalMinor: "750000",
        writtenOffPrincipalMinor: "0"
      }
    ],
    hasMoreAssetExposures: false,
    schemaVersion: "tenant_risk_portfolio_view.v1"
  };
}

function servicingQueue(command) {
  const allCases = [
    {
      obligationId: "obligation_case_default_8f32",
      subjectId: "subject_case_17ad",
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      status: "defaulted",
      servicingClassification: "defaulted",
      daysPastDue: 104,
      priority: "critical",
      reviewCode: "default_resolution_review",
      outstandingPrincipalMinor: "184000",
      outstandingInterestMinor: "12600",
      outstandingFeesMinor: "0",
      outstandingTotalMinor: "196600",
      pastDuePrincipalMinor: "92000",
      pastDueInterestMinor: "12600",
      pastDueFeesMinor: "0",
      pastDueTotalMinor: "104600",
      oldestUnpaidInstallmentId: "installment_default_001",
      oldestDueAt: "2026-04-04T08:30:00.000Z",
      servicingEffectiveAt: "2026-07-17T08:30:00.000Z",
      scheduleSequence: 1,
      servicingOwnerCode: "sandbox_platform",
      latestServicingAction: {
        servicingActionId: "servicing_action_default_001",
        actionType: "advance",
        nextStatus: "defaulted",
        nextClassification: "defaulted",
        daysPastDue: 104,
        reasonCode: "servicing_default_threshold",
        source: "system_worker",
        effectiveAt: "2026-07-17T08:30:00.000Z",
        schemaVersion: "servicing_queue_action_summary.v1"
      },
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "servicing_queue_case.v1"
    },
    {
      obligationId: "obligation_case_predefault_42c1",
      subjectId: "subject_case_45bf",
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      status: "delinquent",
      servicingClassification: "dpd_61_89",
      daysPastDue: 74,
      priority: "high",
      reviewCode: "pre_default_review",
      outstandingPrincipalMinor: "76000",
      outstandingInterestMinor: "4400",
      outstandingFeesMinor: "0",
      outstandingTotalMinor: "80400",
      pastDuePrincipalMinor: "38000",
      pastDueInterestMinor: "4400",
      pastDueFeesMinor: "0",
      pastDueTotalMinor: "42400",
      oldestUnpaidInstallmentId: "installment_predefault_001",
      oldestDueAt: "2026-05-04T08:30:00.000Z",
      servicingEffectiveAt: "2026-07-17T08:30:00.000Z",
      scheduleSequence: 1,
      servicingOwnerCode: "sandbox_originator",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "servicing_queue_case.v1"
    },
    {
      obligationId: "obligation_case_midstage_91a4",
      subjectId: "subject_case_a182",
      assetId: "urn:ipo-one:sandbox-asset:xlayer-usdc",
      status: "delinquent",
      servicingClassification: "dpd_31_60",
      daysPastDue: 39,
      priority: "elevated",
      reviewCode: "late_stage_review",
      outstandingPrincipalMinor: "52000",
      outstandingInterestMinor: "1900",
      outstandingFeesMinor: "0",
      outstandingTotalMinor: "53900",
      pastDuePrincipalMinor: "26000",
      pastDueInterestMinor: "1900",
      pastDueFeesMinor: "0",
      pastDueTotalMinor: "27900",
      oldestUnpaidInstallmentId: "installment_midstage_001",
      oldestDueAt: "2026-06-08T08:30:00.000Z",
      servicingEffectiveAt: "2026-07-17T08:30:00.000Z",
      scheduleSequence: 1,
      servicingOwnerCode: "sandbox_platform",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "servicing_queue_case.v1"
    },
    {
      obligationId: "obligation_case_grace_5d20",
      subjectId: "subject_case_2b71",
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      status: "delinquent",
      servicingClassification: "grace_period",
      daysPastDue: 2,
      priority: "monitor",
      reviewCode: "grace_monitor",
      outstandingPrincipalMinor: "24000",
      outstandingInterestMinor: "300",
      outstandingFeesMinor: "0",
      outstandingTotalMinor: "24300",
      pastDuePrincipalMinor: "12000",
      pastDueInterestMinor: "300",
      pastDueFeesMinor: "0",
      pastDueTotalMinor: "12300",
      oldestUnpaidInstallmentId: "installment_grace_001",
      oldestDueAt: "2026-07-15T08:30:00.000Z",
      servicingEffectiveAt: "2026-07-17T08:30:00.000Z",
      scheduleSequence: 1,
      servicingOwnerCode: "sandbox_platform",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "servicing_queue_case.v1"
    }
  ];
  const requested = command.payload.classifications;
  const cases = requested
    ? allCases.filter((item) => requested.includes(item.servicingClassification))
    : allCases;
  return {
    queueId: servicingQueueId,
    asOf: "2026-07-17T08:30:00.000Z",
    filters: {
      classifications: requested ?? [
        "defaulted",
        "dpd_61_89",
        "dpd_31_60",
        "dpd_1_30",
        "grace_period"
      ]
    },
    cases,
    page: { limit: command.payload.limit ?? 25, hasMore: false },
    safety: {
      readOnly: true,
      piiIncluded: false,
      dispositionAuthority: false,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    schemaVersion: "tenant_servicing_queue_view.v1"
  };
}

function resultFor(command) {
  if (command.operationId === "pilotReadTenantRisk") {
    if (command.resource?.resourceId !== portfolioId) throw new Error("risk_portfolio_browser_qa_unavailable");
    return protocolResult(command.operationId, riskPortfolio());
  }
  if (command.operationId === "pilotReadPilotHealth") {
    if (command.resource?.resourceId !== portfolioId) throw new Error("pilot_health_browser_qa_unavailable");
    return protocolResult(command.operationId, {
      portfolioId,
      asOf: "2026-07-17T08:30:00.000Z",
      entryModes: { humanIntentCount: 3, agentIntentCount: 2, dualNativeObserved: true },
      funnel: {
        intentCount: 5,
        offeredIntentCount: 5,
        acceptedIntentCount: 4,
        executedIntentCount: 3,
        repaidIntentCount: 2,
        fullyRepaidIntentCount: 1
      },
      conversionBps: {
        offer: 10000,
        acceptance: 8000,
        execution: 6000,
        repayment: 4000,
        fullRepayment: 2000
      },
      positions: { obligationCount: 4, openPositionCount: 3, adversePositionCount: 1 },
      readiness: { stage: "verified", dualNativeObserved: true, fullLifecycleObserved: true },
      safety: {
        readOnly: true,
        piiIncluded: false,
        thirdPartyAnalytics: false,
        sandboxOnly: true,
        productionFundsMoved: false
      },
      schemaVersion: "tenant_pilot_health_view.v1"
    });
  }
  if (command.operationId === "pilotReadServicingQueue") {
    if (command.resource?.resourceId !== servicingQueueId) throw new Error("servicing_queue_browser_qa_unavailable");
    return protocolResult(command.operationId, servicingQueue(command));
  }
  if (command.operationId === "pilotFreezeSubject") {
    if (command.resource?.resourceId !== subjectId) throw new Error("risk_subject_browser_qa_unavailable");
    const previousStatus = subjectFrozen ? "active" : "active";
    subjectFrozen = true;
    return protocolResult(command.operationId, {
      subjectId,
      subjectHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      previousStatus,
      status: "suspended",
      reasonCode: command.reasonCode,
      updatedAt: "2026-07-17T08:31:00.000Z",
      schemaVersion: "tenant_agent_subject_frozen.v1"
    });
  }
  throw new Error(`unsupported_risk_browser_qa_operation:${command.operationId}`);
}

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_risk_operations_browser_qa",
  actorId: "actor_risk_operations_browser_qa",
  actorType: ActorType.RISK_OPERATOR,
  clientId: "client_risk_operations_browser_qa",
  credentialId: "credential_risk_operations_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: ["risk.read.tenant", "pilot.health.read", "servicing.queue.read", "risk.freeze"],
  roles: ["risk_operator"],
  tokenJtiHash: "token_jti_hash_risk_operations_browser_qa_000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: "2026-07-17T08:00:00.000Z",
  authTime: "2026-07-17T08:00:00.000Z",
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

const host = createTenantHttpServer({
  environment: "development",
  credentialSource: "local_test",
  gateway: { async execute(command) { return resultFor(command); } },
  resolveAuthenticationContext: async ({ request }) => {
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_risk_browser_qa_csrf");
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "risk_operations_browser_qa" }),
  serveWebAsset: createTenantWebAssetHandler({ csrfTokenProvider: async () => csrfToken })
});

const address = await host.listen();
console.log(`RISK_OPERATIONS_BROWSER_QA_URL=http://${address.host}:${address.port}/#risk`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
