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

export const OKX_CAPABILITY_OBSERVATION_SCHEMA_VERSION =
  "okx_agentic_wallet_capability_observation.v1";
export const OKX_INVOCATION_PROJECTION_SCHEMA_VERSION =
  "okx_agentic_wallet_invocation_projection.v1";

export const OKX_INTEGRATION_SURFACES = Object.freeze([
  "skills", "mcp", "cli", "open_api"
]);
export const OKX_REVIEWED_TOOLS = Object.freeze([
  "security_tx_scan", "security_sig_scan", "wallet_history", "wallet_send"
]);

const ADAPTER_ID = "okx_agentic_wallet_reference";
const PROVIDER_FAMILY = "okx_onchain_os";
const CHAINS = new Set(["eip155:84532", "eip155:1952"]);
const STATUS = new Set(Object.values(AgenticWalletCapabilityStatus));
const BYTES32 = /^0x[0-9a-f]{64}$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

function invalid(code, message) {
  throw new DomainError(code, message);
}

function exact(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("invalid_okx_agentic_wallet_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("invalid_okx_agentic_wallet_input", `${name} has an invalid closed shape`);
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
    invalid("invalid_okx_agentic_wallet_input", "now must be a trusted Date");
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid("invalid_okx_agentic_wallet_input", `${name} must be a canonical timestamp`);
  }
  return parsed;
}

function hash(name, value) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    invalid("invalid_okx_agentic_wallet_input", `${name} must be lowercase bytes32`);
  }
}

function reasons(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8 ||
      values.some((value) => typeof value !== "string" || !REASON.test(value)) ||
      new Set(values).size !== values.length) {
    invalid("invalid_okx_agentic_wallet_input", "reasonCodes must be bounded and unique");
  }
  return [...values].sort();
}

function assertDescriptor(descriptor) {
  verifyAgenticWalletProviderDescriptor(descriptor);
  if (descriptor.adapterId !== ADAPTER_ID || descriptor.providerFamily !== PROVIDER_FAMILY) {
    invalid("okx_agentic_wallet_binding_mismatch", "descriptor is not the OKX reference adapter");
  }
}

function exactStatuses(name, value, keys) {
  exact(name, value, keys);
  const result = {};
  for (const key of keys) {
    if (!STATUS.has(value[key])) invalid("invalid_okx_capability_observation", `${key} status is unavailable`);
    result[key] = value[key];
  }
  return result;
}

function observationCore(value) {
  const core = structuredClone(value);
  delete core.observationHash;
  return core;
}

export function createOkxCapabilityObservation(input) {
  exact("capability observation input", input, [
    "descriptor", "chainId", "contextEpoch", "integrationSurfaceSupport", "toolSupport",
    "securityCapabilities", "observedAt", "expiresAt"
  ]);
  assertDescriptor(input.descriptor);
  if (!CHAINS.has(input.chainId) || !Number.isSafeInteger(input.contextEpoch) || input.contextEpoch < 0) {
    invalid("invalid_okx_capability_observation", "chain or context epoch is unavailable");
  }
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (expiresAt <= observedAt || expiresAt - observedAt > MAX_LIFETIME_MS) {
    invalid("invalid_okx_capability_observation", "observation lifetime is unavailable");
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    descriptorHash: input.descriptor.descriptorHash,
    chainId: input.chainId,
    contextEpoch: input.contextEpoch,
    integrationSurfaceSupport: exactStatuses(
      "integrationSurfaceSupport", input.integrationSurfaceSupport, OKX_INTEGRATION_SURFACES
    ),
    toolSupport: exactStatuses("toolSupport", input.toolSupport, OKX_REVIEWED_TOOLS),
    securityCapabilities: exactStatuses("securityCapabilities", input.securityCapabilities, [
      "teeKeyIsolation", "transactionSimulation", "riskScoring", "criticalBlocking", "identityVerification"
    ]),
    source: "local_synthetic_fixture",
    vendorClaimsAttested: false,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalCallPerformed: false,
    authorizationGranted: false,
    fundsAuthority: false,
    schemaVersion: OKX_CAPABILITY_OBSERVATION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "okxCapabilityObservation");
  return immutable({ observationHash: hashId("okx_capability_observation", value), ...value });
}

export function verifyOkxCapabilityObservation(value, {
  descriptor, now = new Date(), allowExpired = false
} = {}) {
  exact("capability observation", value, [
    "observationHash", "adapterId", "descriptorHash", "chainId", "contextEpoch",
    "integrationSurfaceSupport", "toolSupport", "securityCapabilities", "source", "vendorClaimsAttested",
    "observedAt", "expiresAt", "unknownIsNonPermissive", "externalCallPerformed",
    "authorizationGranted", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  hash("observationHash", value.observationHash);
  hash("descriptorHash", value.descriptorHash);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  exactStatuses("integrationSurfaceSupport", value.integrationSurfaceSupport, OKX_INTEGRATION_SURFACES);
  exactStatuses("toolSupport", value.toolSupport, OKX_REVIEWED_TOOLS);
  exactStatuses("securityCapabilities", value.securityCapabilities, [
    "teeKeyIsolation", "transactionSimulation", "riskScoring", "criticalBlocking", "identityVerification"
  ]);
  if (value.adapterId !== ADAPTER_ID || !CHAINS.has(value.chainId) ||
      !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      value.source !== "local_synthetic_fixture" || value.vendorClaimsAttested !== false ||
      value.unknownIsNonPermissive !== true || value.externalCallPerformed !== false ||
      value.authorizationGranted !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== OKX_CAPABILITY_OBSERVATION_SCHEMA_VERSION || expiresAt <= observedAt ||
      expiresAt - observedAt > MAX_LIFETIME_MS || (!allowExpired && (observedAt > current || expiresAt <= current)) ||
      hashId("okx_capability_observation", observationCore(value)) !== value.observationHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_okx_capability_observation" :
      "invalid_okx_capability_observation", "OKX capability observation is inconsistent or stale");
  }
  if (descriptor) {
    assertDescriptor(descriptor);
    if (descriptor.descriptorHash !== value.descriptorHash) {
      invalid("okx_agentic_wallet_capability_drift", "descriptor changed after capability observation");
    }
  }
  return true;
}

function combinedStatus(...statuses) {
  if (statuses.every((status) => status === "supported")) return "supported";
  if (statuses.some((status) => status === "unknown")) return "unknown";
  return "unsupported";
}

export function normalizeOkxAgenticWalletCapabilities({ descriptor, observation, now = new Date() }) {
  assertDescriptor(descriptor);
  verifyOkxCapabilityObservation(observation, { descriptor, now });
  const operationSupport = Object.fromEntries(
    AGENTIC_WALLET_PROVIDER_OPERATIONS.map((operation) => [operation, "unsupported"])
  );
  const surfaceStatuses = Object.values(observation.integrationSurfaceSupport);
  const surfaceStatus = surfaceStatuses.some((status) => status === "supported") ? "supported" :
    surfaceStatuses.some((status) => status === "unknown") ? "unknown" : "unsupported";
  operationSupport.walletDiscoverCapabilities = "supported";
  operationSupport.walletPrepareExecution = combinedStatus(
    surfaceStatus,
    observation.toolSupport.security_tx_scan,
    observation.securityCapabilities.transactionSimulation,
    observation.securityCapabilities.riskScoring
  );
  operationSupport.walletApproveExecution = combinedStatus(
    surfaceStatus, observation.toolSupport.security_sig_scan, observation.securityCapabilities.identityVerification
  );
  operationSupport.walletSubmitExecution = combinedStatus(surfaceStatus, observation.toolSupport.wallet_send);
  operationSupport.walletReadExecution = combinedStatus(surfaceStatus, observation.toolSupport.wallet_history);
  const surfaces = observation.integrationSurfaceSupport;
  const executionTransport = surfaces.mcp === "supported" ? "mcp" :
    surfaces.cli === "supported" ? "cli" : surfaces.open_api === "supported" ? "vendor_api" :
      surfaceStatus === "unsupported" ? "none" : "unknown";
  return createAgenticWalletProviderCapabilities({
    descriptor,
    chainId: observation.chainId,
    contextEpoch: observation.contextEpoch,
    operationSupport,
    permissionModel: surfaceStatus === "supported" ? "vendor_native" :
      surfaceStatus === "unsupported" ? "none" : "unknown",
    executionTransport,
    providerSimulation: observation.securityCapabilities.transactionSimulation,
    providerThreatScreening: observation.securityCapabilities.riskScoring,
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt
  });
}

function invocationCore(value) {
  const core = structuredClone(value);
  delete core.invocationProjectionId;
  delete core.invocationProjectionHash;
  return core;
}

export function prepareOkxAgenticWalletInvocation(input) {
  exact("invocation projection input", input, [
    "descriptor", "capabilities", "observation", "providerRequest", "integrationSurface", "toolId"
  ], ["now"]);
  const current = trustedNow(input.now ?? new Date());
  assertDescriptor(input.descriptor);
  verifyOkxCapabilityObservation(input.observation, { descriptor: input.descriptor, now: current });
  verifyAgenticWalletProviderCapabilities(input.capabilities, { descriptor: input.descriptor, now: current });
  const normalized = normalizeOkxAgenticWalletCapabilities({
    descriptor: input.descriptor, observation: input.observation, now: current
  });
  verifyAgenticWalletProviderRequest(input.providerRequest, { now: current });
  if (!OKX_INTEGRATION_SURFACES.includes(input.integrationSurface) || !OKX_REVIEWED_TOOLS.includes(input.toolId)) {
    invalid("okx_agentic_wallet_tool_denied", "integration surface or tool is not reviewed");
  }
  const expectedOperation = {
    security_tx_scan: "walletPrepareExecution",
    security_sig_scan: "walletApproveExecution",
    wallet_history: "walletReadExecution",
    wallet_send: "walletSubmitExecution"
  }[input.toolId];
  if (input.capabilities.capabilitiesHash !== normalized.capabilitiesHash ||
      input.providerRequest.adapterId !== ADAPTER_ID ||
      input.providerRequest.descriptorHash !== input.descriptor.descriptorHash ||
      input.providerRequest.capabilitiesHash !== input.capabilities.capabilitiesHash ||
      input.providerRequest.contextEpoch !== input.observation.contextEpoch ||
      input.providerRequest.operationId !== expectedOperation ||
      input.providerRequest.externalCallAllowed !== false ||
      (["walletPrepareExecution", "walletApproveExecution", "walletSubmitExecution"].includes(expectedOperation) &&
        input.providerRequest.payload.preparedExecution.payload.chainId !== input.observation.chainId) ||
      input.observation.integrationSurfaceSupport[input.integrationSurface] !== "supported" ||
      input.observation.toolSupport[input.toolId] !== "supported") {
    invalid("okx_agentic_wallet_binding_mismatch", "invocation does not match one current capability context");
  }
  const valueMoving = input.toolId === "wallet_send";
  const decision = valueMoving ? ExecutionDecision.DENY : ExecutionDecision.STEP_UP;
  const value = {
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities.capabilitiesHash,
    capabilityObservationHash: input.observation.observationHash,
    providerRequestId: input.providerRequest.requestId,
    providerRequestHash: input.providerRequest.requestHash,
    contextEpoch: input.observation.contextEpoch,
    chainId: input.observation.chainId,
    integrationSurface: input.integrationSurface,
    toolId: input.toolId,
    operationId: input.providerRequest.operationId,
    exactInputHash: hashId("okx_exact_provider_input", input.providerRequest.payload),
    toolContractHash: hashId("okx_tool_contract", {
      integrationSurface: input.integrationSurface,
      toolId: input.toolId,
      operationId: input.providerRequest.operationId,
      requestHash: input.providerRequest.requestHash
    }),
    decision,
    reasonCodes: reasons([valueMoving ? "value_moving_vendor_tool_forbidden" :
      "external_okx_integration_review_required"]),
    preparedAt: current.toISOString(),
    expiresAt: input.providerRequest.expiresAt,
    naturalLanguagePromptAllowed: false,
    genericMcpForwardingAllowed: false,
    shellCommandAllowed: false,
    rawArgumentsRetained: false,
    externalCallAllowed: false,
    executionAllowed: false,
    transactionsAllowed: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: OKX_INVOCATION_PROJECTION_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "okxAgenticWalletInvocationProjection");
  const invocationProjectionHash = hashId("okx_invocation_projection", value);
  return immutable({
    invocationProjectionId: `okx_invocation_projection_${invocationProjectionHash.slice(2)}`,
    invocationProjectionHash,
    ...value
  });
}

export function verifyOkxAgenticWalletInvocation(value, { now = new Date(), allowExpired = false } = {}) {
  exact("invocation projection", value, [
    "invocationProjectionId", "invocationProjectionHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "providerRequestId", "providerRequestHash", "contextEpoch", "chainId",
    "integrationSurface", "toolId", "operationId", "exactInputHash", "toolContractHash", "decision",
    "reasonCodes", "preparedAt", "expiresAt", "naturalLanguagePromptAllowed", "genericMcpForwardingAllowed",
    "shellCommandAllowed", "rawArgumentsRetained", "externalCallAllowed", "executionAllowed",
    "transactionsAllowed", "productionAuthority", "fundsAuthority", "schemaVersion"
  ]);
  const current = trustedNow(now);
  for (const key of ["invocationProjectionHash", "descriptorHash", "capabilitiesHash",
    "capabilityObservationHash", "providerRequestHash", "exactInputHash", "toolContractHash"]) hash(key, value[key]);
  const preparedAt = timestamp("preparedAt", value.preparedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  reasons(value.reasonCodes);
  const expectedOperation = {
    security_tx_scan: "walletPrepareExecution", security_sig_scan: "walletApproveExecution",
    wallet_history: "walletReadExecution", wallet_send: "walletSubmitExecution"
  }[value.toolId];
  const expectedDecision = value.toolId === "wallet_send" ? ExecutionDecision.DENY : ExecutionDecision.STEP_UP;
  const expectedReason = value.toolId === "wallet_send" ? "value_moving_vendor_tool_forbidden" :
    "external_okx_integration_review_required";
  if (value.invocationProjectionId !== `okx_invocation_projection_${value.invocationProjectionHash.slice(2)}` ||
      !CHAINS.has(value.chainId) || !OKX_INTEGRATION_SURFACES.includes(value.integrationSurface) ||
      !OKX_REVIEWED_TOOLS.includes(value.toolId) || value.operationId !== expectedOperation ||
      value.decision !== expectedDecision || value.reasonCodes.length !== 1 || value.reasonCodes[0] !== expectedReason ||
      !Number.isSafeInteger(value.contextEpoch) || value.contextEpoch < 0 ||
      value.naturalLanguagePromptAllowed !== false || value.genericMcpForwardingAllowed !== false ||
      value.shellCommandAllowed !== false || value.rawArgumentsRetained !== false ||
      value.externalCallAllowed !== false || value.executionAllowed !== false || value.transactionsAllowed !== false ||
      value.productionAuthority !== false || value.fundsAuthority !== false ||
      value.schemaVersion !== OKX_INVOCATION_PROJECTION_SCHEMA_VERSION || expiresAt <= preparedAt ||
      (!allowExpired && (preparedAt > current || expiresAt <= current)) ||
      hashId("okx_invocation_projection", invocationCore(value)) !== value.invocationProjectionHash) {
    invalid(!allowExpired && expiresAt <= current ? "stale_okx_invocation_projection" :
      "invalid_okx_invocation_projection", "OKX invocation projection is inconsistent or stale");
  }
  return true;
}

export function createDisabledOkxAgenticWalletProvider({
  chainId = "eip155:84532", contextEpoch = 0, now = new Date()
} = {}) {
  const current = trustedNow(now);
  const descriptor = createAgenticWalletProviderDescriptor({
    adapterId: ADAPTER_ID, providerFamily: PROVIDER_FAMILY, adapterVersion: "1.0.0",
    enabled: false, externalCallsEnabled: false
  });
  const unknownSurfaces = Object.fromEntries(OKX_INTEGRATION_SURFACES.map((key) => [key, "unknown"]));
  const unknownTools = Object.fromEntries(OKX_REVIEWED_TOOLS.map((key) => [key, "unknown"]));
  const observation = createOkxCapabilityObservation({
    descriptor, chainId, contextEpoch, integrationSurfaceSupport: unknownSurfaces, toolSupport: unknownTools,
    securityCapabilities: {
      teeKeyIsolation: "unknown", transactionSimulation: "unknown", riskScoring: "unknown",
      criticalBlocking: "unknown", identityVerification: "unknown"
    },
    observedAt: current.toISOString(), expiresAt: new Date(current.getTime() + MAX_LIFETIME_MS).toISOString()
  });
  const capabilities = normalizeOkxAgenticWalletCapabilities({ descriptor, observation, now: current });
  const disabled = async () => invalid("okx_agentic_wallet_disabled_l0_local_no_funds",
    "OKX external operation is disabled");
  return Object.freeze({
    descriptor,
    async discoverCapabilities(request) {
      return createAgenticWalletProviderResult({
        request, status: "unavailable", reasonCodes: ["okx_external_probe_disabled"],
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

export function describeOkxAgenticWalletBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    adapterId: ADAPTER_ID,
    capabilitySource: "local_synthetic_fixture",
    skillsEnabled: false,
    mcpEnabled: false,
    cliEnabled: false,
    openApiEnabled: false,
    teeAttestationVerified: false,
    signingEnabled: false,
    transactionSubmissionEnabled: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
