import {
  DomainError,
  assertNoRawPiiReference,
  hashId
} from "../../../packages/domain/src/index.js";

export const VENUE_EXECUTION_PROVIDER_DESCRIPTOR_SCHEMA_VERSION =
  "venue_execution_provider_descriptor.v1";
export const VENUE_EXECUTION_PROVIDER_CAPABILITIES_SCHEMA_VERSION =
  "venue_execution_provider_capabilities.v1";
export const VENUE_EXECUTION_PROVIDER_REQUEST_SCHEMA_VERSION =
  "venue_execution_provider_request.v1";
export const VENUE_EXECUTION_PROVIDER_RESULT_SCHEMA_VERSION =
  "venue_execution_provider_result.v1";

export const VENUE_EXECUTION_PROVIDER_OPERATIONS = Object.freeze([
  "venueDiscoverCapabilities",
  "venueReadBinding",
  "venuePrepareDelegate",
  "venueActivateDelegate",
  "venueRevokeDelegate",
  "venuePrepareExecution",
  "venueSubmitExecution",
  "venueReadExecution"
]);

export const VENUE_EXECUTION_PROVIDER_METHOD_BY_OPERATION = Object.freeze({
  venueDiscoverCapabilities: "discoverCapabilities",
  venueReadBinding: "readBinding",
  venuePrepareDelegate: "prepareDelegate",
  venueActivateDelegate: "activateDelegate",
  venueRevokeDelegate: "revokeDelegate",
  venuePrepareExecution: "prepareExecution",
  venueSubmitExecution: "submitExecution",
  venueReadExecution: "readExecution"
});

export const VenueCapabilityStatus = Object.freeze({
  SUPPORTED: "supported",
  UNSUPPORTED: "unsupported",
  UNKNOWN: "unknown"
});

export const VenueProviderResultStatus = Object.freeze({
  SUCCEEDED: "succeeded",
  REJECTED: "rejected",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown"
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REASON = /^[a-z][a-z0-9_]{1,95}$/;
const CAPABILITY_STATUSES = new Set(Object.values(VenueCapabilityStatus));
const RESULT_STATUSES = new Set(Object.values(VenueProviderResultStatus));
const MAX_CAPABILITY_LIFETIME_MS = 5 * 60 * 1000;
const MAX_REQUEST_LIFETIME_MS = 2 * 60 * 1000;

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function exactShape(name, value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_venue_execution_provider_input", `${name} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    fail(
      "invalid_venue_execution_provider_input",
      `${name} has an invalid closed shape`
    );
  }
}

function freeze(value) {
  if (Array.isArray(value)) for (const item of value) freeze(item);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
  }
  return Object.freeze(value);
}

function cloneFreeze(value) {
  return freeze(structuredClone(value));
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail(
      "invalid_venue_execution_provider_input",
      `${name} must be a bounded identifier`
    );
  }
  return value;
}

function bytes32(name, value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(
      "invalid_venue_execution_provider_input",
      `${name} must be lowercase bytes32`
    );
  }
  return value;
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_venue_execution_provider_input", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function timestamp(name, value) {
  if (typeof value !== "string") {
    fail(
      "invalid_venue_execution_provider_input",
      `${name} must be a canonical ISO timestamp`
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(
      "invalid_venue_execution_provider_input",
      `${name} must be a canonical ISO timestamp`
    );
  }
  return parsed;
}

function operationSupport(value) {
  exactShape("operationSupport", value, VENUE_EXECUTION_PROVIDER_OPERATIONS);
  const normalized = {};
  for (const operationId of VENUE_EXECUTION_PROVIDER_OPERATIONS) {
    if (!CAPABILITY_STATUSES.has(value[operationId])) {
      fail(
        "invalid_venue_execution_provider_capabilities",
        `unsupported status for ${operationId}`
      );
    }
    normalized[operationId] = value[operationId];
  }
  return normalized;
}

function descriptorCore(value) {
  return {
    adapterId: value.adapterId,
    venueId: value.venueId,
    adapterVersion: value.adapterVersion,
    supportedOperations: value.supportedOperations,
    enabled: value.enabled,
    externalCallsEnabled: value.externalCallsEnabled,
    dynamicLoadingEnabled: value.dynamicLoadingEnabled,
    sandboxOnly: value.sandboxOnly,
    testnetOnly: value.testnetOnly,
    mainnetAuthority: value.mainnetAuthority,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function createVenueExecutionProviderDescriptor(input) {
  exactShape("venue provider descriptor input", input, [
    "adapterId",
    "venueId",
    "adapterVersion",
    "enabled",
    "externalCallsEnabled"
  ]);
  identifier("adapterId", input.adapterId);
  identifier("venueId", input.venueId);
  if (!SEMVER.test(input.adapterVersion ?? "")) {
    fail(
      "invalid_venue_execution_provider_descriptor",
      "adapterVersion must be exact semver"
    );
  }
  if (
    typeof input.enabled !== "boolean" ||
    typeof input.externalCallsEnabled !== "boolean" ||
    (input.externalCallsEnabled && !input.enabled)
  ) {
    fail(
      "invalid_venue_execution_provider_descriptor",
      "provider enablement is inconsistent"
    );
  }
  const value = {
    adapterId: input.adapterId,
    venueId: input.venueId,
    adapterVersion: input.adapterVersion,
    supportedOperations: [...VENUE_EXECUTION_PROVIDER_OPERATIONS],
    enabled: input.enabled,
    externalCallsEnabled: input.externalCallsEnabled,
    dynamicLoadingEnabled: false,
    sandboxOnly: true,
    testnetOnly: true,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: VENUE_EXECUTION_PROVIDER_DESCRIPTOR_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "venueExecutionProviderDescriptor");
  return cloneFreeze({
    descriptorHash: hashId("venue_execution_provider_descriptor", value),
    ...value
  });
}

export function verifyVenueExecutionProviderDescriptor(value) {
  exactShape("venue provider descriptor", value, [
    "descriptorHash",
    "adapterId",
    "venueId",
    "adapterVersion",
    "supportedOperations",
    "enabled",
    "externalCallsEnabled",
    "dynamicLoadingEnabled",
    "sandboxOnly",
    "testnetOnly",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  bytes32("descriptorHash", value.descriptorHash);
  identifier("adapterId", value.adapterId);
  identifier("venueId", value.venueId);
  const operations = [...value.supportedOperations].sort();
  if (
    value.schemaVersion !== VENUE_EXECUTION_PROVIDER_DESCRIPTOR_SCHEMA_VERSION ||
    !SEMVER.test(value.adapterVersion ?? "") ||
    operations.length !== VENUE_EXECUTION_PROVIDER_OPERATIONS.length ||
    new Set(operations).size !== operations.length ||
    JSON.stringify(operations) !==
      JSON.stringify([...VENUE_EXECUTION_PROVIDER_OPERATIONS].sort()) ||
    typeof value.enabled !== "boolean" ||
    typeof value.externalCallsEnabled !== "boolean" ||
    (value.externalCallsEnabled && !value.enabled) ||
    value.dynamicLoadingEnabled !== false ||
    value.sandboxOnly !== true ||
    value.testnetOnly !== true ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    hashId("venue_execution_provider_descriptor", descriptorCore(value)) !==
      value.descriptorHash
  ) {
    fail(
      "invalid_venue_execution_provider_descriptor",
      "provider descriptor is inconsistent"
    );
  }
  return true;
}

function capabilitiesCore(value) {
  return {
    adapterId: value.adapterId,
    venueId: value.venueId,
    descriptorHash: value.descriptorHash,
    environment: value.environment,
    contextEpoch: value.contextEpoch,
    operationSupport: value.operationSupport,
    signingSchemes: value.signingSchemes,
    actionClasses: value.actionClasses,
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    unknownIsNonPermissive: value.unknownIsNonPermissive,
    externalSubmissionAllowed: value.externalSubmissionAllowed,
    withdrawalAllowed: value.withdrawalAllowed,
    transferAllowed: value.transferAllowed,
    mainnetAuthority: value.mainnetAuthority,
    productionAuthority: value.productionAuthority,
    fundsAuthority: value.fundsAuthority,
    schemaVersion: value.schemaVersion
  };
}

export function createVenueExecutionProviderCapabilities(input) {
  exactShape("venue provider capabilities input", input, [
    "descriptor",
    "environment",
    "contextEpoch",
    "operationSupport",
    "signingSchemes",
    "actionClasses",
    "observedAt",
    "expiresAt"
  ]);
  verifyVenueExecutionProviderDescriptor(input.descriptor);
  if (
    input.environment !== "hyperliquid_testnet" ||
    !Number.isSafeInteger(input.contextEpoch) ||
    input.contextEpoch < 0
  ) {
    fail(
      "invalid_venue_execution_provider_capabilities",
      "environment or context epoch is unavailable"
    );
  }
  const observedAt = timestamp("observedAt", input.observedAt);
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (
    expiresAt <= observedAt ||
    expiresAt.getTime() - observedAt.getTime() > MAX_CAPABILITY_LIFETIME_MS
  ) {
    fail(
      "invalid_venue_execution_provider_capabilities",
      "capability lifetime is unavailable"
    );
  }
  if (!Array.isArray(input.signingSchemes) || !Array.isArray(input.actionClasses)) {
    fail(
      "invalid_venue_execution_provider_capabilities",
      "signing schemes and action classes must be arrays"
    );
  }
  const signingSchemes = [...input.signingSchemes].sort();
  const actionClasses = [...input.actionClasses].sort();
  if (
    signingSchemes.length !== 2 ||
    new Set(signingSchemes).size !== 2 ||
    JSON.stringify(signingSchemes) !==
      JSON.stringify(["l1_action", "user_signed_action"]) ||
    actionClasses.length !== 5 ||
    new Set(actionClasses).size !== 5 ||
    JSON.stringify(actionClasses) !==
      JSON.stringify(
        ["cancel", "cancelByCloid", "modify", "order", "reduceOnlyOrder"].sort()
      )
  ) {
    fail(
      "invalid_venue_execution_provider_capabilities",
      "signing schemes or action allowlist drifted"
    );
  }
  const value = {
    adapterId: input.descriptor.adapterId,
    venueId: input.descriptor.venueId,
    descriptorHash: input.descriptor.descriptorHash,
    environment: input.environment,
    contextEpoch: input.contextEpoch,
    operationSupport: operationSupport(input.operationSupport),
    signingSchemes,
    actionClasses,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    unknownIsNonPermissive: true,
    externalSubmissionAllowed: false,
    withdrawalAllowed: false,
    transferAllowed: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: VENUE_EXECUTION_PROVIDER_CAPABILITIES_SCHEMA_VERSION
  };
  return cloneFreeze({
    capabilitiesHash: hashId("venue_execution_provider_capabilities", value),
    ...value
  });
}

export function verifyVenueExecutionProviderCapabilities(
  value,
  { descriptor, now = new Date(), allowExpired = false } = {}
) {
  exactShape("venue provider capabilities", value, [
    "capabilitiesHash",
    "adapterId",
    "venueId",
    "descriptorHash",
    "environment",
    "contextEpoch",
    "operationSupport",
    "signingSchemes",
    "actionClasses",
    "observedAt",
    "expiresAt",
    "unknownIsNonPermissive",
    "externalSubmissionAllowed",
    "withdrawalAllowed",
    "transferAllowed",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  const current = trustedDate("now", now);
  const observedAt = timestamp("observedAt", value.observedAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  bytes32("capabilitiesHash", value.capabilitiesHash);
  bytes32("descriptorHash", value.descriptorHash);
  operationSupport(value.operationSupport);
  if (!Array.isArray(value.signingSchemes) || !Array.isArray(value.actionClasses)) {
    fail(
      "invalid_venue_execution_provider_capabilities",
      "signing schemes and action classes must be arrays"
    );
  }
  if (
    value.schemaVersion !== VENUE_EXECUTION_PROVIDER_CAPABILITIES_SCHEMA_VERSION ||
    value.environment !== "hyperliquid_testnet" ||
    !Number.isSafeInteger(value.contextEpoch) ||
    value.contextEpoch < 0 ||
    JSON.stringify([...value.signingSchemes].sort()) !==
      JSON.stringify(["l1_action", "user_signed_action"]) ||
    JSON.stringify([...value.actionClasses].sort()) !==
      JSON.stringify(
        ["cancel", "cancelByCloid", "modify", "order", "reduceOnlyOrder"].sort()
      ) ||
    value.unknownIsNonPermissive !== true ||
    value.externalSubmissionAllowed !== false ||
    value.withdrawalAllowed !== false ||
    value.transferAllowed !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    expiresAt <= observedAt ||
    expiresAt.getTime() - observedAt.getTime() > MAX_CAPABILITY_LIFETIME_MS ||
    (!allowExpired && expiresAt <= current) ||
    hashId("venue_execution_provider_capabilities", capabilitiesCore(value)) !==
      value.capabilitiesHash
  ) {
    fail(
      !allowExpired && expiresAt <= current
        ? "stale_venue_execution_capabilities"
        : "invalid_venue_execution_provider_capabilities",
      "provider capabilities are inconsistent or stale"
    );
  }
  if (descriptor) {
    verifyVenueExecutionProviderDescriptor(descriptor);
    if (
      value.adapterId !== descriptor.adapterId ||
      value.venueId !== descriptor.venueId ||
      value.descriptorHash !== descriptor.descriptorHash
    ) {
      fail(
        "venue_execution_provider_descriptor_drift",
        "capabilities are bound to another provider"
      );
    }
  }
  return true;
}

function normalizePayload(operationId, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_venue_execution_provider_request", "payload must be an object");
  }
  const requiredByOperation = {
    venueDiscoverCapabilities: ["environment", "contextEpoch"],
    venueReadBinding: ["facilityId", "accountBindingHash"],
    venuePrepareDelegate: ["facilityId", "accountBindingHash", "delegateAddressHash"],
    venueActivateDelegate: ["delegateId", "delegateHash"],
    venueRevokeDelegate: ["delegateId", "delegateHash", "reasonCode"],
    venuePrepareExecution: ["facilityId", "orderIntentId", "orderIntentHash"],
    venueSubmitExecution: ["executionId", "preparedExecutionHash"],
    venueReadExecution: ["executionId", "executionHash"]
  }[operationId];
  if (!requiredByOperation) {
    fail("invalid_venue_execution_provider_request", "operation is unavailable");
  }
  exactShape("venue provider payload", value, requiredByOperation);
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith("Hash")) bytes32(key, item);
    else if (key === "contextEpoch") {
      if (!Number.isSafeInteger(item) || item < 0) {
        fail("invalid_venue_execution_provider_request", "contextEpoch is invalid");
      }
    } else identifier(key, item);
  }
  if (
    operationId === "venueDiscoverCapabilities" &&
    value.environment !== "hyperliquid_testnet"
  ) {
    fail("venue_environment_denied", "only the reviewed Testnet profile exists");
  }
  assertNoRawPiiReference(value, "venueExecutionProviderRequestPayload");
  return structuredClone(value);
}

export function createVenueExecutionProviderRequest(input) {
  exactShape("venue provider request input", input, [
    "descriptor",
    "operationId",
    "payload",
    "expiresAt"
  ], ["capabilities", "now"]);
  const current = trustedDate("now", input.now ?? new Date());
  verifyVenueExecutionProviderDescriptor(input.descriptor);
  if (!VENUE_EXECUTION_PROVIDER_OPERATIONS.includes(input.operationId)) {
    fail("invalid_venue_execution_provider_request", "operation is unavailable");
  }
  const discovery = input.operationId === "venueDiscoverCapabilities";
  if (discovery) {
    if (input.capabilities !== undefined) {
      fail(
        "invalid_venue_execution_provider_request",
        "discovery cannot trust caller capabilities"
      );
    }
  } else {
    verifyVenueExecutionProviderCapabilities(input.capabilities, {
      descriptor: input.descriptor,
      now: current
    });
    if (
      input.capabilities.operationSupport[input.operationId] !==
      VenueCapabilityStatus.SUPPORTED
    ) {
      fail(
        "venue_execution_capability_unavailable",
        "operation capability is not supported"
      );
    }
  }
  const expiresAt = timestamp("expiresAt", input.expiresAt);
  if (
    expiresAt <= current ||
    expiresAt.getTime() - current.getTime() > MAX_REQUEST_LIFETIME_MS ||
    (input.capabilities && expiresAt > new Date(input.capabilities.expiresAt))
  ) {
    fail(
      "invalid_venue_execution_provider_request",
      "request expiry exceeds the current context"
    );
  }
  const payload = normalizePayload(input.operationId, input.payload);
  const value = {
    adapterId: input.descriptor.adapterId,
    venueId: input.descriptor.venueId,
    operationId: input.operationId,
    descriptorHash: input.descriptor.descriptorHash,
    capabilitiesHash: input.capabilities?.capabilitiesHash ?? null,
    contextEpoch: input.capabilities?.contextEpoch ?? payload.contextEpoch,
    payload,
    createdAt: current.toISOString(),
    expiresAt: expiresAt.toISOString(),
    externalCallAllowed:
      input.descriptor.enabled && input.descriptor.externalCallsEnabled,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: VENUE_EXECUTION_PROVIDER_REQUEST_SCHEMA_VERSION
  };
  const requestHash = hashId("venue_execution_provider_request", value);
  return cloneFreeze({
    requestId: `venue_execution_provider_request_${requestHash.slice(2)}`,
    requestHash,
    ...value
  });
}

export function verifyVenueExecutionProviderRequest(
  value,
  { now = new Date(), allowExpired = false } = {}
) {
  exactShape("venue provider request", value, [
    "requestId",
    "requestHash",
    "adapterId",
    "venueId",
    "operationId",
    "descriptorHash",
    "capabilitiesHash",
    "contextEpoch",
    "payload",
    "createdAt",
    "expiresAt",
    "externalCallAllowed",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  const current = trustedDate("now", now);
  const createdAt = timestamp("createdAt", value.createdAt);
  const expiresAt = timestamp("expiresAt", value.expiresAt);
  bytes32("requestHash", value.requestHash);
  bytes32("descriptorHash", value.descriptorHash);
  bytes32("capabilitiesHash", value.capabilitiesHash, { nullable: true });
  normalizePayload(value.operationId, value.payload);
  const core = structuredClone(value);
  delete core.requestId;
  delete core.requestHash;
  if (
    value.schemaVersion !== VENUE_EXECUTION_PROVIDER_REQUEST_SCHEMA_VERSION ||
    value.requestId !== `venue_execution_provider_request_${value.requestHash.slice(2)}` ||
    hashId("venue_execution_provider_request", core) !== value.requestHash ||
    !Number.isSafeInteger(value.contextEpoch) ||
    value.contextEpoch < 0 ||
    (value.operationId === "venueDiscoverCapabilities") !==
      (value.capabilitiesHash === null) ||
    typeof value.externalCallAllowed !== "boolean" ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    expiresAt <= createdAt ||
    expiresAt.getTime() - createdAt.getTime() > MAX_REQUEST_LIFETIME_MS ||
    (!allowExpired && expiresAt <= current)
  ) {
    fail(
      !allowExpired && expiresAt <= current
        ? "stale_venue_execution_provider_request"
        : "invalid_venue_execution_provider_request",
      "provider request is inconsistent or stale"
    );
  }
  return true;
}

function normalizeReasons(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 16 ||
    value.some((item) => typeof item !== "string" || !REASON.test(item)) ||
    new Set(value).size !== value.length
  ) {
    fail(
      "invalid_venue_execution_provider_result",
      "reasonCodes must be a bounded unique list"
    );
  }
  return [...value].sort();
}

export function createVenueExecutionProviderResult(input) {
  exactShape("venue provider result input", input, [
    "request",
    "status",
    "reasonCodes",
    "externalState",
    "externalCallPerformed"
  ], ["externalReferenceHash", "capabilities", "observedAt"]);
  const observedAt = trustedDate("observedAt", input.observedAt ?? new Date());
  verifyVenueExecutionProviderRequest(input.request, { now: observedAt });
  if (!RESULT_STATUSES.has(input.status)) {
    fail("invalid_venue_execution_provider_result", "result status is unavailable");
  }
  identifier("externalState", input.externalState);
  bytes32("externalReferenceHash", input.externalReferenceHash ?? null, {
    nullable: true
  });
  if (
    typeof input.externalCallPerformed !== "boolean" ||
    (input.externalCallPerformed && !input.request.externalCallAllowed) ||
    (input.status === VenueProviderResultStatus.UNKNOWN &&
      !input.externalCallPerformed)
  ) {
    fail(
      "invalid_venue_execution_provider_result",
      "external outcome exceeds request authority"
    );
  }
  const discovery = input.request.operationId === "venueDiscoverCapabilities";
  if (discovery) {
    verifyVenueExecutionProviderCapabilities(input.capabilities, {
      now: observedAt
    });
    if (
      input.capabilities.adapterId !== input.request.adapterId ||
      input.capabilities.descriptorHash !== input.request.descriptorHash ||
      input.capabilities.contextEpoch !== input.request.contextEpoch
    ) {
      fail(
        "venue_execution_provider_capability_drift",
        "discovered capabilities changed context"
      );
    }
  } else if (input.capabilities !== undefined && input.capabilities !== null) {
    fail(
      "invalid_venue_execution_provider_result",
      "capabilities are only returned by discovery"
    );
  }
  const value = {
    requestId: input.request.requestId,
    requestHash: input.request.requestHash,
    adapterId: input.request.adapterId,
    venueId: input.request.venueId,
    operationId: input.request.operationId,
    status: input.status,
    reasonCodes: normalizeReasons(input.reasonCodes),
    externalState: input.externalState,
    externalReferenceHash: input.externalReferenceHash ?? null,
    externalCallPerformed: input.externalCallPerformed,
    capabilities: input.capabilities ?? null,
    observedAt: observedAt.toISOString(),
    adapterAcknowledgementOnly: true,
    canonicalMutationAllowed: false,
    rawProviderResponseRetained: false,
    retryAllowed: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: VENUE_EXECUTION_PROVIDER_RESULT_SCHEMA_VERSION
  };
  assertNoRawPiiReference(value, "venueExecutionProviderResult");
  return cloneFreeze({
    resultHash: hashId("venue_execution_provider_result", value),
    ...value
  });
}

export function verifyVenueExecutionProviderResult(
  value,
  { request, now = new Date() } = {}
) {
  exactShape("venue provider result", value, [
    "resultHash",
    "requestId",
    "requestHash",
    "adapterId",
    "venueId",
    "operationId",
    "status",
    "reasonCodes",
    "externalState",
    "externalReferenceHash",
    "externalCallPerformed",
    "capabilities",
    "observedAt",
    "adapterAcknowledgementOnly",
    "canonicalMutationAllowed",
    "rawProviderResponseRetained",
    "retryAllowed",
    "mainnetAuthority",
    "productionAuthority",
    "fundsAuthority",
    "schemaVersion"
  ]);
  bytes32("resultHash", value.resultHash);
  bytes32("requestHash", value.requestHash);
  bytes32("externalReferenceHash", value.externalReferenceHash, { nullable: true });
  timestamp("observedAt", value.observedAt);
  normalizeReasons(value.reasonCodes);
  const core = structuredClone(value);
  delete core.resultHash;
  if (
    value.schemaVersion !== VENUE_EXECUTION_PROVIDER_RESULT_SCHEMA_VERSION ||
    !RESULT_STATUSES.has(value.status) ||
    typeof value.externalCallPerformed !== "boolean" ||
    (value.status === VenueProviderResultStatus.UNKNOWN &&
      !value.externalCallPerformed) ||
    value.adapterAcknowledgementOnly !== true ||
    value.canonicalMutationAllowed !== false ||
    value.rawProviderResponseRetained !== false ||
    value.retryAllowed !== false ||
    value.mainnetAuthority !== false ||
    value.productionAuthority !== false ||
    value.fundsAuthority !== false ||
    hashId("venue_execution_provider_result", core) !== value.resultHash
  ) {
    fail(
      "invalid_venue_execution_provider_result",
      "provider result is inconsistent"
    );
  }
  if (request) {
    verifyVenueExecutionProviderRequest(request, { now });
    if (
      value.requestId !== request.requestId ||
      value.requestHash !== request.requestHash ||
      value.adapterId !== request.adapterId ||
      value.venueId !== request.venueId ||
      value.operationId !== request.operationId ||
      (value.externalCallPerformed && !request.externalCallAllowed)
    ) {
      fail(
        "venue_execution_provider_result_binding_mismatch",
        "result does not match the request"
      );
    }
  }
  if (value.operationId === "venueDiscoverCapabilities") {
    verifyVenueExecutionProviderCapabilities(value.capabilities, { now });
    if (
      value.capabilities.adapterId !== value.adapterId ||
      value.capabilities.venueId !== value.venueId ||
      (request &&
        (value.capabilities.descriptorHash !== request.descriptorHash ||
          value.capabilities.contextEpoch !== request.contextEpoch))
    ) {
      fail(
        "venue_execution_provider_capability_drift",
        "result capabilities changed provider context"
      );
    }
  } else if (value.capabilities !== null) {
    fail(
      "invalid_venue_execution_provider_result",
      "non-discovery result contains capabilities"
    );
  }
  return true;
}

export function assertVenueExecutionProvider(provider) {
  const methods = Object.values(VENUE_EXECUTION_PROVIDER_METHOD_BY_OPERATION);
  exactShape("venue execution provider", provider, ["descriptor", ...methods]);
  verifyVenueExecutionProviderDescriptor(provider.descriptor);
  if (methods.some((method) => typeof provider[method] !== "function")) {
    fail("invalid_venue_execution_provider", "provider must implement the exact SPI");
  }
  return true;
}

export class VenueExecutionProviderRegistry {
  #providers;

  constructor(providers = []) {
    if (!Array.isArray(providers)) {
      fail("invalid_venue_execution_provider_registry", "providers must be an array");
    }
    this.#providers = new Map();
    for (const provider of providers) {
      assertVenueExecutionProvider(provider);
      if (this.#providers.has(provider.descriptor.adapterId)) {
        fail("duplicate_venue_execution_provider", "adapter IDs must be unique");
      }
      this.#providers.set(provider.descriptor.adapterId, provider);
    }
  }

  listDescriptors() {
    return cloneFreeze(
      [...this.#providers.values()]
        .map(({ descriptor }) => descriptor)
        .sort((left, right) => left.adapterId.localeCompare(right.adapterId))
    );
  }

  requireEnabled(adapterId) {
    identifier("adapterId", adapterId);
    const provider = this.#providers.get(adapterId);
    if (!provider) {
      fail("venue_execution_provider_unregistered", "provider is not registered");
    }
    if (!provider.descriptor.enabled) {
      fail(
        "venue_execution_provider_disabled_l0_local_no_funds",
        "provider invocation is disabled"
      );
    }
    return provider;
  }
}

export async function invokeVenueExecutionProvider({
  registry,
  request,
  capabilities = null,
  now = new Date()
}) {
  if (!(registry instanceof VenueExecutionProviderRegistry)) {
    fail(
      "invalid_venue_execution_provider_registry",
      "a static provider registry is required"
    );
  }
  const current = trustedDate("now", now);
  verifyVenueExecutionProviderRequest(request, { now: current });
  const provider = registry.requireEnabled(request.adapterId);
  if (provider.descriptor.descriptorHash !== request.descriptorHash) {
    fail(
      "venue_execution_provider_descriptor_drift",
      "provider descriptor changed after preparation"
    );
  }
  if (
    request.externalCallAllowed !==
    (provider.descriptor.enabled && provider.descriptor.externalCallsEnabled)
  ) {
    fail(
      "venue_execution_provider_descriptor_drift",
      "provider call authority changed after preparation"
    );
  }
  if (request.operationId !== "venueDiscoverCapabilities") {
    verifyVenueExecutionProviderCapabilities(capabilities, {
      descriptor: provider.descriptor,
      now: current
    });
    if (
      capabilities.capabilitiesHash !== request.capabilitiesHash ||
      capabilities.contextEpoch !== request.contextEpoch ||
      capabilities.operationSupport[request.operationId] !==
        VenueCapabilityStatus.SUPPORTED
    ) {
      fail(
        "venue_execution_provider_capability_drift",
        "provider capabilities changed after preparation"
      );
    }
  }
  const method = VENUE_EXECUTION_PROVIDER_METHOD_BY_OPERATION[request.operationId];
  const result = await provider[method](request);
  verifyVenueExecutionProviderResult(result, { request, now: current });
  return result;
}

export function describeVenueExecutionProviderBoundary() {
  return Object.freeze({
    deliveryMode: "L0_LOCAL_NO_FUNDS",
    hypercoreAdapterImplemented: true,
    externalProviderCallsEnabled: false,
    approveAgentEnabled: false,
    credentialProvisioningEnabled: false,
    officialLiveSigningEnabled: false,
    exchangeSubmissionEnabled: false,
    testnetWriteAuthority: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false
  });
}
