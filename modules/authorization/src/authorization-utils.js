import { DomainError } from "../../../packages/domain/src/index.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_.:-]{1,127}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const PROHIBITED_FIELD_PATTERN = /^(?:access|refresh|id)?token$|cookie|privatekey|signature|authorizationcode|password|secret|rawip|walletproof|kyc|pii/i;

export function authorizationError(code, message) {
  return new DomainError(code, message);
}

export function assertAuthorizationString(
  name,
  value,
  { minimum = 1, maximum = 255, pattern } = {}
) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    throw authorizationError("invalid_authorization_input", `${name} is invalid`);
  }
  return value;
}

export function assertAuthorizationIdentifier(name, value) {
  return assertAuthorizationString(name, value, {
    minimum: 2,
    maximum: 256,
    pattern: SAFE_IDENTIFIER_PATTERN
  });
}

export function assertCapability(name, value) {
  return assertAuthorizationString(name, value, {
    maximum: 128,
    pattern: CAPABILITY_PATTERN
  });
}

export function assertReasonCode(name, value) {
  return assertAuthorizationString(name, value, {
    maximum: 96,
    pattern: REASON_PATTERN
  });
}

export function assertAuthorizationList(
  name,
  value,
  { maximumItems = 64, itemValidator = assertCapability, allowEmpty = true } = {}
) {
  if (!Array.isArray(value) || value.length > maximumItems || (!allowEmpty && value.length === 0)) {
    throw authorizationError("invalid_authorization_input", `${name} is invalid`);
  }
  const normalized = value.map((item) => itemValidator(name, item));
  if (new Set(normalized).size !== normalized.length) {
    throw authorizationError("invalid_authorization_input", `${name} contains duplicate values`);
  }
  return Object.freeze([...normalized]);
}

export function assertAuthorizationShape(name, value, { required = [], optional = [] }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw authorizationError("invalid_authorization_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw authorizationError("invalid_authorization_input", `${name} has an invalid shape`);
  }
  return value;
}

export function authorizationTimestamp(name, value) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw authorizationError("invalid_authorization_input", `${name} is invalid`);
  }
  return parsed;
}

export function deepFreezeAuthorization(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreezeAuthorization(nested);
  return Object.freeze(value);
}

export function cloneAuthorization(value) {
  return structuredClone(value);
}

export function assertNoSensitiveAuthorizationFields(value, path = "authorization") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_FIELD_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))) {
      throw authorizationError(
        "sensitive_authorization_data_rejected",
        `${path} contains a prohibited field`
      );
    }
    assertNoSensitiveAuthorizationFields(nested, `${path}.${key}`);
  }
}

export function assertPositiveCapacity(name, value, maximum = 100_000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw authorizationError("invalid_authorization_configuration", `${name} is invalid`);
  }
  return value;
}
