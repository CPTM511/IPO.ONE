import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  OPERATIONAL_SIGNAL_SCHEMA_VERSION,
  OperationalSignalType
} from "./operations-policy.js";
import { assertDualNativeLifecycleSyntheticResult } from "./dual-native-synthetic.js";
import { assertPrivatePilotOperationalSourceBoundary } from "./operations-source-boundary.js";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const SOURCE_SYSTEMS = new Set([
  "ipo.one.credit-events.v1",
  "ipo.one.evidence.v2",
  "ipo.one.abuse-telemetry.v1",
  "ipo.one.synthetic-monitor.v1"
]);
const SIGNAL_TYPES = new Set(Object.values(OperationalSignalType));

function invalid(message) {
  throw new DomainError("invalid_operational_signal", message);
}

function object(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  return value;
}

function boundedString(name, value, { maximum = 256, pattern } = {}) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value) || (pattern && !pattern.test(value))
  ) invalid(`${name} is invalid`);
  return value;
}

function timestamp(name, value) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid(`${name} is invalid`);
  }
  return value;
}

function exactSignalKeys(value) {
  const expected = [
    "signalType",
    "sourceSystem",
    "sourceEventType",
    "sourceRefHash",
    "scopeRefHash",
    "observedAt",
    "environment",
    "sandboxOnly",
    "productionFundsMoved",
    "schemaVersion"
  ].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid("operational signal has an invalid shape");
  }
}

function referenceHash(namespace, payload) {
  return hashId(`operations_control.${namespace}`, payload);
}

function createSignal({
  signalType,
  sourceSystem,
  sourceEventType,
  sourceId,
  scope
}, observedAt, boundary) {
  const sourceBoundary = assertPrivatePilotOperationalSourceBoundary(boundary);
  const signal = {
    signalType,
    sourceSystem,
    sourceEventType,
    sourceRefHash: referenceHash("source", { sourceSystem, sourceEventType, sourceId }),
    scopeRefHash: referenceHash("scope", { sourceSystem, scope }),
    observedAt: timestamp("observedAt", observedAt),
    environment: sourceBoundary.environment,
    sandboxOnly: sourceBoundary.sandboxOnly,
    productionFundsMoved: sourceBoundary.productionFundsMoved,
    schemaVersion: OPERATIONAL_SIGNAL_SCHEMA_VERSION
  };
  return Object.freeze(signal);
}

export function assertOperationalSignal(value) {
  object("operational signal", value);
  exactSignalKeys(value);
  if (!SIGNAL_TYPES.has(value.signalType)) invalid("signalType is invalid");
  if (!SOURCE_SYSTEMS.has(value.sourceSystem)) invalid("sourceSystem is invalid");
  boundedString("sourceEventType", value.sourceEventType, {
    maximum: 128,
    pattern: /^[a-z][a-z0-9_.-]+$/
  });
  if (!HASH_PATTERN.test(value.sourceRefHash) || !HASH_PATTERN.test(value.scopeRefHash)) {
    invalid("operational signal references must be content hashes");
  }
  timestamp("observedAt", value.observedAt);
  if (
    value.environment !== "closed-pilot" || value.sandboxOnly !== true ||
    value.productionFundsMoved !== false || value.schemaVersion !== OPERATIONAL_SIGNAL_SCHEMA_VERSION
  ) invalid("operational signal safety boundary is invalid");
  return value;
}

export function signalFromCreditEvent(input, { boundary } = {}) {
  const event = object("credit event", input);
  if (event.schemaVersion !== "event.v1") invalid("credit event schemaVersion is invalid");
  const eventType = boundedString("eventType", event.eventType, {
    maximum: 128,
    pattern: /^[a-z][a-z0-9_]+$/
  });
  const eventId = boundedString("eventId", event.eventId);
  const occurredAt = timestamp("occurredAt", event.occurredAt);
  const payload = object("credit event payload", event.payload ?? {});
  let signalType;
  let scope;

  if (eventType === "reconciliation_completed" && payload.status === "failed") {
    signalType = OperationalSignalType.RECONCILIATION_FAILED;
    scope = "full_reconciliation";
  } else if (eventType === "servicing_advanced" && payload.nextClassification === "defaulted") {
    signalType = OperationalSignalType.SERVICING_DEFAULTED;
    scope = boundedString("obligationId", event.obligationId ?? payload.obligationId);
  } else if (eventType === "obligation_written_off") {
    signalType = OperationalSignalType.SERVICING_WRITTEN_OFF;
    scope = boundedString("obligationId", event.obligationId ?? payload.obligationId);
  } else if (eventType === "break_glass_incident_activated") {
    signalType = OperationalSignalType.BREAK_GLASS_ACTIVATED;
    scope = boundedString("breakGlassIncidentId", payload.breakGlassIncidentId);
  } else {
    return undefined;
  }

  return createSignal({
    signalType,
    sourceSystem: "ipo.one.credit-events.v1",
    sourceEventType: eventType,
    sourceId: eventId,
    scope
  }, occurredAt, boundary);
}

export function signalFromEvidenceEnvelope(input, { boundary } = {}) {
  const event = object("evidence envelope", input);
  if (event.schemaVersion !== "evidence_event.v2") invalid("evidence schemaVersion is invalid");
  const eventType = boundedString("eventType", event.eventType, {
    maximum: 128,
    pattern: /^[a-z][a-z0-9_]+$/
  });
  if (eventType !== "payment_chain_invalidated") return undefined;
  const payload = object("evidence payload", event.payload ?? {});
  if (payload.observationStatus !== "invalidated") invalid("invalidated Evidence status is inconsistent");
  const eventId = boundedString("eventId", event.eventId);
  const scope = boundedString("aggregateId", event.obligationId ?? event.aggregateId);
  return createSignal({
    signalType: OperationalSignalType.CHAIN_PAYMENT_INVALIDATED,
    sourceSystem: "ipo.one.evidence.v2",
    sourceEventType: eventType,
    sourceId: eventId,
    scope
  }, timestamp("occurredAt", event.occurredAt), boundary);
}

export function signalFromAbuseTelemetry(input, { observedAt, windowId, boundary } = {}) {
  const row = object("abuse telemetry", input);
  if (
    row.surface !== "tenant" || !["denied", "failed"].includes(row.outcome) ||
    row.reason !== "unavailable" ||
    !Number.isSafeInteger(row.count) || row.count < 0
  ) {
    if (Number.isSafeInteger(row.count) && row.count >= 0) return undefined;
    invalid("abuse telemetry count is invalid");
  }
  if (row.count === 0) return undefined;
  const window = boundedString("windowId", windowId, { maximum: 128 });
  return createSignal({
    signalType: OperationalSignalType.ADMISSION_CONTROL_UNAVAILABLE,
    sourceSystem: "ipo.one.abuse-telemetry.v1",
    sourceEventType: "request_admission_unavailable",
    sourceId: `${window}:${row.outcome}:${row.count}`,
    scope: "tenant_admission_service"
  }, timestamp("observedAt", observedAt), boundary);
}

export function signalFromSyntheticLifecycleResult(input, { boundary } = {}) {
  const result = assertDualNativeLifecycleSyntheticResult(input);
  if (result.status === "passed") return undefined;
  return createSignal({
    signalType: OperationalSignalType.SYNTHETIC_LIFECYCLE_FAILED,
    sourceSystem: "ipo.one.synthetic-monitor.v1",
    sourceEventType: "full_lifecycle_synthetic_failed",
    sourceId: result.syntheticRunId,
    scope: result.checkIdHash
  }, timestamp("observedAt", result.observedAt), boundary);
}
