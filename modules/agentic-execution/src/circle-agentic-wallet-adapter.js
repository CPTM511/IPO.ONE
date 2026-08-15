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

export const CIRCLE_CAPABILITY_OBSERVATION_SCHEMA_VERSION =
  "circle_managed_wallet_capability_observation.v1";
export const CIRCLE_MANAGED_EXECUTION_PROJECTION_SCHEMA_VERSION =
  "circle_managed_execution_projection.v1";

export const CIRCLE_MANAGED_CAPABILITIES = Object.freeze([
  "developerControlledWallet", "mpcKeyManagement", "signingApi", "managedBroadcast",
  "transactionStatus", "credentialIsolation"
]);

const ADAPTER_ID = "circle_managed_agent_wallet_reference";
const PROVIDER_FAMILY = "circle_developer_controlled_wallets";
const CHAINS = new Set(["eip155:84532", "eip155:1952"]);
const STATUSES = new Set(Object.values(AgenticWalletCapabilityStatus));
const BYTES32 = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_circle_agentic_wallet_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_circle_agentic_wallet_input", `${name} has an invalid closed shape`);
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
    invalid("invalid_circle_agentic_wallet_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_circle_agentic_wallet_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_circle_agentic_wallet_input", `${name} must be lowercase bytes32`);
  }
}

function id(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid("invalid_circle_agentic_wallet_input", `${name} must be a bounded identifier`);
  }
}

function reasons(values) {
  if (!Array.isArray(values) || values.length !== 1 ||
      values.some((value) => typeof value !== "string" || !REASON.test(value))) {
    invalid("invalid_circle_agentic_wallet_input", "reasonCodes must contain one reason");
  }
  return [...values];
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID || descriptor.providerFamily !== PROVIDER_FAMILY) {
    invalid("circle_agentic_wallet_binding_mismatch", "descriptor is not the Circle reference adapter");
  }
}

function normalizeSupport(value) {
  exact("managedSupport", value, CIRCLE_MANAGED_CAPABILITIES);
  return Object.fromEntries(CIRCLE_MANAGED_CAPABILITIES.map((key) => {
    if (!STATUSES.has(value[key])) {
      invalid("invalid_circle_capability_observation", `${key} capability status is unavailable`);
    }
    return [key, value[key]];
  }));
}

function observationCore(value) {
  const core = structuredClone(value);
  delete core.observationHash;
  return core;
}

export function createCircleCapabilityObservation(input) {
  exact("capability observation input", input, [
    "descriptor", "chainId", "contextEpoch", "accountType", "managedSupport",
    "custodyConfigurationHash", "observedAt", "expiresAt"
  ]);
  assertDescriptor(input.descriptor);
  if (!CHAINS.has(input.chainId) || !Number.isSafeInteger(input.contextEpoch) || input.contextEpoch < 0 ||
      !new Set(["eoa", "sca", "unknown"]).has(input.accountType)) {
    invalid("invalid_circle_capability_observation", "chain, context epoch or account type is unavailable");
  }
  hash("custodyConfigurationHash", input.custodyConfigurationHash);
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_circle_capability_observation", "observation lifetime is unavailable");
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    descriptorHash: input.descriptor.descriptorHash,
    chainId: input.chainId,
    contextEpoch: input.contextEpoch,
    accountType: input.accountType,
    controlModel: "developer_controlled",
    keyModel: "mpc",
    managedSupport: normalizeSupport(input.managedSupport),
    custodyConfigurationHash: input.custodyConfigurationHash,
    source: "local_synthetic_fixture",
    vendorNetworkSupportAttested: false,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalCallPerformed: false,
    authorizationGranted: false,
    custodyActivated: false,
    fundsAuthority: false,
    schemaVersion: CIRCLE_CAPABILITY_OBSERVATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "circleCapabilityObservation");
  return immutable({ observationHash: hashId("circle_capability_observation", value), ...value });
}

export function verifyCircleCapabilityObservation(value, {
  descriptor, now = new Date(), allowExpired = false
} = {}) {
  exact("capability observation", value, [
    "observationHash", "adapterId", "descriptorHash", "chainId", "contextEpoch", "accountType",
    "controlModel", "keyModel", "managedSupport", "custodyConfigurationHash", "source",
    "vendorNetworkSupportAttested", "observedAt", "expiresAt", "unknownIsNonPermissive",
    "externalCallPerformed", "authorizationGranted", "custodyActivated", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  hash("observationHash", value.observationHash);
  hash("descriptorHash", value.descriptorHash);
  hash("custodyConfigurationHash", value.custodyConfigurationHash);
  normalizeSupport(value.managedSupport);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const valid = value.adapterId === ADAPTER_ID && CHAINS.has(value.chainId) &&
    Number.isSafeInteger(value.contextEpoch) && value.contextEpoch >= 0 &&
    new Set(["eoa", "sca", "unknown"]).has(value.accountType) &&
    value.controlModel === "developer_controlled" && value.keyModel === "mpc" &&
    value.source === "local_synthetic_fixture" && value.vendorNetworkSupportAttested === false &&
    value.unknownIsNonPermissive === true && value.externalCallPerformed === false &&
    value.authorizationGranted === false && value.custodyActivated === false && value.fundsAuthority === false &&
    value.schemaVersion === CIRCLE_CAPABILITY_OBSERVATION_SCHEMA_VERSION && expiresAt > observedAt &&
    expiresAt - observedAt <= MAX_LIFETIME_MS && (allowExpired || (observedAt <= current && expiresAt > current)) &&
    hashId("circle_capability_observation", observationCore(value)) === value.observationHash;
  if (!valid) {
    invalid(!allowExpired && expiresAt <= current ? "stale_circle_capability_observation" :
      "invalid_circle_capability_observation", "Circle capability observation is inconsistent or stale");
  }
  if (descriptor) {
    assertDescriptor(descriptor);
    if (descriptor.descriptorHash !== value.descriptorHash) {
      invalid("circle_agentic_wallet_capability_drift", "descriptor changed after capability observation");
    }
  }
  return true;
}

function combinedStatus(...statuses) {
  if (statuses.every((status) => status === "supported")) return "supported";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "unsupported";
}

export function normalizeCircleAgenticWalletCapabilities({ descriptor, observation, now = new Date() }) {
  assertDescriptor(descriptor);
  verifyCircleCapabilityObservation(observation, { descriptor, now });
  const operationSupport = Object.fromEntries(
    AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operation) => [operation, "unsupported"])
  );
  operationSupport.walletDiscoverCapabilities = "supported";
  operationSupport.walletPrepareExecution = combinedStatus(
    observation.managedSupport.developerControlledWallet,
    observation.managedSupport.mpcKeyManagement,
    observation.managedSupport.signingApi,
    observation.managedSupport.credentialIsolation
  );
  operationSupport.walletApproveExecution = observation.managedSupport.credentialIsolation;
  operationSupport.walletSubmitExecution = observation.managedSupport.managedBroadcast;
  operationSupport.walletReadExecution = observation.managedSupport.transactionStatus;
  const nativeStatus = observation.managedSupport.developerControlledWallet;
  return createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: observation.chainId,
    contextEpoch: observation.contextEpoch,
    operationSupport,
    permissionModel: nativeStatus === "supported" ? "vendor_native" :
      nativeStatus === "unsupported" ? "none" : "unknown",
    executionTransport: nativeStatus === "supported" ? "vendor_api" :
      nativeStatus === "unsupported" ? "none" : "unknown",
    providerSimulation: "unsupported",
    providerThreatScreening: "unsupported",
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt
  });
}

function projectionCore(value) {
  const core = structuredClone(value);
  delete core.circleManagedExecutionProjectionId;
  delete core.circleManagedExecutionProjectionHash;
  return core;
}

const DECISION_BY_REASON = new Map([
  ["canonical_preflight_not_permissive", ExecutionDecision.DENY],
  ["circle_required_capability_unsupported", ExecutionDecision.DENY],
  ["circle_required_capability_unknown", ExecutionDecision.QUARANTINE],
  ["circle_managed_custody_review_required", ExecutionDecision.STEP_UP]
]);

function projectionDecision(observation, providerRequest) {
  if (![ExecutionDecision.ALLOW, ExecutionDecision.STEP_UP].includes(
    providerRequest.payload.preflightReceipt.decision
  )) return [ExecutionDecision.DENY, "canonical_preflight_not_permissive"];
  const required = [
    observation.managedSupport.developerControlledWallet,
    observation.managedSupport.mpcKeyManagement,
    observation.managedSupport.signingApi,
    observation.managedSupport.credentialIsolation
  ];
  if (required.some((status) => status === "unsupported")) {
    return [ExecutionDecision.DENY, "circle_required_capability_unsupported"];
  }
  if (required.some((status) => status === "unknown")) {
    return [ExecutionDecision.QUARANTINE, "circle_required_capability_unknown"];
  }
  return [ExecutionDecision.STEP_UP, "circle_managed_custody_review_required"];
}

export function prepareCircleManagedExecutionProjection(input) {
  exact("managed execution projection input", input, [
    "descriptor", "capabilities", "observation", "providerRequest"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifyCircleCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalized = normalizeCircleAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyAgenticWalletProviderRequest(input.providerRequest, { now: current });
  if (input.capabilities.capabilitiesHash !== normalized.capabilitiesHash ||
      input.providerRequest.adapterId !== ADAPTER_ID ||
      input.providerRequest.descriptorHash !== input.descriptor.descriptorHash ||
      input.providerRequest.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.providerRequest.contextEpoch !== input.observation.contextEpoch ||
      input.providerRequest.operationId !== "walletPrepareExecution" ||
      input.providerRequest.externalCallAllowed !== false ||
      input.providerRequest.payload.preparedExecution.payload.chainId !== input.observation.chainId ||
      input.providerRequest.payload.preflightReceipt.preparedExecutionHash !==
        input.providerRequest.payload.preparedExecution.preparedExecutionHash) {
    invalid("circle_agentic_wallet_binding_mismatch", "projection does not match one current Circle context");
  }
  const [decision, reasonCode] = projectionDecision(input.observation, input.providerRequest);
  const requiredCapabilityStatus = combinedStatus(
    input.observation.managedSupport.developerControlledWallet,
    input.observation.managedSupport.mpcKeyManagement,
    input.observation.managedSupport.signingApi,
    input.observation.managedSupport.credentialIsolation
  );
  const value = {
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    custodyConfigurationHash: input.observation.custodyConfigurationHash,
    providerRequestId: input.providerRequest.requestId,
    providerRequestHash: input.providerRequest.requestHash,
    preparedExecutionHash: input.providerRequest.payload.preparedExecution.preparedExecutionHash,
    preflightHash: input.providerRequest.payload.preflightReceipt.preflightHash,
    chainId: input.observation.chainId,
    contextEpoch: input.observation.contextEpoch,
    accountType: input.observation.accountType,
    canonicalPreflightDecision: input.providerRequest.payload.preflightReceipt.decision,
    requiredCapabilityStatus,
    exactManagedExecutionHash: hashId("circle_exact_managed_execution", {
      providerRequestHash: input.providerRequest.requestHash,
      custodyConfigurationHash: input.observation.custodyConfigurationHash,
      preparedExecutionHash: input.providerRequest.payload.preparedExecution.preparedExecutionHash,
      preflightHash: input.providerRequest.payload.preflightReceipt.preflightHash
    }),
    decision,
    reasonCodes: reasons([reasonCode]),
    preparedAt: current.toISOString(),
    expiresAt: input.providerRequest.expiresAt,
    canonicalPreflightStillRequired: true,
    managedCustodyReviewRequired: true,
    credentialMaterialAccepted: false,
    credentialCiphertextAccepted: false,
    rawSignatureRetained: false,
    rawProviderResponseRetained: false,
    providerAdjustmentAllowed: false,
    externalCallAllowed: false,
    submissionAllowed: false,
    custodyActivated: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: CIRCLE_MANAGED_EXECUTION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "circleManagedExecutionProjection");
  const projectionHash = hashId("circle_managed_execution_projection", value);
  return immutable({
    circleManagedExecutionProjectionId: `circle_managed_execution_${projectionHash.slice(2)}`,
    circleManagedExecutionProjectionHash: projectionHash,
    ...value
  });
}

export function verifyCircleManagedExecutionProjection(value, {
  now = new Date(), allowExpired = false
} = {}) {
  exact("managed execution projection", value, [
    "circleManagedExecutionProjectionId", "circleManagedExecutionProjectionHash", "descriptorHash",
    "capabilitiesHash", "capabilityObservationHash", "custodyConfigurationHash", "providerRequestId",
    "providerRequestHash", "preparedExecutionHash", "preflightHash", "chainId", "contextEpoch",
    "accountType", "canonicalPreflightDecision", "requiredCapabilityStatus", "exactManagedExecutionHash",
    "decision", "reasonCodes", "preparedAt", "expiresAt",
    "canonicalPreflightStillRequired", "managedCustodyReviewRequired", "credentialMaterialAccepted",
    "credentialCiphertextAccepted", "rawSignatureRetained", "rawProviderResponseRetained",
    "providerAdjustmentAllowed", "externalCallAllowed", "submissionAllowed", "custodyActivated",
    "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of [
    "circleManagedExecutionProjectionHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "custodyConfigurationHash", "providerRequestHash",
    "preparedExecutionHash", "preflightHash", "exactManagedExecutionHash"
  ]) hash(key, value[key]);
  id("providerRequestId", value.providerRequestId);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  const normalizedReasons = reasons(value.reasonCodes);
  const reasonCode = normalizedReasons[0];
  const expectedDecision = DECISION_BY_REASON.get(reasonCode);
  const preflightPermissive = [ExecutionDecision.ALLOW, ExecutionDecision.STEP_UP]
    .includes(value.canonicalPreflightDecision);
  const reasonPredicateValid =
    (reasonCode === "canonical_preflight_not_permissive" && !preflightPermissive) ||
    (reasonCode === "circle_required_capability_unsupported" &&
      value.requiredCapabilityStatus === "unsupported") ||
    (reasonCode === "circle_required_capability_unknown" && value.requiredCapabilityStatus === "unknown") ||
    (reasonCode === "circle_managed_custody_review_required" && preflightPermissive &&
      value.requiredCapabilityStatus === "supported");
  const flagsValid = value.canonicalPreflightStillRequired === true &&
    value.managedCustodyReviewRequired === true && value.credentialMaterialAccepted === false &&
    value.credentialCiphertextAccepted === false && value.rawSignatureRetained === false &&
    value.rawProviderResponseRetained === false && value.providerAdjustmentAllowed === false &&
    value.externalCallAllowed === false && value.submissionAllowed === false && value.custodyActivated === false &&
    value.productionAuthority === false && value.fundsAuthority === false;
  if (value.circleManagedExecutionProjectionId !==
      `circle_managed_execution_${value.circleManagedExecutionProjectionHash.slice(2)}` ||
      !CHAINS.has(value.chainId) || !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      !new Set(["eoa", "sca", "unknown"]).has(value.accountType) ||
      !new Set(Object.values(ExecutionDecision)).has(value.canonicalPreflightDecision) ||
      !STATUSES.has(value.requiredCapabilityStatus) || expectedDecision !== value.decision ||
      !reasonPredicateValid || !flagsValid ||
      value.schemaVersion !== CIRCLE_MANAGED_EXECUTION_PROJECTION_SCHEMA_VERSION ||
      expiresAt <= preparedAt || (!allowExpired && (preparedAt > current || expiresAt <= current)) ||
      hashId("circle_managed_execution_projection", projectionCore(value)) !==
        value.circleManagedExecutionProjectionHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_circle_managed_execution_projection" :
      "invalid_circle_managed_execution_projection", "Circle managed execution projection is inconsistent");
  }
  return true;
}

export function createDisabledCircleAgenticWalletProvider({
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
  const unknown = Object.fromEntries(CIRCLE_MANAGED_CAPABILITIES.map((key) => [key, "unknown"]));
  const observation = createCircleCapabilityObservation({
    descriptor,
    chainId,
    contextEpoch,
    accountType: "unknown",
    managedSupport: unknown,
    custodyConfigurationHash: hashId("circle_local_fixture", { field: "custody_configuration" }),
    observedAt: current.toISOString(),
    expiresAt: new Date(current.getTime() + MAX_LIFETIME_MS).toISOString()
  });
  const capabilities = normalizeCircleAgenticWalletCapabilities({ descriptor, observation, now: current });
  const disabled = async () => invalid(
    "circle_agentic_wallet_disabled_l0_local_no_funds", "Circle external operation is disabled"
  );
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request,
        status: "unavailable",
        reasonCodes: ["circle_external_probe_disabled"],
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

export function describeCircleAgenticWalletBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: ADAPTER_ID,
    capabilitySource: "local_synthetic_fixture",
    managedWalletApiEnabled: false,
    credentialMaterialAccepted: false,
    mpcSigningEnabled: false,
    custodyActivated: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
