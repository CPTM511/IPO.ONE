import { DomainError } from "../../../packages/domain/src/index.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const REFERENCE_HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const PROHIBITED_FIELD_PATTERN =
  /^(?:access|refresh|id)?token$|cookie|privatekey|signature|authorizationcode|password|secret|rawip|walletproof|kyc|pii/i;

export function approvalError(code, message, details = {}) {
  return new DomainError(code, message, details);
}

export function assertApprovalString(name, value, { minimum = 1, maximum = 256, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    throw approvalError("invalid_approval_input", `${name} is invalid`);
  }
  return value;
}

export function assertApprovalIdentifier(name, value) {
  return assertApprovalString(name, value, {
    minimum: 2,
    maximum: 256,
    pattern: IDENTIFIER_PATTERN
  });
}

export function assertApprovalReason(name, value) {
  return assertApprovalString(name, value, { maximum: 96, pattern: REASON_PATTERN });
}

export function assertApprovalHash(name, value) {
  return assertApprovalString(name, value, { minimum: 66, maximum: 66, pattern: HASH_PATTERN });
}

export function assertApprovalReferenceHash(name, value) {
  return assertApprovalString(name, value, {
    minimum: 32,
    maximum: 128,
    pattern: REFERENCE_HASH_PATTERN
  });
}

export function assertApprovalVersion(name, value, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw approvalError("invalid_approval_input", `${name} is invalid`);
  }
  return value;
}

export function assertApprovalTimestamp(name, value) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw approvalError("invalid_approval_input", `${name} is invalid`);
  }
  return parsed;
}

export function assertApprovalShape(name, value, { required = [], optional = [] } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw approvalError("invalid_approval_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw approvalError("invalid_approval_input", `${name} has an invalid shape`);
  }
  return value;
}

export function assertApprovalList(
  name,
  value,
  { minimumItems = 0, maximumItems = 16, itemValidator = assertApprovalIdentifier } = {}
) {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    throw approvalError("invalid_approval_input", `${name} is invalid`);
  }
  const normalized = value.map((item) => itemValidator(name, item));
  if (new Set(normalized).size !== normalized.length) {
    throw approvalError("invalid_approval_input", `${name} contains duplicate values`);
  }
  return Object.freeze(normalized);
}

export function assertNoSensitiveApprovalFields(value, path = "approval") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_FIELD_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))) {
      throw approvalError("sensitive_approval_data_rejected", `${path} contains a prohibited field`);
    }
    assertNoSensitiveApprovalFields(nested, `${path}.${key}`);
  }
}

export function cloneApproval(value) {
  return structuredClone(value);
}

export function deepFreezeApproval(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreezeApproval(nested);
  return Object.freeze(value);
}
