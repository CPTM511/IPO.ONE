import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import { ExecutionDecision } from "./agentic-execution-preflight.js";
import {
  verifyAgenticWalletProviderCapabilities,
  verifyAgenticWalletProviderDescriptor
} from "./agentic-wallet-provider.js";
import {
  normalizeOkxAgenticWalletCapabilities,
  verifyOkxAgenticWalletInvocation,
  verifyOkxCapabilityObservation
} from "./okx-agentic-wallet-adapter.js";

export const OKX_TEE_EXECUTION_REFERENCE_SCHEMA_VERSION =
  "okx_tee_execution_reference.v1";
export const OKX_RISK_RECEIPT_SCHEMA_VERSION =
  "okx_agentic_wallet_risk_receipt.v1";

const ADAPTER_ID = "okx_agentic_wallet_reference";
const BYTES32 = /^0x[0-9a-f]{64}$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_okx_agentic_wallet_risk_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_okx_agentic_wallet_risk_input", `${name} has an invalid closed shape`);
  }
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function immutable(value) {
  return freeze(structuredClone(value));
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_okx_agentic_wallet_risk_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_okx_agentic_wallet_risk_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_okx_agentic_wallet_risk_input", `${name} must be lowercase bytes32`);
  }
}

function reasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8 ||
      values.some((value) => typeof value !== "string" || !REASON.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_okx_agentic_wallet_risk_input", "reasonCodes must be bounded and unique");
  }
  return [...values].sort();
}

function coreWithout(value, keys) {
  const core = structuredClone(value);
  for (const key of keys) delete core[key];
  return core;
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID) {
    invalid("okx_agentic_wallet_binding_mismatch", "descriptor is not the OKX reference adapter");
  }
}

export function createOkxTeeExecutionReference(input) {
  exact("TEE execution reference input", input, [
    "invocationProjection", "teeClaimStatus", "attestationStatus", "executionStatus",
    "externalExecutionRefHash", "observedAt"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  verifyOkxAgenticWalletInvocation(input.invocationProjection, { now: current });
  if (!["claimed", "unavailable", "unknown"].includes(input.teeClaimStatus) ||
      !["unverified", "invalid", "unknown"].includes(input.attestationStatus) ||
      !["not_submitted", "pending", "succeeded", "failed", "unknown"].includes(input.executionStatus)) {
    invalid("invalid_okx_tee_execution_reference", "TEE or execution state is unavailable");
  }
  hash("externalExecutionRefHash", input.externalExecutionRefHash, true);
  const observedAt = timestamp("observedAt", input.observedAt);
  if (observedAt > current || current.getTime() - observedAt.getTime() > 120_000) {
    invalid("stale_okx_tee_execution_reference", "TEE execution reference is stale");
  }
  if ((input.executionStatus !== "not_submitted" && input.externalExecutionRefHash === null) ||
      (input.executionStatus === "not_submitted" && input.externalExecutionRefHash !== null)) {
    invalid("invalid_okx_tee_execution_reference", "execution state and hash reference are inconsistent");
  }
  const reconciliationRequired = input.executionStatus !== "not_submitted";
  const value = {
    invocationProjectionHash: input.invocationProjection.invocationProjectionHash,
    teeClaimStatus: input.teeClaimStatus,
    attestationStatus: input.attestationStatus,
    executionStatus: input.executionStatus,
    externalExecutionRefHash: input.externalExecutionRefHash,
    decision: ExecutionDecision.QUARANTINE,
    reasonCodes: reasons([reconciliationRequired ? "synthetic_external_execution_state_unreconciled" :
      "vendor_tee_claim_unattested"]),
    source: "local_synthetic_fixture",
    observedAt: observedAt.toISOString(),
    teeAttestationVerified: false,
    externalCallPerformed: false,
    canonicalExecutionConfirmed: false,
    canonicalSettlementConfirmed: false,
    canonicalMutationAllowed: false,
    reconciliationRequired,
    retryAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: OKX_TEE_EXECUTION_REFERENCE_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "okxTeeExecutionReference");
  return immutable({ teeExecutionReferenceHash: hashId("okx_tee_execution_reference", value), ...value });
}

export function verifyOkxTeeExecutionReference(value, { now = new Date(), allowStale = false } = {}) {
  exact("TEE execution reference", value, [
    "teeExecutionReferenceHash", "invocationProjectionHash", "teeClaimStatus", "attestationStatus",
    "executionStatus", "externalExecutionRefHash", "decision", "reasonCodes", "source", "observedAt",
    "teeAttestationVerified", "externalCallPerformed", "canonicalExecutionConfirmed",
    "canonicalSettlementConfirmed", "canonicalMutationAllowed", "reconciliationRequired", "retryAllowed",
    "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of ["teeExecutionReferenceHash", "invocationProjectionHash"]) hash(key, value[key]);
  hash("externalExecutionRefHash", value.externalExecutionRefHash, true);
  const observedAt = timestamp("observedAt", value.observedAt);
  reasons(value.reasonCodes);
  const reconciliationRequired = value.executionStatus !== "not_submitted";
  const expectedReason = reconciliationRequired ? "synthetic_external_execution_state_unreconciled" :
    "vendor_tee_claim_unattested";
  if (!["claimed", "unavailable", "unknown"].includes(value.teeClaimStatus) ||
      !["unverified", "invalid", "unknown"].includes(value.attestationStatus) ||
      !["not_submitted", "pending", "succeeded", "failed", "unknown"].includes(value.executionStatus) ||
      (reconciliationRequired && value.externalExecutionRefHash === null) ||
      (!reconciliationRequired && value.externalExecutionRefHash !== null) ||
      value.decision !== ExecutionDecision.QUARANTINE ||
      value.reasonCodes.length !== 1 || value.reasonCodes[0] !== expectedReason ||
      value.source !== "local_synthetic_fixture" || value.teeAttestationVerified !== false ||
      value.externalCallPerformed !== false || value.canonicalExecutionConfirmed !== false ||
      value.canonicalSettlementConfirmed !== false || value.canonicalMutationAllowed !== false ||
      value.reconciliationRequired !== reconciliationRequired || value.retryAllowed !== false ||
      value.productionAuthority !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== OKX_TEE_EXECUTION_REFERENCE_SCHEMA_VERSION ||
      (!allowStale && (observedAt > current || current.getTime() - observedAt.getTime() > 120_000)) ||
      hashId("okx_tee_execution_reference", coreWithout(value, ["teeExecutionReferenceHash"])) !==
        value.teeExecutionReferenceHash) {
    invalid(!allowStale && current.getTime() - observedAt.getTime() > 120_000 ?
      "stale_okx_tee_execution_reference" : "invalid_okx_tee_execution_reference",
    "TEE execution reference is inconsistent or stale");
  }
  return true;
}

function riskDecision(input) {
  if (["pending", "succeeded", "unknown"].includes(input.externalOutcomeStatus)) {
    return [ExecutionDecision.QUARANTINE, "external_outcome_requires_reconciliation"];
  }
  if (input.interceptionStatus !== "clear") {
    return [ExecutionDecision.QUARANTINE, input.interceptionStatus === "blocked" ?
      "vendor_interception_blocked" : "vendor_interception_unknown"];
  }
  if (["critical", "unknown"].includes(input.riskGrade)) {
    return [ExecutionDecision.QUARANTINE, input.riskGrade === "critical" ?
      "vendor_risk_critical" : "vendor_risk_unknown"];
  }
  if (input.identityStatus === "unknown") return [ExecutionDecision.QUARANTINE, "vendor_identity_unknown"];
  if (input.externalOutcomeStatus === "failed") return [ExecutionDecision.DENY, "vendor_execution_failed"];
  if (input.simulationStatus !== "passed") return [ExecutionDecision.DENY,
    input.simulationStatus === "failed" ? "vendor_simulation_failed" : "vendor_simulation_unknown"];
  if (input.identityStatus === "failed") return [ExecutionDecision.DENY, "vendor_identity_failed"];
  if (input.riskGrade === "high" || input.identityStatus === "step_up") {
    return [ExecutionDecision.STEP_UP, input.riskGrade === "high" ?
      "vendor_risk_high" : "vendor_identity_step_up"];
  }
  return [ExecutionDecision.ALLOW, "vendor_checks_descriptively_clear"];
}

export function createOkxAgenticWalletRiskReceipt(input) {
  exact("risk receipt input", input, [
    "descriptor", "capabilities", "observation", "invocationProjection", "simulationStatus",
    "riskGrade", "identityStatus", "interceptionStatus", "externalOutcomeStatus", "observedAt", "expiresAt"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifyOkxCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalized = normalizeOkxAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyOkxAgenticWalletInvocation(input.invocationProjection, { now: current });
  if (normalized.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.invocationProjection.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.invocationProjection.capabilityObservationHash !== input.observation.observationHash) {
    invalid("okx_agentic_wallet_capability_drift", "risk receipt facts changed invocation context");
  }
  if (!["passed", "failed", "unknown"].includes(input.simulationStatus) ||
      !["low", "medium", "high", "critical", "unknown"].includes(input.riskGrade) ||
      !["verified", "step_up", "failed", "unknown"].includes(input.identityStatus) ||
      !["clear", "blocked", "unknown"].includes(input.interceptionStatus) ||
      !["not_submitted", "pending", "succeeded", "failed", "unknown"].includes(input.externalOutcomeStatus)) {
    invalid("invalid_okx_agentic_wallet_risk_receipt", "risk receipt state is unavailable");
  }
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (observedAt > current || expiresAt <= current || expiresAt <= observedAt || expiresAt - observedAt > 120_000) {
    invalid(expiresAt <= current ? "stale_okx_agentic_wallet_risk_receipt" :
      "invalid_okx_agentic_wallet_risk_receipt", "risk receipt evidence is inconsistent or stale");
  }
  const [decision, reason] = riskDecision(input);
  const reconciliationRequired = input.externalOutcomeStatus !== "not_submitted";
  const value = {
    adapterId: ADAPTER_ID,
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    invocationProjectionHash: input.invocationProjection.invocationProjectionHash,
    simulationStatus: input.simulationStatus,
    riskGrade: input.riskGrade,
    identityStatus: input.identityStatus,
    interceptionStatus: input.interceptionStatus,
    externalOutcomeStatus: input.externalOutcomeStatus,
    decision,
    reasonCodes: [reason],
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    canonicalPreflightStillRequired: true,
    submissionAllowed: false,
    externalCallPerformed: false,
    reconciliationRequired,
    retryAllowed: false,
    rawVendorResponseRetained: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: OKX_RISK_RECEIPT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "okxAgenticWalletRiskReceipt");
  return immutable({ riskReceiptHash: hashId("okx_risk_receipt", value), ...value });
}

export function verifyOkxAgenticWalletRiskReceipt(value, { now = new Date(), allowExpired = false } = {}) {
  exact("risk receipt", value, [
    "riskReceiptHash", "adapterId", "descriptorHash", "capabilitiesHash", "capabilityObservationHash",
    "invocationProjectionHash", "simulationStatus", "riskGrade", "identityStatus", "interceptionStatus",
    "externalOutcomeStatus", "decision", "reasonCodes", "observedAt", "expiresAt",
    "canonicalPreflightStillRequired", "submissionAllowed", "externalCallPerformed", "reconciliationRequired",
    "retryAllowed", "rawVendorResponseRetained", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of ["riskReceiptHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "invocationProjectionHash"]) hash(key, value[key]);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  reasons(value.reasonCodes);
  const [decision, reason] = riskDecision(value);
  const reconciliationRequired = value.externalOutcomeStatus !== "not_submitted";
  const statesValid = ["passed", "failed", "unknown"].includes(value.simulationStatus) &&
    ["low", "medium", "high", "critical", "unknown"].includes(value.riskGrade) &&
    ["verified", "step_up", "failed", "unknown"].includes(value.identityStatus) &&
    ["clear", "blocked", "unknown"].includes(value.interceptionStatus) &&
    ["not_submitted", "pending", "succeeded", "failed", "unknown"].includes(value.externalOutcomeStatus);
  if (!statesValid || value.adapterId !== ADAPTER_ID || value.decision !== decision || value.reasonCodes.length !== 1 ||
      value.reasonCodes[0] !== reason || value.canonicalPreflightStillRequired !== true ||
      value.submissionAllowed !== false || value.externalCallPerformed !== false ||
      value.reconciliationRequired !== reconciliationRequired || value.retryAllowed !== false ||
      value.rawVendorResponseRetained !== false || value.productionAuthority !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== OKX_RISK_RECEIPT_SCHEMA_VERSION || expiresAt <= observedAt ||
      expiresAt - observedAt > 120_000 || (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("okx_risk_receipt", coreWithout(value, ["riskReceiptHash"])) !== value.riskReceiptHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_okx_agentic_wallet_risk_receipt" :
      "invalid_okx_agentic_wallet_risk_receipt", "risk receipt is inconsistent or stale");
  }
  return true;
}
