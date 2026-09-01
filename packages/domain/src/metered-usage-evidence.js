import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const POSITIVE = /^[1-9][0-9]{0,77}$/;

function fail(code, message) {
  throw new DomainError(code, message);
}

function id(name, value) {
  if (typeof value !== "string" || !ID.test(value)) fail("metered_usage_invalid", `${name} is invalid`);
  return value;
}

function digest(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) fail("metered_usage_invalid", `${name} is invalid`);
  return value;
}

function integer(name, value, positive = false) {
  if (typeof value !== "string" || !(positive ? POSITIVE : UINT).test(value)) {
    fail("metered_usage_invalid", `${name} is invalid`);
  }
  return BigInt(value);
}

function instant(name, value) {
  const parsed = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("metered_usage_invalid", `${name} is invalid`);
  }
  return parsed;
}

function corePolicy(input) {
  return {
    policyId: id("policyId", input.policyId),
    tenantId: id("tenantId", input.tenantId),
    subjectId: id("subjectId", input.subjectId),
    principalId: id("principalId", input.principalId),
    mandateId: id("mandateId", input.mandateId),
    facilityId: id("facilityId", input.facilityId),
    authorizationId: id("authorizationId", input.authorizationId),
    obligationId: id("obligationId", input.obligationId),
    providerId: id("providerId", input.providerId),
    resourceClass: id("resourceClass", input.resourceClass),
    measurementUnit: id("measurementUnit", input.measurementUnit),
    priceScheduleHash: digest("priceScheduleHash", input.priceScheduleHash),
    unitPriceMinor: integer("unitPriceMinor", input.unitPriceMinor, true).toString(),
    assetId: id("assetId", input.assetId),
    maxQuantityPerEvent: integer("maxQuantityPerEvent", input.maxQuantityPerEvent, true).toString(),
    maxChargePerEventMinor: integer("maxChargePerEventMinor", input.maxChargePerEventMinor, true).toString(),
    maxChargePerWindowMinor: integer("maxChargePerWindowMinor", input.maxChargePerWindowMinor, true).toString(),
    validFrom: instant("validFrom", input.validFrom).toISOString(),
    expiresAt: instant("expiresAt", input.expiresAt).toISOString(),
    status: input.status ?? "active",
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_policy.v1"
  };
}

export function createMeteredUsagePolicy(input) {
  const policy = corePolicy(input);
  if (policy.status !== "active" && policy.status !== "revoked") fail("metered_usage_invalid", "status is invalid");
  if (instant("expiresAt", policy.expiresAt) <= instant("validFrom", policy.validFrom)) {
    fail("metered_usage_invalid", "policy validity window is invalid");
  }
  return Object.freeze({ ...policy, policyHash: hashId("metered_usage_policy", policy) });
}

function evidenceCore(input) {
  return {
    usageEvidenceId: id("usageEvidenceId", input.usageEvidenceId),
    providerEventId: id("providerEventId", input.providerEventId),
    nonce: id("nonce", input.nonce),
    tenantId: id("tenantId", input.tenantId),
    subjectId: id("subjectId", input.subjectId),
    principalId: id("principalId", input.principalId),
    mandateId: id("mandateId", input.mandateId),
    facilityId: id("facilityId", input.facilityId),
    authorizationId: id("authorizationId", input.authorizationId),
    obligationId: id("obligationId", input.obligationId),
    providerId: id("providerId", input.providerId),
    resourceClass: id("resourceClass", input.resourceClass),
    measurementUnit: id("measurementUnit", input.measurementUnit),
    quantity: integer("quantity", input.quantity, true).toString(),
    priceScheduleHash: digest("priceScheduleHash", input.priceScheduleHash),
    unitPriceMinor: integer("unitPriceMinor", input.unitPriceMinor, true).toString(),
    chargeMinor: integer("chargeMinor", input.chargeMinor, true).toString(),
    assetId: id("assetId", input.assetId),
    windowStartedAt: instant("windowStartedAt", input.windowStartedAt).toISOString(),
    windowEndedAt: instant("windowEndedAt", input.windowEndedAt).toISOString(),
    observedAt: instant("observedAt", input.observedAt).toISOString(),
    finality: input.finality,
    reconciliation: input.reconciliation,
    providerKeyId: id("providerKeyId", input.providerKeyId),
    providerPayloadHash: digest("providerPayloadHash", input.providerPayloadHash),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_evidence.v1"
  };
}

export function createMeteredUsageEvidence(input) {
  const evidence = evidenceCore(input);
  if (evidence.finality !== "pending" && evidence.finality !== "finalized") fail("metered_usage_invalid", "finality is invalid");
  if (!["pending", "reconciled", "disputed"].includes(evidence.reconciliation)) fail("metered_usage_invalid", "reconciliation is invalid");
  if (instant("windowEndedAt", evidence.windowEndedAt) <= instant("windowStartedAt", evidence.windowStartedAt) ||
      instant("observedAt", evidence.observedAt) < instant("windowEndedAt", evidence.windowEndedAt)) {
    fail("metered_usage_invalid", "usage chronology is invalid");
  }
  if (BigInt(evidence.quantity) * BigInt(evidence.unitPriceMinor) !== BigInt(evidence.chargeMinor)) {
    fail("metered_usage_charge_mismatch", "charge does not equal quantity times unit price");
  }
  return Object.freeze({ ...evidence, usageEvidenceHash: hashId("metered_usage_evidence", evidence) });
}

export function admitMeteredUsageEvidence({ policy, evidence, windowChargeBeforeMinor, admittedAt = evidence?.observedAt }) {
  const currentPolicy = createMeteredUsagePolicy(policy);
  const currentEvidence = createMeteredUsageEvidence(evidence);
  if (currentPolicy.status !== "active") fail("metered_usage_policy_inactive", "policy is not active");
  const now = instant("admittedAt", admittedAt);
  if (now < instant("validFrom", currentPolicy.validFrom) || now >= instant("expiresAt", currentPolicy.expiresAt)) {
    fail("metered_usage_policy_expired", "policy is outside its validity window");
  }
  for (const key of ["tenantId", "subjectId", "principalId", "mandateId", "facilityId", "authorizationId", "obligationId", "providerId", "resourceClass", "measurementUnit", "priceScheduleHash", "unitPriceMinor", "assetId"]) {
    if (currentPolicy[key] !== currentEvidence[key]) fail("metered_usage_scope_mismatch", `${key} does not match policy`);
  }
  if (currentEvidence.finality !== "finalized" || currentEvidence.reconciliation !== "reconciled") {
    fail("metered_usage_not_reconciled", "usage is not finalized and reconciled");
  }
  const quantity = BigInt(currentEvidence.quantity);
  const charge = BigInt(currentEvidence.chargeMinor);
  const before = integer("windowChargeBeforeMinor", windowChargeBeforeMinor);
  if (quantity > BigInt(currentPolicy.maxQuantityPerEvent) || charge > BigInt(currentPolicy.maxChargePerEventMinor) || before + charge > BigInt(currentPolicy.maxChargePerWindowMinor)) {
    fail("metered_usage_cap_exceeded", "usage exceeds an exact policy cap");
  }
  const body = {
    policyId: currentPolicy.policyId,
    policyHash: currentPolicy.policyHash,
    usageEvidenceId: currentEvidence.usageEvidenceId,
    usageEvidenceHash: currentEvidence.usageEvidenceHash,
    chargeMinor: charge.toString(),
    windowChargeBeforeMinor: before.toString(),
    windowChargeAfterMinor: (before + charge).toString(),
    admittedAt: now.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "metered_usage_admission.v1"
  };
  return Object.freeze({ ...body, admissionHash: hashId("metered_usage_admission", body) });
}
