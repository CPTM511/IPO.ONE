import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  DelegatedWalletGrantStatus,
  verifyDelegatedWalletGrant,
  verifyExecutionTargetPolicy
} from "./agentic-execution-grant.js";
import {
  ExecutionDecision,
  verifyPreparedExecution,
  verifyTransactionPreflightReceipt
} from "./agentic-execution-preflight.js";

export const AGENTIC_WALLET_PROVIDER_DESCRIPTOR_SCHEMA_VERSION =
  "agentic_wallet_provider_descriptor.v1";
export const AGENTIC_WALLET_PROVIDER_CAPABILITIES_SCHEMA_VERSION =
  "agentic_wallet_provider_capabilities.v1";
export const EXTERNAL_WALLET_PERMISSION_PROJECTION_SCHEMA_VERSION =
  "external_wallet_permission_projection.v1";
export const AGENTIC_WALLET_PROVIDER_REQUEST_SCHEMA_VERSION =
  "agentic_wallet_provider_request.v1";
export const AGENTIC_WALLET_PROVIDER_RESULT_SCHEMA_VERSION =
  "agentic_wallet_provider_result.v1";

export const AGENTIC_WALLET_PROVIDER_OPERATIONS = Object.freeze([
  "walletDiscoverCapabilities",
  "walletPrepareGrant",
  "walletActivateGrant",
  "walletReadGrant",
  "walletRevokeGrant",
  "walletPrepareExecution",
  "walletApproveExecution",
  "walletSubmitExecution",
  "walletReadExecution"
]);

export const AGENTIC_WALLET_PROVIDER_METHOD_BY_OPERATION = Object.freeze({
  walletDiscoverCapabilities: "discoverCapabilities",
  walletPrepareGrant: "prepareGrant",
  walletActivateGrant: "activateGrant",
  walletReadGrant: "readGrant",
  walletRevokeGrant: "revokeGrant",
  walletPrepareExecution: "preflight",
  walletApproveExecution: "requestHumanStepUp",
  walletSubmitExecution: "submit",
  walletReadExecution: "readExecution"
});

export const AgenticWalletCapabilityStatus = Object.freeze({
  SUPPORTED: "supported",
  UNSUPPORTED: "unsupported",
  UNKNOWN: "unknown"
});

export const AgenticWalletProviderResultStatus = Object.freeze({
  SUCCEEDED: "succeeded",
  REJECTED: "rejected",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown"
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const BYTES32 = /^0x[0-9a-f]{64}$/;
const UNSIGNED = /^(?:0|[1-9][0-9]{0,77})$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,95}$/;
const SUPPORTED_CHAINS = new Set(["eip155:84532", "eip155:1952"]);
const CAPABILITY_STATUSES = new Set(Object.values(AgenticWalletCapabilityStatus));
const RESULT_STATUSES = new Set(Object.values(AgenticWalletProviderResultStatus));
const PERMISSION_MODELS = new Set(["none", "erc7715", "erc7710", "vendor_native", "unknown"]);
const EXECUTION_TRANSPORTS = new Set(["none", "wallet_rpc", "vendor_api", "mcp", "cli", "tee", "unknown"]);
const MAX_CAPABILITY_LIFETIME_MS = 5 * 60 * 1000;
const MAX_REQUEST_LIFETIME_MS = 2 * 60 * 1000;

function invalid(code, message, details) {
  throw new DomainError(code, message, details);
}

function exactShape(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalid("invalid_agentic_wallet_provider_input", `${name} has an invalid closed shape`);
  }
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be a bounded identifier`);
  }
  return value;
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be lowercase bytes32`);
  }
  return value;
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function trustedNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalid("invalid_agentic_wallet_provider_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function canonicalMinor(name, value, { positive = false } = {}) {
  if (typeof value !== "string" || !UNSIGNED.test(value) || (positive && value === "0")) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be canonical minor units`);
  }
  return BigInt(value);
}

function sortedUnique(name, values, allowedValues) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 64) {
    invalid("invalid_agentic_wallet_provider_input", `${name} must be a bounded non-empty array`);
  }
  const result = [...values].sort();
  if (new Set(result).size !== result.length || result.some((value) => !allowedValues.has(value))) {
    invalid("invalid_agentic_wallet_provider_input", `${name} contains unavailable values`);
  }
  return result;
}

function descriptorCore(value) {
  return {
    adapterId: value.adapterId,
    providerFamily: value.providerFamily,
    adapterVersion: value.adapterVersion,
    supportedOperations: value.supportedOperations,
    enabled: value.enabled,
    externalCallsEnabled: value.externalCallsEnabled,
    dynamicallyLoaded: value.dynamicallyLoaded,
    sandboxOnly: value.sandboxOnly,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function createAgenticWalletProviderDescriptor(input) {
  exactShape("provider descriptor input", input, [
    "adapterId", "providerFamily", "adapterVersion", "enabled", "externalCallsEnabled"
  ]);
  identifier("adapterId", input.adapterId);
  identifier("providerFamily", input.providerFamily);
  if (typeof input.adapterVersion !== "string" || !VERSION.test(input.adapterVersion)) {
    invalid("invalid_agentic_wallet_provider_descriptor", "adapterVersion must be exact semver");
  }
  if (typeof input.enabled !== "boolean" || typeof input.externalCallsEnabled !== "boolean") {
    invalid("invalid_agentic_wallet_provider_descriptor", "provider enablement must be explicit");
  }
  if (input.externalCallsEnabled && !input.enabled) {
    invalid("invalid_agentic_wallet_provider_descriptor", "disabled providers cannot allow external calls");
  }
  const value = {
    adapterId: input.adapterId,
    providerFamily: input.providerFamily,
    adapterVersion: input.adapterVersion,
    supportedOperations: [...AGENTIC_WALLET_PROVIDER_OPERATIONS],
    enabled: input.enabled,
    externalCallsEnabled: input.externalCallsEnabled,
    dynamicallyLoaded: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: AGENTIC_WALLET_PROVIDER_DESCRIPTOR_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "agenticWalletProviderDescriptor");
  return cloneFreeze({ descriptorHash: hashId("agentic_wallet_provider_descriptor", value), ...value });
}

export function verifyAgenticWalletProviderDescriptor(value) {
  exactShape("provider descriptor", value, [
    "descriptorHash", "adapterId", "providerFamily", "adapterVersion", "supportedOperations",
    "enabled", "externalCallsEnabled", "dynamicallyLoaded", "sandboxOnly",
    "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  bytes32("descriptorHash", value.descriptorHash);
  identifier("adapterId", value.adapterId);
  identifier("providerFamily", value.providerFamily);
  const operations = sortedUnique(
    "supportedOperations", value.supportedOperations, new Set(AGENTIC_WALLET_PROVIDER_OPERATIONS)
  );
  if (
    value.schemaVersion !== AGENTIC_WALLET_PROVIDER_DESCRIPTOR_SCHEMA_VERSION ||
    !VERSION.test(value.adapterVersion ?? "") ||
    JSON.stringify(operations) !== JSON.stringify([...AGENTIC_WALLET_PROVIDER_OPERATIONS].sort()) ||
    typeof value.enabled !== "boolean" || typeof value.externalCallsEnabled !== "boolean" ||
    (value.externalCallsEnabled && !value.enabled) || value.dynamicallyLoaded !== false ||
    value.sandboxOnly !== true || value.productionAuthority !== false || value.fundsAuthority !== false ||
    hashId("agentic_wallet_provider_descriptor", descriptorCore(value)) !== value.descriptorHash
  ) {
    invalid("invalid_agentic_wallet_provider_descriptor", "provider descriptor is inconsistent");
  }
  return true;
}

function capabilitiesCore(value) {
  return {
    adapterId: value.adapterId,
    descriptorHash: value.descriptorHash,
    chainId: value.chainId,
    contextEpoch: value.contextEpoch,
    operationSupport: value.operationSupport,
    permissionModel: value.permissionModel,
    executionTransport: value.executionTransport,
    providerSimulation: value.providerSimulation,
    providerThreatScreening: value.providerThreatScreening,
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    unknownIsNonPermissive: value.unknownIsNonPermissive,
    authorizationGranted: value.authorizationGranted,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

function normalizeOperationSupport(value) {
  exactShape("operationSupport", value, AGENTIC_WALLET_PROVIDER_OPERATIONS);
  const result = {};
  for (const operationId of AGENTIC_WALLET_PROVIDER_OPERATIONS) {
    if (!CAPABILITY_STATUSES.has(value[operationId])) {
      invalid("invalid_agentic_wallet_provider_capabilities", `unsupported status for ${operationId}`);
    }
    result[operationId] = value[operationId];
  }
  return result;
}

export function createAgenticWalletProviderCapabilities(input) {
  exactShape("provider capabilities input", input, [
    "descriptor", "chainId", "contextEpoch", "operationSupport", "permissionModel",
    "executionTransport", "providerSimulation", "providerThreatScreening", "observedAt", "expiresAt"
  ]);
  const {
    descriptor, chainId, contextEpoch, operationSupport, permissionModel, executionTransport,
    providerSimulation, providerThreatScreening, observedAt, expiresAt
  } = input;
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (!SUPPORTED_CHAINS.has(chainId) || !Number.isSafeInteger(contextEpoch) || contextEpoch < 0) {
    invalid("invalid_agentic_wallet_provider_capabilities", "chain or context epoch is unavailable");
  }
  const observed = timestamp("observedAt", observedAt);
  const expiry = timestamp("expiresAt", expiresAt);
  if (expiry <= observed || expiry.getTime() - observed.getTime() > MAX_CAPABILITY_LIFETIME_MS) {
    invalid("invalid_agentic_wallet_provider_capabilities", "capability lifetime is unavailable");
  }
  if (
    !PERMISSION_MODELS.has(permissionModel) || !EXECUTION_TRANSPORTS.has(executionTransport) ||
    !CAPABILITY_STATUSES.has(providerSimulation) || !CAPABILITY_STATUSES.has(providerThreatScreening)
  ) {
    invalid("invalid_agentic_wallet_provider_capabilities", "capability vocabulary is unavailable");
  }
  const value = {
    adapterId: descriptor.adapterId,
    descriptorHash: descriptor.descriptorHash,
    chainId,
    contextEpoch,
    operationSupport: normalizeOperationSupport(operationSupport),
    permissionModel,
    executionTransport,
    providerSimulation,
    providerThreatScreening,
    observedAt: observed.toISOString(),
    expiresAt: expiry.toISOString(),
    unknownIsNonPermissive: true,
    authorizationGranted: false,
    fundsAuthority: false,
    schemaVersion: AGENTIC_WALLET_PROVIDER_CAPABILITIES_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "agenticWalletProviderCapabilities");
  return cloneFreeze({ capabilitiesHash: hashId("agentic_wallet_provider_capabilities", value), ...value });
}

export function verifyAgenticWalletProviderCapabilities(value, {
  descriptor,
  now = new Date(),
  allowExpired = false
} = {}) {
  exactShape("provider capabilities", value, [
    "capabilitiesHash", "adapterId", "descriptorHash", "chainId", "contextEpoch",
    "operationSupport", "permissionModel", "executionTransport", "providerSimulation",
    "providerThreatScreening", "observedAt", "expiresAt", "unknownIsNonPermissive",
    "authorizationGranted", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  const observed = timestamp("observedAt", value.observedAt);
  const expiry = timestamp("expiresAt", value.expiresAt);
  bytes32("capabilitiesHash", value.capabilitiesHash);
  bytes32("descriptorHash", value.descriptorHash);
  identifier("adapterId", value.adapterId);
  normalizeOperationSupport(value.operationSupport);
  if (
    value.schemaVersion !== AGENTIC_WALLET_PROVIDER_CAPABILITIES_SCHEMA_VERSION ||
    !SUPPORTED_CHAINS.has(value.chainId) || !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
    !PERMISSION_MODELS.has(value.permissionModel) || !EXECUTION_TRANSPORTS.has(value.executionTransport) ||
    !CAPABILITY_STATUSES.has(value.providerSimulation) ||
    !CAPABILITY_STATUSES.has(value.providerThreatScreening) ||
    value.unknownIsNonPermissive !== true || value.authorizationGranted !== false ||
    value.fundsAuthority !== false || expiry <= observed ||
    expiry.getTime() - observed.getTime() > MAX_CAPABILITY_LIFETIME_MS ||
    (!allowExpired && (observed > current || expiry <= current)) ||
    hashId("agentic_wallet_provider_capabilities", capabilitiesCore(value)) !== value.capabilitiesHash
  ) {
    invalid(
      !allowExpired && expiry <= current
        ? "stale_agentic_wallet_provider_capabilities"
        : "invalid_agentic_wallet_provider_capabilities",
      "provider capabilities are inconsistent or stale"
    );
  }
  if (descriptor) {
    verifyAgenticWalletProviderDescriptor(descriptor);
    if (descriptor.adapterId !== value.adapterId || descriptor.descriptorHash !== value.descriptorHash) {
      invalid("agentic_wallet_provider_capability_drift", "capabilities do not match the provider descriptor");
    }
  }
  return true;
}

function ensureSubset(name, requested, canonical) {
  if (!Array.isArray(requested) || requested.length < 1 || new Set(requested).size !== requested.length) {
    invalid("agentic_wallet_permission_widened", `${name} must be a non-empty unique subset`);
  }
  if (requested.some((value) => !canonical.includes(value))) {
    invalid("agentic_wallet_permission_widened", `${name} exceeds canonical authority`);
  }
  return [...requested].sort();
}

export function compileExternalWalletPermissionProjection(input) {
  exactShape("permission projection input", input, [
    "grant", "targetPolicies", "descriptor", "capabilities", "narrowing"
  ], ["now"]);
  const {
    grant, targetPolicies, descriptor, capabilities, narrowing, now = new Date()
  } = input;
  const current = trustedNow(now);
  verifyDelegatedWalletGrant(grant, { now: current, requireUsable: true });
  verifyAgenticWalletProviderDescriptor(descriptor);
  verifyAgenticWalletProviderCapabilities(capabilities, { descriptor, now: current });
  exactShape("permission narrowing", narrowing, [
    "chainIds", "assetIds", "targetPolicyIds", "perTxLimitMinor", "rolling24hLimitMinor",
    "aggregateLimitMinor", "obligationLimitMinor", "expiresAt"
  ]);
  if (grant.status !== DelegatedWalletGrantStatus.ACTIVE || descriptor.adapterId !== grant.adapterId) {
    invalid("agentic_wallet_provider_binding_mismatch", "grant and provider adapter do not match");
  }
  if (capabilities.operationSupport.walletPrepareGrant !== AgenticWalletCapabilityStatus.SUPPORTED) {
    invalid("agentic_wallet_provider_capability_unavailable", "permission preparation is unsupported");
  }
  const chainIds = ensureSubset("chainIds", narrowing.chainIds, grant.chainIds);
  const assetIds = ensureSubset("assetIds", narrowing.assetIds, grant.assetIds);
  const targetPolicyIds = ensureSubset(
    "targetPolicyIds", narrowing.targetPolicyIds, grant.allowedTargetPolicyIds
  );
  if (!Array.isArray(targetPolicies) || targetPolicies.length !== targetPolicyIds.length) {
    invalid("agentic_wallet_permission_widened", "exact target policies are required");
  }
  const byId = new Map(targetPolicies.map((policy) => [policy.targetPolicyId, policy]));
  if (byId.size !== targetPolicies.length) {
    invalid("agentic_wallet_permission_widened", "target policies must be unique");
  }
  const selectedPolicies = targetPolicyIds.map((targetPolicyId) => {
    const policy = byId.get(targetPolicyId);
    verifyExecutionTargetPolicy(policy, { now: current });
    if (
      policy.providerId !== grant.providerId || !chainIds.includes(policy.chainId) ||
      policy.transactionsAllowed !== false || policy.withdrawalAllowed !== false ||
      policy.transferAllowed !== false || policy.approvalMode !== "none"
    ) {
      invalid("agentic_wallet_permission_widened", "target policy exceeds canonical authority");
    }
    return {
      targetPolicyId: policy.targetPolicyId,
      policyHash: policy.policyHash,
      chainId: policy.chainId,
      targetAddress: policy.targetAddress,
      codeHash: policy.codeHash,
      proxyImplementationHash: policy.proxyImplementationHash,
      allowedFunctionSelectors: policy.allowedFunctionSelectors,
      maxNativeValueMinor: policy.maxNativeValueMinor,
      maxTokenAllowanceMinor: policy.maxTokenAllowanceMinor,
      approvalMode: "none",
      withdrawalAllowed: false,
      transferAllowed: false
    };
  });
  const limits = {};
  for (const key of [
    "perTxLimitMinor", "rolling24hLimitMinor", "aggregateLimitMinor", "obligationLimitMinor"
  ]) {
    const requested = canonicalMinor(key, narrowing[key], { positive: true });
    if (requested > canonicalMinor(`grant.${key}`, grant[key], { positive: true })) {
      invalid("agentic_wallet_permission_widened", `${key} exceeds canonical authority`);
    }
    limits[key] = requested.toString();
  }
  const expiry = timestamp("narrowing.expiresAt", narrowing.expiresAt);
  if (expiry <= current || expiry > new Date(grant.expiresAt) || expiry > new Date(capabilities.expiresAt)) {
    invalid("agentic_wallet_permission_widened", "permission expiry exceeds current authority");
  }
  const value = {
    grantId: grant.grantId,
    grantHash: grant.grantHash,
    adapterId: descriptor.adapterId,
    providerId: grant.providerId,
    descriptorHash: descriptor.descriptorHash,
    capabilitiesHash: capabilities.capabilitiesHash,
    sessionEpoch: grant.sessionEpoch,
    chainIds,
    assetIds,
    targetPolicies: selectedPolicies,
    ...limits,
    validFrom: current.toISOString(),
    expiresAt: expiry.toISOString(),
    status: "prepared",
    externalPermissionRefHash: null,
    activationAllowed: false,
    externalProvisioningPerformed: false,
    withdrawalAllowed: false,
    transferAllowed: false,
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: EXTERNAL_WALLET_PERMISSION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "externalWalletPermissionProjection");
  const permissionProjectionHash = hashId("external_wallet_permission_projection", value);
  return cloneFreeze({
    permissionProjectionId: `external_wallet_permission_${permissionProjectionHash.slice(2)}`,
    permissionProjectionHash,
    ...value
  });
}

export function verifyExternalWalletPermissionProjection(value, { now = new Date(), allowExpired = false } = {}) {
  exactShape("external permission projection", value, [
    "permissionProjectionId", "permissionProjectionHash", "grantId", "grantHash", "adapterId",
    "providerId", "descriptorHash", "capabilitiesHash", "sessionEpoch", "chainIds", "assetIds",
    "targetPolicies", "perTxLimitMinor", "rolling24hLimitMinor", "aggregateLimitMinor",
    "obligationLimitMinor", "validFrom", "expiresAt", "status", "externalPermissionRefHash",
    "activationAllowed", "externalProvisioningPerformed", "withdrawalAllowed", "transferAllowed",
    "transactionsAllowed", "sandboxOnly", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  const validFrom = timestamp("validFrom", value.validFrom);
  const expiry = timestamp("expiresAt", value.expiresAt);
  for (const key of ["permissionProjectionHash", "grantHash", "descriptorHash", "capabilitiesHash"]) {
    bytes32(key, value[key]);
  }
  for (const key of ["perTxLimitMinor", "rolling24hLimitMinor", "aggregateLimitMinor", "obligationLimitMinor"]) {
    canonicalMinor(key, value[key], { positive: true });
  }
  identifier("permissionProjectionId", value.permissionProjectionId);
  identifier("grantId", value.grantId);
  identifier("adapterId", value.adapterId);
  identifier("providerId", value.providerId);
  if (
    !Number.isSafeInteger(value.sessionEpoch) || value.sessionEpoch < 0 ||
    !Array.isArray(value.chainIds) || value.chainIds.length < 1 ||
    value.chainIds.some((chainId) => !SUPPORTED_CHAINS.has(chainId)) ||
    new Set(value.chainIds).size !== value.chainIds.length ||
    !Array.isArray(value.assetIds) || value.assetIds.length < 1 ||
    value.assetIds.some((assetId) => !IDENTIFIER.test(assetId)) ||
    new Set(value.assetIds).size !== value.assetIds.length ||
    !Array.isArray(value.targetPolicies) || value.targetPolicies.length < 1 ||
    value.targetPolicies.length > 16
  ) invalid("invalid_external_wallet_permission_projection", "permission scope is invalid");
  const targetPolicyIds = new Set();
  for (const policy of value.targetPolicies) {
    exactShape("permission target policy", policy, [
      "targetPolicyId", "policyHash", "chainId", "targetAddress", "codeHash",
      "proxyImplementationHash", "allowedFunctionSelectors", "maxNativeValueMinor",
      "maxTokenAllowanceMinor", "approvalMode", "withdrawalAllowed", "transferAllowed"
    ]);
    identifier("targetPolicyId", policy.targetPolicyId);
    bytes32("policyHash", policy.policyHash);
    bytes32("codeHash", policy.codeHash);
    bytes32("proxyImplementationHash", policy.proxyImplementationHash, { nullable: true });
    if (
      targetPolicyIds.has(policy.targetPolicyId) || !value.chainIds.includes(policy.chainId) ||
      typeof policy.targetAddress !== "string" || !/^0x[0-9a-f]{40}$/.test(policy.targetAddress) ||
      !Array.isArray(policy.allowedFunctionSelectors) || policy.allowedFunctionSelectors.length < 1 ||
      policy.allowedFunctionSelectors.length > 64 ||
      policy.allowedFunctionSelectors.some((selector) => !/^0x[0-9a-f]{8}$/.test(selector)) ||
      new Set(policy.allowedFunctionSelectors).size !== policy.allowedFunctionSelectors.length ||
      policy.maxNativeValueMinor !== "0" || policy.maxTokenAllowanceMinor !== "0" ||
      policy.approvalMode !== "none" || policy.withdrawalAllowed !== false || policy.transferAllowed !== false
    ) invalid("invalid_external_wallet_permission_projection", "permission target policy is invalid");
    targetPolicyIds.add(policy.targetPolicyId);
  }
  const core = structuredClone(value);
  delete core.permissionProjectionId;
  delete core.permissionProjectionHash;
  if (
    value.schemaVersion !== EXTERNAL_WALLET_PERMISSION_PROJECTION_SCHEMA_VERSION ||
    value.permissionProjectionId !== `external_wallet_permission_${value.permissionProjectionHash.slice(2)}` ||
    hashId("external_wallet_permission_projection", core) !== value.permissionProjectionHash ||
    value.status !== "prepared" || value.externalPermissionRefHash !== null ||
    value.activationAllowed !== false || value.externalProvisioningPerformed !== false ||
    value.withdrawalAllowed !== false || value.transferAllowed !== false ||
    value.transactionsAllowed !== false || value.sandboxOnly !== true ||
    value.productionAuthority !== false || value.fundsAuthority !== false || expiry <= validFrom ||
    (!allowExpired && (validFrom > current || expiry <= current))
  ) {
    invalid("invalid_external_wallet_permission_projection", "permission projection is inconsistent");
  }
  return true;
}

function normalizedPayload(operationId, payload, now) {
  if (operationId === "walletDiscoverCapabilities") {
    exactShape("discover payload", payload, ["chainId", "accountRefHash", "contextEpoch"]);
    if (!SUPPORTED_CHAINS.has(payload.chainId) || !Number.isSafeInteger(payload.contextEpoch) || payload.contextEpoch < 0) {
      invalid("invalid_agentic_wallet_provider_request", "discovery context is unavailable");
    }
    bytes32("accountRefHash", payload.accountRefHash);
  } else if (["walletPrepareGrant", "walletActivateGrant", "walletReadGrant", "walletRevokeGrant"].includes(operationId)) {
    exactShape("grant payload", payload, ["grant", "permissionProjection"]);
    verifyDelegatedWalletGrant(payload.grant, { now, requireUsable: true });
    verifyExternalWalletPermissionProjection(payload.permissionProjection, { now });
    if (
      payload.grant.grantId !== payload.permissionProjection.grantId ||
      payload.grant.grantHash !== payload.permissionProjection.grantHash
    ) invalid("agentic_wallet_provider_request_binding_mismatch", "grant projection binding changed");
  } else if (["walletPrepareExecution", "walletSubmitExecution", "walletApproveExecution"].includes(operationId)) {
    const required = ["preparedExecution", "preflightReceipt"];
    const optional = operationId === "walletApproveExecution"
      ? ["approvalRequestHash"]
      : operationId === "walletSubmitExecution" ? ["approvalArtifactHash"] : [];
    exactShape("execution payload", payload, required, optional);
    verifyPreparedExecution(payload.preparedExecution, { now });
    verifyTransactionPreflightReceipt(payload.preflightReceipt, { now });
    if (
      payload.preparedExecution.executionId !== payload.preflightReceipt.executionId ||
      payload.preparedExecution.preparedExecutionHash !== payload.preflightReceipt.preparedExecutionHash
    ) invalid("agentic_wallet_provider_request_binding_mismatch", "execution preflight binding changed");
    if (operationId === "walletApproveExecution") {
      bytes32("approvalRequestHash", payload.approvalRequestHash);
      if (payload.preflightReceipt.decision !== ExecutionDecision.STEP_UP) {
        invalid("agentic_wallet_provider_step_up_unavailable", "step-up requires an exact STEP_UP receipt");
      }
    }
    if (operationId === "walletSubmitExecution") {
      if (payload.preflightReceipt.decision === ExecutionDecision.STEP_UP) {
        bytes32("approvalArtifactHash", payload.approvalArtifactHash);
      } else if (payload.preflightReceipt.decision !== ExecutionDecision.ALLOW || payload.approvalArtifactHash !== undefined) {
        invalid("agentic_wallet_provider_submission_denied", "submission requires ALLOW or exact approved STEP_UP");
      }
    }
  } else if (operationId === "walletReadExecution") {
    exactShape("read execution payload", payload, [
      "executionId", "preparedExecutionHash", "externalExecutionRefHash"
    ]);
    identifier("executionId", payload.executionId);
    bytes32("preparedExecutionHash", payload.preparedExecutionHash);
    bytes32("externalExecutionRefHash", payload.externalExecutionRefHash);
  } else {
    invalid("invalid_agentic_wallet_provider_request", "operation is unavailable");
  }
  assertNoRawPiiReference(payload, "agenticWalletProviderRequestPayload");
  return structuredClone(payload);
}

export function createAgenticWalletProviderRequest(input) {
  exactShape("provider request input", input, [
    "descriptor", "operationId", "payload", "expiresAt"
  ], ["capabilities", "now"]);
  const {
    descriptor, capabilities = null, operationId, payload, expiresAt, now = new Date()
  } = input;
  const current = trustedNow(now);
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (!AGENTIC_WALLET_PROVIDER_OPERATIONS.includes(operationId)) {
    invalid("invalid_agentic_wallet_provider_request", "operation is unavailable");
  }
  if (operationId === "walletDiscoverCapabilities") {
    if (capabilities !== null) {
      invalid("invalid_agentic_wallet_provider_request", "discovery cannot trust caller capabilities");
    }
  } else {
    verifyAgenticWalletProviderCapabilities(capabilities, { descriptor, now: current });
    if (capabilities.operationSupport[operationId] !== AgenticWalletCapabilityStatus.SUPPORTED) {
      invalid("agentic_wallet_provider_capability_unavailable", "operation capability is not supported");
    }
  }
  const expiry = timestamp("expiresAt", expiresAt);
  if (
    expiry <= current || expiry.getTime() - current.getTime() > MAX_REQUEST_LIFETIME_MS ||
    (capabilities && expiry > new Date(capabilities.expiresAt))
  ) invalid("invalid_agentic_wallet_provider_request", "request expiry exceeds current context");
  const value = {
    adapterId: descriptor.adapterId,
    operationId,
    descriptorHash: descriptor.descriptorHash,
    capabilitiesHash: capabilities?.capabilitiesHash ?? null,
    contextEpoch: capabilities?.contextEpoch ?? payload.contextEpoch,
    payload: normalizedPayload(operationId, payload, current),
    createdAt: current.toISOString(),
    expiresAt: expiry.toISOString(),
    externalCallAllowed: descriptor.enabled && descriptor.externalCallsEnabled,
    fundsAuthority: false,
    schemaVersion: AGENTIC_WALLET_PROVIDER_REQUEST_SCHEMA_VERSION
  };
  const requestHash = hashId("agentic_wallet_provider_request", value);
  return cloneFreeze({ requestId: `agentic_wallet_provider_request_${requestHash.slice(2)}`, requestHash, ...value });
}

export function verifyAgenticWalletProviderRequest(value, { now = new Date(), allowExpired = false } = {}) {
  exactShape("provider request", value, [
    "requestId", "requestHash", "adapterId", "operationId", "descriptorHash", "capabilitiesHash",
    "contextEpoch", "payload", "createdAt", "expiresAt", "externalCallAllowed", "fundsAuthority",
    "schemaVersion"
  ]);
  const current = trustedNow(now);
  const createdAt = timestamp("createdAt", value.createdAt);
  const expiry = timestamp("expiresAt", value.expiresAt);
  bytes32("requestHash", value.requestHash);
  bytes32("descriptorHash", value.descriptorHash);
  bytes32("capabilitiesHash", value.capabilitiesHash, { nullable: true });
  normalizedPayload(value.operationId, value.payload, current);
  const core = structuredClone(value);
  delete core.requestId;
  delete core.requestHash;
  if (
    value.schemaVersion !== AGENTIC_WALLET_PROVIDER_REQUEST_SCHEMA_VERSION ||
    (value.operationId === "walletDiscoverCapabilities" && value.capabilitiesHash !== null) ||
    (value.operationId !== "walletDiscoverCapabilities" && value.capabilitiesHash === null) ||
    value.requestId !== `agentic_wallet_provider_request_${value.requestHash.slice(2)}` ||
    hashId("agentic_wallet_provider_request", core) !== value.requestHash ||
    !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
    typeof value.externalCallAllowed !== "boolean" || value.fundsAuthority !== false ||
    expiry <= createdAt || expiry.getTime() - createdAt.getTime() > MAX_REQUEST_LIFETIME_MS ||
    (!allowExpired && expiry <= current)
  ) {
    invalid(
      !allowExpired && expiry <= current
        ? "stale_agentic_wallet_provider_request"
        : "invalid_agentic_wallet_provider_request",
      "provider request is inconsistent or stale"
    );
  }
  return true;
}

function normalizedReasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16 ||
      values.some((value) => typeof value !== "string" || !REASON_CODE.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_agentic_wallet_provider_result", "reasonCodes must be a bounded unique list");
  }
  return [...values].sort();
}

export function createAgenticWalletProviderResult(input) {
  exactShape("provider result input", input, [
    "request", "status", "reasonCodes", "externalState", "externalCallPerformed"
  ], ["externalReferenceHash", "capabilities", "observedAt"]);
  const {
    request, status, reasonCodes, externalState, externalReferenceHash = null,
    externalCallPerformed, capabilities = null, observedAt = new Date()
  } = input;
  const current = trustedNow(observedAt);
  verifyAgenticWalletProviderRequest(request, { now: current });
  if (!RESULT_STATUSES.has(status)) {
    invalid("invalid_agentic_wallet_provider_result", "result status is unavailable");
  }
  identifier("externalState", externalState);
  bytes32("externalReferenceHash", externalReferenceHash, { nullable: true });
  if (typeof externalCallPerformed !== "boolean" || (externalCallPerformed && !request.externalCallAllowed)) {
    invalid("invalid_agentic_wallet_provider_result", "external call claim exceeds request authority");
  }
  if (status === AgenticWalletProviderResultStatus.UNKNOWN && !externalCallPerformed) {
    invalid("invalid_agentic_wallet_provider_result", "unknown requires an attempted external call");
  }
  if (request.operationId === "walletDiscoverCapabilities") {
    verifyAgenticWalletProviderCapabilities(capabilities, { now: current });
    if (
      capabilities.adapterId !== request.adapterId || capabilities.contextEpoch !== request.contextEpoch ||
      capabilities.descriptorHash !== request.descriptorHash
    ) {
      invalid("agentic_wallet_provider_capability_drift", "discovered capabilities changed context");
    }
  } else if (capabilities !== null) {
    invalid("invalid_agentic_wallet_provider_result", "capabilities are only returned by discovery");
  }
  const value = {
    requestId: request.requestId,
    requestHash: request.requestHash,
    adapterId: request.adapterId,
    operationId: request.operationId,
    status,
    reasonCodes: normalizedReasons(reasonCodes),
    externalState,
    externalReferenceHash,
    externalCallPerformed,
    capabilities,
    observedAt: current.toISOString(),
    adapterAcknowledgementOnly: true,
    canonicalMutationAllowed: false,
    rawProviderResponseRetained: false,
    fundsAuthority: false,
    schemaVersion: AGENTIC_WALLET_PROVIDER_RESULT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "agenticWalletProviderResult");
  return cloneFreeze({ resultHash: hashId("agentic_wallet_provider_result", value), ...value });
}

export function verifyAgenticWalletProviderResult(value, { request, now = new Date() } = {}) {
  exactShape("provider result", value, [
    "resultHash", "requestId", "requestHash", "adapterId", "operationId", "status", "reasonCodes",
    "externalState", "externalReferenceHash", "externalCallPerformed", "capabilities", "observedAt",
    "adapterAcknowledgementOnly", "canonicalMutationAllowed", "rawProviderResponseRetained",
    "fundsAuthority", "schemaVersion"
  ]);
  bytes32("resultHash", value.resultHash);
  bytes32("requestHash", value.requestHash);
  bytes32("externalReferenceHash", value.externalReferenceHash, { nullable: true });
  timestamp("observedAt", value.observedAt);
  normalizedReasons(value.reasonCodes);
  const core = structuredClone(value);
  delete core.resultHash;
  if (
    value.schemaVersion !== AGENTIC_WALLET_PROVIDER_RESULT_SCHEMA_VERSION ||
    !RESULT_STATUSES.has(value.status) || typeof value.externalCallPerformed !== "boolean" ||
    (value.status === AgenticWalletProviderResultStatus.UNKNOWN && !value.externalCallPerformed) ||
    value.adapterAcknowledgementOnly !== true || value.canonicalMutationAllowed !== false ||
    value.rawProviderResponseRetained !== false || value.fundsAuthority !== false ||
    hashId("agentic_wallet_provider_result", core) !== value.resultHash
  ) invalid("invalid_agentic_wallet_provider_result", "provider result is inconsistent");
  if (value.operationId === "walletDiscoverCapabilities") {
    verifyAgenticWalletProviderCapabilities(value.capabilities, { now });
    if (
      value.capabilities.adapterId !== value.adapterId ||
      (request !== undefined && value.capabilities.descriptorHash !== request.descriptorHash)
    ) invalid("agentic_wallet_provider_capability_drift", "result capabilities changed provider context");
  } else if (value.capabilities !== null) {
    invalid("invalid_agentic_wallet_provider_result", "non-discovery result contains capabilities");
  }
  if (request) {
    verifyAgenticWalletProviderRequest(request, { now });
    if (
      value.requestId !== request.requestId || value.requestHash !== request.requestHash ||
      value.adapterId !== request.adapterId || value.operationId !== request.operationId ||
      (value.externalCallPerformed && !request.externalCallAllowed)
    ) invalid("agentic_wallet_provider_result_binding_mismatch", "result does not match the request");
  }
  return true;
}

export function assertAgenticWalletProvider(provider) {
  const methods = Object.values(AGENTIC_WALLET_PROVIDER_METHOD_BY_OPERATION);
  exactShape("agentic wallet provider", provider, ["descriptor", ...methods]);
  verifyAgenticWalletProviderDescriptor(provider.descriptor);
  if (methods.some((method) => typeof provider[method] !== "function")) {
    invalid("invalid_agentic_wallet_provider", "provider must implement the exact SPI");
  }
  return true;
}

export class AgenticWalletProviderRegistry {
  #providers;

  constructor(providers = []) {
    if (!Array.isArray(providers)) invalid("invalid_agentic_wallet_provider_registry", "providers must be an array");
    this.#providers = new Map();
    for (const provider of providers) {
      assertAgenticWalletProvider(provider);
      if (this.#providers.has(provider.descriptor.adapterId)) {
        invalid("duplicate_agentic_wallet_provider", "provider adapter IDs must be unique");
      }
      this.#providers.set(provider.descriptor.adapterId, provider);
    }
  }

  listDescriptors() {
    return cloneFreeze([...this.#providers.values()].map(({ descriptor }) => descriptor)
      .sort((left, right) => left.adapterId.localeCompare(right.adapterId)));
  }

  requireEnabled(adapterId) {
    identifier("adapterId", adapterId);
    const provider = this.#providers.get(adapterId);
    if (!provider) invalid("agentic_wallet_provider_unregistered", "provider is not registered");
    if (!provider.descriptor.enabled || !provider.descriptor.externalCallsEnabled) {
      invalid("agentic_wallet_provider_disabled_l0_local_no_funds", "provider invocation is disabled");
    }
    return provider;
  }
}

export async function invokeAgenticWalletProvider({ registry, request, capabilities = null, now = new Date() }) {
  if (!(registry instanceof AgenticWalletProviderRegistry)) {
    invalid("invalid_agentic_wallet_provider_registry", "a static provider registry is required");
  }
  const current = trustedNow(now);
  verifyAgenticWalletProviderRequest(request, { now: current });
  const provider = registry.requireEnabled(request.adapterId);
  if (provider.descriptor.descriptorHash !== request.descriptorHash) {
    invalid("agentic_wallet_provider_descriptor_drift", "provider descriptor changed after request preparation");
  }
  if (request.externalCallAllowed !== (provider.descriptor.enabled && provider.descriptor.externalCallsEnabled)) {
    invalid("agentic_wallet_provider_descriptor_drift", "provider call authority changed after preparation");
  }
  if (request.operationId !== "walletDiscoverCapabilities") {
    verifyAgenticWalletProviderCapabilities(capabilities, { descriptor: provider.descriptor, now: current });
    if (
      capabilities.capabilitiesHash !== request.capabilitiesHash ||
      capabilities.contextEpoch !== request.contextEpoch ||
      capabilities.operationSupport[request.operationId] !== AgenticWalletCapabilityStatus.SUPPORTED
    ) invalid("agentic_wallet_provider_capability_drift", "provider capabilities changed after preparation");
  }
  const method = AGENTIC_WALLET_PROVIDER_METHOD_BY_OPERATION[request.operationId];
  const result = await provider[method](request);
  verifyAgenticWalletProviderResult(result, { request, now: current });
  return result;
}

export function createDisabledLocalAgenticWalletProvider({
  chainId = "eip155:84532",
  contextEpoch = 0,
  now = new Date()
} = {}) {
  const current = trustedNow(now);
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: "local_sandbox",
    providerFamily: "local_disabled",
    adapterVersion: "1.0.0",
    enabled: false,
    externalCallsEnabled: false
  });
  const unsupported = Object.fromEntries(
    AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operationId) => [operationId, "unsupported"])
  );
  const capabilities = createAgenticWalletProviderCapabilities({
    descriptor,
    chainId,
    contextEpoch,
    operationSupport: unsupported,
    permissionModel: "none",
    executionTransport: "none",
    providerSimulation: "unsupported",
    providerThreatScreening: "unsupported",
    observedAt: current.toISOString(),
    expiresAt: new Date(current.getTime() + MAX_CAPABILITY_LIFETIME_MS).toISOString()
  });
  const disabled = async () => invalid(
    "agentic_wallet_provider_disabled_l0_local_no_funds",
    "external agentic wallet operation is disabled"
  );
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request,
        status: "unavailable",
        reasonCodes: ["external_provider_disabled"],
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
    submit: disabled,
    readExecution: disabled,
    requestHumanStepUp: disabled
  });
}

export function describeAgenticWalletProviderBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    vendorAdaptersImplemented: false,
    externalProviderCallsEnabled: false,
    externalPermissionProvisioningEnabled: false,
    signaturesEnabled: false,
    transactionSubmissionEnabled: false,
    dynamicLoadingEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
