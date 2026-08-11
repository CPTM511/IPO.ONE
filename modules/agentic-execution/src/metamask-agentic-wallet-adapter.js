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
  verifyExternalWalletPermissionProjection
} from "./agentic-wallet-provider.js";

export const METAMASK_CAPABILITY_OBSERVATION_SCHEMA_VERSION =
  "metamask_agentic_wallet_capability_observation.v1";
export const METAMASK_PERMISSION_PROJECTION_SCHEMA_VERSION =
  "metamask_advanced_permission_projection.v1";
export const METAMASK_PERMISSION_COMPARISON_SCHEMA_VERSION =
  "metamask_advanced_permission_response_comparison.v1";

export const METAMASK_ERC7715_RPC_METHODS = Object.freeze([
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
  "wallet_revokeExecutionPermission"
]);

const ADAPTER_ID = "metamask_agent_wallet_reference";
const PROVIDER_FAMILY = "metamask";
const CHAINS = new Map([["eip155:84532", "0x14a34"], ["eip155:1952", "0x7a0"]]);
const STATUS = new Set(Object.values(AgenticWalletCapabilityStatus));
const BYTES32 = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HEX_CHAIN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;
const RISKY_PERMISSION_TYPES = new Set([
  "erc20-token-allowance",
  "erc20-token-periodic",
  "erc20-token-stream",
  "native-token-allowance",
  "native-token-periodic",
  "native-token-stream",
  "token-approval-revocation"
]);

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_metamask_agentic_wallet_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalid("invalid_metamask_agentic_wallet_input", `${name} has an invalid closed shape`);
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

function nowDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_metamask_agentic_wallet_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function time(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_metamask_agentic_wallet_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_metamask_agentic_wallet_input", `${name} must be lowercase bytes32`);
  }
}

function id(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_metamask_agentic_wallet_input", `${name} must be a bounded identifier`);
  }
}

function reasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8 ||
      values.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9_]{1,95}$/.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_metamask_agentic_wallet_input", "reasonCodes must be bounded and unique");
  }
  return [...values].sort();
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID || descriptor.providerFamily !== PROVIDER_FAMILY) {
    invalid("metamask_agentic_wallet_binding_mismatch", "descriptor is not the MetaMask reference adapter");
  }
}

function normalizeMethodSupport(value) {
  exact("rpcMethodSupport", value, METAMASK_ERC7715_RPC_METHODS);
  return Object.fromEntries(METAMASK_ERC7715_RPC_METHODS.map((method) => {
    if (!STATUS.has(value[method])) {
      invalid("invalid_metamask_capability_observation", `invalid capability for ${method}`);
    }
    return [method, value[method]];
  }));
}

function normalizePermissionTypes(values) {
  if (!Array.isArray(values) || values.length > 32) {
    invalid("invalid_metamask_capability_observation", "permissionTypes must be bounded");
  }
  const seen = new Set();
  return values.map((value) => {
    exact("permission type", value, ["type", "chainIds", "ruleTypes"]);
    id("permission type", value.type);
    if (seen.has(value.type)) invalid("invalid_metamask_capability_observation", "permission types must be unique");
    seen.add(value.type);
    for (const list of [value.chainIds, value.ruleTypes]) {
      if (!Array.isArray(list) || list.length > 16 || new Set(list).size !== list.length) {
        invalid("invalid_metamask_capability_observation", "permission capability lists must be unique");
      }
    }
    if (value.chainIds.some((chainId) => typeof chainId !== "string" || !HEX_CHAIN.test(chainId)) ||
        value.ruleTypes.some((ruleType) => typeof ruleType !== "string" || !IDENTIFIER.test(ruleType))) {
      invalid("invalid_metamask_capability_observation", "permission capability value is invalid");
    }
    return { type: value.type, chainIds: [...value.chainIds].sort(), ruleTypes: [...value.ruleTypes].sort() };
  }).sort((left, right) => left.type.localeCompare(right.type));
}

function normalizeSecurity(value) {
  exact("agentWalletSecurity", value, ["simulation", "threatScanning", "asyncApproval"]);
  for (const status of Object.values(value)) {
    if (!STATUS.has(status)) invalid("invalid_metamask_capability_observation", "security capability is invalid");
  }
  return { ...value };
}

export function createMetaMaskCapabilityObservation(input) {
  exact("capability observation input", input, [
    "descriptor", "chainId", "contextEpoch", "rpcMethodSupport", "permissionTypes",
    "agentWalletSecurity", "observedAt", "expiresAt"
  ]);
  assertDescriptor(input.descriptor);
  if (!CHAINS.has(input.chainId) || !Number.isSafeInteger(input.contextEpoch) || input.contextEpoch < 0) {
    invalid("invalid_metamask_capability_observation", "chain or context epoch is unavailable");
  }
  const observedAt = time("observedAt", input.observedAt);
  const expiresAt = time("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_metamask_capability_observation", "observation lifetime is unavailable");
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    descriptorHash: input.descriptor.descriptorHash,
    chainId: input.chainId,
    chainIdHex: CHAINS.get(input.chainId),
    contextEpoch: input.contextEpoch,
    rpcMethodSupport: normalizeMethodSupport(input.rpcMethodSupport),
    permissionTypes: normalizePermissionTypes(input.permissionTypes),
    agentWalletSecurity: normalizeSecurity(input.agentWalletSecurity),
    source: "local_synthetic_fixture",
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalCallPerformed: false,
    authorizationGranted: false,
    fundsAuthority: false,
    schemaVersion: METAMASK_CAPABILITY_OBSERVATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "metaMaskCapabilityObservation");
  return immutable({ observationHash: hashId("metamask_capability_observation", value), ...value });
}

export function verifyMetaMaskCapabilityObservation(value, { descriptor, now = new Date(), allowExpired = false } = {}) {
  exact("capability observation", value, [
    "observationHash", "adapterId", "descriptorHash", "chainId", "chainIdHex", "contextEpoch",
    "rpcMethodSupport", "permissionTypes", "agentWalletSecurity", "source", "observedAt", "expiresAt",
    "unknownIsNonPermissive", "externalCallPerformed", "authorizationGranted", "fundsAuthority", "schemaVersion"
  ]);
  const current = nowDate(now);
  const observedAt = time("observedAt", value.observedAt);
  const expiresAt = time("expiresAt", value.expiresAt);
  hash("observationHash", value.observationHash);
  hash("descriptorHash", value.descriptorHash);
  normalizeMethodSupport(value.rpcMethodSupport);
  normalizePermissionTypes(value.permissionTypes);
  normalizeSecurity(value.agentWalletSecurity);
  const core = structuredClone(value);
  delete core.observationHash;
  if (value.adapterId !== ADAPTER_ID || !CHAINS.has(value.chainId) || value.chainIdHex !== CHAINS.get(value.chainId) ||
      !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 || value.source !== "local_synthetic_fixture" ||
      value.unknownIsNonPermissive !== true || value.externalCallPerformed !== false ||
      value.authorizationGranted !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== METAMASK_CAPABILITY_OBSERVATION_SCHEMA_VERSION || expiresAt <= observedAt ||
      expiresAt - observedAt > MAX_LIFETIME_MS || (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("metamask_capability_observation", core) !== value.observationHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_metamask_capability_observation" :
      "invalid_metamask_capability_observation", "MetaMask capability observation is inconsistent or stale");
  }
  if (descriptor) {
    assertDescriptor(descriptor);
    if (descriptor.descriptorHash !== value.descriptorHash) {
      invalid("metamask_agentic_wallet_capability_drift", "descriptor changed after capability observation");
    }
  }
  return true;
}

export function normalizeMetaMaskAgenticWalletCapabilities({ descriptor, observation, now = new Date() }) {
  assertDescriptor(descriptor);
  verifyMetaMaskCapabilityObservation(observation, { descriptor, now });
  const methods = observation.rpcMethodSupport;
  const operationSupport = Object.fromEntries(AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operation) => [operation, "unsupported"]));
  operationSupport.walletDiscoverCapabilities = "supported";
  operationSupport.walletPrepareGrant = methods.wallet_requestExecutionPermissions;
  operationSupport.walletActivateGrant = methods.wallet_requestExecutionPermissions;
  operationSupport.walletReadGrant = methods.wallet_getGrantedExecutionPermissions;
  operationSupport.walletRevokeGrant = methods.wallet_revokeExecutionPermission;
  operationSupport.walletPrepareExecution = observation.agentWalletSecurity.simulation;
  operationSupport.walletApproveExecution = observation.agentWalletSecurity.asyncApproval;
  return createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: observation.chainId,
    contextEpoch: observation.contextEpoch,
    operationSupport,
    permissionModel: Object.values(methods).some((status) => status === "supported") ? "erc7715" : "unknown",
    executionTransport: methods.wallet_requestExecutionPermissions === "supported" ? "wallet_rpc" : "unknown",
    providerSimulation: observation.agentWalletSecurity.simulation,
    providerThreatScreening: observation.agentWalletSecurity.threatScanning,
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt
  });
}

function permissionProjectionCore(value) {
  const core = structuredClone(value);
  delete core.metaMaskPermissionProjectionId;
  delete core.metaMaskPermissionProjectionHash;
  return core;
}

export function prepareMetaMaskAdvancedPermissionProjection(input) {
  exact("permission projection input", input, [
    "descriptor", "capabilities", "observation", "permissionProjection", "requestedPermissionType",
    "accountRefHash", "sessionAccountRefHash"
  ], ["now"]);
  const current = nowDate(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifyMetaMaskCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalizedCapabilities = normalizeMetaMaskAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyExternalWalletPermissionProjection(input.permissionProjection, { now: current });
  id("requestedPermissionType", input.requestedPermissionType);
  hash("accountRefHash", input.accountRefHash);
  hash("sessionAccountRefHash", input.sessionAccountRefHash);
  if (input.capabilities.capabilitiesHash !== normalizedCapabilities.capabilitiesHash ||
      input.capabilities.capabilitiesHash !== input.permissionProjection.capabilitiesHash ||
      input.capabilities.descriptorHash !== input.observation.descriptorHash ||
      input.capabilities.contextEpoch !== input.observation.contextEpoch ||
      input.permissionProjection.adapterId !== ADAPTER_ID || input.permissionProjection.chainIds.length !== 1 ||
      input.permissionProjection.descriptorHash !== input.descriptor.descriptorHash) {
    invalid("metamask_agentic_wallet_binding_mismatch", "permission inputs do not share one exact context");
  }
  const permission = input.observation.permissionTypes.find(({ type }) => type === input.requestedPermissionType);
  const supported = Boolean(permission?.chainIds.includes(input.observation.chainIdHex));
  const expirySupported = Boolean(permission?.ruleTypes.includes("expiry"));
  const risky = RISKY_PERMISSION_TYPES.has(input.requestedPermissionType);
  const decision = risky || !supported || !expirySupported ? ExecutionDecision.DENY : ExecutionDecision.STEP_UP;
  const reasonCodes = risky ? ["canonical_policy_forbids_allowance_permission"] :
    !supported ? ["permission_type_not_observed_for_chain"] :
    !expirySupported ? ["expiry_rule_not_observed"] : ["human_wallet_approval_required"];
  const expiresAt = time("permissionProjection.expiresAt", input.permissionProjection.expiresAt);
  const value = {
    permissionProjectionHash: input.permissionProjection.permissionProjectionHash,
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    sessionEpoch: input.permissionProjection.sessionEpoch,
    rpcMethod: "wallet_requestExecutionPermissions",
    chainId: input.permissionProjection.chainIds[0],
    chainIdHex: CHAINS.get(input.permissionProjection.chainIds[0]),
    accountRefHash: input.accountRefHash,
    sessionAccountRefHash: input.sessionAccountRefHash,
    requestedPermissionType: input.requestedPermissionType,
    permissionDataHash: hashId("metamask_permission_data", {
      targetPolicies: input.permissionProjection.targetPolicies,
      assetIds: input.permissionProjection.assetIds,
      limits: {
        perTxLimitMinor: input.permissionProjection.perTxLimitMinor,
        rolling24hLimitMinor: input.permissionProjection.rolling24hLimitMinor,
        aggregateLimitMinor: input.permissionProjection.aggregateLimitMinor,
        obligationLimitMinor: input.permissionProjection.obligationLimitMinor
      }
    }),
    expiryTimestamp: Math.floor(expiresAt.getTime() / 1000),
    isAdjustmentAllowed: false,
    decision,
    reasonCodes: reasons(reasonCodes),
    preparedAt: current.toISOString(),
    expiresAt: expiresAt.toISOString(),
    providerProvisioningReady: false,
    activationAllowed: false,
    externalCallAllowed: false,
    externalProvisioningPerformed: false,
    rawParamsRetained: false,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: METAMASK_PERMISSION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "metaMaskAdvancedPermissionProjection");
  const metaMaskPermissionProjectionHash = hashId("metamask_permission_projection", value);
  return immutable({
    metaMaskPermissionProjectionId: `metamask_permission_projection_${metaMaskPermissionProjectionHash.slice(2)}`,
    metaMaskPermissionProjectionHash,
    ...value
  });
}

export function verifyMetaMaskAdvancedPermissionProjection(value, { now = new Date(), allowExpired = false } = {}) {
  exact("MetaMask permission projection", value, [
    "metaMaskPermissionProjectionId", "metaMaskPermissionProjectionHash", "permissionProjectionHash",
    "descriptorHash", "capabilitiesHash", "capabilityObservationHash", "sessionEpoch", "rpcMethod", "chainId",
    "chainIdHex", "accountRefHash", "sessionAccountRefHash", "requestedPermissionType", "permissionDataHash",
    "expiryTimestamp", "isAdjustmentAllowed", "decision", "reasonCodes", "preparedAt", "expiresAt",
    "providerProvisioningReady", "activationAllowed", "externalCallAllowed", "externalProvisioningPerformed",
    "rawParamsRetained", "transactionsAllowed", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = nowDate(now);
  for (const key of ["metaMaskPermissionProjectionHash", "permissionProjectionHash", "descriptorHash",
    "capabilitiesHash", "capabilityObservationHash", "accountRefHash", "sessionAccountRefHash", "permissionDataHash"]) hash(key, value[key]);
  const preparedAt = time("preparedAt", value.preparedAt);
  const expiresAt = time("expiresAt", value.expiresAt);
  id("requestedPermissionType", value.requestedPermissionType);
  reasons(value.reasonCodes);
  const riskyPermission = RISKY_PERMISSION_TYPES.has(value.requestedPermissionType);
  const reasonSetIsValid = value.decision === ExecutionDecision.STEP_UP
    ? JSON.stringify(value.reasonCodes) === JSON.stringify(["human_wallet_approval_required"])
    : riskyPermission
      ? JSON.stringify(value.reasonCodes) === JSON.stringify(["canonical_policy_forbids_allowance_permission"])
      : ["expiry_rule_not_observed", "permission_type_not_observed_for_chain"].includes(value.reasonCodes[0]);
  if (value.metaMaskPermissionProjectionId !== `metamask_permission_projection_${value.metaMaskPermissionProjectionHash.slice(2)}` ||
      value.rpcMethod !== "wallet_requestExecutionPermissions" || !CHAINS.has(value.chainId) ||
      value.chainIdHex !== CHAINS.get(value.chainId) || !Number.isSafeInteger(value.sessionEpoch) || value.sessionEpoch < 0 ||
      !Number.isSafeInteger(value.expiryTimestamp) || value.expiryTimestamp !== Math.floor(expiresAt.getTime() / 1000) ||
      value.isAdjustmentAllowed !== false || ![ExecutionDecision.DENY, ExecutionDecision.STEP_UP].includes(value.decision) ||
      (riskyPermission && value.decision !== ExecutionDecision.DENY) || value.reasonCodes.length !== 1 || !reasonSetIsValid ||
      value.providerProvisioningReady !== false || value.activationAllowed !== false || value.externalCallAllowed !== false ||
      value.externalProvisioningPerformed !== false || value.rawParamsRetained !== false ||
      value.transactionsAllowed !== false || value.productionAuthority !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== METAMASK_PERMISSION_PROJECTION_SCHEMA_VERSION || expiresAt <= preparedAt ||
      (!allowExpired && (preparedAt > current || expiresAt <= current)) ||
      hashId("metamask_permission_projection", permissionProjectionCore(value)) !== value.metaMaskPermissionProjectionHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_metamask_permission_projection" :
      "invalid_metamask_permission_projection", "MetaMask permission projection is inconsistent or stale");
  }
  return true;
}

export function compareMetaMaskAdvancedPermissionResponse({ preparedProjection, response, now = new Date() }) {
  const current = nowDate(now);
  verifyMetaMaskAdvancedPermissionProjection(preparedProjection, { now: current });
  exact("normalized permission response", response, [
    "chainIdHex", "permissionType", "permissionDataHash", "accountRefHash", "sessionAccountRefHash",
    "expiryTimestamp", "isAdjustmentAllowed", "externalPermissionRefHash", "dependenciesHash"
  ]);
  id("permissionType", response.permissionType);
  for (const key of ["permissionDataHash", "accountRefHash", "sessionAccountRefHash",
    "externalPermissionRefHash", "dependenciesHash"]) hash(key, response[key]);
  if (!HEX_CHAIN.test(response.chainIdHex) || !Number.isSafeInteger(response.expiryTimestamp) ||
      typeof response.isAdjustmentAllowed !== "boolean") {
    invalid("invalid_metamask_permission_response", "normalized permission response is invalid");
  }
  const exactMatch = preparedProjection.decision === ExecutionDecision.STEP_UP &&
    response.chainIdHex === preparedProjection.chainIdHex &&
    response.permissionType === preparedProjection.requestedPermissionType &&
    response.permissionDataHash === preparedProjection.permissionDataHash &&
    response.accountRefHash === preparedProjection.accountRefHash &&
    response.sessionAccountRefHash === preparedProjection.sessionAccountRefHash &&
    response.expiryTimestamp === preparedProjection.expiryTimestamp && response.isAdjustmentAllowed === false;
  const decision = exactMatch ? ExecutionDecision.STEP_UP : ExecutionDecision.QUARANTINE;
  const reasonCodes = exactMatch ? ["human_confirmation_required_before_activation"] :
    [preparedProjection.decision === ExecutionDecision.DENY ? "response_for_denied_permission" : "provider_response_widened_or_changed"];
  const normalizedResponseHash = hashId("metamask_normalized_permission_response", response);
  const value = {
    metaMaskPermissionProjectionHash: preparedProjection.metaMaskPermissionProjectionHash,
    normalizedResponseHash,
    externalPermissionRefHash: response.externalPermissionRefHash,
    decision,
    reasonCodes: reasons(reasonCodes),
    comparedAt: current.toISOString(),
    activationAllowed: false,
    externalProvisioningConfirmed: false,
    rawProviderResponseRetained: false,
    canonicalMutationAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: METAMASK_PERMISSION_COMPARISON_SCHEMA_VERSION
  };
  return immutable({ comparisonHash: hashId("metamask_permission_response_comparison", value), ...value });
}

export function createDisabledMetaMaskAgenticWalletProvider({ chainId = "eip155:84532", contextEpoch = 0, now = new Date() } = {}) {
  const current = nowDate(now);
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: ADAPTER_ID, providerFamily: PROVIDER_FAMILY, adapterVersion: "1.0.0",
    enabled: false, externalCallsEnabled: false
  });
  const unknownMethods = Object.fromEntries(METAMASK_ERC7715_RPC_METHODS.map((method) => [method, "unknown"]));
  const observation = createMetaMaskCapabilityObservation({
    descriptor, chainId, contextEpoch, rpcMethodSupport: unknownMethods, permissionTypes: [],
    agentWalletSecurity: { simulation: "unknown", threatScanning: "unknown", asyncApproval: "unknown" },
    observedAt: current.toISOString(), expiresAt: new Date(current.getTime() + MAX_LIFETIME_MS).toISOString()
  });
  const capabilities = normalizeMetaMaskAgenticWalletCapabilities({ descriptor, observation, now: current });
  const disabled = async () => invalid("metamask_agentic_wallet_disabled_l0_local_no_funds",
    "MetaMask external operation is disabled");
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request, status: "unavailable", reasonCodes: ["metamask_external_probe_disabled"],
        externalState: "not_invoked", externalCallPerformed: false, capabilities, observedAt: current
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

export function describeMetaMaskAgenticWalletBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: ADAPTER_ID,
    capabilitySource: "local_synthetic_fixture",
    walletRpcEnabled: false,
    agentWalletCliEnabled: false,
    providerPermissionProvisioningEnabled: false,
    permissionContextRedemptionEnabled: false,
    signatureEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
