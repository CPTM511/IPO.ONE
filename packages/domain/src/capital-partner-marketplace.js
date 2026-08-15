import {
  CreditOfferStatus,
  ObligationStatus,
  RepaymentFrequency,
  ServicingClassification,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertNonNegativeMinorUnits,
  assertPositiveMinorUnits
} from "./validators.js";

export const CAPITAL_PARTNER_PROFILE_SCHEMA_VERSION = "capital_partner_profile.v1";
export const CAPITAL_PARTNER_OFFER_SCHEMA_VERSION = "credit_offer.v2";
export const FACILITY_VIEW_SCHEMA_VERSION = "facility_view.v1";
export const CAPITAL_PARTNER_PORTFOLIO_SCHEMA_VERSION = "capital_partner_portfolio.v1";

export const CapitalPartnerOfferCondition = Object.freeze({
  PASSPORT_CURRENT_AT_ACCEPTANCE: "passport_current_at_acceptance",
  AUTHORITY_CURRENT_AT_ACCEPTANCE: "authority_current_at_acceptance",
  NO_ADVERSE_OBLIGATION_AT_ACCEPTANCE: "no_adverse_obligation_at_acceptance"
});

export const UndrawnRevocationRule = Object.freeze({
  CAPITAL_PARTNER_BEFORE_ACCEPTANCE: "capital_partner_before_acceptance",
  IRREVOCABLE_UNTIL_EXPIRY: "irrevocable_until_expiry"
});

const OFFER_STATUS_SET = new Set(Object.values(CreditOfferStatus));
const TERMINAL_OFFER_STATUS_SET = new Set([
  CreditOfferStatus.ACCEPTED,
  CreditOfferStatus.DECLINED,
  CreditOfferStatus.EXPIRED,
  CreditOfferStatus.WITHDRAWN,
  CreditOfferStatus.SUPERSEDED
]);
const CONDITION_SET = new Set(Object.values(CapitalPartnerOfferCondition));
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;
const MAX_ANNUAL_RATE_BPS = 100_000;
const MAX_INSTALLMENTS = 520;
const MAX_CONDITIONS = 12;

function invalid(message, details) {
  throw new DomainError("invalid_capital_partner_marketplace", message, details);
}

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(`${name} must be a lowercase bytes32 value`);
  }
  return value;
}

function assertDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid(`${name} must be a valid Date`);
  }
}

function timestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function integer(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function code(name, value) {
  assertNonEmptyString(name, value);
  if (!CODE_PATTERN.test(value)) invalid(`${name} must be a stable machine-readable code`);
  return value;
}

function conditions(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_CONDITIONS) {
    invalid(`conditions must contain between 1 and ${MAX_CONDITIONS} values`);
  }
  const normalized = values.map((value) => {
    if (!CONDITION_SET.has(value)) invalid("conditions contains an unsupported value");
    return value;
  });
  if (new Set(normalized).size !== normalized.length) invalid("conditions cannot contain duplicates");
  return Object.freeze(normalized);
}

function reasonCodes(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16) {
    invalid("reasonCodes must contain between 1 and 16 values");
  }
  const normalized = values.map((value) => code("reasonCode", value));
  if (new Set(normalized).size !== normalized.length) invalid("reasonCodes cannot contain duplicates");
  return Object.freeze(normalized);
}

function assertPassportUnderwritingChain({ creditIntent, decision, passportArtifact, passportVerification }) {
  if (
    !creditIntent ||
    creditIntent.schemaVersion !== "credit_intent.v1" ||
    creditIntent.status !== "decided" ||
    !decision ||
    decision.schemaVersion !== "risk_decision.v3" ||
    decision.status !== "approved" ||
    !passportArtifact ||
    passportArtifact.schemaVersion !== "credit_passport_artifact.v1" ||
    passportArtifact.status !== "active" ||
    !passportVerification ||
    passportVerification.schemaVersion !== "credit_passport_verification.v1" ||
    passportVerification.verified !== true ||
    passportVerification.status !== "active" ||
    passportVerification.sourceCurrent !== true ||
    decision.creditIntentId !== creditIntent.creditIntentId ||
    decision.subjectId !== creditIntent.subjectId ||
    passportArtifact.subjectId !== creditIntent.subjectId ||
    passportArtifact.sourceRiskDecisionId !== decision.riskDecisionId ||
    passportArtifact.sourceDecisionHash !== decision.decisionHash ||
    passportVerification.artifactHash !== passportArtifact.artifactHash ||
    passportVerification.artifactVersion !== passportArtifact.version ||
    passportArtifact.purpose !== "private_credit_review" ||
    passportArtifact.sandboxOnly !== true ||
    passportArtifact.productionAuthority !== false
  ) {
    throw new DomainError(
      "capital_partner_underwriting_provenance_unavailable",
      "Credit Intent, Decision, Passport, and verification provenance must be current and exact"
    );
  }
}

export function createCapitalPartnerProfile({
  capitalPartnerId,
  organizationRef,
  displayName,
  operatorActorId,
  tenantId,
  now = new Date()
}) {
  assertDate("now", now);
  for (const [name, value] of Object.entries({
    capitalPartnerId,
    organizationRef,
    displayName,
    operatorActorId,
    tenantId
  })) assertNonEmptyString(name, value);
  const core = {
    capitalPartnerId,
    organizationRef,
    displayName,
    operatorActorId,
    tenantId,
    status: "active",
    invitationOnly: true,
    sameTenantOnly: true,
    sandboxOnly: true,
    productionFundsAuthority: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  assertNoRawPiiReference(core, "capitalPartnerProfile");
  return Object.freeze({
    ...core,
    profileHash: hashId("capital_partner_profile", core),
    schemaVersion: CAPITAL_PARTNER_PROFILE_SCHEMA_VERSION
  });
}

export function createCapitalPartnerCreditOffer({
  creditOfferId,
  creditIntent,
  decision,
  passportArtifact,
  passportVerification,
  capitalPartnerId,
  capitalPartnerOperatorId,
  underwritingSnapshotHash,
  assetId,
  facilityLimitMinor,
  approvedPrincipalMinor,
  perDrawCapMinor,
  annualRateBps,
  originationFeeMinor = "0",
  repaymentFrequency,
  installmentCount,
  firstPaymentAt,
  maturityAt,
  permittedPurposeCode,
  conditions: offerConditions = Object.values(CapitalPartnerOfferCondition),
  undrawnRevocationRule = UndrawnRevocationRule.CAPITAL_PARTNER_BEFORE_ACCEPTANCE,
  validUntil,
  reasonCodes: offerReasonCodes = ["capital_partner_underwritten"],
  disclosureRef,
  now = new Date()
}) {
  assertDate("now", now);
  assertPassportUnderwritingChain({
    creditIntent,
    decision,
    passportArtifact,
    passportVerification
  });
  for (const [name, value] of Object.entries({
    capitalPartnerId,
    capitalPartnerOperatorId,
    assetId,
    disclosureRef
  })) assertNonEmptyString(name, value);
  assertHash("underwritingSnapshotHash", underwritingSnapshotHash);
  const limit = BigInt(assertPositiveMinorUnits(facilityLimitMinor, "facilityLimitMinor"));
  const principal = BigInt(assertPositiveMinorUnits(approvedPrincipalMinor, "approvedPrincipalMinor"));
  const perDraw = BigInt(assertPositiveMinorUnits(perDrawCapMinor, "perDrawCapMinor"));
  const fee = BigInt(assertNonNegativeMinorUnits(originationFeeMinor, "originationFeeMinor"));
  if (principal > limit || principal > perDraw || perDraw > limit) {
    invalid("approved principal and per-draw cap must remain within the Facility limit");
  }
  if (fee > principal) invalid("originationFeeMinor cannot exceed approvedPrincipalMinor");
  integer("annualRateBps", annualRateBps, 0, MAX_ANNUAL_RATE_BPS);
  assertEnumValue("repaymentFrequency", repaymentFrequency, enumValues(RepaymentFrequency));
  integer("installmentCount", installmentCount, 1, MAX_INSTALLMENTS);
  const normalizedFirstPaymentAt = timestamp("firstPaymentAt", firstPaymentAt);
  const normalizedMaturityAt = timestamp("maturityAt", maturityAt);
  const normalizedValidUntil = timestamp("validUntil", validUntil);
  if (new Date(normalizedValidUntil) <= now) invalid("validUntil must be after Offer creation");
  if (new Date(normalizedFirstPaymentAt) <= now) invalid("firstPaymentAt must be after Offer creation");
  if (new Date(normalizedMaturityAt) < new Date(normalizedFirstPaymentAt)) {
    invalid("maturityAt cannot precede firstPaymentAt");
  }
  code("permittedPurposeCode", permittedPurposeCode);
  if (
    assetId !== creditIntent.assetId ||
    permittedPurposeCode !== creditIntent.purposeCode ||
    principal > BigInt(creditIntent.requestedPrincipalMinor) ||
    repaymentFrequency !== creditIntent.repaymentFrequency ||
    installmentCount !== creditIntent.installmentCount
  ) {
    throw new DomainError(
      "capital_partner_offer_outside_intent",
      "Capital Partner terms must remain within the exact borrower Credit Intent"
    );
  }
  if (!Object.values(UndrawnRevocationRule).includes(undrawnRevocationRule)) {
    invalid("undrawnRevocationRule is unsupported");
  }
  const normalizedConditions = conditions(offerConditions);
  const normalizedReasonCodes = reasonCodes(offerReasonCodes);
  const passportVerificationHash = hashId(
    "credit_passport_verification",
    passportVerification
  );
  const termsCore = {
    assetId,
    facilityLimitMinor,
    approvedPrincipalMinor,
    perDrawCapMinor,
    annualRateBps,
    originationFeeMinor,
    repaymentFrequency,
    installmentCount,
    firstPaymentAt: normalizedFirstPaymentAt,
    maturityAt: normalizedMaturityAt,
    permittedPurposeCode,
    conditions: normalizedConditions,
    undrawnRevocationRule,
    disclosureRef,
    termsVersion: "credit_terms.v2"
  };
  const offerCore = {
    creditIntentId: creditIntent.creditIntentId,
    subjectId: creditIntent.subjectId,
    riskDecisionId: decision.riskDecisionId,
    capitalPartnerId,
    capitalPartnerOperatorId,
    creditPassportArtifactId: passportArtifact.creditPassportArtifactId,
    creditPassportArtifactHash: passportArtifact.artifactHash,
    creditPassportArtifactVersion: passportArtifact.version,
    passportVerificationHash,
    underwritingSnapshotHash,
    ...termsCore,
    validUntil: normalizedValidUntil,
    reasonCodes: normalizedReasonCodes,
    sandboxOnly: true,
    productionFundsApproved: false
  };
  assertNoRawPiiReference(offerCore, "capitalPartnerCreditOffer");
  const createdAt = now.toISOString();
  return Object.freeze({
    creditOfferId: creditOfferId ?? createOperationalId("credit_offer"),
    creditOfferHash: hashId("credit_offer_v2", offerCore),
    termsHash: hashId("credit_terms_v2", termsCore),
    ...offerCore,
    status: CreditOfferStatus.OFFERED,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: CAPITAL_PARTNER_OFFER_SCHEMA_VERSION
  });
}

export function transitionCapitalPartnerCreditOffer({
  offer,
  nextStatus,
  capitalPartnerId,
  capitalPartnerOperatorId,
  supersedingOfferId,
  now = new Date()
}) {
  assertDate("now", now);
  if (
    offer?.schemaVersion !== CAPITAL_PARTNER_OFFER_SCHEMA_VERSION ||
    offer.status !== CreditOfferStatus.OFFERED ||
    !OFFER_STATUS_SET.has(nextStatus) ||
    !TERMINAL_OFFER_STATUS_SET.has(nextStatus) ||
    nextStatus === CreditOfferStatus.ACCEPTED ||
    offer.capitalPartnerId !== capitalPartnerId ||
    offer.capitalPartnerOperatorId !== capitalPartnerOperatorId
  ) invalid("only the authoring Capital Partner may close its offered v2 Offer");
  if (
    nextStatus === CreditOfferStatus.WITHDRAWN &&
    offer.undrawnRevocationRule === UndrawnRevocationRule.IRREVOCABLE_UNTIL_EXPIRY
  ) invalid("the Offer is irrevocable until expiry");
  if (
    (nextStatus === CreditOfferStatus.EXPIRED) !==
    (now >= new Date(offer.validUntil))
  ) invalid("Offer expiry must match its validity window");
  if (nextStatus === CreditOfferStatus.SUPERSEDED) {
    assertNonEmptyString("supersedingOfferId", supersedingOfferId);
    if (supersedingOfferId === offer.creditOfferId) invalid("an Offer cannot supersede itself");
  }
  return Object.freeze({
    ...structuredClone(offer),
    status: nextStatus,
    ...(nextStatus === CreditOfferStatus.SUPERSEDED ? { supersedingOfferId } : {}),
    closedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
}

function amount(value) {
  return BigInt(assertNonNegativeMinorUnits(value, "portfolioAmount"));
}

function minor(value) {
  return value.toString();
}

export function createFacilityView({
  offer,
  obligation,
  lockbox,
  latestServicingAction,
  evidenceCoverage,
  asOf = new Date()
}) {
  assertDate("asOf", asOf);
  if (
    offer?.schemaVersion !== CAPITAL_PARTNER_OFFER_SCHEMA_VERSION ||
    offer.status !== CreditOfferStatus.ACCEPTED ||
    obligation?.schemaVersion !== "obligation.v2" ||
    obligation.creditOfferId !== offer.creditOfferId ||
    obligation.subjectId !== offer.subjectId ||
    obligation.assetId !== offer.assetId ||
    obligation.originalPrincipalMinor !== offer.approvedPrincipalMinor ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false
  ) invalid("Facility view requires one exact accepted Offer and shared Obligation");
  if (lockbox && lockbox.subjectId !== obligation.subjectId) {
    invalid("Facility Lockbox does not match the Obligation");
  }
  if (latestServicingAction && latestServicingAction.obligationId !== obligation.obligationId) {
    invalid("Facility servicing state does not match the Obligation");
  }
  const coverage = evidenceCoverage ?? {
    requiredEventCount: 0,
    anchoredEventCount: 0,
    status: "not_evaluated"
  };
  const core = {
    facilityId: `facility_${hashId("capital_partner_facility", {
      creditOfferId: offer.creditOfferId,
      obligationId: obligation.obligationId
    }).slice(2)}`,
    capitalPartnerId: offer.capitalPartnerId,
    creditOfferId: offer.creditOfferId,
    obligationId: obligation.obligationId,
    subjectId: obligation.subjectId,
    assetId: obligation.assetId,
    facilityLimitMinor: offer.facilityLimitMinor,
    utilizedMinor: obligation.originalPrincipalMinor,
    outstandingMinor: obligation.outstandingPrincipalMinor,
    repaidMinor: obligation.totalRepaidMinor,
    availableMinor: minor(amount(offer.facilityLimitMinor) - amount(obligation.originalPrincipalMinor)),
    status: obligation.status,
    servicingClassification: obligation.servicingClassification,
    daysPastDue: obligation.daysPastDue,
    nextPayment: obligation.installments.find((row) => row.status !== "paid") ?? null,
    scheduleHash: obligation.scheduleHash,
    ...(lockbox ? {
      lockboxId: lockbox.lockboxId,
      lockboxStatus: lockbox.status,
      lockboxBalanceMinor: lockbox.balanceMinor
    } : {}),
    ...(latestServicingAction ? {
      latestServicingActionId: latestServicingAction.servicingActionId
    } : {}),
    evidenceCoverage: structuredClone(coverage),
    asOf: asOf.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false
  };
  assertNoRawPiiReference(core, "facilityView");
  return Object.freeze({
    ...core,
    schemaVersion: FACILITY_VIEW_SCHEMA_VERSION
  });
}

export function createCapitalPartnerPortfolio({
  capitalPartnerId,
  offers,
  facilities,
  asOf = new Date()
}) {
  assertNonEmptyString("capitalPartnerId", capitalPartnerId);
  assertDate("asOf", asOf);
  if (!Array.isArray(offers) || !Array.isArray(facilities)) {
    invalid("offers and facilities must be arrays");
  }
  if (offers.some((offer) => (
    offer.schemaVersion !== CAPITAL_PARTNER_OFFER_SCHEMA_VERSION ||
    offer.capitalPartnerId !== capitalPartnerId
  ))) invalid("portfolio Offer scope is inconsistent");
  if (facilities.some((facility) => (
    facility.schemaVersion !== FACILITY_VIEW_SCHEMA_VERSION ||
    facility.capitalPartnerId !== capitalPartnerId
  ))) invalid("portfolio Facility scope is inconsistent");

  const sum = (values) => minor(values.reduce((total, value) => total + amount(value), 0n));
  const activeOffers = offers.filter(({ status }) => status === CreditOfferStatus.OFFERED);
  const outstandingFacilities = facilities.filter(({ status }) => ![
    ObligationStatus.FULLY_REPAID,
    ObligationStatus.WRITTEN_OFF,
    ObligationStatus.CLOSED
  ].includes(status));
  const rows = facilities.map((facility) => ({
    facilityId: facility.facilityId,
    creditOfferId: facility.creditOfferId,
    obligationId: facility.obligationId,
    subjectId: facility.subjectId,
    assetId: facility.assetId,
    utilizedMinor: facility.utilizedMinor,
    outstandingMinor: facility.outstandingMinor,
    repaidMinor: facility.repaidMinor,
    status: facility.status,
    servicingClassification: facility.servicingClassification,
    daysPastDue: facility.daysPastDue,
    nextPayment: facility.nextPayment,
    evidenceCoverage: facility.evidenceCoverage
  }));
  const core = {
    capitalPartnerId,
    authoredOfferCount: offers.length,
    activeOfferCount: activeOffers.length,
    activeFacilityCount: outstandingFacilities.length,
    completedFacilityCount: facilities.length - outstandingFacilities.length,
    committedMinor: sum(offers
      .filter(({ status }) => [CreditOfferStatus.OFFERED, CreditOfferStatus.ACCEPTED].includes(status))
      .map(({ facilityLimitMinor }) => facilityLimitMinor)),
    availableMinor: sum([
      ...activeOffers.map(({ facilityLimitMinor }) => facilityLimitMinor),
      ...facilities.map(({ availableMinor }) => availableMinor)
    ]),
    utilizedMinor: sum(facilities.map(({ utilizedMinor }) => utilizedMinor)),
    outstandingMinor: sum(facilities.map(({ outstandingMinor }) => outstandingMinor)),
    repaidMinor: sum(facilities.map(({ repaidMinor }) => repaidMinor)),
    overdueMinor: sum(facilities
      .filter(({ daysPastDue }) => daysPastDue > 0)
      .map(({ outstandingMinor }) => outstandingMinor)),
    writtenOffMinor: sum(facilities
      .filter(({ status, servicingClassification }) => (
        status === ObligationStatus.WRITTEN_OFF ||
        servicingClassification === ServicingClassification.WRITTEN_OFF
      ))
      .map(({ outstandingMinor }) => outstandingMinor)),
    offers: offers.map((offer) => ({
      creditOfferId: offer.creditOfferId,
      creditIntentId: offer.creditIntentId,
      creditPassportArtifactId: offer.creditPassportArtifactId,
      subjectId: offer.subjectId,
      assetId: offer.assetId,
      facilityLimitMinor: offer.facilityLimitMinor,
      approvedPrincipalMinor: offer.approvedPrincipalMinor,
      status: offer.status,
      validUntil: offer.validUntil,
      updatedAt: offer.updatedAt
    })),
    facilities: rows,
    asOf: asOf.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false
  };
  assertNoRawPiiReference(core, "capitalPartnerPortfolio");
  return Object.freeze({
    ...core,
    portfolioHash: hashId("capital_partner_portfolio", core),
    schemaVersion: CAPITAL_PARTNER_PORTFOLIO_SCHEMA_VERSION
  });
}
