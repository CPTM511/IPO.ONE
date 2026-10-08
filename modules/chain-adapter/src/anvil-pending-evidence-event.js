import { DomainError, FinalityStatus, createEvidenceEnvelope, hashId } from "../../../packages/domain/src/index.js";
import { ANVIL_ABI_VERSION, ANVIL_EVENT_ABI, ANVIL_READ_ABI, ANVIL_SOURCE_REVISION } from "./anvil-readonly-abi.js";

export const ANVIL_PENDING_BATCH_LIMITS = Object.freeze({
  maxRecords: 128, maxEventPayloadBytes: 64 * 1024, maxBatchPayloadBytes: 1024 * 1024
});
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const REF = /^[A-Za-z0-9_.:-]{1,160}$/;
const TENANT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROFILE_KEYS = [
  "chainId", "contractAddress", "implementationAddress", "implementationCodeHash",
  "contractVersion", "sourceRevision", "dataMode", "sourceRef", "deploymentVerificationRef"
];
const CORE_KEYS = [
  "schemaVersion", "adapterId", "abiVersion", ...PROFILE_KEYS, "locId", "transactionHash", "logIndex",
  "blockNumber", "blockHash", "occurredAt", "versionVerification", "observationStatus", "finality",
  "reconciliation", "businessSemantics", "creditDecisionEligible", "mappingStatus", "kind", "facts"
];
const STATE_INTERPRETATION = Object.freeze({
  tag: "event_only_not_stored", perLocFactors: "deprecated_not_current_global_configuration",
  creationHistory: "not_established_by_snapshot", zeroTuple: "absent_or_deleted"
});

function fail(code, message) { throw new DomainError(`anvil_pending_${code}`, message); }

function closed(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("invalid_shape", "A plain data record is required");
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Reflect.ownKeys(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key !== "string" || !allowed.has(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, "value");
  })) fail("invalid_shape", "Record fields are missing, unsupported or executable");
}

function dataArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > ANVIL_PENDING_BATCH_LIMITS.maxRecords ||
      Reflect.ownKeys(value).length !== value.length + 1) fail("batch_limit", "A dense data array of at most 128 records is required");
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("invalid_shape", "Array entries must be plain data");
  }
}

// Bound and reject non-JSON/accessor inputs before cloning or hashing them.
function snapshot(value) {
  const active = new Set();
  let nodes = 0;
  function visit(item, depth) {
    if (++nodes > 4096 || depth > 12) fail("size_limit", "Data exceeds the bounded record shape");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") {
      if (item.length > ANVIL_PENDING_BATCH_LIMITS.maxEventPayloadBytes) fail("size_limit", "Data exceeds the record size bound");
      return;
    }
    if (typeof item === "number" && Number.isSafeInteger(item)) return;
    if (!item || typeof item !== "object" || active.has(item)) fail("invalid_shape", "Only acyclic JSON data is accepted");
    if (Array.isArray(item)) {
      dataArray(item);
    } else if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail("invalid_shape", "Only plain data records are accepted");
    active.add(item);
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        fail("invalid_shape", "Executable or hidden fields are prohibited");
      }
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > ANVIL_PENDING_BATCH_LIMITS.maxEventPayloadBytes) {
    fail("size_limit", "Data exceeds the record size bound");
  }
  return structuredClone(value);
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function text(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) fail("invalid_value", "A canonical bounded identifier is required");
}

function uint(value, bits = 256, positive = false) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,77})$/.test(value) ||
      BigInt(value) >= 2n ** BigInt(bits) || (positive && value === "0")) {
    fail("invalid_value", "A canonical bounded unsigned decimal string is required");
  }
}

function timestamp(value) {
  text(value, ISO);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("invalid_value", "A canonical UTC ISO timestamp is required");
  }
}

function profileFrom(input) {
  const profile = snapshot(input);
  closed(profile, PROFILE_KEYS, ["enabled", "adapterId", "abiVersion"]);
  text(profile.chainId, /^eip155:[1-9][0-9]{0,14}$/);
  for (const key of ["contractAddress", "implementationAddress"]) {
    text(profile[key], ADDRESS);
    if (profile[key] === `0x${"0".repeat(40)}`) fail("invalid_profile", "Nonzero contract addresses are required");
  }
  text(profile.implementationCodeHash, HASH);
  text(profile.sourceRef, REF);
  text(profile.deploymentVerificationRef, REF);
  if (profile.contractVersion !== "3.0.0" || profile.sourceRevision !== ANVIL_SOURCE_REVISION ||
      !["synthetic", "public_readonly"].includes(profile.dataMode) ||
      (Object.hasOwn(profile, "enabled") && profile.enabled !== true) ||
      (Object.hasOwn(profile, "adapterId") && profile.adapterId !== "anvil_readonly") ||
      (Object.hasOwn(profile, "abiVersion") && profile.abiVersion !== ANVIL_ABI_VERSION)) {
    fail("invalid_profile", "The pinned trusted V3 profile is required");
  }
  return profile;
}

function validateFacts(core) {
  const state = core.kind === "getLOC";
  const parameters = state ? ANVIL_READ_ABI[0].outputs[0].components
    : ANVIL_EVENT_ABI.find(({ name }) => name === core.kind)?.inputs;
  if (!parameters) fail("unsupported_kind", "Only the pinned V3 observation kinds are accepted");
  const fields = parameters.filter(({ name }) => name !== "tag");
  const extra = state ? ["recordPresence"] : core.kind === "LOCCreatedV3" ? ["tagHash", "tagByteLength"] : [];
  closed(core.facts, [...fields.map(({ name }) => name), ...extra]);
  for (const { name, type } of fields) {
    if (type === "address") text(core.facts[name], ADDRESS);
    else uint(core.facts[name], Number(type.slice(4)));
  }
  if (state) {
    const zero = fields.every(({ name, type }) => core.facts[name] === (type === "address" ? `0x${"0".repeat(40)}` : "0"));
    if (core.facts.recordPresence !== (zero ? "absent_or_deleted" : "present")) fail("invalid_semantics", "Snapshot presence is inconsistent");
  } else {
    if (core.facts.id !== core.locId) fail("invalid_provenance", "Event LOC identity is inconsistent");
    if (core.kind === "LOCCreatedV3") {
      text(core.facts.tagHash, HASH);
      uint(core.facts.tagByteLength, 16);
      if (BigInt(core.facts.tagByteLength) > 512n) fail("invalid_value", "Tag byte length exceeds the pinned bound");
    }
  }
}

function validateObservation(input, profile) {
  const observation = snapshot(input);
  closed(observation, [...CORE_KEYS, "observationId", "tupleId", "observedAt", "evidence"], ["stateInterpretation"]);
  const state = observation.kind === "getLOC";
  const keys = [...CORE_KEYS, ...(state ? ["stateInterpretation"] : [])];
  closed(observation, [...keys, "observationId", "tupleId", "observedAt", "evidence"]);
  const core = Object.fromEntries(keys.map((key) => [key, observation[key]]));
  if (PROFILE_KEYS.some((key) => core[key] !== profile[key])) fail("profile_mismatch", "Observation differs from the trusted source profile");
  if (core.schemaVersion !== "anvil_readonly_observation.v1" || core.adapterId !== "anvil_readonly" ||
      core.abiVersion !== ANVIL_ABI_VERSION || core.versionVerification !== "block_end_bytecode_match" ||
      core.observationStatus !== "included" || core.finality !== "unverified" ||
      core.reconciliation !== "unreconciled" || core.businessSemantics !== "unknown" ||
      core.creditDecisionEligible !== false || core.mappingStatus !== "unmapped") {
    fail("invalid_semantics", "External facts must remain pending, unknown, unmapped and non-authorizing");
  }
  uint(core.locId, 96, true);
  uint(core.blockNumber);
  text(core.blockHash, HASH);
  timestamp(core.occurredAt);
  timestamp(observation.observedAt);
  if (!core.occurredAt.endsWith(".000Z") || observation.observedAt < core.occurredAt) {
    fail("invalid_provenance", "Observation chronology differs from a block timestamp");
  }
  if (state) {
    if (core.transactionHash !== null || core.logIndex !== null) fail("invalid_provenance", "A state snapshot has no transaction/log identity");
    closed(core.stateInterpretation, Object.keys(STATE_INTERPRETATION));
    if (Object.keys(STATE_INTERPRETATION).some((key) => core.stateInterpretation[key] !== STATE_INTERPRETATION[key])) {
      fail("invalid_semantics", "Snapshot interpretation limits must be retained");
    }
  } else {
    text(core.transactionHash, HASH);
    uint(core.logIndex);
  }
  validateFacts(core);
  const observationId = hashId("anvil_observation", core);
  const tupleId = hashId("anvil_external_tuple", {
    chainId: core.chainId, contractAddress: core.contractAddress,
    transactionHash: core.transactionHash, logIndex: core.logIndex,
    ...(state ? { locId: core.locId, blockHash: core.blockHash } : {})
  });
  if (observation.observationId !== observationId || observation.tupleId !== tupleId) fail("invalid_hash", "Source identity hashes do not match the facts");
  const expected = createEvidenceEnvelope({
    eventId: observationId, eventType: "external.anvil.fact_observed",
    aggregateType: "ExternalLOCObservation", aggregateId: tupleId, aggregateVersion: 1,
    actorRef: "adapter:anvil_readonly",
    sourceSystem: core.dataMode === "synthetic" ? "anvil_synthetic_fixture" : "anvil_public_contract",
    sourceFinality: FinalityStatus.PENDING, payload: core,
    occurredAt: core.occurredAt, recordedAt: observation.observedAt
  });
  if (hashId("anvil_source_envelope", observation.evidence) !== hashId("anvil_source_envelope", expected)) {
    fail("invalid_hash", "The source envelope, payload or provenance was changed");
  }
  return { observation, core };
}

function convert(tenantId, profile, input) {
  const { observation, core } = validateObservation(input, profile);
  const eventId = hashId("anvil_pending_event", { tenantId, observationId: observation.observationId });
  const payload = { schemaVersion: "anvil_pending_source.v1", sourceObservation: observation };
  if (Buffer.byteLength(JSON.stringify(payload)) > ANVIL_PENDING_BATCH_LIMITS.maxEventPayloadBytes) {
    fail("size_limit", "Event payload exceeds the repository-compatible bound");
  }
  return freeze({
    schemaVersion: "anvil_pending_evidence_event.v1", tenantId,
    observationId: observation.observationId, tupleId: observation.tupleId,
    aggregateType: "ExternalLOCObservation",
    aggregateId: hashId("anvil_pending_aggregate", { tenantId, tupleId: observation.tupleId }),
    sourceSystem: observation.evidence.sourceSystem,
    idempotencyKey: eventId,
    // Delivery timestamps stay in the original receipt but do not change replay identity.
    commandHash: hashId("anvil_pending_command", { tenantId, core }),
    event: {
      eventId, eventType: "external.anvil.fact_observed", finalityStatus: FinalityStatus.PENDING,
      payloadHash: hashId("event_payload", payload), payload,
      occurredAt: core.occurredAt, schemaVersion: "event.v1"
    }
  });
}

// Pure candidates only. No repository, transport, callback, registration or queue.
export function createAnvilPendingEvidenceEvent(input) {
  closed(input, ["tenantId", "profile", "observation"]);
  text(input.tenantId, TENANT);
  return convert(input.tenantId, profileFrom(input.profile), input.observation);
}

export function prepareAnvilPendingEvidenceBatch(input) {
  closed(input, ["tenantId", "profile", "observations"], ["priorRecords"]);
  const { tenantId, observations, priorRecords = [] } = input;
  text(tenantId, TENANT);
  const profile = profileFrom(input.profile);
  for (const records of [observations, priorRecords]) dataArray(records);
  const byTuple = new Map();
  let payloadBytes = 0;
  function retain(record) {
    const previous = byTuple.get(record.tupleId);
    if (previous) {
      if (previous.observationId !== record.observationId || previous.commandHash !== record.commandHash) {
        fail("conflict", "An external tuple has conflicting facts; explicit review is required");
      }
      return previous;
    }
    if (byTuple.size === ANVIL_PENDING_BATCH_LIMITS.maxRecords) fail("batch_limit", "Combined replay window exceeds 128 records");
    payloadBytes += Buffer.byteLength(JSON.stringify(record.event.payload));
    if (payloadBytes > ANVIL_PENDING_BATCH_LIMITS.maxBatchPayloadBytes) fail("size_limit", "Combined payloads exceed one MiB");
    byTuple.set(record.tupleId, record);
    return null;
  }
  for (const inputRecord of priorRecords) {
    const saved = snapshot(inputRecord);
    closed(saved, ["schemaVersion", "tenantId", "observationId", "tupleId", "aggregateType", "aggregateId", "sourceSystem", "idempotencyKey", "commandHash", "event"]);
    if (saved.tenantId !== tenantId) fail("tenant_mismatch", "Replay records belong to a different tenant");
    const rebuilt = convert(tenantId, profile, saved.event?.payload?.sourceObservation);
    if (hashId("anvil_pending_record", saved) !== hashId("anvil_pending_record", rebuilt)) {
      fail("invalid_hash", "Replay record differs from its validated source");
    }
    retain(rebuilt);
  }
  const events = [];
  const results = [];
  for (const observation of observations) {
    const candidate = convert(tenantId, profile, observation);
    const previous = retain(candidate);
    if (!previous) events.push(candidate);
    results.push({ observationId: candidate.observationId, eventId: candidate.event.eventId, disposition: previous ? "replayed" : "prepared" });
  }
  return freeze({
    schemaVersion: "anvil_pending_evidence_batch.v1", tenantId,
    events, results, records: [...byTuple.values()], payloadBytes
  });
}
