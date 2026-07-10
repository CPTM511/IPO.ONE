import { createHash, randomUUID } from "node:crypto";

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

export function hashId(namespace, payload) {
  return `0x${createHash("sha3-256")
    .update("IPO_ONE_V1")
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
