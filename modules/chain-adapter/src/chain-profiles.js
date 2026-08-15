import {
  DomainError,
  assertCAIP2,
  assertNonNegativeMinorUnits,
  assertNonEmptyString,
  assertPositiveMinorUnits,
  hashId
} from "../../../packages/domain/src/index.js";

const APPROVED_TEST_CHAIN_IDS = new Set(["eip155:84532", "eip155:1952"]);
const APPROVED_PROFILE_IDENTITIES = Object.freeze({
  "eip155:84532": Object.freeze({
    profileId: "base_sepolia_execution_test_v1",
    role: "primary_execution_test"
  }),
  "eip155:1952": Object.freeze({
    profileId: "x_layer_testnet_portability_v1",
    role: "portability_conformance"
  })
});
const REQUIRED_CAPABILITIES = Object.freeze([
  "chain.logs.read",
  "chain.receipts.read",
  "chain.finality.normalize",
  "chain.reorg.invalidate",
  "chain.provider.failover"
]);
const PROFILE_KEYS = [
  "profileId",
  "displayName",
  "role",
  "chainId",
  "chainFamily",
  "adapterVersion",
  "capabilities",
  "providerSlots",
  "finalityPolicy",
  "requestPolicy",
  "caps",
  "sandboxOnly",
  "productionApproved",
  "fundsMode"
];

export const ChainObservationStatus = Object.freeze({
  SUBMITTED: "submitted",
  INCLUDED: "included",
  SAFE: "safe",
  FINALIZED: "finalized",
  INVALIDATED: "invalidated"
});

export const ChainIngestionDisposition = Object.freeze({
  APPLIED: "applied",
  DUPLICATE: "duplicate",
  REPLAYED: "replayed"
});

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertClosedObject(name, value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("invalid_chain_profile", `${name} must be an object`, { name });
  }
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new DomainError("invalid_chain_profile", `${name} must use the closed profile contract`, {
      name,
      unknown,
      missing
    });
  }
}

function assertPositiveSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainError("invalid_chain_profile", `${name} must be a positive safe integer`, { name, value });
  }
}

function uniqueStrings(name, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new DomainError("invalid_chain_profile", `${name} must be a non-empty array`, { name });
  }
  for (const value of values) assertNonEmptyString(name, value);
  if (new Set(values).size !== values.length) {
    throw new DomainError("invalid_chain_profile", `${name} cannot contain duplicates`, { name });
  }
  return [...values];
}

export function createChainProfile(input) {
  assertClosedObject("chainProfile", input, PROFILE_KEYS);
  for (const name of ["profileId", "displayName", "role", "chainFamily", "adapterVersion", "fundsMode"]) {
    assertNonEmptyString(name, input[name]);
  }
  assertCAIP2(input.chainId);
  if (!APPROVED_TEST_CHAIN_IDS.has(input.chainId)) {
    throw new DomainError("chain_profile_not_approved", "only ratified IPO.ONE test-chain profiles are accepted", {
      chainId: input.chainId
    });
  }
  const approvedIdentity = APPROVED_PROFILE_IDENTITIES[input.chainId];
  if (input.profileId !== approvedIdentity.profileId || input.role !== approvedIdentity.role) {
    throw new DomainError("chain_profile_identity_mismatch", "profile identity and role must match the ratified chain", {
      chainId: input.chainId
    });
  }
  if (input.chainFamily !== "evm") {
    throw new DomainError("invalid_chain_profile", "CHAIN-001A only supports the EVM sandbox adapter family");
  }
  if (!/^1\.[0-9]+\.[0-9]+$/.test(input.adapterVersion)) {
    throw new DomainError("invalid_chain_profile", "adapterVersion must be a 1.x semantic version");
  }
  if (input.sandboxOnly !== true || input.productionApproved !== false || input.fundsMode !== "synthetic_only") {
    throw new DomainError(
      "production_chain_not_approved",
      "CHAIN-001A profiles must be sandbox-only, synthetic-only, and explicitly unapproved for production"
    );
  }

  const capabilities = uniqueStrings("capabilities", input.capabilities);
  if (
    capabilities.length !== REQUIRED_CAPABILITIES.length ||
    REQUIRED_CAPABILITIES.some((capability) => !capabilities.includes(capability))
  ) {
    throw new DomainError("invalid_chain_profile", "chain profile must declare the complete CHAIN-001A capability set");
  }
  const providerSlots = uniqueStrings("providerSlots", input.providerSlots);
  if (providerSlots.length < 2) {
    throw new DomainError("invalid_chain_profile", "at least two logical provider slots are required for failover tests");
  }

  assertClosedObject("finalityPolicy", input.finalityPolicy, [
    "model",
    "includedConfirmations",
    "safeConfirmations",
    "finalizedConfirmations",
    "maxReorgDepth"
  ]);
  if (input.finalityPolicy.model !== "sandbox_confirmations") {
    throw new DomainError("invalid_chain_profile", "CHAIN-001A finality must be explicitly marked as a sandbox model");
  }
  for (const name of ["includedConfirmations", "safeConfirmations", "finalizedConfirmations", "maxReorgDepth"]) {
    assertPositiveSafeInteger(`finalityPolicy.${name}`, input.finalityPolicy[name]);
  }
  if (
    input.finalityPolicy.includedConfirmations > input.finalityPolicy.safeConfirmations ||
    input.finalityPolicy.safeConfirmations > input.finalityPolicy.finalizedConfirmations
  ) {
    throw new DomainError("invalid_chain_profile", "finality confirmation thresholds must be monotonic");
  }

  assertClosedObject("requestPolicy", input.requestPolicy, ["timeoutMs", "maxProviderAttempts", "rateLimit"]);
  assertPositiveSafeInteger("requestPolicy.timeoutMs", input.requestPolicy.timeoutMs);
  assertPositiveSafeInteger("requestPolicy.maxProviderAttempts", input.requestPolicy.maxProviderAttempts);
  if (input.requestPolicy.maxProviderAttempts > providerSlots.length) {
    throw new DomainError("invalid_chain_profile", "maxProviderAttempts cannot exceed configured provider slots");
  }
  assertClosedObject("requestPolicy.rateLimit", input.requestPolicy.rateLimit, ["maxRequests", "windowMs"]);
  assertPositiveSafeInteger("requestPolicy.rateLimit.maxRequests", input.requestPolicy.rateLimit.maxRequests);
  assertPositiveSafeInteger("requestPolicy.rateLimit.windowMs", input.requestPolicy.rateLimit.windowMs);

  assertClosedObject("caps", input.caps, ["maxExecutionMinor", "maxExposureMinor", "maxPendingTransactions"]);
  const maxExecutionMinor = assertPositiveMinorUnits(input.caps.maxExecutionMinor, "caps.maxExecutionMinor").toString();
  const maxExposureMinor = assertPositiveMinorUnits(input.caps.maxExposureMinor, "caps.maxExposureMinor").toString();
  assertPositiveSafeInteger("caps.maxPendingTransactions", input.caps.maxPendingTransactions);
  if (BigInt(maxExecutionMinor) > BigInt(maxExposureMinor)) {
    throw new DomainError("invalid_chain_profile", "per-execution cap cannot exceed the aggregate exposure cap");
  }
  assertNonNegativeMinorUnits(maxExposureMinor, "caps.maxExposureMinor");

  const core = {
    profileId: input.profileId,
    displayName: input.displayName,
    role: input.role,
    chainId: input.chainId,
    chainFamily: input.chainFamily,
    adapterVersion: input.adapterVersion,
    capabilities,
    providerSlots,
    finalityPolicy: clone(input.finalityPolicy),
    requestPolicy: clone(input.requestPolicy),
    caps: { maxExecutionMinor, maxExposureMinor, maxPendingTransactions: input.caps.maxPendingTransactions },
    sandboxOnly: true,
    productionApproved: false,
    fundsMode: "synthetic_only"
  };
  return deepFreeze({
    ...core,
    profileHash: hashId("chain_profile", core),
    schemaVersion: "chain_profile.v1"
  });
}

const SHARED_SANDBOX_POLICY = Object.freeze({
  chainFamily: "evm",
  adapterVersion: "1.0.0",
  capabilities: REQUIRED_CAPABILITIES,
  providerSlots: Object.freeze(["primary", "secondary"]),
  finalityPolicy: Object.freeze({
    model: "sandbox_confirmations",
    includedConfirmations: 1,
    safeConfirmations: 2,
    finalizedConfirmations: 4,
    maxReorgDepth: 32
  }),
  requestPolicy: Object.freeze({
    timeoutMs: 5_000,
    maxProviderAttempts: 2,
    rateLimit: Object.freeze({ maxRequests: 50, windowMs: 1_000 })
  }),
  caps: Object.freeze({
    maxExecutionMinor: "100000",
    maxExposureMinor: "1000000",
    maxPendingTransactions: 25
  }),
  sandboxOnly: true,
  productionApproved: false,
  fundsMode: "synthetic_only"
});

export const BASE_SEPOLIA_PROFILE = createChainProfile({
  profileId: "base_sepolia_execution_test_v1",
  displayName: "Base Sepolia",
  role: "primary_execution_test",
  chainId: "eip155:84532",
  ...SHARED_SANDBOX_POLICY
});

export const X_LAYER_TESTNET_PROFILE = createChainProfile({
  profileId: "x_layer_testnet_portability_v1",
  displayName: "X Layer Testnet",
  role: "portability_conformance",
  chainId: "eip155:1952",
  ...SHARED_SANDBOX_POLICY
});

export function listSandboxChainProfiles() {
  return [clone(BASE_SEPOLIA_PROFILE), clone(X_LAYER_TESTNET_PROFILE)];
}
