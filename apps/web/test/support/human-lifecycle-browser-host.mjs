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
import { DomainError } from "../../../../packages/domain/src/errors.js";

const csrfToken = "human_lifecycle_browser_qa_csrf_token_00000001";
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

function curedObligation() {
  const obligation = obligationAt("executed");
  const [first, second] = obligation.installments;
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
  obligation.servicingEffectiveAt = "2026-08-16T12:00:00.000Z";
  obligation.servicingReasonCode = "servicing_cured_by_repayment";
  obligation.lastAccruedAt = obligation.servicingEffectiveAt;
  obligation.updatedAt = obligation.servicingEffectiveAt;
  return obligation;
}

function curedRepayment(obligation) {
  return {
    ...structuredClone(lifecycleReceipt.repayment),
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

let currentObligation;
let currentServicingAction;

function resultFor(operationId) {
  if (operationId === "pilotReadTenantRisk" || operationId === "pilotFreezeSubject") {
    throw new DomainError("authorization_denied", "The requested operation is not available.");
  }
  if (operationId === "pilotCreateHumanSubject") {
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
      schemaVersion: "tenant_credit_application_view.v1"
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
    const obligation = curedObligation();
    currentObligation = obligation;
    currentServicingAction = cureAction(obligation);
    return protocolResult(operationId, {
      obligation,
      repayment: curedRepayment(obligation),
      servicingAction: currentServicingAction,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_repayment_posted.v1"
    });
  }
  if (operationId === "pilotReadOwnObligation") {
    if (!currentObligation) {
      throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
    }
    return protocolResult(operationId, {
      obligation: currentObligation,
      ...(currentServicingAction ? { latestServicingAction: currentServicingAction } : {}),
      asOf: "2026-08-16T12:00:01.000Z",
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_owned_obligation_view.v1"
    });
  }
  if (operationId === "pilotReadOwnObligationEvidence") {
    const obligationId = lifecycleReceipt.obligation.obligationId;
    const eventTypes = [
      "credit_offer_accepted",
      "obligation_created",
      "sandbox_obligation_executed",
      "sandbox_repayment_posted",
      "servicing_cured"
    ];
    const occurredAt = [
      "2026-07-15T00:04:00.000Z",
      "2026-07-15T00:04:00.100Z",
      "2026-07-15T00:05:00.000Z",
      "2026-08-16T12:00:00.000Z",
      "2026-08-16T12:00:00.100Z"
    ];
    return protocolResult(operationId, {
      obligationId,
      asOf: "2026-08-16T12:00:01.000Z",
      items: eventTypes.map((eventType, index) => ({
        evidenceId: `event_browser_qa_${eventType}`,
        evidenceHash: `0x${String(index + 5).repeat(64)}`,
        eventType,
        aggregateType: index === 0 ? "credit_offer" : "obligation",
        aggregateId: index === 0 ? lifecycleReceipt.acceptance.creditOfferId : obligationId,
        aggregateVersion: index + 1,
        obligationId,
        sourceFinality: "finalized",
        payloadHash: `0x${String(index + 1).repeat(64)}`,
        occurredAt: occurredAt[index],
        recordedAt: new Date(new Date(occurredAt[index]).getTime() + 100).toISOString(),
        schemaVersion: "obligation_evidence_summary.v1"
      })),
      hasMore: false,
      schemaVersion: "tenant_owned_obligation_evidence_view.v1"
    });
  }
  throw new Error(`unsupported_browser_qa_operation:${operationId}`);
}

const authenticationContext = createAuthenticationContext({
  tenantId: "tenant_human_lifecycle_browser_qa",
  actorId: "actor_human_lifecycle_browser_qa",
  actorType: ActorType.HUMAN,
  clientId: "client_human_lifecycle_browser_qa",
  credentialId: "credential_human_lifecycle_browser_qa",
  credentialVersion: 1,
  policyVersion: "security_001.v1",
  capabilities: TENANT_PROTOCOL_CATALOG.operations
    .filter((operation) => operation.actorTypes.includes("human"))
    .map((operation) => operation.requiredCapability),
  roles: ["borrower"],
  tokenJtiHash: "token_jti_hash_human_lifecycle_browser_qa_000000000000",
  authenticationMethod: ClientAuthenticationMethod.OIDC_PKCE_BFF,
  senderConstraintMethod: SenderConstraintMethod.HOST_SESSION,
  authenticatedAt: "2026-07-16T00:00:00.000Z",
  authTime: "2026-07-16T00:00:00.000Z",
  acr: "urn:ipo.one:acr:phishing-resistant",
  amr: ["webauthn"]
});

const host = createTenantHttpServer({
  environment: "development",
  credentialSource: "local_test",
  gateway: { async execute(command) { return resultFor(command.operationId); } },
  resolveAuthenticationContext: async ({ request }) => {
    if (request.method === "POST" && request.headers["x-csrf-token"] !== csrfToken) {
      throw new Error("invalid_browser_qa_csrf");
    }
    return authenticationContext;
  },
  createNetworkContext: async () => ({ source: "human_lifecycle_browser_qa" }),
  serveWebAsset: createTenantWebAssetHandler({ csrfTokenProvider: async () => csrfToken })
});

const address = await host.listen();
console.log(`HUMAN_LIFECYCLE_BROWSER_QA_URL=http://${address.host}:${address.port}/#human`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await host.close();
    process.exit(0);
  });
}
