import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import { ExecutionDecision } from "./agentic-execution-preflight.js";
import {
  AGENTIC_WALLET_PROVIDER_OPERATIONS,
  AgenticWalletCapabilityStatus,
  createAgenticWalletProviderCapabilities,
  createAgenticWalletProviderDescriptor,
  createAgenticWalletProviderResult,
  verifyAgenticWalletProviderCapabilities,
  verifyAgenticWalletProviderDescriptor,
  verifyAgenticWalletProviderRequest
} from "./agentic-wallet-provider.js";

export const SAFE_CAPABILITY_OBSERVATION_SCHEMA_VERSION =
  "safe_agentic_wallet_capability_observation.v1";
export const SAFE_TRANSACTION_PROJECTION_SCHEMA_VERSION =
  "safe_transaction_projection.v1";
export const SAFE_ACCOUNT_CONFIGURATION_COMPARISON_SCHEMA_VERSION =
  "safe_account_configuration_comparison.v1";

export const SAFE_INTERFACE_CAPABILITIES = Object.freeze([
  "eip1271", "eip712", "safeTransaction", "transactionService"
]);

const ADAPTER_ID = "safe_institutional_wallet_reference";
const PROVIDER_FAMILY = "safe";
const CHAINS = new Set(["eip155:84532", "eip155:1952"]);
const STATUS = new Set(Object.values(AgenticWalletCapabilityStatus));
const BYTES32 = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const UNSIGNED = /^(?:0|[1-9][0-9]{0,77})$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_safe_agentic_wallet_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_safe_agentic_wallet_input", `${name} has an invalid closed shape`);
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
    invalid("invalid_safe_agentic_wallet_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_safe_agentic_wallet_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_safe_agentic_wallet_input", `${name} must be lowercase bytes32`);
  }
}

function id(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_safe_agentic_wallet_input", `${name} must be a bounded identifier`);
  }
}

function reasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8 ||
      values.some((value) => typeof value !== "string" || !REASON.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_safe_agentic_wallet_input", "reasonCodes must be bounded and unique");
  }
  return [...values].sort();
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID || descriptor.providerFamily !== PROVIDER_FAMILY) {
    invalid("safe_agentic_wallet_binding_mismatch", "descriptor is not the Safe reference adapter");
  }
}

function normalizeInterfaceSupport(value) {
  exact("interfaceSupport", value, SAFE_INTERFACE_CAPABILITIES);
  return Object.fromEntries(SAFE_INTERFACE_CAPABILITIES.map((key) => {
    if (!STATUS.has(value[key])) {
      invalid("invalid_safe_capability_observation", `${key} capability status is unavailable`);
    }
    return [key, value[key]];
  }));
}

function normalizeAccountConfiguration(value) {
  exact("accountConfiguration", value, [
    "implementationCodeHash", "singletonHash", "ownerSetHash", "threshold", "safeNonce",
    "enabledModulesHash", "moduleCount", "guardHash", "fallbackHandlerHash"
  ]);
  for (const key of [
    "implementationCodeHash", "singletonHash", "ownerSetHash", "enabledModulesHash",
    "guardHash", "fallbackHandlerHash"
  ]) hash(key, value[key]);
  if (!Number.isSafeInteger(value.threshold) || value.threshold < 1 || value.threshold > 64 ||
      !Number.isSafeInteger(value.moduleCount) || value.moduleCount < 0 || value.moduleCount > 64 ||
      typeof value.safeNonce !== "string" || !UNSIGNED.test(value.safeNonce)) {
    invalid("invalid_safe_capability_observation", "Safe threshold, nonce or module count is unavailable");
  }
  return {
    implementationCodeHash: value.implementationCodeHash,
    singletonHash: value.singletonHash,
    ownerSetHash: value.ownerSetHash,
    threshold: value.threshold,
    safeNonce: value.safeNonce,
    enabledModulesHash: value.enabledModulesHash,
    moduleCount: value.moduleCount,
    guardHash: value.guardHash,
    fallbackHandlerHash: value.fallbackHandlerHash
  };
}

function observationCore(value) {
  const core = structuredClone(value);
  delete core.observationHash;
  return core;
}

export function createSafeCapabilityObservation(input) {
  exact("capability observation input", input, [
    "descriptor", "chainId", "contextEpoch", "safeVersion", "interfaceSupport",
    "accountConfiguration", "observedAt", "expiresAt"
  ]);
  assertDescriptor(input.descriptor);
  if (!CHAINS.has(input.chainId) || !Number.isSafeInteger(input.contextEpoch) || input.contextEpoch < 0 ||
      typeof input.safeVersion !== "string" || !VERSION.test(input.safeVersion)) {
    invalid("invalid_safe_capability_observation", "chain, context epoch or Safe version is unavailable");
  }
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_safe_capability_observation", "observation lifetime is unavailable");
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    descriptorHash: input.descriptor.descriptorHash,
    chainId: input.chainId,
    contextEpoch: input.contextEpoch,
    safeVersion: input.safeVersion,
    interfaceSupport: normalizeInterfaceSupport(input.interfaceSupport),
    accountConfiguration: normalizeAccountConfiguration(input.accountConfiguration),
    source: "local_synthetic_fixture",
    onchainConfigurationVerified: false,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalCallPerformed: false,
    authorizationGranted: false,
    fundsAuthority: false,
    schemaVersion: SAFE_CAPABILITY_OBSERVATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "safeCapabilityObservation");
  return immutable({ observationHash: hashId("safe_capability_observation", value), ...value });
}

export function verifySafeCapabilityObservation(value, {
  descriptor, now = new Date(), allowExpired = false
} = {}) {
  exact("capability observation", value, [
    "observationHash", "adapterId", "descriptorHash", "chainId", "contextEpoch", "safeVersion",
    "interfaceSupport", "accountConfiguration", "source", "onchainConfigurationVerified",
    "observedAt", "expiresAt", "unknownIsNonPermissive", "externalCallPerformed",
    "authorizationGranted", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  hash("observationHash", value.observationHash);
  hash("descriptorHash", value.descriptorHash);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  normalizeInterfaceSupport(value.interfaceSupport);
  normalizeAccountConfiguration(value.accountConfiguration);
  if (value.adapterId !== ADAPTER_ID || !CHAINS.has(value.chainId) ||
      !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      typeof value.safeVersion !== "string" || !VERSION.test(value.safeVersion) ||
      value.source !== "local_synthetic_fixture" || value.onchainConfigurationVerified !== false ||
      value.unknownIsNonPermissive !== true || value.externalCallPerformed !== false ||
      value.authorizationGranted !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== SAFE_CAPABILITY_OBSERVATION_SCHEMA_VERSION || expiresAt <= observedAt ||
      expiresAt - observedAt > MAX_LIFETIME_MS || (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("safe_capability_observation", observationCore(value)) !== value.observationHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_safe_capability_observation" :
      "invalid_safe_capability_observation", "Safe capability observation is inconsistent or stale");
  }
  if (descriptor) {
    assertDescriptor(descriptor);
    if (descriptor.descriptorHash !== value.descriptorHash) {
      invalid("safe_agentic_wallet_capability_drift", "descriptor changed after capability observation");
    }
  }
  return true;
}

function combinedStatus(...statuses) {
  if (statuses.every((status) => status === "supported")) return "supported";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "unsupported";
}

export function normalizeSafeAgenticWalletCapabilities({ descriptor, observation, now = new Date() }) {
  assertDescriptor(descriptor);
  verifySafeCapabilityObservation(observation, { descriptor, now });
  const operationSupport = Object.fromEntries(
    AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operation) => [operation, "unsupported"])
  );
  operationSupport.walletDiscoverCapabilities = "supported";
  operationSupport.walletPrepareExecution = combinedStatus(
    observation.interfaceSupport.safeTransaction, observation.interfaceSupport.eip712
  );
  operationSupport.walletApproveExecution = combinedStatus(
    observation.interfaceSupport.eip1271, observation.interfaceSupport.eip712
  );
  operationSupport.walletReadExecution = observation.interfaceSupport.transactionService;
  return createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: observation.chainId,
    contextEpoch: observation.contextEpoch,
    operationSupport,
    permissionModel: observation.interfaceSupport.safeTransaction === "supported" ? "vendor_native" :
      observation.interfaceSupport.safeTransaction === "unsupported" ? "none" : "unknown",
    executionTransport: observation.interfaceSupport.safeTransaction === "supported" ? "wallet_rpc" :
      observation.interfaceSupport.safeTransaction === "unsupported" ? "none" : "unknown",
    providerSimulation: "unsupported",
    providerThreatScreening: "unsupported",
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt
  });
}

function projectionCore(value) {
  const core = structuredClone(value);
  delete core.safeTransactionProjectionId;
  delete core.safeTransactionProjectionHash;
  return core;
}

const PROJECTION_DECISION_BY_REASON = new Map([
  ["safe_delegatecall_forbidden", ExecutionDecision.DENY],
  ["canonical_preflight_not_permissive", ExecutionDecision.DENY],
  ["safe_modules_require_separate_review", ExecutionDecision.QUARANTINE],
  ["safe_required_capability_unsupported", ExecutionDecision.DENY],
  ["safe_required_capability_unknown", ExecutionDecision.QUARANTINE],
  ["safe_threshold_approval_required", ExecutionDecision.STEP_UP]
]);

function projectionDecision({ observation, providerRequest, operation }) {
  if (operation !== "CALL") return [ExecutionDecision.DENY, "safe_delegatecall_forbidden"];
  if (![ExecutionDecision.ALLOW, ExecutionDecision.STEP_UP].includes(
    providerRequest.payload.preflightReceipt.decision
  )) return [ExecutionDecision.DENY, "canonical_preflight_not_permissive"];
  if (observation.accountConfiguration.moduleCount > 0) {
    return [ExecutionDecision.QUARANTINE, "safe_modules_require_separate_review"];
  }
  const required = [
    observation.interfaceSupport.safeTransaction,
    observation.interfaceSupport.eip712,
    observation.interfaceSupport.eip1271
  ];
  if (required.some((status) => status === "unsupported")) {
    return [ExecutionDecision.DENY, "safe_required_capability_unsupported"];
  }
  if (required.some((status) => status === "unknown")) {
    return [ExecutionDecision.QUARANTINE, "safe_required_capability_unknown"];
  }
  return [ExecutionDecision.STEP_UP, "safe_threshold_approval_required"];
}

export function prepareSafeTransactionProjection(input) {
  exact("Safe transaction projection input", input, [
    "descriptor", "capabilities", "observation", "providerRequest", "operation"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifySafeCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalized = normalizeSafeAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyAgenticWalletProviderRequest(input.providerRequest, { now: current });
  if (!new Set(["CALL", "DELEGATECALL"]).has(input.operation) ||
      input.capabilities.capabilitiesHash !== normalized.capabilitiesHash ||
      input.providerRequest.adapterId !== ADAPTER_ID ||
      input.providerRequest.descriptorHash !== input.descriptor.descriptorHash ||
      input.providerRequest.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.providerRequest.contextEpoch !== input.observation.contextEpoch ||
      input.providerRequest.operationId !== "walletPrepareExecution" ||
      input.providerRequest.externalCallAllowed !== false ||
      input.providerRequest.payload.preparedExecution.payload.chainId !== input.observation.chainId ||
      input.providerRequest.payload.preflightReceipt.preparedExecutionHash !==
        input.providerRequest.payload.preparedExecution.preparedExecutionHash) {
    invalid("safe_agentic_wallet_binding_mismatch", "projection does not match one current Safe context");
  }
  const accountConfigurationHash = hashId(
    "safe_account_configuration", input.observation.accountConfiguration
  );
  const [decision, reasonCode] = projectionDecision(input);
  const value = {
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    providerRequestId: input.providerRequest.requestId,
    providerRequestHash: input.providerRequest.requestHash,
    preparedExecutionHash: input.providerRequest.payload.preparedExecution.preparedExecutionHash,
    preflightHash: input.providerRequest.payload.preflightReceipt.preflightHash,
    accountConfigurationHash,
    chainId: input.observation.chainId,
    contextEpoch: input.observation.contextEpoch,
    safeVersion: input.observation.safeVersion,
    safeNonce: input.observation.accountConfiguration.safeNonce,
    operation: input.operation,
    exactSafeTransactionDataHash: hashId("safe_exact_transaction_data", {
      requestHash: input.providerRequest.requestHash,
      preparedExecutionHash: input.providerRequest.payload.preparedExecution.preparedExecutionHash,
      preflightHash: input.providerRequest.payload.preflightReceipt.preflightHash,
      accountConfigurationHash,
      safeNonce: input.observation.accountConfiguration.safeNonce,
      chainId: input.observation.chainId,
      operation: input.operation
    }),
    decision,
    reasonCodes: reasons([reasonCode]),
    preparedAt: current.toISOString(),
    expiresAt: input.providerRequest.expiresAt,
    canonicalPreflightStillRequired: true,
    thresholdApprovalRequired: true,
    officialSafeTxHashComputed: false,
    safeSignaturesCollected: false,
    moduleExecutionAllowed: false,
    delegateCallAllowed: false,
    providerAdjustmentAllowed: false,
    transactionServiceUsed: false,
    rawCalldataRetained: false,
    rawSignatureRetained: false,
    externalCallAllowed: false,
    submissionAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: SAFE_TRANSACTION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "safeTransactionProjection");
  const safeTransactionProjectionHash = hashId("safe_transaction_projection", value);
  return immutable({
    safeTransactionProjectionId: `safe_transaction_projection_${safeTransactionProjectionHash.slice(2)}`,
    safeTransactionProjectionHash,
    ...value
  });
}

export function verifySafeTransactionProjection(value, { now = new Date(), allowExpired = false } = {}) {
  exact("Safe transaction projection", value, [
    "safeTransactionProjectionId", "safeTransactionProjectionHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "providerRequestId", "providerRequestHash", "preparedExecutionHash",
    "preflightHash", "accountConfigurationHash", "chainId", "contextEpoch", "safeVersion", "safeNonce",
    "operation", "exactSafeTransactionDataHash", "decision", "reasonCodes", "preparedAt", "expiresAt",
    "canonicalPreflightStillRequired", "thresholdApprovalRequired", "officialSafeTxHashComputed",
    "safeSignaturesCollected", "moduleExecutionAllowed", "delegateCallAllowed", "providerAdjustmentAllowed",
    "transactionServiceUsed", "rawCalldataRetained", "rawSignatureRetained", "externalCallAllowed",
    "submissionAllowed", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of [
    "safeTransactionProjectionHash", "descriptorHash", "capabilitiesHash", "capabilityObservationHash",
    "providerRequestHash", "preparedExecutionHash", "preflightHash", "accountConfigurationHash",
    "exactSafeTransactionDataHash"
  ]) hash(key, value[key]);
  id("providerRequestId", value.providerRequestId);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const normalizedReasonCodes = reasons(value.reasonCodes);
  const expectedDecision = normalizedReasonCodes.length === 1
    ? PROJECTION_DECISION_BY_REASON.get(normalizedReasonCodes[0])
    : undefined;
  const operationReasonValid = value.operation === "DELEGATECALL"
    ? normalizedReasonCodes[0] === "safe_delegatecall_forbidden"
    : normalizedReasonCodes[0] !== "safe_delegatecall_forbidden";
  const flagsValid = value.canonicalPreflightStillRequired === true &&
    value.thresholdApprovalRequired === true && value.officialSafeTxHashComputed === false &&
    value.safeSignaturesCollected === false && value.moduleExecutionAllowed === false &&
    value.delegateCallAllowed === false && value.providerAdjustmentAllowed === false &&
    value.transactionServiceUsed === false && value.rawCalldataRetained === false &&
    value.rawSignatureRetained === false && value.externalCallAllowed === false &&
    value.submissionAllowed === false && value.productionAuthority === false && value.fundsAuthority === false;
  if (value.safeTransactionProjectionId !==
      `safe_transaction_projection_${value.safeTransactionProjectionHash.slice(2)}` ||
      !CHAINS.has(value.chainId) || !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      typeof value.safeVersion !== "string" || !VERSION.test(value.safeVersion) ||
      typeof value.safeNonce !== "string" || !UNSIGNED.test(value.safeNonce) ||
      !new Set(["CALL", "DELEGATECALL"]).has(value.operation) ||
      expectedDecision !== value.decision || !operationReasonValid || !flagsValid ||
      value.schemaVersion !== SAFE_TRANSACTION_PROJECTION_SCHEMA_VERSION || expiresAt <= preparedAt ||
      (!allowExpired && (preparedAt > current || expiresAt <= current)) ||
      hashId("safe_transaction_projection", projectionCore(value)) !== value.safeTransactionProjectionHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_safe_transaction_projection" :
      "invalid_safe_transaction_projection", "Safe transaction projection is inconsistent or stale");
  }
  return true;
}

function comparisonCore(value) {
  const core = structuredClone(value);
  delete core.comparisonHash;
  return core;
}

export function compareSafeAccountConfiguration(input) {
  exact("Safe account configuration comparison input", input, [
    "descriptor", "preparedProjection", "currentObservation"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifySafeTransactionProjection(input.preparedProjection, { now: current });
  verifySafeCapabilityObservation(input.currentObservation, { descriptor: input.descriptor, now: current });
  const currentConfigurationHash = hashId(
    "safe_account_configuration", input.currentObservation.accountConfiguration
  );
  const configurationMatches =
    input.preparedProjection.descriptorHash === input.descriptor.descriptorHash &&
    input.preparedProjection.chainId === input.currentObservation.chainId &&
    input.preparedProjection.contextEpoch === input.currentObservation.contextEpoch &&
    input.preparedProjection.safeVersion === input.currentObservation.safeVersion &&
    input.preparedProjection.accountConfigurationHash === currentConfigurationHash;
  const expiresAt = new Date(Math.min(
    timestamp("projection.expiresAt", input.preparedProjection.expiresAt).getTime(),
    timestamp("observation.expiresAt", input.currentObservation.expiresAt).getTime()
  ));
  const value = {
    safeTransactionProjectionHash: input.preparedProjection.safeTransactionProjectionHash,
    currentObservationHash: input.currentObservation.observationHash,
    expectedConfigurationHash: input.preparedProjection.accountConfigurationHash,
    currentConfigurationHash,
    contextEpoch: input.currentObservation.contextEpoch,
    configurationMatches,
    decision: configurationMatches ? input.preparedProjection.decision : ExecutionDecision.QUARANTINE,
    reasonCodes: reasons([configurationMatches ? "safe_account_configuration_unchanged" :
      "safe_account_configuration_drift"]),
    comparedAt: current.toISOString(),
    expiresAt: expiresAt.toISOString(),
    externalCallPerformed: false,
    submissionAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: SAFE_ACCOUNT_CONFIGURATION_COMPARISON_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "safeAccountConfigurationComparison");
  return immutable({ comparisonHash: hashId("safe_account_configuration_comparison", value), ...value });
}

export function verifySafeAccountConfigurationComparison(value, {
  now = new Date(), allowExpired = false
} = {}) {
  exact("Safe account configuration comparison", value, [
    "comparisonHash", "safeTransactionProjectionHash", "currentObservationHash",
    "expectedConfigurationHash", "currentConfigurationHash", "contextEpoch", "configurationMatches",
    "decision", "reasonCodes", "comparedAt", "expiresAt", "externalCallPerformed",
    "submissionAllowed", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of [
    "comparisonHash", "safeTransactionProjectionHash", "currentObservationHash",
    "expectedConfigurationHash", "currentConfigurationHash"
  ]) hash(key, value[key]);
  const comparedAt = timestamp("comparedAt", value.comparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  reasons(value.reasonCodes);
  const expectedDecision = value.configurationMatches ? null : ExecutionDecision.QUARANTINE;
  const expectedReason = value.configurationMatches ? "safe_account_configuration_unchanged" :
    "safe_account_configuration_drift";
  if (!Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      typeof value.configurationMatches !== "boolean" ||
      (expectedDecision && value.decision !== expectedDecision) ||
      ![ExecutionDecision.STEP_UP, ExecutionDecision.DENY, ExecutionDecision.QUARANTINE]
        .includes(value.decision) || value.reasonCodes.length !== 1 ||
      value.reasonCodes[0] !== expectedReason || value.externalCallPerformed !== false ||
      value.submissionAllowed !== false || value.productionAuthority !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== SAFE_ACCOUNT_CONFIGURATION_COMPARISON_SCHEMA_VERSION || expiresAt <= comparedAt ||
      (!allowExpired && (comparedAt > current || expiresAt <= current)) ||
      hashId("safe_account_configuration_comparison", comparisonCore(value)) !== value.comparisonHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_safe_account_configuration_comparison" :
      "invalid_safe_account_configuration_comparison",
    "Safe account configuration comparison is inconsistent or stale");
  }
  return true;
}

export function createDisabledSafeAgenticWalletProvider({
  chainId = "eip155:84532", contextEpoch = 0, now = new Date()
} = {}) {
  const current = trustedNow(now);
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: ADAPTER_ID,
    providerFamily: PROVIDER_FAMILY,
    adapterVersion: "1.0.0",
    enabled: false,
    externalCallsEnabled: false
  });
  const unknown = Object.fromEntries(SAFE_INTERFACE_CAPABILITIES.map((key) => [key, "unknown"]));
  const accountConfiguration = {
    implementationCodeHash: hashId("safe_local_fixture", { field: "implementation" }),
    singletonHash: hashId("safe_local_fixture", { field: "singleton" }),
    ownerSetHash: hashId("safe_local_fixture", { field: "owners" }),
    threshold: 1,
    safeNonce: "0",
    enabledModulesHash: hashId("safe_local_fixture", { field: "modules" }),
    moduleCount: 0,
    guardHash: hashId("safe_local_fixture", { field: "guard" }),
    fallbackHandlerHash: hashId("safe_local_fixture", { field: "fallback" })
  };
  const observation = createSafeCapabilityObservation({
    descriptor,
    chainId,
    contextEpoch,
    safeVersion: "0.0.0-local",
    interfaceSupport: unknown,
    accountConfiguration,
    observedAt: current.toISOString(),
    expiresAt: new Date(current.getTime() + MAX_LIFETIME_MS).toISOString()
  });
  const capabilities = normalizeSafeAgenticWalletCapabilities({ descriptor, observation, now: current });
  const disabled = async () => invalid(
    "safe_agentic_wallet_disabled_l0_local_no_funds",
    "Safe external operation is disabled"
  );
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request,
        status: "unavailable",
        reasonCodes: ["safe_external_probe_disabled"],
        externalState: "not_invoked",
        externalCallPerformed: false,
        capabilities,
        observedAt: current
      });
    },
    prepareGrant: disabled,
    activateGrant: disabled,
    readGrant: disabled,
    revokeGrant: disabled,
    preflight: disabled,
    requestHumanStepUp: disabled,
    submit: disabled,
    readExecution: disabled
  });
}

export function describeSafeAgenticWalletBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: ADAPTER_ID,
    capabilitySource: "local_synthetic_fixture",
    onchainConfigurationReadEnabled: false,
    transactionServiceEnabled: false,
    moduleExecutionEnabled: false,
    delegateCallEnabled: false,
    signatureCollectionEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
