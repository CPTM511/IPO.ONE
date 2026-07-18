import {
  ConsentPurpose,
  ConsentStatus,
  CreditAuthorityType,
  CreditIntentStatus,
  CreditOfferStatus,
  MandateCapability,
  MandateStatus,
  ObligationExecutionStatus,
  ObligationStatus,
  RepaymentFrequency,
  SandboxServicingOwner,
  ServicingClassification
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits
} from "./validators.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const DAY_MS = 86_400_000;
const INTERVAL_DAYS = Object.freeze({
  [RepaymentFrequency.WEEKLY]: 7,
  [RepaymentFrequency.BIWEEKLY]: 14,
  [RepaymentFrequency.MONTHLY]: 30
});

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new DomainError("offer_terms_mismatch", `${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function assertOfferChain({ offer, intent, decision }) {
  if (
    !offer || offer.schemaVersion !== "credit_offer.v1" ||
    !intent || intent.schemaVersion !== "credit_intent.v1" ||
    !decision || !["risk_decision.v2", "risk_decision.v3"].includes(decision.schemaVersion) ||
    intent.status !== CreditIntentStatus.DECIDED ||
    decision.status !== "approved" ||
    offer.creditIntentId !== intent.creditIntentId ||
    offer.riskDecisionId !== decision.riskDecisionId ||
    offer.subjectId !== intent.subjectId ||
    decision.subjectId !== intent.subjectId ||
    decision.principalId !== intent.principalId ||
    offer.assetId !== intent.assetId ||
    decision.assetId !== intent.assetId ||
    offer.sandboxOnly !== true ||
    offer.productionFundsApproved !== false
  ) {
    throw new DomainError("offer_not_available", "Offer provenance is unavailable or inconsistent");
  }
}

export function assertConsentAuthorizesCreditOfferAcceptance(consent, { offer, intent, now = new Date() }) {
  if (!consent || consent.schemaVersion !== "consent_record.v1") {
    throw new DomainError("authority_not_current", "Offer acceptance requires Consent v1");
  }
  assertNoRawPiiReference(consent, "creditOfferAcceptance.consent");
  if (
    consent.status !== ConsentStatus.ACTIVE ||
    consent.sandboxOnly !== true ||
    consent.productionAuthority !== false ||
    now < new Date(consent.validFrom) ||
    now >= new Date(consent.expiresAt)
  ) {
    throw new DomainError("authority_not_current", "Consent is not current");
  }
  if (
    intent.authorityType !== CreditAuthorityType.CONSENT ||
    intent.authorityRef !== consent.consentId ||
    intent.subjectId !== consent.subjectId ||
    intent.principalId !== consent.principalId
  ) {
    throw new DomainError("authority_not_current", "Consent does not match the accepted Offer provenance");
  }
  const requiredPurposes = [
    ConsentPurpose.CREDIT_APPLICATION,
    ConsentPurpose.CREDIT_DECISION,
    ConsentPurpose.CREDIT_OFFER_ACCEPTANCE,
    ConsentPurpose.OBLIGATION_SERVICING,
    ConsentPurpose.IDENTITY_REFERENCE_USE
  ];
  if (requiredPurposes.some((purpose) => !consent.purposes.includes(purpose))) {
    throw new DomainError("acceptance_scope_not_authorized", "Consent does not authorize Offer acceptance and servicing");
  }
  if (
    !consent.allowedAssetIds.includes(offer.assetId) ||
    !consent.allowedCreditPurposeCodes.includes(intent.purposeCode) ||
    !consent.allowedRepaymentFrequencies.includes(offer.repaymentFrequency) ||
    BigInt(offer.approvedPrincipalMinor) > BigInt(consent.maxRequestedPrincipalMinor) ||
    intent.requestedTermDays > consent.maxRequestedTermDays ||
    offer.installmentCount > consent.maxInstallmentCount
  ) {
    throw new DomainError("acceptance_scope_not_authorized", "Offer exceeds the current Consent scope");
  }
  return true;
}

export function assertMandateAuthorizesCreditOfferAcceptance(mandate, { offer, intent, now = new Date() }) {
  if (
    !mandate ||
    mandate.status !== MandateStatus.ACTIVE ||
    mandate.sandboxOnly !== true ||
    mandate.productionAuthority !== false ||
    now < new Date(mandate.validFrom) ||
    now >= new Date(mandate.expiresAt)
  ) {
    throw new DomainError("authority_not_current", "Mandate is not current and active");
  }
  if (
    intent.authorityType !== CreditAuthorityType.MANDATE ||
    intent.authorityRef !== mandate.mandateId ||
    intent.subjectId !== mandate.subjectId ||
    intent.principalId !== mandate.principalId
  ) {
    throw new DomainError("authority_not_current", "Mandate does not match the accepted Offer provenance");
  }
  if (
    !mandate.capabilities.includes(MandateCapability.REQUEST_CREDIT) ||
    !mandate.capabilities.includes(MandateCapability.ACCEPT_CREDIT_OFFER) ||
    !mandate.assetIds.includes(offer.assetId) ||
    BigInt(offer.approvedPrincipalMinor) > BigInt(mandate.perActionLimitMinor) ||
    BigInt(offer.approvedPrincipalMinor) > BigInt(mandate.aggregateLimitMinor) - BigInt(mandate.utilizedMinor)
  ) {
    throw new DomainError("acceptance_scope_not_authorized", "Offer exceeds the active Mandate scope");
  }
  return true;
}

export function acceptCreditOffer(offer, {
  expectedOfferHash,
  expectedTermsHash,
  acceptanceId,
  now = new Date()
}) {
  assertHash("expectedOfferHash", expectedOfferHash);
  assertHash("expectedTermsHash", expectedTermsHash);
  assertNonEmptyString("acceptanceId", acceptanceId);
  if (offer.status !== CreditOfferStatus.OFFERED) {
    throw new DomainError("offer_not_available", "Offer is no longer available");
  }
  if (now >= new Date(offer.validUntil)) {
    throw new DomainError("offer_expired", "Offer has expired");
  }
  if (offer.creditOfferHash !== expectedOfferHash || offer.termsHash !== expectedTermsHash) {
    throw new DomainError("offer_terms_mismatch", "Offer or terms hash is stale");
  }
  return Object.freeze({
    ...structuredClone(offer),
    status: CreditOfferStatus.ACCEPTED,
    acceptanceId,
    acceptedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
}

export function createCreditOfferAcceptance({
  offer,
  intent,
  decision,
  authorityType,
  authorityRef,
  acknowledgementHash,
  acceptedByActorId,
  now = new Date()
}) {
  assertOfferChain({ offer, intent, decision });
  assertHash("acknowledgementHash", acknowledgementHash);
  for (const [name, value] of Object.entries({ authorityRef, acceptedByActorId })) {
    assertNonEmptyString(name, value);
  }
  if (authorityType !== intent.authorityType || authorityRef !== intent.authorityRef) {
    throw new DomainError("authority_not_current", "Acceptance authority does not match the Credit Intent");
  }
  const core = {
    creditOfferId: offer.creditOfferId,
    creditOfferHash: offer.creditOfferHash,
    termsHash: offer.termsHash,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    authorityType,
    authorityRef,
    ...(authorityType === CreditAuthorityType.CONSENT
      ? { consentId: authorityRef }
      : { mandateId: authorityRef }),
    acknowledgementHash,
    acceptedByActorHash: hashId("actor", acceptedByActorId),
    acceptedAt: now.toISOString(),
    sandboxOnly: true,
    productionAuthority: false
  };
  assertNoRawPiiReference(core, "creditOfferAcceptance");
  const acceptanceHash = hashId("credit_offer_acceptance", core);
  return Object.freeze({
    creditOfferAcceptanceId: `credit_offer_acceptance_${acceptanceHash.slice(2)}`,
    acceptanceHash,
    ...core,
    schemaVersion: "credit_offer_acceptance.v1"
  });
}

export function createObligationSchedule({ obligationId, offer }) {
  assertNonEmptyString("obligationId", obligationId);
  const principal = BigInt(assertPositiveMinorUnits(offer.approvedPrincipalMinor, "approvedPrincipalMinor"));
  const count = offer.installmentCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > 520) {
    throw new DomainError("invalid_credit_schedule", "Offer installment count is invalid");
  }
  const first = new Date(offer.firstPaymentAt);
  const maturity = new Date(offer.maturityAt);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(maturity.getTime()) || maturity < first) {
    throw new DomainError("invalid_credit_schedule", "Offer schedule timestamps are invalid");
  }
  const intervalDays = INTERVAL_DAYS[offer.repaymentFrequency];
  if (count > 1 && !intervalDays) {
    throw new DomainError("invalid_credit_schedule", "Offer frequency cannot produce multiple installments");
  }
  const basePrincipal = principal / BigInt(count);
  const remainder = principal % BigInt(count);
  const scheduleVersion = "obligation_schedule.v1";
  let previousDueAt;
  const installments = Array.from({ length: count }, (_, index) => {
    const installmentNumber = index + 1;
    const dueAt = installmentNumber === count
      ? maturity.toISOString()
      : new Date(first.getTime() + index * intervalDays * DAY_MS).toISOString();
    if (previousDueAt !== undefined && new Date(dueAt) <= new Date(previousDueAt)) {
      throw new DomainError("invalid_credit_schedule", "Offer schedule is not strictly increasing");
    }
    previousDueAt = dueAt;
    const scheduledPrincipal = basePrincipal + (installmentNumber === count ? remainder : 0n);
    const rowCore = {
      obligationId,
      installmentNumber,
      dueAt,
      scheduledPrincipalMinor: scheduledPrincipal.toString(),
      scheduledInterestMinor: "0",
      scheduledFeeMinor: "0",
      paidPrincipalMinor: "0",
      paidInterestMinor: "0",
      paidFeeMinor: "0",
      status: "scheduled",
      scheduleVersion,
      scheduleSequence: 1
    };
    return Object.freeze({
      installmentId: `obligation_installment_${hashId("obligation_installment", rowCore).slice(2)}`,
      ...rowCore,
      schemaVersion: "obligation_installment.v1"
    });
  });
  const total = installments.reduce((sum, row) => sum + BigInt(row.scheduledPrincipalMinor), 0n);
  if (total !== principal || installments.at(-1)?.dueAt !== maturity.toISOString()) {
    throw new DomainError("invalid_credit_schedule", "normalized schedule does not reconcile to Offer terms");
  }
  return Object.freeze({
    scheduleVersion,
    scheduleHash: hashId("obligation_schedule", installments),
    installments: Object.freeze(installments)
  });
}

export function createAcceptedOfferObligation({ offer, intent, decision, acceptance, now = new Date() }) {
  assertOfferChain({ offer, intent, decision });
  if (
    acceptance.creditOfferId !== offer.creditOfferId ||
    acceptance.creditIntentId !== intent.creditIntentId ||
    acceptance.riskDecisionId !== decision.riskDecisionId ||
    acceptance.authorityType !== intent.authorityType ||
    acceptance.authorityRef !== intent.authorityRef
  ) {
    throw new DomainError("offer_not_available", "Acceptance does not match Offer provenance");
  }
  const obligationId = createOperationalId("obligation");
  const schedule = createObligationSchedule({ obligationId, offer });
  const core = {
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    creditIntentId: intent.creditIntentId,
    riskDecisionId: decision.riskDecisionId,
    creditOfferId: offer.creditOfferId,
    creditOfferAcceptanceId: acceptance.creditOfferAcceptanceId,
    authorityType: intent.authorityType,
    authorityRef: intent.authorityRef,
    ...(intent.authorityType === CreditAuthorityType.CONSENT
      ? { consentId: intent.authorityRef }
      : { mandateId: intent.authorityRef }),
    assetId: offer.assetId,
    originalPrincipalMinor: offer.approvedPrincipalMinor,
    outstandingPrincipalMinor: offer.approvedPrincipalMinor,
    annualRateBps: offer.annualRateBps,
    originationFeeMinor: offer.originationFeeMinor,
    accruedInterestMinor: "0",
    outstandingInterestMinor: "0",
    accruedFeesMinor: "0",
    outstandingFeesMinor: "0",
    totalRepaidMinor: "0",
    repaymentFrequency: offer.repaymentFrequency,
    installmentCount: offer.installmentCount,
    firstPaymentAt: offer.firstPaymentAt,
    maturityAt: offer.maturityAt,
    scheduleVersion: schedule.scheduleVersion,
    scheduleSequence: 1,
    scheduleHash: schedule.scheduleHash,
    installments: schedule.installments,
    executionStatus: ObligationExecutionStatus.PENDING,
    sandboxOnly: true,
    productionFundsMoved: false,
    status: ObligationStatus.CREATED,
    servicingClassification: ServicingClassification.CURRENT,
    daysPastDue: 0,
    oldestUnpaidInstallmentId: schedule.installments[0].installmentId,
    servicingEffectiveAt: now.toISOString(),
    servicingReasonCode: "obligation_created",
    servicingPolicyVersion: "sandbox-servicing-policy.v1",
    servicingOwnerCode: SandboxServicingOwner.PLATFORM,
    writtenOffPrincipalMinor: "0",
    writtenOffInterestMinor: "0",
    writtenOffFeesMinor: "0",
    acceptedAt: acceptance.acceptedAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  assertNoRawPiiReference(core, "acceptedOfferObligation");
  return Object.freeze({
    obligationId,
    obligationHash: hashId("obligation_v2", core),
    ...core,
    schemaVersion: "obligation.v2"
  });
}
