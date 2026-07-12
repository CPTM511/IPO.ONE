import { DomainError } from "./errors.js";

const CAIP2_PATTERN = /^[a-z0-9-]+:[A-Za-z0-9-]+$/;
const CAIP10_PATTERN = /^[a-z0-9-]+:[A-Za-z0-9-]+:[A-Za-z0-9:._%-]+$/;
const MAX_DOMAIN_STRING_LENGTH = 2048;
const MAX_MINOR_UNIT_DIGITS = 78;
const BANNED_PII_KEYS = new Set([
  "ssn",
  "passport",
  "passportnumber",
  "idnumber",
  "nationalid",
  "phonenumber",
  "rawkyc",
  "accountnumber",
  "bankaccount",
  "bankaccountnumber",
  "routingnumber",
  "iban",
  "privatekey",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "password",
  "clientsecret",
  "webhooksecret",
  "credentials",
  "seedphrase",
  "mnemonic",
  "secret"
]);

export function assertEnumValue(name, value, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw new DomainError("invalid_enum_value", `${name} must be one of ${allowedValues.join(", ")}`, {
      name,
      value
    });
  }
}

export function assertNonEmptyString(name, value) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_DOMAIN_STRING_LENGTH
  ) {
    throw new DomainError("invalid_string", `${name} must be a non-empty string`, { name });
  }
}

export function toMinorUnitBigInt(value, name = "amountMinor") {
  if (typeof value === "bigint") {
    if (value.toString().replace("-", "").length > MAX_MINOR_UNIT_DIGITS) {
      throw new DomainError("invalid_minor_units", `${name} exceeds the supported decimal width`, { name });
    }
    return value;
  }
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MINOR_UNIT_DIGITS ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new DomainError("invalid_minor_units", `${name} must be an unsigned integer string`, {
      name,
      value: typeof value === "string" && value.length > 128 ? "[redacted: oversized]" : value
    });
  }
  return BigInt(value);
}

export function assertPositiveMinorUnits(value, name = "amountMinor") {
  const parsed = toMinorUnitBigInt(value, name);
  if (parsed <= 0n) {
    throw new DomainError("invalid_minor_units", `${name} must be greater than zero`, { name, value });
  }
  return parsed;
}

export function assertNonNegativeMinorUnits(value, name = "amountMinor") {
  const parsed = toMinorUnitBigInt(value, name);
  if (parsed < 0n) {
    throw new DomainError("invalid_minor_units", `${name} must be zero or greater`, { name, value });
  }
  return parsed;
}

export function assertCAIP2(chainId) {
  assertNonEmptyString("chainId", chainId);
  if (!CAIP2_PATTERN.test(chainId)) {
    throw new DomainError("invalid_caip2", "chainId must use CAIP-2 format", { chainId });
  }
}

export function assertCAIP10(accountId) {
  assertNonEmptyString("accountId", accountId);
  if (!CAIP10_PATTERN.test(accountId)) {
    throw new DomainError("invalid_caip10", "accountId must use CAIP-10 format", { accountId });
  }
}

export function chainIdFromCAIP10(accountId) {
  assertCAIP10(accountId);
  const [namespace, reference] = accountId.split(":");
  return `${namespace}:${reference}`;
}

export function assertNoRawPiiReference(value, path = "metadata") {
  if (value === null || value === undefined || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (BANNED_PII_KEYS.has(normalized)) {
      throw new DomainError("raw_pii_prohibited", "raw PII, KYC, or secrets are prohibited", {
        path: `${path}.${key}`
      });
    }
    assertNoRawPiiReference(nested, `${path}.${key}`);
  }
}

export function assertDueAt(value) {
  const due = new Date(value);
  if (!Number.isFinite(due.getTime())) {
    throw new DomainError("invalid_due_at", "dueAt must be an ISO timestamp", { dueAt: value });
  }
}
