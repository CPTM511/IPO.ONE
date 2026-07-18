import {
  ConsentPurpose,
  ConsentStatus,
  HumanIdentityAssurance,
  HumanIdentityReferenceStatus,
  HumanIdentityReferenceType,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import {
  assertEnumValue,
  assertNoRawPiiReference,
  assertNonEmptyString
} from "./validators.js";

const CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,95}$/;
const VERSION_PATTERN = /^[a-z][a-z0-9_.-]{0,95}\.v[1-9][0-9]*$/;
const MAX_LIST_ITEMS = 8;
const MAX_SYNTHETIC_REFERENCE_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

function clone(value) {
  return structuredClone(value);
}

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_identity_reference_timestamp", `${name} must be an ISO timestamp`, { name });
  }
  return parsed.toISOString();
}

function normalizeReference(name, value) {
  assertNonEmptyString(name, value);
  let reference;
  try {
    reference = new URL(value);
  } catch {
    throw new DomainError("invalid_identity_reference", `${name} must be an absolute reference`, { name });
  }
  if (
    reference.username ||
    reference.password ||
    reference.search ||
    reference.hash ||
    ["data:", "javascript:", "file:"].includes(reference.protocol)
  ) {
    throw new DomainError(
      "unsafe_identity_reference",
      `${name} cannot contain credentials, query, fragment, or unsafe data`,
      { name }
    );
  }
  return reference.toString();
}

function assertVersion(name, value) {
  assertNonEmptyString(name, value);
  if (!VERSION_PATTERN.test(value)) {
    throw new DomainError("invalid_identity_reference_version", `${name} must be a versioned contract identifier`, {
      name
    });
  }
}

function normalizePurposeCodes(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_LIST_ITEMS) {
    throw new DomainError(
      "invalid_identity_reference_purpose",
      `purposeCodes must contain between 1 and ${MAX_LIST_ITEMS} values`
    );
  }
  const normalized = values.map((value) => {
    assertNonEmptyString("purposeCode", value);
    if (!CODE_PATTERN.test(value)) {
      throw new DomainError("invalid_identity_reference_purpose", "purposeCodes must be stable machine-readable codes");
    }
    assertEnumValue("purposeCode", value, enumValues(ConsentPurpose));
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_identity_reference_purpose", "purposeCodes cannot contain duplicates");
  }
  if (!normalized.includes(ConsentPurpose.IDENTITY_REFERENCE_USE)) {
    throw new DomainError(
      "identity_reference_use_required",
      "identity reference purpose must include identity_reference_use"
    );
  }
  return normalized;
}

function assertConsentForIdentityReference(consent, { subjectId, principalId, purposeCodes, now }) {
  if (!consent || typeof consent !== "object" || consent.schemaVersion !== "consent_record.v1") {
    throw new DomainError("invalid_identity_reference_consent", "identity reference requires Consent v1");
  }
  assertNoRawPiiReference(consent, "identityReference.consent");
  if (consent.sandboxOnly !== true || consent.productionAuthority !== false) {
    throw new DomainError("production_identity_reference_prohibited", "identity reference Consent is not sandbox-only");
  }
  if (consent.status !== ConsentStatus.ACTIVE) {
    throw new DomainError("identity_reference_consent_not_active", "identity reference Consent is not active");
  }
  if (consent.subjectId !== subjectId || consent.principalId !== principalId) {
    throw new DomainError("identity_reference_consent_mismatch", "identity reference does not match Consent authority");
  }
  if (
    !consent.purposes.includes(ConsentPurpose.IDENTITY_REFERENCE_USE) ||
    purposeCodes.some((purposeCode) => !consent.purposes.includes(purposeCode))
  ) {
    throw new DomainError("identity_reference_consent_scope_mismatch", "identity reference exceeds Consent purpose scope");
  }
  if (now < new Date(consent.validFrom)) {
    throw new DomainError("identity_reference_consent_not_yet_valid", "identity reference Consent is not yet valid");
  }
  if (now >= new Date(consent.expiresAt)) {
    throw new DomainError("identity_reference_consent_expired", "identity reference Consent has expired");
  }
}

function assertIdentityReference(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== "human_identity_reference.v1") {
    throw new DomainError("invalid_human_identity_reference", "identity reference must use human_identity_reference.v1");
  }
  assertNoRawPiiReference(value, "humanIdentityReference");
}

export function createHumanIdentityReference(input) {
  assertNoRawPiiReference(input, "humanIdentityReference");
  const {
    subjectId,
    principalId,
    consent,
    referenceType,
    providerRef,
    providerVersion,
    referenceRef,
    assuranceLevel,
    purposeCodes,
    validFrom,
    expiresAt,
    now = new Date()
  } = input;
  for (const [name, value] of Object.entries({ subjectId, principalId })) {
    assertNonEmptyString(name, value);
  }
  assertEnumValue("referenceType", referenceType, enumValues(HumanIdentityReferenceType));
  assertEnumValue("assuranceLevel", assuranceLevel, enumValues(HumanIdentityAssurance));
  const normalizedPurposeCodes = normalizePurposeCodes(purposeCodes);
  assertVersion("providerVersion", providerVersion);
  const normalizedProviderRef = normalizeReference("providerRef", providerRef);
  const normalizedReferenceRef = normalizeReference("referenceRef", referenceRef);
  const createdAt = now.toISOString();
  const normalizedValidFrom = parseTimestamp("validFrom", validFrom ?? createdAt);
  const normalizedExpiresAt = parseTimestamp("expiresAt", expiresAt);
  assertConsentForIdentityReference(consent, {
    subjectId,
    principalId,
    purposeCodes: normalizedPurposeCodes,
    now
  });
  const createdTime = new Date(createdAt).getTime();
  const validFromTime = new Date(normalizedValidFrom).getTime();
  const expiresAtTime = new Date(normalizedExpiresAt).getTime();
  if (validFromTime < createdTime || validFromTime < new Date(consent.validFrom).getTime()) {
    throw new DomainError("backdated_identity_reference_prohibited", "validFrom cannot precede creation or Consent");
  }
  if (expiresAtTime <= validFromTime) {
    throw new DomainError("invalid_identity_reference_window", "expiresAt must be after validFrom");
  }
  if (expiresAtTime > new Date(consent.expiresAt).getTime()) {
    throw new DomainError("identity_reference_exceeds_consent", "identity reference cannot outlive its Consent");
  }
  if (expiresAtTime - validFromTime > MAX_SYNTHETIC_REFERENCE_DURATION_MS) {
    throw new DomainError("identity_reference_window_too_long", "synthetic identity reference cannot exceed 366 days");
  }

  const evidenceCore = {
    referenceType,
    providerRef: normalizedProviderRef,
    providerVersion,
    referenceRef: normalizedReferenceRef,
    assuranceLevel,
    syntheticOnly: true,
    productionVerified: false
  };
  const referenceCore = {
    subjectId,
    principalId,
    consentId: consent.consentId,
    consentHash: consent.consentHash,
    ...evidenceCore,
    purposeCodes: normalizedPurposeCodes,
    validFrom: normalizedValidFrom,
    expiresAt: normalizedExpiresAt
  };
  assertNoRawPiiReference(referenceCore, "humanIdentityReference");
  return {
    identityReferenceId: createOperationalId("identity_ref"),
    identityReferenceHash: hashId("human_identity_reference", referenceCore),
    referenceEvidenceHash: hashId("human_identity_reference_evidence", evidenceCore),
    ...referenceCore,
    status: HumanIdentityReferenceStatus.ACTIVE,
    createdAt,
    updatedAt: createdAt,
    schemaVersion: "human_identity_reference.v1"
  };
}

export function revokeHumanIdentityReference(reference, { reasonCode, evidenceRef, now = new Date() }) {
  assertIdentityReference(reference);
  if (reference.status === HumanIdentityReferenceStatus.REVOKED) return clone(reference);
  if (reference.status !== HumanIdentityReferenceStatus.ACTIVE) {
    throw new DomainError("identity_reference_terminal", "only active identity references can be revoked");
  }
  assertNonEmptyString("reasonCode", reasonCode);
  if (!CODE_PATTERN.test(reasonCode)) {
    throw new DomainError("invalid_identity_reference_reason", "reasonCode must be machine-readable");
  }
  const normalizedEvidenceRef = normalizeReference("evidenceRef", evidenceRef);
  const revokedAt = now.toISOString();
  if (new Date(revokedAt) < new Date(reference.createdAt)) {
    throw new DomainError("invalid_identity_reference_timestamp", "revocation cannot precede creation");
  }
  return {
    ...clone(reference),
    status: HumanIdentityReferenceStatus.REVOKED,
    revokedAt,
    revocationReasonCode: reasonCode,
    revocationEvidenceRef: normalizedEvidenceRef,
    updatedAt: revokedAt
  };
}

export function expireHumanIdentityReference(reference, { now = new Date() } = {}) {
  assertIdentityReference(reference);
  if (
    reference.status === HumanIdentityReferenceStatus.EXPIRED ||
    reference.status === HumanIdentityReferenceStatus.REVOKED
  ) {
    return clone(reference);
  }
  if (reference.status !== HumanIdentityReferenceStatus.ACTIVE) {
    throw new DomainError("identity_reference_terminal", "only active identity references can expire");
  }
  if (now < new Date(reference.expiresAt)) {
    throw new DomainError("identity_reference_not_expired", "identity reference cannot expire before expiresAt");
  }
  const expiredAt = now.toISOString();
  return {
    ...clone(reference),
    status: HumanIdentityReferenceStatus.EXPIRED,
    expiredAt,
    updatedAt: expiredAt
  };
}

export function assertHumanIdentityReferenceUsable(
  reference,
  consent,
  { subjectId, principalId, purposeCode, now = new Date() }
) {
  assertIdentityReference(reference);
  assertNonEmptyString("subjectId", subjectId);
  assertNonEmptyString("principalId", principalId);
  assertEnumValue("purposeCode", purposeCode, enumValues(ConsentPurpose));
  if (reference.syntheticOnly !== true || reference.productionVerified !== false) {
    throw new DomainError("production_identity_reference_prohibited", "identity reference is not synthetic-only");
  }
  if (reference.status !== HumanIdentityReferenceStatus.ACTIVE) {
    throw new DomainError("identity_reference_not_active", "identity reference is not active");
  }
  if (now < new Date(reference.validFrom)) {
    throw new DomainError("identity_reference_not_yet_valid", "identity reference is not yet valid");
  }
  if (now >= new Date(reference.expiresAt)) {
    throw new DomainError("identity_reference_expired", "identity reference has expired");
  }
  if (
    reference.subjectId !== subjectId ||
    reference.principalId !== principalId ||
    !reference.purposeCodes.includes(purposeCode)
  ) {
    throw new DomainError("identity_reference_scope_mismatch", "identity reference does not authorize this use");
  }
  assertConsentForIdentityReference(consent, {
    subjectId,
    principalId,
    purposeCodes: [purposeCode],
    now
  });
  if (reference.consentId !== consent.consentId || reference.consentHash !== consent.consentHash) {
    throw new DomainError("identity_reference_consent_mismatch", "identity reference is bound to a different Consent");
  }
  return true;
}
