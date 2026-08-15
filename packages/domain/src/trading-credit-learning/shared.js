import { DomainError } from "../errors.js";
import { TRADING_CREDIT_ZERO_HASH } from "./contracts.js";

const HASH = /^0x[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CAIP_ASSET =
  /^[a-z0-9-]+:[A-Za-z0-9._%-]+\/[a-z0-9-]+:[A-Za-z0-9._%:-]+$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,77})(?:\.[0-9]{1,18})?$/;

export const BPS = 10_000n;
export const INDEX_SCALE = 100_000_000n;

export function fail(message) {
  throw new DomainError("invalid_trading_credit_learning", message);
}

export function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

export function plainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

export function exactObject(name, value, keys) {
  plainObject(name, value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${name} has an open shape`);
  }
  return value;
}

export function hash(name, value, { allowZero = false } = {}) {
  if (
    typeof value !== "string" ||
    !HASH.test(value) ||
    (!allowZero && value === TRADING_CREDIT_ZERO_HASH)
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

export function safeId(name, value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

export function timestamp(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

export function nonNegativeInteger(
  name,
  value,
  maximum = 1_000_000
) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail(`${name} is invalid`);
  }
  return value;
}

export function positiveInteger(name, value, maximum = 1_000_000) {
  nonNegativeInteger(name, value, maximum);
  if (value === 0) fail(`${name} is invalid`);
  return value;
}

export function minor(name, value, { positive = false } = {}) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]{0,77})$/.test(value)
  ) {
    fail(`${name} is invalid`);
  }
  const parsed = BigInt(value);
  if (positive && parsed === 0n) fail(`${name} must be positive`);
  return parsed;
}

export function signedMinor(name, value) {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9][0-9]{0,77})$/.test(value)
  ) {
    fail(`${name} is invalid`);
  }
  return BigInt(value);
}

export function assetId(value) {
  if (typeof value !== "string" || !CAIP_ASSET.test(value)) {
    fail("assetId must be a CAIP-19-style identifier");
  }
  return value;
}

export function uniqueHashes(name, values, { minimum = 1 } = {}) {
  if (
    !Array.isArray(values) ||
    values.length < minimum ||
    values.length > 10_000
  ) {
    fail(`${name} is invalid`);
  }
  const normalized = values.map((value, index) =>
    hash(`${name}[${index}]`, value)
  );
  if (new Set(normalized).size !== normalized.length) {
    fail(`${name} contains duplicates`);
  }
  return normalized.sort();
}

export function ratioBps(
  numerator,
  denominator,
  { cap = 1_000_000 } = {}
) {
  if (denominator <= 0n) return null;
  const value = Number((numerator * BPS) / denominator);
  return Math.max(0, Math.min(cap, value));
}

export function decimalToMinor(name, value, decimals) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(`${name} is invalid`);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > decimals) {
    const discarded = fraction.slice(decimals);
    if (!/^0*$/.test(discarded)) {
      fail(`${name} cannot be represented in configured minor units`);
    }
  }
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const result =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -result : result;
}

export function minBigInt(entries) {
  return entries.reduce((lowest, value) => (value < lowest ? value : lowest));
}

function featureById(profile, featureId) {
  const features = profile.factorScorecard?.shadowRisk?.features;
  if (!Array.isArray(features)) fail("Shadow Risk features are unavailable");
  const matches = features.filter((feature) => feature.featureId === featureId);
  if (matches.length !== 1) {
    fail(`Shadow Risk feature ${featureId} is invalid`);
  }
  return matches[0];
}

export function observedDecimalFeature(profile, featureId) {
  const feature = featureById(profile, featureId);
  if (
    !["observed", "stale"].includes(feature.state) ||
    typeof feature.value !== "string" ||
    !DECIMAL.test(feature.value) ||
    feature.authorizing !== false
  ) {
    return null;
  }
  return feature.value;
}
