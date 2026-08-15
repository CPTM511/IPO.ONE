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
  normalizeMetaMaskAgenticWalletCapabilities,
  verifyMetaMaskCapabilityObservation
} from "./metamask-agentic-wallet-adapter.js";

export const METAMASK_SECURITY_RECEIPT_SCHEMA_VERSION =
  "metamask_agent_wallet_security_receipt.v1";

const ADAPTER_ID = "metamask_agent_wallet_reference";
const BYTES32 = /^0x[0-9a-f]{64}$/;
const DECISIONS = new Set(Object.values(ExecutionDecision));

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_metamask_security_receipt", "security receipt must be an object");
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_metamask_security_receipt", "security receipt has an invalid closed shape");
  }
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_metamask_security_receipt", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_metamask_security_receipt", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hashes(value) {
  for (const key of [
    "descriptorHash", "capabilitiesHash", "capabilityObservationHash", "preparedExecutionHash", "preflightHash"
  ]) {
    if (typeof value[key] !== "string" || !BYTES32.test(value[key])) {
      invalid("invalid_metamask_security_receipt", `${key} must be lowercase bytes32`);
    }
  }
}

function normalizedReasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8 ||
      values.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9_]{1,95}$/.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_metamask_security_receipt", "reasonCodes must be bounded and unique");
  }
  return [...values].sort();
}

function receiptCore(value) {
  const core = structuredClone(value);
  delete core.securityReceiptHash;
  return core;
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function decisionFor({ simulationStatus, threatStatus, approvalStatus }) {
  if (threatStatus !== "safe") {
    return [ExecutionDecision.QUARANTINE,
      threatStatus === "malicious" ? "provider_threat_detected" : "provider_threat_state_unknown"];
  }
  if (simulationStatus !== "passed") {
    return [ExecutionDecision.DENY,
      simulationStatus === "failed" ? "provider_simulation_failed" : "provider_simulation_unknown"];
  }
  if (["awaiting_mfa", "unknown"].includes(approvalStatus)) {
    return [ExecutionDecision.STEP_UP,
      approvalStatus === "awaiting_mfa" ? "provider_awaiting_mfa" : "provider_approval_state_unknown"];
  }
  if (approvalStatus === "rejected") return [ExecutionDecision.DENY, "provider_approval_rejected"];
  return [ExecutionDecision.ALLOW, "provider_security_checks_passed"];
}

export function createMetaMaskAgentWalletSecurityReceipt(input) {
  exact(input, [
    "descriptor", "capabilities", "observation", "preparedExecutionHash", "preflightHash",
    "simulationStatus", "threatStatus", "approvalStatus", "observedAt", "expiresAt"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  verifyAgenticWalletProviderDescriptor(input.descriptor);
  if (input.descriptor.adapterId !== ADAPTER_ID) {
    invalid("metamask_agentic_wallet_binding_mismatch", "descriptor is not the MetaMask reference adapter");
  }
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  verifyMetaMaskCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  const normalizedCapabilities = normalizeMetaMaskAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  if (normalizedCapabilities.capabilitiesHash !== input.capabilities.capabilitiesHash) {
    invalid("metamask_agentic_wallet_capability_drift", "security facts changed capability context");
  }
  for (const key of ["preparedExecutionHash", "preflightHash"]) {
    if (typeof input[key] !== "string" || !BYTES32.test(input[key])) {
      invalid("invalid_metamask_security_receipt", `${key} must be lowercase bytes32`);
    }
  }
  if (!["passed", "failed", "unknown"].includes(input.simulationStatus) ||
      !["safe", "malicious", "unknown"].includes(input.threatStatus) ||
      !["not_required", "awaiting_mfa", "approved", "rejected", "unknown"].includes(input.approvalStatus)) {
    invalid("invalid_metamask_security_receipt", "security status is unavailable");
  }
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (observedAt > current || expiresAt <= current || expiresAt <= observedAt || expiresAt - observedAt > 120_000) {
    invalid(expiresAt <= current ? "stale_metamask_security_receipt" :
      "invalid_metamask_security_receipt", "security evidence is inconsistent or stale");
  }
  const [decision, reason] = decisionFor(input);
  const value = {
    adapterId: ADAPTER_ID,
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    preparedExecutionHash: input.preparedExecutionHash,
    preflightHash: input.preflightHash,
    simulationStatus: input.simulationStatus,
    threatStatus: input.threatStatus,
    approvalStatus: input.approvalStatus,
    decision,
    reasonCodes: [reason],
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    canonicalPreflightStillRequired: true,
    submissionAllowed: false,
    externalCallPerformed: false,
    rawProviderResponseRetained: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: METAMASK_SECURITY_RECEIPT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "metaMaskAgentWalletSecurityReceipt");
  return freeze({ securityReceiptHash: hashId("metamask_security_receipt", value), ...value });
}

export function verifyMetaMaskAgentWalletSecurityReceipt(value, { now = new Date(), allowExpired = false } = {}) {
  exact(value, [
    "securityReceiptHash", "adapterId", "descriptorHash", "capabilitiesHash", "capabilityObservationHash",
    "preparedExecutionHash", "preflightHash", "simulationStatus", "threatStatus", "approvalStatus", "decision",
    "reasonCodes", "observedAt", "expiresAt", "canonicalPreflightStillRequired", "submissionAllowed",
    "externalCallPerformed", "rawProviderResponseRetained", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  hashes(value);
  if (!BYTES32.test(value.securityReceiptHash ?? "")) {
    invalid("invalid_metamask_security_receipt", "securityReceiptHash must be lowercase bytes32");
  }
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  normalizedReasons(value.reasonCodes);
  const [decision, reason] = decisionFor(value);
  if (value.adapterId !== ADAPTER_ID || value.schemaVersion !== METAMASK_SECURITY_RECEIPT_SCHEMA_VERSION ||
      !DECISIONS.has(value.decision) || value.decision !== decision || value.reasonCodes.length !== 1 ||
      value.reasonCodes[0] !== reason || value.canonicalPreflightStillRequired !== true ||
      value.submissionAllowed !== false || value.externalCallPerformed !== false ||
      value.rawProviderResponseRetained !== false || value.productionAuthority !== false || value.fundsAuthority !== false ||
      expiresAt <= observedAt || expiresAt - observedAt > 120_000 ||
      (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("metamask_security_receipt", receiptCore(value)) !== value.securityReceiptHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_metamask_security_receipt" :
      "invalid_metamask_security_receipt", "security receipt is inconsistent or stale");
  }
  return true;
}
