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
const disableAuthenticationDiscovery =
  process.env.IPO_ONE_BROWSER_QA_DISABLE_AUTH_DISCOVERY === "1";
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
const creditPassportCreateFixture = tenantProtocolFixtures.validResults.find(
  ({ operationId }) => operationId === "pilotCreateCreditPassportArtifact"
);
const creditPassportRevokeFixture = tenantProtocolFixtures.validResults.find(
  ({ operationId }) => operationId === "pilotRevokeCreditPassportArtifact"
);

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

function obligationEvidence(obligationId, evidenceObligation) {
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
  return {
    obligationId,
    asOf: new Date(
      Math.max(
        new Date("2026-08-16T12:00:01.000Z").getTime(),
        new Date(evidenceObligation.servicingEffectiveAt).getTime() + 2_000
      )
    ).toISOString(),
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
  };
}

function pagedObligationEvidence(obligationId, evidenceObligation, cursor) {
  const complete = obligationEvidence(obligationId, evidenceObligation);
  if (cursor === "browser_qa_evidence_page_2") {
    return {
      ...complete,
      items: complete.items.slice(3),
      hasMore: false
    };
  }
  if (cursor !== undefined) {
    throw new DomainError(
      "tenant_resource_unavailable",
      "The requested resource is not available."
    );
  }
  return {
    ...complete,
    items: complete.items.slice(0, 3),
    hasMore: true,
    nextCursor: "browser_qa_evidence_page_2"
  };
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
  if (operationId === "pilotReadTenantRisk" || operationId === "pilotFreezeSubject") {
    throw new DomainError("authorization_denied", "The requested operation is not available.");
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
      schemaVersion: "tenant_workspace_resume_view.v1"
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
    const obligation = curedObligation(
      secondary ? secondaryCurrentObligation : obligationAt("executed")
    );
    const servicingAction = cureAction(obligation);
    if (secondary) {
      secondaryCurrentObligation = obligation;
      secondaryServicingAction = servicingAction;
    } else {
      currentObligation = obligation;
      currentServicingAction = servicingAction;
    }
    return protocolResult(operationId, {
      obligation,
      repayment: curedRepayment(obligation),
      servicingAction,
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
      pagedObligationEvidence(
        obligationId,
        evidenceObligation,
        command.payload?.cursor
      )
    );
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

async function serveAuthentication({ request, response, url, requestId }) {
  if (disableAuthenticationDiscovery) return false;
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
  environment: "development",
  credentialSource: "local_test",
  gateway: { async execute(command) { return resultFor(command); } },
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
    csrfTokenProvider: async () => browserSessionActive ? csrfToken : undefined
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
