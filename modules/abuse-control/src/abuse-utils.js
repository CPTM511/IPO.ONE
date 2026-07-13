import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { RetryAfterClass } from "./abuse-constants.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const RETRY_CLASSES = new Set(Object.values(RetryAfterClass));

export function abuseError(code, message, details = {}) {
  return new DomainError(code, message, details);
}

export function budgetExceeded(retryAfterClass = RetryAfterClass.SHORT) {
  return abuseError(
    "request_budget_exceeded",
    "The request budget is temporarily unavailable.",
    { retryAfterClass }
  );
}

export function admissionUnavailable() {
  return abuseError(
    "request_admission_unavailable",
    "Request admission is temporarily unavailable.",
    { retryAfterClass: RetryAfterClass.LONG }
  );
}

export function assertAbuseShape(name, value, { required = [], optional = [] } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw abuseError("invalid_abuse_control_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw abuseError("invalid_abuse_control_input", `${name} has an invalid shape`);
  }
  return value;
}

export function assertAbuseIdentifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw abuseError("invalid_abuse_control_input", `${name} is invalid`);
  }
  return value;
}

export function assertAbuseHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw abuseError("invalid_abuse_control_input", `${name} is invalid`);
  }
  return value;
}

export function assertNonNegativeInteger(name, value, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw abuseError("invalid_abuse_control_input", `${name} is invalid`);
  }
  return value;
}

export function assertPositiveInteger(name, value, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw abuseError("invalid_abuse_control_input", `${name} is invalid`);
  }
  return value;
}

export function assertRetryAfterClass(value) {
  if (!RETRY_CLASSES.has(value)) {
    throw abuseError("invalid_abuse_control_input", "retryAfterClass is invalid");
  }
  return value;
}

export function abuseHash(namespace, payload) {
  return hashId(`abuse_control.${namespace}`, payload);
}

export function cloneAbuse(value) {
  return structuredClone(value);
}

export function deepFreezeAbuse(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreezeAbuse(nested);
  return Object.freeze(value);
}
