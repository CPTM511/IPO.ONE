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

export const BASE_ACCOUNT_CAPABILITY_OBSERVATION_SCHEMA_VERSION =
  "base_account_capability_observation.v1";
export const BASE_SPEND_PERMISSION_PROJECTION_SCHEMA_VERSION =
  "base_spend_permission_projection.v1";

export const BASE_ACCOUNT_CAPABILITIES = Object.freeze([
  "smartAccount", "spendPermission", "spendPermissionRevoke", "subAccounts",
  "walletSendCalls", "walletGetCallsStatus", "autoSpendPermission"
]);

const ADAPTER_ID = "base_account_spend_permission_reference";
const PROVIDER_FAMILY = "base_account";
const BASE_SEPOLIA = "eip155:84532";
const STATUSES = new Set(Object.values(AgenticWalletCapabilityStatus));
const BYTES32 = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const UNSIGNED = /^(?:0|[1-9][0-9]{0,77})$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;
const PERIOD_SECONDS = 86_400;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_base_account_agentic_wallet_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_base_account_agentic_wallet_input", `${name} has an invalid closed shape`);
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
    invalid("invalid_base_account_agentic_wallet_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_base_account_agentic_wallet_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_base_account_agentic_wallet_input", `${name} must be lowercase bytes32`);
  }
}

function id(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_base_account_agentic_wallet_input", `${name} must be a bounded identifier`);
  }
}

function minor(name, value) {
  if (typeof value !== "string" || !UNSIGNED.test(value) || value === "0") {
    invalid("invalid_base_spend_permission", `${name} must be positive canonical minor units`);
  }
  return BigInt(value);
}

function reasons(values) {
  if (!Array.isArray(values) || values.length !== 1 ||
      values.some((value) => typeof value !== "string" || !REASON.test(value))) {
    invalid("invalid_base_account_agentic_wallet_input", "reasonCodes must contain one reason");
  }
  return [...values];
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID || descriptor.providerFamily !== PROVIDER_FAMILY) {
    invalid("base_account_agentic_wallet_binding_mismatch", "descriptor is not the Base Account adapter");
  }
}

function normalizeSupport(value) {
  exact("accountSupport", value, BASE_ACCOUNT_CAPABILITIES);
  return Object.fromEntries(BASE_ACCOUNT_CAPABILITIES.map((key) => {
    if (!STATUSES.has(value[key])) {
      invalid("invalid_base_account_capability_observation", `${key} capability status is unavailable`);
    }
    return [key, value[key]];
  }));
}

function observationCore(value) {
  const core = structuredClone(value);
  delete core.observationHash;
  return core;
}

export function createBaseAccountCapabilityObservation(input) {
  exact("capability observation input", input, [
    "descriptor", "chainId", "contextEpoch", "accountSupport", "accountConfigurationHash",
    "observedAt", "expiresAt"
  ]);
  assertDescriptor(input.descriptor);
  if (input.chainId !== BASE_SEPOLIA || !Number.isSafeInteger(input.contextEpoch) || input.contextEpoch < 0) {
    invalid("invalid_base_account_capability_observation", "only the local Base Sepolia reference is available");
  }
  hash("accountConfigurationHash", input.accountConfigurationHash);
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_base_account_capability_observation", "observation lifetime is unavailable");
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    descriptorHash: input.descriptor.descriptorHash,
    chainId: input.chainId,
    contextEpoch: input.contextEpoch,
    accountSupport: normalizeSupport(input.accountSupport),
    accountConfigurationHash: input.accountConfigurationHash,
    source: "local_synthetic_fixture",
    vendorNetworkSupportAttested: false,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalCallPerformed: false,
    authorizationGranted: false,
    fundsAuthority: false,
    schemaVersion: BASE_ACCOUNT_CAPABILITY_OBSERVATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "baseAccountCapabilityObservation");
  return immutable({ observationHash: hashId("base_account_capability_observation", value), ...value });
}

export function verifyBaseAccountCapabilityObservation(value, {
  descriptor, now = new Date(), allowExpired = false
} = {}) {
  exact("capability observation", value, [
    "observationHash", "adapterId", "descriptorHash", "chainId", "contextEpoch", "accountSupport",
    "accountConfigurationHash", "source", "vendorNetworkSupportAttested", "observedAt", "expiresAt",
    "unknownIsNonPermissive", "externalCallPerformed", "authorizationGranted", "fundsAuthority",
    "schemaVersion"
  ]);
  const current = trustedNow(now);
  hash("observationHash", value.observationHash);
  hash("descriptorHash", value.descriptorHash);
  hash("accountConfigurationHash", value.accountConfigurationHash);
  normalizeSupport(value.accountSupport);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const valid = value.adapterId === ADAPTER_ID && value.chainId === BASE_SEPOLIA &&
    Number.isSafeInteger(value.contextEpoch) && value.contextEpoch >= 0 &&
    value.source === "local_synthetic_fixture" && value.vendorNetworkSupportAttested === false &&
    value.unknownIsNonPermissive === true && value.externalCallPerformed === false &&
    value.authorizationGranted === false && value.fundsAuthority === false &&
    value.schemaVersion === BASE_ACCOUNT_CAPABILITY_OBSERVATION_SCHEMA_VERSION && expiresAt > observedAt &&
    expiresAt - observedAt <= MAX_LIFETIME_MS && (allowExpired || (observedAt <= current && expiresAt > current)) &&
    hashId("base_account_capability_observation", observationCore(value)) === value.observationHash;
  if (!valid) {
    invalid(!allowExpired && expiresAt <= current ? "stale_base_account_capability_observation" :
      "invalid_base_account_capability_observation", "Base Account observation is inconsistent or stale");
  }
  if (descriptor) {
    assertDescriptor(descriptor);
    if (descriptor.descriptorHash !== value.descriptorHash) {
      invalid("base_account_capability_drift", "descriptor changed after capability observation");
    }
  }
  return true;
}

function combinedStatus(...statuses) {
  if (statuses.every((status) => status === "supported")) return "supported";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "unsupported";
}

export function normalizeBaseAccountAgenticWalletCapabilities({ descriptor, observation, now = new Date() }) {
  assertDescriptor(descriptor);
  verifyBaseAccountCapabilityObservation(observation, { descriptor, now });
  const operationSupport = Object.fromEntries(
    AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operation) => [operation, "unsupported"])
  );
  const permissionSupport = combinedStatus(
    observation.accountSupport.smartAccount, observation.accountSupport.spendPermission
  );
  operationSupport.walletDiscoverCapabilities = "supported";
  operationSupport.walletPrepareGrant = permissionSupport;
  operationSupport.walletActivateGrant = permissionSupport;
  operationSupport.walletReadGrant = permissionSupport;
  operationSupport.walletRevokeGrant = combinedStatus(
    permissionSupport, observation.accountSupport.spendPermissionRevoke
  );
  operationSupport.walletPrepareExecution = combinedStatus(
    observation.accountSupport.smartAccount, observation.accountSupport.walletSendCalls
  );
  operationSupport.walletApproveExecution = permissionSupport;
  operationSupport.walletSubmitExecution = operationSupport.walletPrepareExecution;
  operationSupport.walletReadExecution = observation.accountSupport.walletGetCallsStatus;
  return createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: observation.chainId,
    contextEpoch: observation.contextEpoch,
    operationSupport,
    permissionModel: permissionSupport === "supported" ? "vendor_native" :
      permissionSupport === "unsupported" ? "none" : "unknown",
    executionTransport: observation.accountSupport.smartAccount === "supported" ? "wallet_rpc" :
      observation.accountSupport.smartAccount === "unsupported" ? "none" : "unknown",
    providerSimulation: "unsupported",
    providerThreatScreening: "unsupported",
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt
  });
}

function normalizeRequestedPermission(value) {
  exact("requestedPermission", value, [
    "chainId", "assetId", "targetPolicyId", "tokenRefHash", "spenderRefHash", "allowanceMinor",
    "periodSeconds", "validFrom", "validUntil", "saltHash", "extraDataHash"
  ]);
  id("assetId", value.assetId);
  id("targetPolicyId", value.targetPolicyId);
  for (const key of ["tokenRefHash", "spenderRefHash", "saltHash", "extraDataHash"]) hash(key, value[key]);
  minor("allowanceMinor", value.allowanceMinor);
  if (!Number.isSafeInteger(value.periodSeconds) || value.periodSeconds < 1) {
    invalid("invalid_base_spend_permission", "periodSeconds must be a positive safe integer");
  }
  const validFrom = timestamp("validFrom", value.validFrom);
  const validUntil = timestamp("validUntil", value.validUntil);
  if (validUntil <= validFrom) invalid("invalid_base_spend_permission", "permission validity is unavailable");
  return { ...value, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() };
}

function projectionDecision(permissionProjection, requestedPermission, observation) {
  const required = [observation.accountSupport.smartAccount, observation.accountSupport.spendPermission];
  if (required.some((status) => status === "unsupported")) {
    return [ExecutionDecision.DENY, "base_required_capability_unsupported"];
  }
  if (required.some((status) => status === "unknown")) {
    return [ExecutionDecision.QUARANTINE, "base_required_capability_unknown"];
  }
  if (requestedPermission.chainId !== observation.chainId ||
      !permissionProjection.chainIds.includes(requestedPermission.chainId)) {
    return [ExecutionDecision.DENY, "base_spend_permission_chain_widened"];
  }
  const target = permissionProjection.targetPolicies.find(
    (policy) => policy.targetPolicyId === requestedPermission.targetPolicyId
  );
  if (!permissionProjection.assetIds.includes(requestedPermission.assetId) || !target) {
    return [ExecutionDecision.DENY, "base_spend_permission_scope_widened"];
  }
  const expectedTokenRefHash = hashId("base_spend_permission_asset", {
    assetId: requestedPermission.assetId
  });
  const expectedSpenderRefHash = hashId("base_spend_permission_target", {
    targetPolicyId: target.targetPolicyId,
    targetAddress: target.targetAddress,
    policyHash: target.policyHash
  });
  if (requestedPermission.tokenRefHash !== expectedTokenRefHash ||
      requestedPermission.spenderRefHash !== expectedSpenderRefHash) {
    return [ExecutionDecision.DENY, "base_spend_permission_binding_widened"];
  }
  const canonicalLimits = [
    permissionProjection.perTxLimitMinor,
    permissionProjection.rolling24hLimitMinor,
    permissionProjection.aggregateLimitMinor,
    permissionProjection.obligationLimitMinor
  ].map(BigInt);
  if (BigInt(requestedPermission.allowanceMinor) > canonicalLimits.reduce(
    (minimum, current) => current < minimum ? current : minimum
  )) return [ExecutionDecision.DENY, "base_spend_permission_amount_widened"];
  if (requestedPermission.periodSeconds !== PERIOD_SECONDS ||
      new Date(requestedPermission.validFrom) < new Date(permissionProjection.validFrom) ||
      new Date(requestedPermission.validUntil) > new Date(permissionProjection.expiresAt)) {
    return [ExecutionDecision.DENY, "base_spend_permission_time_widened"];
  }
  if (requestedPermission.extraDataHash !== hashId("base_spend_permission_extra_data", { empty: true })) {
    return [ExecutionDecision.DENY, "base_spend_permission_extra_data_forbidden"];
  }
  return [ExecutionDecision.STEP_UP, "base_spend_permission_human_approval_required"];
}

function canonicalPermissionBounds(permissionProjection) {
  const limits = [
    permissionProjection.perTxLimitMinor,
    permissionProjection.rolling24hLimitMinor,
    permissionProjection.aggregateLimitMinor,
    permissionProjection.obligationLimitMinor
  ].map(BigInt);
  return {
    canonicalLimitMinor: limits.reduce(
      (minimum, current) => current < minimum ? current : minimum
    ).toString(),
    canonicalValidFrom: permissionProjection.validFrom,
    canonicalExpiresAt: permissionProjection.expiresAt
  };
}

function projectionCore(value) {
  const core = structuredClone(value);
  delete core.baseSpendPermissionProjectionId;
  delete core.baseSpendPermissionProjectionHash;
  return core;
}

const DECISION_BY_REASON = new Map([
  ["base_required_capability_unsupported", ExecutionDecision.DENY],
  ["base_required_capability_unknown", ExecutionDecision.QUARANTINE],
  ["base_spend_permission_chain_widened", ExecutionDecision.DENY],
  ["base_spend_permission_scope_widened", ExecutionDecision.DENY],
  ["base_spend_permission_binding_widened", ExecutionDecision.DENY],
  ["base_spend_permission_amount_widened", ExecutionDecision.DENY],
  ["base_spend_permission_time_widened", ExecutionDecision.DENY],
  ["base_spend_permission_extra_data_forbidden", ExecutionDecision.DENY],
  ["base_spend_permission_human_approval_required", ExecutionDecision.STEP_UP]
]);

export function prepareBaseSpendPermissionProjection(input) {
  exact("Spend Permission projection input", input, [
    "descriptor", "capabilities", "observation", "providerRequest", "requestedPermission"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifyBaseAccountCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalized = normalizeBaseAccountAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyAgenticWalletProviderRequest(input.providerRequest, { now: current });
  const requestedPermission = normalizeRequestedPermission(input.requestedPermission);
  const permissionProjection = input.providerRequest.payload.permissionProjection;
  if (input.capabilities.capabilitiesHash !== normalized.capabilitiesHash ||
      input.providerRequest.adapterId !== ADAPTER_ID ||
      input.providerRequest.descriptorHash !== input.descriptor.descriptorHash ||
      input.providerRequest.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.providerRequest.contextEpoch !== input.observation.contextEpoch ||
      input.providerRequest.operationId !== "walletPrepareGrant" ||
      input.providerRequest.externalCallAllowed !== false ||
      permissionProjection.adapterId !== input.descriptor.adapterId ||
      input.providerRequest.payload.grant.grantHash !== permissionProjection.grantHash) {
    invalid("base_account_agentic_wallet_binding_mismatch", "projection does not match one current Base context");
  }
  const [decision, reasonCode] = projectionDecision(
    permissionProjection, requestedPermission, input.observation
  );
  const canonicalBounds = canonicalPermissionBounds(permissionProjection);
  const value = {
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    accountConfigurationHash: input.observation.accountConfigurationHash,
    providerRequestId: input.providerRequest.requestId,
    providerRequestHash: input.providerRequest.requestHash,
    permissionProjectionHash: permissionProjection.permissionProjectionHash,
    grantHash: permissionProjection.grantHash,
    chainId: requestedPermission.chainId,
    contextEpoch: input.observation.contextEpoch,
    assetRefHash: hashId("base_spend_permission_asset", { assetId: requestedPermission.assetId }),
    targetRefHash: hashId("base_spend_permission_target_policy", {
      targetPolicyId: requestedPermission.targetPolicyId
    }),
    tokenRefHash: requestedPermission.tokenRefHash,
    spenderRefHash: requestedPermission.spenderRefHash,
    allowanceMinor: requestedPermission.allowanceMinor,
    periodSeconds: requestedPermission.periodSeconds,
    validFrom: requestedPermission.validFrom,
    validUntil: requestedPermission.validUntil,
    ...canonicalBounds,
    saltHash: requestedPermission.saltHash,
    extraDataHash: requestedPermission.extraDataHash,
    exactSpendPermissionHash: hashId("base_exact_spend_permission", {
      providerRequestHash: input.providerRequest.requestHash,
      permissionProjectionHash: permissionProjection.permissionProjectionHash,
      requestedPermission
    }),
    decision,
    reasonCodes: reasons([reasonCode]),
    preparedAt: current.toISOString(),
    expiresAt: input.providerRequest.expiresAt,
    canonicalAuthorizationStillRequired: true,
    humanApprovalRequired: true,
    autoSpendPermissionAllowed: false,
    silentSpendAllowed: false,
    subAccountCreationAllowed: false,
    providerAdjustmentAllowed: false,
    walletSendCallsAllowed: false,
    ethSendTransactionAllowed: false,
    rawCalldataRetained: false,
    rawSignatureRetained: false,
    externalCallAllowed: false,
    activationAllowed: false,
    submissionAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: BASE_SPEND_PERMISSION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "baseSpendPermissionProjection");
  const projectionHash = hashId("base_spend_permission_projection", value);
  return immutable({
    baseSpendPermissionProjectionId: `base_spend_permission_${projectionHash.slice(2)}`,
    baseSpendPermissionProjectionHash: projectionHash,
    ...value
  });
}

export function verifyBaseSpendPermissionProjection(value, {
  now = new Date(), allowExpired = false
} = {}) {
  exact("Spend Permission projection", value, [
    "baseSpendPermissionProjectionId", "baseSpendPermissionProjectionHash", "descriptorHash",
    "capabilitiesHash", "capabilityObservationHash", "accountConfigurationHash", "providerRequestId",
    "providerRequestHash", "permissionProjectionHash", "grantHash", "chainId", "contextEpoch",
    "assetRefHash", "targetRefHash", "tokenRefHash", "spenderRefHash", "allowanceMinor", "periodSeconds",
    "validFrom", "validUntil", "canonicalLimitMinor", "canonicalValidFrom", "canonicalExpiresAt",
    "saltHash", "extraDataHash", "exactSpendPermissionHash", "decision",
    "reasonCodes", "preparedAt", "expiresAt", "canonicalAuthorizationStillRequired",
    "humanApprovalRequired", "autoSpendPermissionAllowed", "silentSpendAllowed",
    "subAccountCreationAllowed", "providerAdjustmentAllowed", "walletSendCallsAllowed",
    "ethSendTransactionAllowed", "rawCalldataRetained", "rawSignatureRetained", "externalCallAllowed",
    "activationAllowed", "submissionAllowed", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of [
    "baseSpendPermissionProjectionHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "accountConfigurationHash", "providerRequestHash",
    "permissionProjectionHash", "grantHash", "assetRefHash", "targetRefHash", "tokenRefHash",
    "spenderRefHash", "saltHash", "extraDataHash", "exactSpendPermissionHash"
  ]) hash(key, value[key]);
  id("providerRequestId", value.providerRequestId);
  minor("allowanceMinor", value.allowanceMinor);
  minor("canonicalLimitMinor", value.canonicalLimitMinor);
  const validFrom = timestamp("validFrom", value.validFrom);
  const validUntil = timestamp("validUntil", value.validUntil);
  const canonicalValidFrom = timestamp("canonicalValidFrom", value.canonicalValidFrom);
  const canonicalExpiresAt = timestamp("canonicalExpiresAt", value.canonicalExpiresAt);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const reasonCode = reasons(value.reasonCodes)[0];
  const expectedDecision = DECISION_BY_REASON.get(reasonCode);
  const emptyExtraDataHash = hashId("base_spend_permission_extra_data", { empty: true });
  const amountWidened = BigInt(value.allowanceMinor) > BigInt(value.canonicalLimitMinor);
  const timeWidened = value.periodSeconds !== PERIOD_SECONDS || validFrom < canonicalValidFrom ||
    validUntil > canonicalExpiresAt;
  const reasonPredicateValid =
    (reasonCode === "base_spend_permission_amount_widened" && amountWidened) ||
    (reasonCode === "base_spend_permission_time_widened" && timeWidened) ||
    (reasonCode === "base_spend_permission_extra_data_forbidden" &&
      value.extraDataHash !== emptyExtraDataHash) ||
    (reasonCode === "base_spend_permission_human_approval_required" && !amountWidened && !timeWidened &&
      value.extraDataHash === emptyExtraDataHash) ||
    !new Set([
      "base_spend_permission_amount_widened", "base_spend_permission_time_widened",
      "base_spend_permission_extra_data_forbidden", "base_spend_permission_human_approval_required"
    ]).has(reasonCode);
  const flagsValid = value.canonicalAuthorizationStillRequired === true && value.humanApprovalRequired === true &&
    value.autoSpendPermissionAllowed === false && value.silentSpendAllowed === false &&
    value.subAccountCreationAllowed === false && value.providerAdjustmentAllowed === false &&
    value.walletSendCallsAllowed === false && value.ethSendTransactionAllowed === false &&
    value.rawCalldataRetained === false && value.rawSignatureRetained === false &&
    value.externalCallAllowed === false && value.activationAllowed === false &&
    value.submissionAllowed === false && value.productionAuthority === false && value.fundsAuthority === false;
  if (value.baseSpendPermissionProjectionId !==
      `base_spend_permission_${value.baseSpendPermissionProjectionHash.slice(2)}` ||
      value.chainId !== BASE_SEPOLIA || !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      !Number.isSafeInteger(value.periodSeconds) || value.periodSeconds < 1 || validUntil <= validFrom ||
      canonicalExpiresAt <= canonicalValidFrom || expectedDecision !== value.decision || !reasonPredicateValid ||
      !flagsValid ||
      value.schemaVersion !== BASE_SPEND_PERMISSION_PROJECTION_SCHEMA_VERSION || expiresAt <= preparedAt ||
      (!allowExpired && (preparedAt > current || expiresAt <= current)) ||
      hashId("base_spend_permission_projection", projectionCore(value)) !==
        value.baseSpendPermissionProjectionHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_base_spend_permission_projection" :
      "invalid_base_spend_permission_projection", "Base Spend Permission projection is inconsistent");
  }
  return true;
}

export function createDisabledBaseAccountAgenticWalletProvider({
  chainId = BASE_SEPOLIA, contextEpoch = 0, now = new Date()
} = {}) {
  const current = trustedNow(now);
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: ADAPTER_ID,
    providerFamily: PROVIDER_FAMILY,
    adapterVersion: "1.0.0",
    enabled: false,
    externalCallsEnabled: false
  });
  const unknown = Object.fromEntries(BASE_ACCOUNT_CAPABILITIES.map((key) => [key, "unknown"]));
  const observation = createBaseAccountCapabilityObservation({
    descriptor,
    chainId,
    contextEpoch,
    accountSupport: unknown,
    accountConfigurationHash: hashId("base_account_local_fixture", { field: "account_configuration" }),
    observedAt: current.toISOString(),
    expiresAt: new Date(current.getTime() + MAX_LIFETIME_MS).toISOString()
  });
  const capabilities = normalizeBaseAccountAgenticWalletCapabilities({ descriptor, observation, now: current });
  const disabled = async () => invalid(
    "base_account_agentic_wallet_disabled_l0_local_no_funds", "Base Account external operation is disabled"
  );
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request,
        status: "unavailable",
        reasonCodes: ["base_account_external_probe_disabled"],
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

export function describeBaseAccountAgenticWalletBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: ADAPTER_ID,
    capabilitySource: "local_synthetic_fixture",
    walletRpcEnabled: false,
    spendPermissionActivationEnabled: false,
    autoSpendPermissionEnabled: false,
    subAccountCreationEnabled: false,
    silentSpendEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
