import {
  FinalityStatus,
  PluginAuthMethod,
  PluginFailurePolicy,
  PluginStatus,
  PluginType,
  enumValues
} from "./enums.js";
import { DomainError } from "./errors.js";
import { createOperationalId, hashId } from "./ids.js";
import { assertEnumValue, assertNoRawPiiReference, assertNonEmptyString } from "./validators.js";

const EXECUTABLE_PLUGIN_KEYS = new Set([
  "binary",
  "code",
  "command",
  "dockerimage",
  "entrypoint",
  "executable",
  "modulepath",
  "packageurl",
  "script",
  "sourcecode"
]);
const CAPABILITY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const SCHEMA_VERSION_PATTERN = /^[a-z][a-z0-9_.-]*\.v[1-9][0-9]*$/;

function clone(value) {
  return structuredClone(value);
}

function parseTimestamp(name, value) {
  assertNonEmptyString(name, value);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DomainError("invalid_timestamp", `${name} must be an ISO timestamp`, { name, value });
  }
  return parsed.toISOString();
}

function uniqueStrings(name, values, { allowEmpty = false, pattern } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new DomainError("invalid_string_list", `${name} must be ${allowEmpty ? "an" : "a non-empty"} array`, {
      name
    });
  }
  const normalized = values.map((value) => {
    assertNonEmptyString(name, value);
    if (pattern && !pattern.test(value)) {
      throw new DomainError("invalid_contract_identifier", `${name} contains an invalid identifier`, { name, value });
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainError("duplicate_contract_value", `${name} cannot contain duplicates`, { name });
  }
  return normalized;
}

function assertNoExecutableFields(value, path = "plugin") {
  if (value === null || value === undefined || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (EXECUTABLE_PLUGIN_KEYS.has(normalized)) {
      throw new DomainError("executable_plugin_field_prohibited", "plugin manifests cannot contain executable payloads", {
        path: `${path}.${key}`
      });
    }
    assertNoExecutableFields(nested, `${path}.${key}`);
  }
}

export function createEvidenceEnvelope({
  eventId,
  eventType,
  aggregateType,
  aggregateId,
  aggregateVersion,
  subjectId,
  obligationId,
  causationId,
  correlationId,
  idempotencyKey,
  actorRef,
  sourceSystem,
  sourceFinality = FinalityStatus.FINALIZED,
  payload = {},
  payloadRef,
  attestationRefs = [],
  occurredAt,
  recordedAt = new Date().toISOString()
}) {
  for (const [name, value] of Object.entries({ eventId, eventType, aggregateType, aggregateId, actorRef, sourceSystem })) {
    assertNonEmptyString(name, value);
  }
  if (!Number.isSafeInteger(aggregateVersion) || aggregateVersion < 1) {
    throw new DomainError("invalid_aggregate_version", "aggregateVersion must be a positive safe integer", {
      aggregateVersion
    });
  }
  assertEnumValue("sourceFinality", sourceFinality, enumValues(FinalityStatus));
  assertNoRawPiiReference(payload, "evidence.payload");
  const normalizedAttestationRefs = uniqueStrings("attestationRefs", attestationRefs, { allowEmpty: true });
  const normalizedOccurredAt = parseTimestamp("occurredAt", occurredAt);
  const normalizedRecordedAt = parseTimestamp("recordedAt", recordedAt);
  const normalizedCorrelationId = correlationId ?? eventId;
  const normalizedIdempotencyKey = idempotencyKey ?? eventId;
  assertNonEmptyString("correlationId", normalizedCorrelationId);
  assertNonEmptyString("idempotencyKey", normalizedIdempotencyKey);
  const payloadHash = hashId("evidence_payload", payload);
  const optionalReferences = {};
  for (const [name, value] of Object.entries({ subjectId, obligationId, causationId, payloadRef })) {
    if (value !== undefined) {
      assertNonEmptyString(name, value);
      optionalReferences[name] = value;
    }
  }
  const core = {
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    aggregateVersion,
    correlationId: normalizedCorrelationId,
    idempotencyKey: normalizedIdempotencyKey,
    actorRef,
    sourceSystem,
    sourceFinality,
    payloadHash,
    ...optionalReferences,
    attestationRefs: normalizedAttestationRefs,
    occurredAt: normalizedOccurredAt,
    recordedAt: normalizedRecordedAt
  };
  return {
    evidenceId: eventId,
    evidenceHash: hashId("evidence_envelope", core),
    ...core,
    payload: clone(payload),
    schemaVersion: "evidence_event.v2"
  };
}

export function createPluginManifest(input) {
  assertNoRawPiiReference(input, "plugin");
  assertNoExecutableFields(input);
  for (const name of ["pluginKey", "displayName", "publisherId", "serviceVersion", "endpoint", "termsRef"]) {
    assertNonEmptyString(name, input[name]);
  }
  assertEnumValue("pluginType", input.pluginType, enumValues(PluginType));
  assertEnumValue("authMethod", input.authMethod, enumValues(PluginAuthMethod));
  assertEnumValue("failurePolicy", input.failurePolicy, enumValues(PluginFailurePolicy));
  if (typeof input.sandboxOnly !== "boolean") {
    throw new DomainError("invalid_sandbox_flag", "sandboxOnly must be a boolean");
  }

  let endpoint;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    throw new DomainError("invalid_plugin_endpoint", "plugin endpoint must be an absolute URL");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new DomainError("unsafe_plugin_endpoint", "plugin endpoint cannot contain credentials, query, or fragment data");
  }
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(input.sandboxOnly && isLocalhost && endpoint.protocol === "http:")) {
    throw new DomainError("insecure_plugin_endpoint", "plugin endpoint requires HTTPS outside a localhost sandbox");
  }
  if (input.authMethod === PluginAuthMethod.NONE && !input.sandboxOnly) {
    throw new DomainError("plugin_auth_required", "production-capable plugins require an authentication method");
  }

  const capabilities = uniqueStrings("capabilities", input.capabilities, { pattern: CAPABILITY_PATTERN });
  const supportedSchemaVersions = uniqueStrings("supportedSchemaVersions", input.supportedSchemaVersions, {
    pattern: SCHEMA_VERSION_PATTERN
  });
  const jurisdictions = uniqueStrings("jurisdictions", input.jurisdictions);
  const dataClasses = uniqueStrings("dataClasses", input.dataClasses ?? [], { allowEmpty: true, pattern: CAPABILITY_PATTERN });
  const requiredInputs = uniqueStrings("requiredInputs", input.requiredInputs ?? [], {
    allowEmpty: true,
    pattern: CAPABILITY_PATTERN
  });
  const producedAttestationTypes = uniqueStrings("producedAttestationTypes", input.producedAttestationTypes ?? [], {
    allowEmpty: true,
    pattern: SCHEMA_VERSION_PATTERN
  });
  const manifestCore = {
    pluginKey: input.pluginKey,
    displayName: input.displayName,
    publisherId: input.publisherId,
    pluginType: input.pluginType,
    capabilities,
    supportedSchemaVersions,
    jurisdictions,
    dataClasses,
    requiredInputs,
    producedAttestationTypes,
    endpoint: endpoint.toString(),
    authMethod: input.authMethod,
    failurePolicy: input.failurePolicy,
    sandboxOnly: input.sandboxOnly,
    serviceVersion: input.serviceVersion,
    termsRef: input.termsRef
  };
  const now = input.now ?? new Date();
  return {
    pluginId: createOperationalId("plugin"),
    manifestHash: hashId("plugin_manifest", manifestCore),
    ...manifestCore,
    status: PluginStatus.PENDING,
    registeredAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "plugin_manifest.v1"
  };
}
