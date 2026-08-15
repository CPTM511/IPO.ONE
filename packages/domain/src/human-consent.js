import {
  ConsentPurpose,
  ConsentStatus,
  CreditAuthorityType,
  CreditIntentStatus,
  RepaymentFrequency,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  toMinorUnitBigInt
} from "./validators.js";

const CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;
const VERSION_PATTERN = /^[a-z][a-z0-9_.-]{0,95}\.v[1-9][0-9]*$/;
const MAX_LIST_ITEMS = 16;
const MAX_TERM_DAYS = 3_660;
const MAX_INSTALLMENTS = 520;
const MAX_SANDBOX_CONSENT_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

function clone(value) {
  return structuredClone(value);
}

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_consent_timestamp", `${name} must be an ISO timestamp`, { name });
  }
  return parsed.toISOString();
}

function assertSafeIntegerRange(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DomainError("invalid_consent_limit", `${name} must be an integer between ${minimum} and ${maximum}`, {
      name,
      value
    });
  }
}

function normalizeReference(name, value) {
  assertNonEmptyString(name, value);
  let reference;
  try {
    reference = new URL(value);
  } catch {
    throw new DomainError("invalid_consent_reference", `${name} must be an absolute reference`, { name });
  }
  if (
    reference.username ||
    reference.password ||
    reference.search ||
    reference.hash ||
    ["data:", "javascript:", "file:"].includes(reference.protocol)
  ) {
    throw new DomainError("unsafe_consent_reference", `${name} cannot contain credentials, query, fragment, or unsafe data`, {
      name
    });
  }
  return reference.toString();
}

function normalizeCodeList(name, values, { allowedValues } = {}) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_LIST_ITEMS) {
    throw new DomainError("invalid_consent_scope", `${name} must contain between 1 and ${MAX_LIST_ITEMS} values`, {
      name
    });
  }
  const normalized = values.map((value) => {
    assertNonEmptyString(name, value);
    if (!CODE_PATTERN.test(value)) {
      throw new DomainError("invalid_consent_scope", `${name} must use stable machine-readable codes`, {
        name,
        value
      });
    }
    if (allowedValues) assertEnumValue(name, value, allowedValues);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_consent_scope", `${name} cannot contain duplicate values`, { name });
  }
  return normalized;
}

function normalizeReferenceList(name, values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_LIST_ITEMS) {
    throw new DomainError("invalid_consent_scope", `${name} must contain between 1 and ${MAX_LIST_ITEMS} values`, {
      name
    });
  }
  const normalized = values.map((value) => {
    assertNonEmptyString(name, value);
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_consent_scope", `${name} cannot contain duplicate values`, { name });
  }
  return normalized;
}

function assertVersion(name, value) {
  assertNonEmptyString(name, value);
  if (!VERSION_PATTERN.test(value)) {
    throw new DomainError("invalid_consent_version", `${name} must be a versioned contract identifier`, { name });
  }
}

function assertConsentRecord(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== "consent_record.v1") {
    throw new DomainError("invalid_consent_record", "Consent must use consent_record.v1");
  }
  assertNoRawPiiReference(value, "consentRecord");
}

export function createConsentRecord(input) {
  assertNoRawPiiReference(input, "consentRecord");
  const {
    subjectId,
    principalId,
    purposes,
    allowedAssetIds,
    allowedCreditPurposeCodes,
    allowedRepaymentFrequencies,
    maxRequestedPrincipalMinor,
    maxRequestedTermDays,
    maxInstallmentCount,
    termsRef,
    termsVersion,
    dataUsageRef,
    dataUsageVersion,
    disclosureRef,
    validFrom,
    expiresAt,
    now = new Date()
  } = input;
  for (const [name, value] of Object.entries({ subjectId, principalId })) {
    assertNonEmptyString(name, value);
  }
  const normalizedPurposes = normalizeCodeList("purposes", purposes, {
    allowedValues: enumValues(ConsentPurpose)
  });
  if (!normalizedPurposes.includes(ConsentPurpose.CREDIT_APPLICATION)) {
    throw new DomainError(
      "credit_application_consent_required",
      "credit Consent must include the credit_application purpose"
    );
  }
  const normalizedAssetIds = normalizeReferenceList("allowedAssetIds", allowedAssetIds);
  const normalizedCreditPurposeCodes = normalizeCodeList(
    "allowedCreditPurposeCodes",
    allowedCreditPurposeCodes
  );
  const normalizedRepaymentFrequencies = normalizeCodeList(
    "allowedRepaymentFrequencies",
    allowedRepaymentFrequencies,
    { allowedValues: enumValues(RepaymentFrequency) }
  );
  assertPositiveMinorUnits(maxRequestedPrincipalMinor, "maxRequestedPrincipalMinor");
  assertSafeIntegerRange("maxRequestedTermDays", maxRequestedTermDays, 1, MAX_TERM_DAYS);
  assertSafeIntegerRange("maxInstallmentCount", maxInstallmentCount, 1, MAX_INSTALLMENTS);
  assertVersion("termsVersion", termsVersion);
  assertVersion("dataUsageVersion", dataUsageVersion);
  const normalizedTermsRef = normalizeReference("termsRef", termsRef);
  const normalizedDataUsageRef = normalizeReference("dataUsageRef", dataUsageRef);
  const normalizedDisclosureRef = normalizeReference("disclosureRef", disclosureRef);

  const createdAt = now.toISOString();
  const normalizedValidFrom = parseTimestamp("validFrom", validFrom ?? createdAt);
  const normalizedExpiresAt = parseTimestamp("expiresAt", expiresAt);
  const createdTime = new Date(createdAt).getTime();
  const validFromTime = new Date(normalizedValidFrom).getTime();
  const expiresAtTime = new Date(normalizedExpiresAt).getTime();
  if (validFromTime < createdTime) {
    throw new DomainError("backdated_consent_prohibited", "validFrom cannot precede Consent creation");
  }
  if (expiresAtTime <= validFromTime) {
    throw new DomainError("invalid_consent_window", "expiresAt must be after validFrom");
  }
  if (expiresAtTime - validFromTime > MAX_SANDBOX_CONSENT_DURATION_MS) {
    throw new DomainError("consent_window_too_long", "sandbox Consent cannot remain valid for more than 366 days");
  }

  const scopeCore = {
    purposes: normalizedPurposes,
    allowedAssetIds: normalizedAssetIds,
    allowedCreditPurposeCodes: normalizedCreditPurposeCodes,
    allowedRepaymentFrequencies: normalizedRepaymentFrequencies,
    maxRequestedPrincipalMinor,
    maxRequestedTermDays,
    maxInstallmentCount
  };
  const termsCore = {
    ...scopeCore,
    termsRef: normalizedTermsRef,
    termsVersion,
    disclosureRef: normalizedDisclosureRef
  };
  const dataUsageCore = {
    purposes: normalizedPurposes,
    dataUsageRef: normalizedDataUsageRef,
    dataUsageVersion
  };
  const consentCore = {
    subjectId,
    principalId,
    ...termsCore,
    dataUsageRef: normalizedDataUsageRef,
    dataUsageVersion,
    validFrom: normalizedValidFrom,
    expiresAt: normalizedExpiresAt,
    sandboxOnly: true,
    productionAuthority: false
  };
  assertNoRawPiiReference(consentCore, "consentRecord");

  return {
    consentId: createOperationalId("consent"),
    consentHash: hashId("consent_record", consentCore),
    termsHash: hashId("consent_terms", termsCore),
    dataUsageHash: hashId("consent_data_usage", dataUsageCore),
    ...consentCore,
    status: ConsentStatus.ACTIVE,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "consent_record.v1"
  };
}

export function revokeConsentRecord(consent, { reasonCode, evidenceRef, now = new Date() }) {
  assertConsentRecord(consent);
  if (consent.status === ConsentStatus.REVOKED) return clone(consent);
  if (consent.status !== ConsentStatus.ACTIVE) {
    throw new DomainError("consent_terminal", "only active Consent can be revoked");
  }
  const [normalizedReasonCode] = normalizeCodeList("reasonCode", [reasonCode]);
  const normalizedEvidenceRef = normalizeReference("evidenceRef", evidenceRef);
  const revokedAt = now.toISOString();
  if (new Date(revokedAt) < new Date(consent.createdAt)) {
    throw new DomainError("invalid_consent_timestamp", "revocation cannot precede Consent creation");
  }
  return {
    ...clone(consent),
    status: ConsentStatus.REVOKED,
    revokedAt,
    revocationReasonCode: normalizedReasonCode,
    revocationEvidenceRef: normalizedEvidenceRef,
    updatedAt: revokedAt
  };
}

export function expireConsentRecord(consent, { now = new Date() } = {}) {
  assertConsentRecord(consent);
  if (consent.status === ConsentStatus.EXPIRED || consent.status === ConsentStatus.REVOKED) {
    return clone(consent);
  }
  if (consent.status !== ConsentStatus.ACTIVE) {
    throw new DomainError("consent_terminal", "only active Consent can expire");
  }
  if (now < new Date(consent.expiresAt)) {
    throw new DomainError("consent_not_expired", "Consent cannot expire before expiresAt");
  }
  const expiredAt = now.toISOString();
  return {
    ...clone(consent),
    status: ConsentStatus.EXPIRED,
    expiredAt,
    updatedAt: expiredAt
  };
}

export function assertConsentAuthorizesCreditIntent(consent, creditIntent, { now = new Date() } = {}) {
  assertConsentRecord(consent);
  if (!creditIntent || typeof creditIntent !== "object") {
    throw new DomainError("invalid_credit_intent", "Credit Intent is required");
  }
  assertNoRawPiiReference(creditIntent, "creditIntent");
  if (consent.sandboxOnly !== true || consent.productionAuthority !== false) {
    throw new DomainError("production_consent_prohibited", "Consent is not constrained to the sandbox");
  }
  if (creditIntent.sandboxOnly !== true || creditIntent.productionFundsRequested !== false) {
    throw new DomainError("production_credit_prohibited", "Consent cannot authorize production funds");
  }
  if (consent.status !== ConsentStatus.ACTIVE) {
    throw new DomainError("consent_not_active", "Consent is not active");
  }
  if (now < new Date(consent.validFrom)) {
    throw new DomainError("consent_not_yet_valid", "Consent is not yet valid");
  }
  if (now >= new Date(consent.expiresAt)) {
    throw new DomainError("consent_expired", "Consent has expired");
  }
  if (
    creditIntent.status !== CreditIntentStatus.SUBMITTED ||
    creditIntent.authorityType !== CreditAuthorityType.CONSENT ||
    creditIntent.authorityRef !== consent.consentId ||
    creditIntent.subjectId !== consent.subjectId ||
    creditIntent.principalId !== consent.principalId
  ) {
    throw new DomainError("consent_authority_mismatch", "Credit Intent does not match the Consent authority");
  }
  if (!consent.purposes.includes(ConsentPurpose.CREDIT_APPLICATION)) {
    throw new DomainError("consent_scope_mismatch", "Consent does not allow credit applications");
  }
  if (
    !consent.allowedAssetIds.includes(creditIntent.assetId) ||
    !consent.allowedCreditPurposeCodes.includes(creditIntent.purposeCode) ||
    !consent.allowedRepaymentFrequencies.includes(creditIntent.repaymentFrequency)
  ) {
    throw new DomainError("consent_scope_mismatch", "Credit Intent is outside the Consent scope");
  }
  if (
    toMinorUnitBigInt(creditIntent.requestedPrincipalMinor, "requestedPrincipalMinor") >
      toMinorUnitBigInt(consent.maxRequestedPrincipalMinor, "maxRequestedPrincipalMinor") ||
    creditIntent.requestedTermDays > consent.maxRequestedTermDays ||
    creditIntent.installmentCount > consent.maxInstallmentCount
  ) {
    throw new DomainError("consent_limit_exceeded", "Credit Intent exceeds the Consent limits");
  }
  return true;
}
