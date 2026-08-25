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
import {
  DomainError,
  createOfficialReportArtifact,
  officialReportEffectiveStatus,
  revokeOfficialReportArtifact
} from "../../../../packages/domain/src/index.js";

const csrfToken = "human_lifecycle_browser_qa_csrf_token_00000001";
const browserQaPort = Number(process.env.IPO_ONE_BROWSER_QA_PORT ?? 0);
if (!Number.isSafeInteger(browserQaPort) || browserQaPort < 0 || browserQaPort > 65_535) {
  throw new Error("invalid_browser_qa_port");
}
const browserQaRole = process.env.IPO_ONE_BROWSER_QA_ROLE ?? "borrower";
const BROWSER_QA_ROLES = Object.freeze({
  borrower: Object.freeze({
    actorId: "actor_human_lifecycle_browser_qa",
    actorType: ActorType.HUMAN,
    roles: ["borrower"]
  }),
  capitalPartner: Object.freeze({
    actorId: "actor_capital_partner_browser_qa",
    actorType: ActorType.HUMAN,
    roles: ["capital_partner"]
  }),
  risk: Object.freeze({
    actorId: "actor_risk_browser_qa",
    actorType: ActorType.RISK_OPERATOR,
    roles: ["risk_operator"]
  })
});
const browserQaIdentity = BROWSER_QA_ROLES[browserQaRole];
if (!browserQaIdentity) throw new Error("invalid_browser_qa_role");
const disableAuthenticationDiscovery =
  process.env.IPO_ONE_BROWSER_QA_DISABLE_AUTH_DISCOVERY === "1";
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
let browserSessionActive = true;
const offerReceipt = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
)).valid[0];
const lifecycleReceipt = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
)).valid[0];
const tenantProtocolFixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const securedPoolFixtures = JSON.parse(await readFile(
  new URL(
    "../../../../api/tenant-protocol/conformance/secured-pool-workspace.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const securedPoolResult = (operationId) => structuredClone(
  securedPoolFixtures.validResults.find((fixture) =>
    fixture.operationId === operationId
  )
);
const tenantProtocolResult = (operationId) => structuredClone(
  tenantProtocolFixtures.validResults.find((fixture) =>
    fixture.operationId === operationId
  )
);
const creditPassportCreateFixture = tenantProtocolFixtures.validResults.find(
  ({ operationId }) => operationId === "pilotCreateCreditPassportArtifact"
);
const creditPassportRevokeFixture = tenantProtocolFixtures.validResults.find(
  ({ operationId }) => operationId === "pilotRevokeCreditPassportArtifact"
);
const supportedBrowserQaOperationIds = new Set([
  "pilotCreateHumanSubject",
  "pilotCreateConsent",
  "pilotReadHumanSelf",
  "pilotReadWorkspaceResume",
  "pilotRequestCredit",
  "pilotReadCreditApplication",
  "pilotEvaluateCreditApplication",
  "pilotCreateCreditPassportArtifact",
  "pilotReadOwnCreditPassportArtifact",
  "pilotVerifyCreditPassportArtifact",
  "pilotRevokeCreditPassportArtifact",
  "pilotAcceptCreditOffer",
  "pilotExecuteSandboxObligation",
  "pilotPostSandboxRepayment",
  "pilotReadOwnObligation",
  "pilotReadOwnObligationEvidence",
  "pilotReadOwnCreditState",
  "pilotReadOwnSecuredPool",
  "pilotReviewSecuredPoolAction",
  "pilotCreateOfficialReport",
  "pilotReadOfficialReport",
  "pilotRetrieveOfficialReport",
  "pilotRevokeOfficialReport"
]);
const roleOperationIds = Object.freeze({
  borrower: supportedBrowserQaOperationIds,
  capitalPartner: new Set([
    "pilotReadCapitalPartnerSelf",
    "pilotReadCapitalPartnerPassportInbox",
    "pilotAuthorCapitalPartnerOffer",
    "pilotTransitionCapitalPartnerOffer",
    "pilotReadCapitalPartnerFacility",
    "pilotReadCapitalPartnerPortfolio"
  ]),
  risk: new Set([
    "pilotReadTenantRiskPortfolioReference",
    "pilotReadTenantRisk",
    "pilotReadSecuredPoolRisk"
  ])
});

const consent = Object.freeze({
  consentId: offerReceipt.consentId,
  consentHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  termsHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  dataUsageHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  status: "active",
  purposes: [
    "credit_application",
    "credit_decision",
    "credit_offer_acceptance",
    "obligation_servicing",
    "identity_reference_use"
  ],
  allowedAssetIds: [offerReceipt.creditIntent.assetId],
  allowedCreditPurposeCodes: [offerReceipt.creditIntent.purposeCode],
  allowedRepaymentFrequencies: [offerReceipt.creditIntent.repaymentFrequency],
  maxRequestedPrincipalMinor: offerReceipt.creditIntent.requestedPrincipalMinor,
  maxRequestedTermDays: offerReceipt.creditIntent.requestedTermDays,
  maxInstallmentCount: offerReceipt.creditIntent.installmentCount,
  validFrom: "2026-07-15T00:00:00.000Z",
  expiresAt: "2026-10-12T00:00:00.000Z",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
});
const identityReference = Object.freeze({
  identityReferenceId: offerReceipt.identityReferenceId,
  identityReferenceHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  referenceEvidenceHash: "0x1222222222222222222222222222222222222222222222222222222222222222",
  consentId: offerReceipt.consentId,
  consentHash: consent.consentHash,
  referenceType: "verifiable_credential_reference",
  providerVersion: "synthetic_browser_qa.v1",
  assuranceLevel: "synthetic_provider_asserted",
  purposeCodes: ["credit_decision", "identity_reference_use"],
  validFrom: "2026-07-15T00:00:00.000Z",
  expiresAt: "2026-10-12T00:00:00.000Z",
  syntheticOnly: true,
  productionVerified: false,
  status: "active",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
});
const subject = Object.freeze({
  subjectId: offerReceipt.subjectId,
  subjectHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  subjectType: "human",
  displayName: "Human Credit Profile",
  primaryPrincipalId: lifecycleReceipt.acceptance.principalId,
  status: "active",
  riskTier: "tier_2",
  prototypeOnly: true,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  schemaVersion: "subject.v1"
});

function protocolResult(operationId, response) {
  return {
    operationId,
    replayed: false,
    response: structuredClone(response),
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function obligationAt(stage) {
  const obligation = structuredClone(lifecycleReceipt.obligation);
  if (stage === "accepted") {
    obligation.outstandingPrincipalMinor = obligation.originalPrincipalMinor;
    obligation.totalRepaidMinor = "0";
    obligation.executionStatus = "pending";
    obligation.status = "created";
    obligation.servicingReasonCode = "obligation_created";
    for (const key of [
      "sandboxExecutionReceiptId",
      "executedAt",
      "lastAccruedAt",
      "interestAccrualRemainder",
      "withdrawable"
    ]) delete obligation[key];
    for (const installment of obligation.installments) {
      installment.paidPrincipalMinor = "0";
      installment.paidInterestMinor = "0";
      installment.paidFeeMinor = "0";
      installment.status = "scheduled";
    }
  }
  if (stage === "executed") {
    obligation.outstandingPrincipalMinor = obligation.originalPrincipalMinor;
    obligation.totalRepaidMinor = "0";
    obligation.status = "active";
    for (const installment of obligation.installments) {
      installment.paidPrincipalMinor = "0";
      installment.paidInterestMinor = "0";
      installment.paidFeeMinor = "0";
      installment.status = "scheduled";
    }
  }
  return obligation;
}

const secondaryObligationId = `${lifecycleReceipt.obligation.obligationId}_secondary`;
let currentCreditPassportArtifact;

function reidentifyObligation(obligation, obligationId) {
  obligation.obligationId = obligationId;
  obligation.installments.forEach((installment, index) => {
    installment.obligationId = obligationId;
    installment.installmentId = `${obligationId}_installment_${index + 1}`;
  });
  obligation.oldestUnpaidInstallmentId =
    obligation.installments.find((installment) => installment.status !== "paid")?.installmentId ?? null;
  return obligation;
}

function secondaryDelinquentObligation() {
  const obligation = reidentifyObligation(obligationAt("executed"), secondaryObligationId);
  const oldest = obligation.installments[0];
  obligation.status = "delinquent";
  obligation.servicingClassification = "dpd_1_30";
  obligation.daysPastDue = 12;
  obligation.oldestUnpaidInstallmentId = oldest.installmentId;
  obligation.servicingEffectiveAt = new Date(
    new Date(oldest.dueAt).getTime() + 12 * 86_400_000
  ).toISOString();
  obligation.servicingReasonCode = "servicing_dpd_1_30";
  obligation.updatedAt = obligation.servicingEffectiveAt;
  return obligation;
}

function curedObligation(source = obligationAt("executed")) {
  const obligation = structuredClone(source);
  const [first, second] = obligation.installments;
  const effectiveAt = new Date(Math.max(
    new Date("2026-08-16T12:00:00.000Z").getTime(),
    new Date(obligation.servicingEffectiveAt).getTime() + 1_000
  )).toISOString();
  first.paidPrincipalMinor = first.scheduledPrincipalMinor;
  first.paidInterestMinor = first.scheduledInterestMinor;
  first.paidFeeMinor = first.scheduledFeeMinor;
  first.status = "paid";
  obligation.outstandingPrincipalMinor = second.scheduledPrincipalMinor;
  obligation.outstandingInterestMinor = second.scheduledInterestMinor;
  obligation.outstandingFeesMinor = second.scheduledFeeMinor;
  obligation.totalRepaidMinor = first.scheduledPrincipalMinor;
  obligation.status = "partially_repaid";
  obligation.servicingClassification = "cured";
  obligation.daysPastDue = 0;
  obligation.oldestUnpaidInstallmentId = second.installmentId;
  obligation.servicingEffectiveAt = effectiveAt;
  obligation.servicingReasonCode = "servicing_cured_by_repayment";
  obligation.lastAccruedAt = obligation.servicingEffectiveAt;
  obligation.updatedAt = obligation.servicingEffectiveAt;
  return obligation;
}

function curedRepayment(obligation) {
  return {
    ...structuredClone(lifecycleReceipt.repayment),
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    repaymentId: "repayment_human_browser_cure_001",
    repaymentHash: "0xacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacac",
    requestedMinor: "6000",
    appliedMinor: "6000",
    appliedPrincipalMinor: "6000",
    remainingPrincipalMinor: obligation.outstandingPrincipalMinor,
    remainingInterestMinor: obligation.outstandingInterestMinor,
    remainingFeesMinor: obligation.outstandingFeesMinor,
    sourceCode: "synthetic_bank",
    ledgerTransactionId: "ledger_transaction_human_browser_cure_001",
    occurredAt: obligation.servicingEffectiveAt
  };
}

function earlyRepaidObligation(
  source = obligationAt("executed"),
  requestedMinor = source.outstandingPrincipalMinor
) {
  const obligation = structuredClone(source);
  const outstandingBefore = BigInt(obligation.outstandingPrincipalMinor);
  const requested = BigInt(requestedMinor);
  const applied = requested < outstandingBefore ? requested : outstandingBefore;
  let principalToApply = applied;
  for (const installment of obligation.installments) {
    const scheduled = BigInt(installment.scheduledPrincipalMinor);
    const alreadyPaid = BigInt(installment.paidPrincipalMinor);
    const remaining = scheduled - alreadyPaid;
    const installmentApplied =
      principalToApply < remaining ? principalToApply : remaining;
    installment.paidPrincipalMinor =
      (alreadyPaid + installmentApplied).toString();
    principalToApply -= installmentApplied;
    installment.status =
      installment.paidPrincipalMinor === installment.scheduledPrincipalMinor
        ? "paid"
        : installmentApplied > 0n
          ? "partial"
          : "scheduled";
  }
  const outstandingAfter = outstandingBefore - applied;
  const effectiveAt = new Date("2026-07-31T12:00:00.000Z").toISOString();
  obligation.outstandingPrincipalMinor = outstandingAfter.toString();
  obligation.totalRepaidMinor = (
    BigInt(obligation.totalRepaidMinor) + applied
  ).toString();
  obligation.status =
    outstandingAfter === 0n ? "fully_repaid" : "partially_repaid";
  obligation.servicingClassification = "current";
  obligation.daysPastDue = 0;
  obligation.oldestUnpaidInstallmentId =
    obligation.installments.find(
      (installment) => installment.status !== "paid"
    )?.installmentId ?? null;
  obligation.servicingEffectiveAt = effectiveAt;
  obligation.servicingReasonCode = "servicing_current";
  obligation.lastAccruedAt = effectiveAt;
  obligation.updatedAt = effectiveAt;
  return {
    appliedMinor: applied.toString(),
    obligation
  };
}

function earlyRepayment(
  obligation,
  { appliedMinor, requestedMinor, sourceCode }
) {
  return {
    ...structuredClone(lifecycleReceipt.repayment),
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    repaymentId: "repayment_human_browser_early_001",
    repaymentHash:
      "0xaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeae",
    requestedMinor,
    appliedMinor,
    appliedPrincipalMinor: appliedMinor,
    surplusMinor: (
      BigInt(requestedMinor) - BigInt(appliedMinor)
    ).toString(),
    remainingPrincipalMinor: obligation.outstandingPrincipalMinor,
    remainingInterestMinor: obligation.outstandingInterestMinor,
    remainingFeesMinor: obligation.outstandingFeesMinor,
    sourceCode,
    ledgerTransactionId: "ledger_transaction_human_browser_early_001",
    occurredAt: obligation.servicingEffectiveAt
  };
}

function cureAction(obligation) {
  return {
    servicingActionId: "sandbox_servicing_action_human_browser_cure_001",
    servicingActionHash: "0xadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadad",
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    actionType: "cure",
    previousStatus: "delinquent",
    nextStatus: obligation.status,
    previousClassification: "dpd_1_30",
    nextClassification: obligation.servicingClassification,
    daysPastDue: obligation.daysPastDue,
    oldestUnpaidInstallmentId: obligation.oldestUnpaidInstallmentId,
    reasonCode: obligation.servicingReasonCode,
    source: "repayment",
    policyVersion: obligation.servicingPolicyVersion,
    scheduleSequenceBefore: obligation.scheduleSequence,
    scheduleSequenceAfter: obligation.scheduleSequence,
    balancesBefore: {
      outstandingPrincipalMinor: obligation.originalPrincipalMinor,
      outstandingInterestMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "0"
    },
    balancesAfter: {
      outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
      outstandingInterestMinor: obligation.outstandingInterestMinor,
      outstandingFeesMinor: obligation.outstandingFeesMinor,
      totalRepaidMinor: obligation.totalRepaidMinor
    },
    effectiveAt: obligation.servicingEffectiveAt,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "sandbox_servicing_action.v1"
  };
}

let currentObligation = obligationAt("executed");
let currentServicingAction;
let secondaryCurrentObligation = secondaryDelinquentObligation();
let secondaryServicingAction;
let currentSubjectCreated = true;
let currentConsentCreated = true;
let currentOfficialReport;
let failNextEvidenceRead = false;

function obligationEvidence(obligationId, evidenceObligation) {
  const evidenceKey = obligationId === secondaryObligationId
    ? "secondary"
    : "primary";
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
  if (evidenceObligation.executionStatus === "executed") {
    events.push({
      eventType: "obligation_sandbox_executed",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 2,
      occurredAt: evidenceObligation.executedAt ?? "2026-07-16T12:02:00.000Z"
    });
  }
  if (BigInt(evidenceObligation.totalRepaidMinor ?? "0") > 0n) {
    events.push({
      eventType: "repayment_posted",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 3,
      occurredAt: evidenceObligation.servicingEffectiveAt
    });
  }
  if (evidenceObligation.servicingClassification === "cured") {
    events.push({
      eventType: "obligation_cured",
      aggregateType: "obligation",
      aggregateId: obligationId,
      aggregateVersion: 4,
      occurredAt: new Date(
        new Date(evidenceObligation.servicingEffectiveAt).getTime() + 100
      ).toISOString()
    });
  }
  const items = events.map((event, index) => {
    const evidenceDigit = (
      (evidenceKey === "secondary" ? 10 : 1) + index
    ).toString(16);
    const payloadDigit = (
      (evidenceKey === "secondary" ? 4 : 9) + index
    ).toString(16);
    return {
      evidenceId: `event_browser_qa_${evidenceKey}_${event.eventType}`,
      evidenceHash: `0x${evidenceDigit.repeat(64)}`,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      obligationId,
      sourceFinality: "finalized",
      payloadHash: `0x${payloadDigit.repeat(64)}`,
      occurredAt: event.occurredAt,
      recordedAt: new Date(
        new Date(event.occurredAt).getTime() + 100
      ).toISOString(),
      schemaVersion: "obligation_evidence_summary.v1"
    };
  });
  const latestRecordedAt = items.at(-1)?.recordedAt ??
    evidenceObligation.updatedAt;
  return {
    obligationId,
    asOf: new Date(
      Math.max(
        new Date("2026-08-16T12:00:01.000Z").getTime(),
        new Date(latestRecordedAt).getTime() + 1_000
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

function pagedObligationEvidence(
  obligationId,
  evidenceObligation,
  { cursor, limit = 25 } = {}
) {
  const complete = obligationEvidence(obligationId, evidenceObligation);
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

function readObligationEvidence(obligationId, evidenceObligation, payload) {
  if (failNextEvidenceRead) {
    failNextEvidenceRead = false;
    throw new Error("browser_qa_evidence_read_failed_once");
  }
  return pagedObligationEvidence(obligationId, evidenceObligation, payload);
}

function officialReportView(report, now = new Date()) {
  const { contentBase64: _contentBase64, ...metadata } = report;
  return {
    ...metadata,
    effectiveStatus: officialReportEffectiveStatus(report, now),
    asOf: now.toISOString()
  };
}

function resultFor(command) {
  const { operationId } = command;
  if (operationId === "pilotFreezeSubject") {
    throw new DomainError("authorization_denied", "The requested operation is not available.");
  }
  if (
    operationId === "pilotReadTenantRiskPortfolioReference" ||
    operationId === "pilotReadTenantRisk" ||
    operationId === "pilotReadCapitalPartnerSelf" ||
    operationId === "pilotReadCapitalPartnerPassportInbox" ||
    operationId === "pilotReadCapitalPartnerFacility" ||
    operationId === "pilotReadCapitalPartnerPortfolio"
  ) {
    const result = tenantProtocolResult(operationId);
    if (operationId === "pilotReadCapitalPartnerPortfolio") {
      result.response.portfolio.facilities = [
        tenantProtocolResult("pilotReadCapitalPartnerFacility").response.facility
      ];
    }
    return result;
  }
  if (operationId === "pilotReadSecuredPoolRisk") {
    return securedPoolResult(operationId);
  }
  if (operationId === "pilotReadOwnSecuredPool") {
    const result = securedPoolResult(operationId);
    result.response.subjectId = command.resource.resourceId;
    return result;
  }
  if (operationId === "pilotReviewSecuredPoolAction") {
    const result = securedPoolResult(operationId);
    result.response.actionType = command.payload.actionType;
    result.response.amountAssets = command.payload.amountAssets;
    return result;
  }
  if (operationId === "pilotCreateHumanSubject") {
    currentSubjectCreated = true;
    return protocolResult(operationId, {
      principalId: subject.primaryPrincipalId,
      subjectId: subject.subjectId,
      subjectHash: subject.subjectHash,
      subjectType: "human",
      status: "pending",
      prototypeOnly: true,
      schemaVersion: "tenant_human_subject_created.v1"
    });
  }
  if (operationId === "pilotCreateConsent") {
    currentSubjectCreated = true;
    currentConsentCreated = true;
    return protocolResult(operationId, {
      subjectId: subject.subjectId,
      consent,
      schemaVersion: "tenant_consent_created.v1"
    });
  }
  if (operationId === "pilotReadHumanSelf") {
    return protocolResult(operationId, {
      subject,
      consents: [consent],
      identityReferences: [identityReference],
      hasMoreConsents: false,
      hasMoreIdentityReferences: false,
      schemaVersion: "tenant_human_subject_view.v1"
    });
  }
  if (operationId === "pilotReadWorkspaceResume") {
    const resources = [];
    if (currentObligation) {
      resources.push({
        resourceType: "obligation",
        resourceId: currentObligation.obligationId,
        relationship: "owner"
      });
    }
    resources.push({
      resourceType: "obligation",
      resourceId: secondaryCurrentObligation.obligationId,
      relationship: "owner"
    });
    if (currentConsentCreated) {
      resources.push({
        resourceType: "consent",
        resourceId: consent.consentId,
        relationship: "owner"
      });
      resources.push({
        resourceType: "credit_intent",
        resourceId: offerReceipt.creditIntent.creditIntentId,
        relationship: "owner"
      });
    }
    if (currentSubjectCreated) {
      resources.push({
        resourceType: "subject",
        resourceId: subject.subjectId,
        relationship: "owner"
      });
    }
    return protocolResult(operationId, {
      workspaceKind: "human_borrower",
      resources,
      hasMore: false,
      serverTruth: true,
      schemaVersion: "tenant_workspace_resume_view.v2"
    });
  }
  if (operationId === "pilotRequestCredit") {
    return protocolResult(operationId, {
      creditIntent: offerReceipt.creditIntent,
      schemaVersion: "tenant_credit_intent_created.v1"
    });
  }
  if (operationId === "pilotReadCreditApplication") {
    return protocolResult(operationId, {
      creditIntent: offerReceipt.creditIntent,
      decision: offerReceipt.decision,
      offer: offerReceipt.offer,
      schemaVersion: "tenant_credit_application_view.v2"
    });
  }
  if (operationId === "pilotEvaluateCreditApplication") {
    return protocolResult(operationId, {
      creditIntent: offerReceipt.creditIntent,
      decision: offerReceipt.decision,
      offer: offerReceipt.offer,
      schemaVersion: "tenant_credit_application_evaluated.v2"
    });
  }
  if (operationId === "pilotCreateCreditPassportArtifact") {
    currentCreditPassportArtifact = structuredClone(
      creditPassportCreateFixture.response.artifact
    );
    currentCreditPassportArtifact.subjectId = command.resource.resourceId;
    currentCreditPassportArtifact.asOf = "2026-07-24T10:00:00.000Z";
    return protocolResult(operationId, {
      artifact: currentCreditPassportArtifact,
      replaced: false,
      schemaVersion: "tenant_credit_passport_artifact_created.v1"
    });
  }
  if (operationId === "pilotReadOwnCreditPassportArtifact") {
    if (
      !currentCreditPassportArtifact ||
      command.resource?.resourceId !==
        currentCreditPassportArtifact.creditPassportArtifactId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    return protocolResult(operationId, {
      artifact: currentCreditPassportArtifact,
      schemaVersion: "tenant_owned_credit_passport_artifact_view.v1"
    });
  }
  if (operationId === "pilotVerifyCreditPassportArtifact") {
    const verified =
      currentCreditPassportArtifact?.effectiveStatus === "active" &&
      command.resource?.resourceId ===
        currentCreditPassportArtifact.creditPassportArtifactId &&
      command.payload?.artifactHash === currentCreditPassportArtifact.artifactHash &&
      command.payload?.artifactVersion === currentCreditPassportArtifact.version;
    if (!verified) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    return protocolResult(operationId, {
      verification: {
        verified: true,
        status: "active",
        sourceCurrent: true,
        checkedAt: "2026-07-24T10:01:00.000Z",
        artifactHash: currentCreditPassportArtifact.artifactHash,
        artifactVersion: currentCreditPassportArtifact.version,
        onlineVerificationRequired: true,
        schemaVersion: "credit_passport_verification.v1"
      },
      artifact: currentCreditPassportArtifact,
      schemaVersion: "tenant_credit_passport_verification_result.v1"
    });
  }
  if (operationId === "pilotRevokeCreditPassportArtifact") {
    if (
      !currentCreditPassportArtifact ||
      command.resource?.resourceId !==
        currentCreditPassportArtifact.creditPassportArtifactId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    currentCreditPassportArtifact = structuredClone(
      creditPassportRevokeFixture.response.artifact
    );
    return protocolResult(operationId, {
      artifact: currentCreditPassportArtifact,
      schemaVersion: "tenant_credit_passport_artifact_revoked.v1"
    });
  }
  if (operationId === "pilotAcceptCreditOffer") {
    currentObligation = obligationAt("accepted");
    currentServicingAction = undefined;
    return protocolResult(operationId, {
      acceptance: lifecycleReceipt.acceptance,
      obligation: currentObligation,
      offerStatus: "accepted",
      executionCreated: false,
      fundsAuthority: false,
      schemaVersion: "tenant_credit_offer_accepted.v1"
    });
  }
  if (operationId === "pilotExecuteSandboxObligation") {
    currentObligation = obligationAt("executed");
    return protocolResult(operationId, {
      obligation: currentObligation,
      executionReceipt: lifecycleReceipt.executionReceipt,
      principalLedgerTransactionId: lifecycleReceipt.principalLedgerTransactionId,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_obligation_executed.v1"
    });
  }
  if (operationId === "pilotPostSandboxRepayment") {
    const secondary = command.resource?.resourceId === secondaryObligationId;
    const requestedMinor = command.payload?.amountMinor ?? "6000";
    const sourceCode = command.payload?.sourceCode ?? "synthetic_wallet";
    const repaymentState = secondary
      ? {
          appliedMinor: "6000",
          obligation: curedObligation(secondaryCurrentObligation)
        }
      : earlyRepaidObligation(currentObligation, requestedMinor);
    const obligation = repaymentState.obligation;
    const servicingAction = secondary ? cureAction(obligation) : undefined;
    if (secondary) {
      secondaryCurrentObligation = obligation;
      secondaryServicingAction = servicingAction;
    } else {
      currentObligation = obligation;
      currentServicingAction = undefined;
    }
    if (evidenceScenario === "fail-after-repayment-once") {
      failNextEvidenceRead = true;
    }
    return protocolResult(operationId, {
      obligation,
      repayment: secondary
        ? curedRepayment(obligation)
        : earlyRepayment(obligation, {
            appliedMinor: repaymentState.appliedMinor,
            requestedMinor,
            sourceCode
          }),
      ...(servicingAction ? { servicingAction } : {}),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_repayment_posted.v1"
    });
  }
  if (operationId === "pilotReadOwnObligation") {
    const obligationId = command.resource?.resourceId;
    const obligation = obligationId === secondaryObligationId
      ? secondaryCurrentObligation
      : obligationId === currentObligation?.obligationId
        ? currentObligation
        : null;
    const latestServicingAction = obligationId === secondaryObligationId
      ? secondaryServicingAction
      : currentServicingAction;
    if (!obligation) {
      throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
    }
    return protocolResult(operationId, {
      obligation,
      ...(latestServicingAction ? { latestServicingAction } : {}),
      asOf: new Date(
        Math.max(
          new Date("2026-08-16T12:00:01.000Z").getTime(),
          new Date(obligation.servicingEffectiveAt).getTime() + 1_000
        )
      ).toISOString(),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_owned_obligation_view.v1"
    });
  }
  if (operationId === "pilotReadOwnObligationEvidence") {
    const obligationId = command.resource?.resourceId;
    const evidenceObligation = obligationId === secondaryObligationId
      ? secondaryCurrentObligation
      : currentObligation;
    if (
      obligationId !== secondaryObligationId &&
      obligationId !== currentObligation?.obligationId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    return protocolResult(
      operationId,
      readObligationEvidence(
        obligationId,
        evidenceObligation,
        command.payload
      )
    );
  }
  if (operationId === "pilotReadOwnCreditState") {
    if (command.resource?.resourceId !== subject.subjectId) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    const outcomeHash =
      "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
    const creditStateHash =
      "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
    const finalizedAt = "2026-07-31T12:00:00.000Z";
    const trackRecord = [{
      creditOutcomeId: "credit_outcome_human_browser_001",
      outcomeHash,
      obligationId: lifecycleReceipt.obligation.obligationId,
      outcomeLabel: "on_time_repaid",
      creditImpact: "positive_repayment_history",
      maxDaysPastDue: 0,
      restructured: false,
      repurchased: false,
      originalPrincipalMinor: lifecycleReceipt.obligation.originalPrincipalMinor,
      totalRepaidMinor: lifecycleReceipt.obligation.originalPrincipalMinor,
      lossMinor: "0",
      repaymentRatioBps: 10000,
      sourceEvidenceHashes: [
        "0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
        "0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      ],
      outcomeFinalizedAt: finalizedAt,
      recordedAt: finalizedAt,
      schemaVersion: "credit_track_record_entry.v1"
    }];
    return protocolResult(operationId, {
      creditState: {
        creditStateHash,
        subjectId: subject.subjectId,
        principalId: subject.primaryPrincipalId,
        projectionVersion: 1,
        metrics: {
          completedCycleCount: 1,
          outcomeCounts: {
            onTimeRepaid: 1,
            lateOrModifiedRepaid: 0,
            writtenOff: 0
          },
          maximumDaysPastDue: 0,
          totalOriginalPrincipalMinor: lifecycleReceipt.obligation.originalPrincipalMinor,
          totalRepaidMinor: lifecycleReceipt.obligation.originalPrincipalMinor,
          totalLossMinor: "0",
          schemaVersion: "credit_state_metrics.v1"
        },
        factors: {
          repaymentReliability: "verified_on_time_history",
          servicingPerformance: "no_delinquency_or_modification_recorded",
          lossExperience: "no_loss_recorded",
          evidenceBasis: "finalized_credit_outcomes_only",
          schemaVersion: "credit_state_factors.v1"
        },
        latestOutcome: trackRecord[0],
        trackRecord,
        updatedAt: finalizedAt,
        authorizing: false,
        automaticLimitChange: false,
        fundsAuthority: false,
        piiIncluded: false,
        productionAuthority: false,
        productionFundsMoved: false,
        rawTransactionDataIncluded: false,
        sandboxOnly: true,
        scoreAuthoritative: false,
        schemaVersion: "credit_state_projection.v1"
      },
      asOf: "2026-08-16T12:00:00.000Z",
      schemaVersion: "tenant_owned_credit_state_view.v1"
    });
  }
  if (operationId === "pilotCreateOfficialReport") {
    const obligationId = command.resource?.resourceId;
    if (obligationId !== currentObligation?.obligationId) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    const evidence = obligationEvidence(obligationId, currentObligation).items;
    currentOfficialReport = createOfficialReportArtifact({
      reportId: "official_report_human_browser_qa_001",
      format: command.payload.format,
      obligation: currentObligation,
      evidence,
      controllerActorRefHash: `0x${"a".repeat(64)}`,
      lifetimeSeconds: command.payload.lifetimeSeconds,
      now: new Date()
    });
    return protocolResult(operationId, {
      report: officialReportView(currentOfficialReport),
      schemaVersion: "tenant_official_report_created.v1"
    });
  }
  if (
    operationId === "pilotReadOfficialReport" ||
    operationId === "pilotRetrieveOfficialReport" ||
    operationId === "pilotRevokeOfficialReport"
  ) {
    if (
      !currentOfficialReport ||
      command.resource?.resourceId !== currentOfficialReport.officialReportId
    ) {
      throw new DomainError(
        "tenant_resource_unavailable",
        "The requested resource is not available."
      );
    }
    if (operationId === "pilotReadOfficialReport") {
      return protocolResult(operationId, {
        report: officialReportView(currentOfficialReport),
        schemaVersion: "tenant_official_report_view.v1"
      });
    }
    if (operationId === "pilotRetrieveOfficialReport") {
      if (officialReportEffectiveStatus(currentOfficialReport) !== "active") {
        throw new DomainError(
          "tenant_resource_unavailable",
          "The requested resource is not available."
        );
      }
      return protocolResult(operationId, {
        report: officialReportView(currentOfficialReport),
        contentBase64: currentOfficialReport.contentBase64,
        integrityVerified: true,
        authorizationRevalidatedAt: new Date().toISOString(),
        schemaVersion: "tenant_official_report_retrieval.v1"
      });
    }
    currentOfficialReport = revokeOfficialReportArtifact({
      artifact: currentOfficialReport,
      reasonCode: command.reasonCode,
      now: new Date()
    });
    return protocolResult(operationId, {
      report: officialReportView(currentOfficialReport),
      schemaVersion: "tenant_official_report_revoked.v1"
    });
  }
  throw new Error(`unsupported_browser_qa_operation:${operationId}`);
}

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_human_lifecycle_browser_qa",
  actorId: browserQaIdentity.actorId,
  actorType: browserQaIdentity.actorType,
  clientId: "client_human_lifecycle_browser_qa",
  credentialId: "credential_human_lifecycle_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: [...new Set(
    TENANT_PROTOCOL_CATALOG.operations
      .filter((operation) => roleOperationIds[browserQaRole].has(operation.operationId))
      .map((operation) => operation.requiredCapability)
  )],
  roles: browserQaIdentity.roles,
  tokenJtiHash: "token_jti_hash_human_lifecycle_browser_qa_000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: "2026-07-16T00:00:00.000Z",
  authTime: "2026-07-16T00:00:00.000Z",
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

async function serveAuthentication({ request, response, url, requestId }) {
  if (disableAuthenticationDiscovery) return false;
  if (request.method === "GET" && url.pathname === "/.well-known/ipo-one.json") {
    const releaseId = "f".repeat(40);
    const body = JSON.stringify({
      schemaVersion: "ipo_one_deployment_capability.v1",
      deployment: {
        hostingStatus: "PRODUCTION_HOSTED",
        deploymentRole: "primary",
        releaseId
      },
      chainEvidence: {
        status: "DISABLED",
        reasonCode: "approved_testnet_authority_unavailable",
        currentUserWritesEnabled: false,
        hashOnly: true,
        network: null,
        contractAddress: null,
        transactionSubmissionConfigured: false,
        observationConfigured: false,
        finalityConfigured: false,
        reconciliationConfigured: false,
        historicalArtifactsAreCurrentUserEvidence: false,
        lifecycleStates: [
          "queued",
          "submitted",
          "observed",
          "finalized",
          "reconciled",
          "failed"
        ],
        releaseId,
        schemaVersion: "ipo_one_chain_capability.v1"
      }
    });
    response.writeHead(200, {
      "cache-control": "no-store",
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
      response.writeHead(403, {
        "content-type": "application/problem+json; charset=utf-8",
        "x-request-id": requestId
      });
      response.end(JSON.stringify({
        code: "authentication_rejected",
        detail: "The browser QA logout boundary rejected the request."
      }));
      return true;
    }
    browserSessionActive = false;
    const body = JSON.stringify({
      schemaVersion: "ipo_one_logout_result.v1",
      status: "logged_out"
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "set-cookie": [
        "__Host-ipo_one_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
        "__Host-ipo_one_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0"
      ],
      "x-request-id": requestId
    });
    response.end(body);
    return true;
  }
  if (request.method !== "GET" || url.pathname !== "/auth/v1/options") return false;
  const body = JSON.stringify({
    schemaVersion: "ipo_one_authentication_options.v1",
    profile: "closed_non_funds_pilot",
    enabled: true,
    sessionActive: browserSessionActive,
    sessionAuthenticationMethod: browserSessionActive ? "oidc_pkce_bff" : null,
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

const host = createTenantHttpServer({
  port: browserQaPort,
  environment: "development",
  credentialSource: "local_test",
  gateway: {
    async execute(command) {
      if (
        evidenceScenario === "slow-read" &&
        command.operationId === "pilotReadOwnObligationEvidence"
      ) {
        await new Promise((resolve) => setTimeout(resolve, EVIDENCE_READ_DELAY_MS));
      }
      return resultFor(command);
    }
  },
  resolveAuthenticationContext: async ({ request }) => {
    if (!browserSessionActive) {
      throw new Error("browser_qa_session_inactive");
    }
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_browser_qa_csrf");
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "human_lifecycle_browser_qa" }),
  serveAuthentication,
  serveWebAsset: createTenantWebAssetHandler({
    csrfTokenProvider: async () => browserSessionActive ? csrfToken : undefined,
    workspaceNameProvider: async () => browserQaRole
  })
});

const address = await host.listen();
console.log(`HUMAN_LIFECYCLE_BROWSER_QA_URL=http://${address.host}:${address.port}/#request-credit`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
