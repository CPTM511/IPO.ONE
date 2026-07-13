import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { DomainError } from "../../../packages/domain/src/index.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,255}$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_.:-]{1,127}$/;

export function authenticationError(code, message) {
  return new DomainError(code, message);
}
export function assertBoundedString(name, value, { minimum = 1, maximum = 255, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    throw authenticationError("invalid_authentication_input", `${name} is invalid`);
  }
  return value;
}

export function assertSafeIdentifier(name, value) {
  return assertBoundedString(name, value, {
    minimum: 2,
    maximum: 256,
    pattern: SAFE_IDENTIFIER_PATTERN
  });
}

export function assertStringList(
  name,
  value,
  { maximumItems = 64, itemPattern = CAPABILITY_PATTERN, allowEmpty = true } = {}
) {
  if (!Array.isArray(value) || value.length > maximumItems || (!allowEmpty && value.length === 0)) {
    throw authenticationError("invalid_authentication_claims", `${name} is invalid`);
  }
  const normalized = value.map((item) =>
    assertBoundedString(name, item, { maximum: 128, pattern: itemPattern })
  );
  if (new Set(normalized).size !== normalized.length) {
    throw authenticationError("invalid_authentication_claims", `${name} contains duplicate values`);
  }
  return Object.freeze([...normalized]);
}

export function assertExactObjectKeys(name, value, { required = [], optional = [] }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw authenticationError("invalid_authentication_claims", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw authenticationError("invalid_authentication_claims", `${name} has an invalid shape`);
  }
  return value;
}

export function assertNumericDate(name, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw authenticationError("invalid_authentication_claims", `${name} must be a NumericDate`);
  }
  return value;
}

export function randomOpaqueValue(byteLength = 32) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw authenticationError("invalid_authentication_configuration", "opaque value size is invalid");
  }
  return randomBytes(byteLength).toString("base64url");
}

export function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

export function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

export function createReferenceHasher(secret) {
  const key = Buffer.from(secret ?? []);
  if (key.length < 32) {
    throw authenticationError(
      "invalid_authentication_configuration",
      "reference hashing key must contain at least 32 bytes"
    );
  }
  const privateKey = Buffer.from(key);
  return Object.freeze({
    hash(namespace, value) {
      assertBoundedString("hash namespace", namespace, { maximum: 64, pattern: /^[a-z][a-z0-9_.-]+$/ });
      assertBoundedString("hash input", value, { maximum: 16_384 });
      return createHmac("sha256", privateKey)
        .update("IPO_ONE_AUTHN_V1")
        .update("\0")
        .update(namespace)
        .update("\0")
        .update(value)
        .digest("base64url");
    }
  });
}

export function epochSeconds(value = new Date()) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) {
    throw authenticationError("invalid_authentication_input", "time is invalid");
  }
  return Math.floor(milliseconds / 1000);
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
