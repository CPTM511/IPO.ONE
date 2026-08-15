import {
  CreditAuthorityType,
  CreditIntentStatus,
  CreditOfferStatus,
  RepaymentFrequency,
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

const PURPOSE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;
const MAX_TERM_DAYS = 3_660;
const MAX_INSTALLMENTS = 520;
const MAX_ANNUAL_RATE_BPS = 100_000;
const MAX_REASON_CODES = 16;

function assertSafeIntegerRange(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DomainError("invalid_credit_term", `${name} must be an integer between ${minimum} and ${maximum}`, {
      name,
      value
    });
  }
}

function assertCode(name, value, pattern) {
  assertNonEmptyString(name, value);
  if (!pattern.test(value)) {
    throw new DomainError("invalid_credit_code", `${name} must use a stable machine-readable code`, { name });
  }
}

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_credit_timestamp", `${name} must be an ISO timestamp`, { name });
  }
  return parsed.toISOString();
}

function uniqueReasonCodes(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REASON_CODES) {
    throw new DomainError(
      "invalid_credit_reason_codes",
      `reasonCodes must contain between 1 and ${MAX_REASON_CODES} values`
    );
  }
  const normalized = values.map((value) => {
    assertCode("reasonCode", value, REASON_CODE_PATTERN);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_credit_reason_code", "reasonCodes cannot contain duplicates");
  }
  return normalized;
}

export function createCreditIntent({
  subjectId,
  principalId,
  authorityType,
  authorityRef,
  assetId,
  requestedPrincipalMinor,
  purposeCode,
  requestedTermDays,
  repaymentFrequency,
  installmentCount,
  now = new Date()
}) {
  for (const [name, value] of Object.entries({ subjectId, principalId, authorityRef, assetId })) {
    assertNonEmptyString(name, value);
  }
  assertEnumValue("authorityType", authorityType, enumValues(CreditAuthorityType));
  assertEnumValue("repaymentFrequency", repaymentFrequency, enumValues(RepaymentFrequency));
  assertPositiveMinorUnits(requestedPrincipalMinor, "requestedPrincipalMinor");
  assertCode("purposeCode", purposeCode, PURPOSE_CODE_PATTERN);
  assertSafeIntegerRange("requestedTermDays", requestedTermDays, 1, MAX_TERM_DAYS);
  assertSafeIntegerRange("installmentCount", installmentCount, 1, MAX_INSTALLMENTS);

  const createdAt = now.toISOString();
  const intentCore = {
    subjectId,
    principalId,
    authorityType,
    authorityRef,
    assetId,
    requestedPrincipalMinor,
    purposeCode,
    requestedTermDays,
    repaymentFrequency,
    installmentCount,
    sandboxOnly: true,
    productionFundsRequested: false
  };
  assertNoRawPiiReference(intentCore, "creditIntent");

  return {
    creditIntentId: createOperationalId("credit_intent"),
    creditIntentHash: hashId("credit_intent", intentCore),
    ...intentCore,
    status: CreditIntentStatus.SUBMITTED,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "credit_intent.v1"
  };
}

export function createCreditOffer({
  creditOfferId,
  creditIntentId,
  subjectId,
  riskDecisionId,
  assetId,
  approvedPrincipalMinor,
  annualRateBps,
  originationFeeMinor = "0",
  repaymentFrequency,
  installmentCount,
  firstPaymentAt,
  maturityAt,
  validUntil,
  reasonCodes,
  disclosureRef,
  now = new Date()
}) {
  for (const [name, value] of Object.entries({
    creditIntentId,
    subjectId,
    riskDecisionId,
    assetId,
    disclosureRef
  })) {
    assertNonEmptyString(name, value);
  }
  assertPositiveMinorUnits(approvedPrincipalMinor, "approvedPrincipalMinor");
  const fee = assertNonNegativeMinorUnits(originationFeeMinor, "originationFeeMinor");
  if (fee > BigInt(approvedPrincipalMinor)) {
    throw new DomainError("invalid_credit_fee", "originationFeeMinor cannot exceed approvedPrincipalMinor");
  }
  assertSafeIntegerRange("annualRateBps", annualRateBps, 0, MAX_ANNUAL_RATE_BPS);
  assertEnumValue("repaymentFrequency", repaymentFrequency, enumValues(RepaymentFrequency));
  assertSafeIntegerRange("installmentCount", installmentCount, 1, MAX_INSTALLMENTS);

  const createdAt = now.toISOString();
  const normalizedFirstPaymentAt = parseTimestamp("firstPaymentAt", firstPaymentAt);
  const normalizedMaturityAt = parseTimestamp("maturityAt", maturityAt);
  const normalizedValidUntil = parseTimestamp("validUntil", validUntil);
  if (new Date(normalizedValidUntil) <= now) {
    throw new DomainError("expired_credit_offer", "validUntil must be after offer creation");
  }
  if (new Date(normalizedFirstPaymentAt) <= now) {
    throw new DomainError("invalid_credit_schedule", "firstPaymentAt must be after offer creation");
  }
  if (new Date(normalizedMaturityAt) < new Date(normalizedFirstPaymentAt)) {
    throw new DomainError("invalid_credit_schedule", "maturityAt cannot precede firstPaymentAt");
  }

  const normalizedReasonCodes = uniqueReasonCodes(reasonCodes);
  const termsCore = {
    assetId,
    approvedPrincipalMinor,
    annualRateBps,
    originationFeeMinor,
    repaymentFrequency,
    installmentCount,
    firstPaymentAt: normalizedFirstPaymentAt,
    maturityAt: normalizedMaturityAt,
    disclosureRef,
    termsVersion: "credit_terms.v1"
  };
  const offerCore = {
    creditIntentId,
    subjectId,
    riskDecisionId,
    ...termsCore,
    validUntil: normalizedValidUntil,
    reasonCodes: normalizedReasonCodes,
    sandboxOnly: true,
    productionFundsApproved: false
  };
  assertNoRawPiiReference(offerCore, "creditOffer");

  return {
    creditOfferId: creditOfferId ?? createOperationalId("credit_offer"),
    creditOfferHash: hashId("credit_offer", offerCore),
    termsHash: hashId("credit_terms", termsCore),
    ...offerCore,
    status: CreditOfferStatus.OFFERED,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "credit_offer.v1"
  };
}
