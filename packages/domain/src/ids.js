import { createHash, randomUUID } from "node:crypto";

export const DEMO_HASH_ALGORITHM = "sha3-256";
export const DEMO_HASH_DOMAIN = "IPO_ONE_DEMO_V1";

function stableSerialize(value) {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item === undefined ? null : item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

export function hashId(namespace, payload) {
  return `0x${createHash(DEMO_HASH_ALGORITHM)
    .update(DEMO_HASH_DOMAIN)
    .update("\0")
    .update(namespace)
    .update("\0")
    .update(stableSerialize(payload))
    .digest("hex")}`;
}

export function createOperationalId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function createSubjectHash(payload) {
  return hashId("subject", payload);
}

export function createPrincipalHash(payload) {
  return hashId("principal", payload);
}

export function createAccountHash(accountId) {
  return hashId("account", { accountId });
}

export function createAssetHash(assetId) {
  return hashId("asset", { assetId });
}

export function createSpendPolicyHash(payload) {
  return hashId("spend_policy", payload);
}

export function createCashflowRouteHash(payload) {
  return hashId("cashflow_route", payload);
}

export function createObligationHash(payload) {
  return hashId("obligation", payload);
}
