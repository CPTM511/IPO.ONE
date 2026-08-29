import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";

export const PILOT_CASE_SCHEMA_VERSION = "pilot_case.v1";

export const PilotCaseTargetType = Object.freeze({
  DECISION: "decision",
  OFFER_DISCLOSURE: "offer_disclosure",
  PAYMENT: "payment",
  SERVICING_ACTION: "servicing_action",
  EVIDENCE_ITEM: "evidence_item",
  REPORT: "report"
});

export const PilotCaseReasonCode = Object.freeze({
  RECORD_INACCURATE: "record_inaccurate",
  CONTEXT_MISSING: "context_missing",
  PAYMENT_MISMATCH: "payment_mismatch",
  SERVICING_ERROR: "servicing_error",
  EVIDENCE_MISMATCH: "evidence_mismatch",
  REPORT_MISMATCH: "report_mismatch"
});

export const PilotCaseCorrectionCode = Object.freeze({
  RECORD_VERSION_ADDED: "record_version_added",
  ATTRIBUTION_CORRECTED: "attribution_corrected",
  STATUS_CONTEXT_ADDED: "status_context_added",
  PAYMENT_REFERENCE_LINKED: "payment_reference_linked",
  EVIDENCE_REFERENCE_LINKED: "evidence_reference_linked",
  REPORT_METADATA_VERSIONED: "report_metadata_versioned"
});

export const PilotCaseStatus = Object.freeze({
  OPEN: "open",
  ASSIGNED: "assigned",
  RESOLVED_UPHELD: "resolved_upheld",
  RESOLVED_CORRECTED: "resolved_corrected"
});

export const PilotCaseTransition = Object.freeze({
  ASSIGN: "assign",
  UPHOLD: "uphold",
  CORRECT: "correct"
});

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const TARGET_TYPES = new Set(Object.values(PilotCaseTargetType));
const REASON_CODES = new Set(Object.values(PilotCaseReasonCode));
const CORRECTION_CODES = new Set(Object.values(PilotCaseCorrectionCode));
const STATUS_VALUES = new Set(Object.values(PilotCaseStatus));
const HISTORY_ACTIONS = new Set(["filed", "assigned", "resolved_upheld", "resolved_corrected"]);

function invalid(message) {
  throw new DomainError("invalid_pilot_case", message);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function validateCase(value) {
  const projectionKeys = [
    "pilotCaseId", "caseIdentityHash", "subjectId", "entryMode",
    "filerActorRefHash", "targetType", "targetId", "targetRefHash",
    "reasonCode", "status", "assignedOwnerRefHash", "resolution",
    "correction", "sequence", "filedAt", "updatedAt", "sandboxOnly",
    "productionAuthority", "economicMutationAuthorized", "history",
    "schemaVersion"
  ];
  if (
    !exactKeys(value, projectionKeys) ||
    value.schemaVersion !== PILOT_CASE_SCHEMA_VERSION ||
    typeof value.pilotCaseId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.pilotCaseId) ||
    typeof value.caseIdentityHash !== "string" ||
    !HASH_PATTERN.test(value.caseIdentityHash) ||
    typeof value.subjectId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.subjectId) ||
    !new Set(["human", "agent"]).has(value.entryMode) ||
    typeof value.filerActorRefHash !== "string" ||
    !HASH_PATTERN.test(value.filerActorRefHash) ||
    !TARGET_TYPES.has(value.targetType) ||
    typeof value.targetId !== "string" ||
    !IDENTIFIER_PATTERN.test(value.targetId) ||
    typeof value.targetRefHash !== "string" ||
    !HASH_PATTERN.test(value.targetRefHash) ||
    !REASON_CODES.has(value.reasonCode) ||
    !STATUS_VALUES.has(value.status) ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1 ||
    !canonicalTimestamp(value.filedAt) ||
    !canonicalTimestamp(value.updatedAt) ||
    value.sandboxOnly !== true ||
    value.productionAuthority !== false ||
    value.economicMutationAuthorized !== false ||
    !Array.isArray(value.history) ||
    value.history.length !== value.sequence ||
    value.history.length > 3
  ) invalid("pilot case projection is invalid");
  value.history.forEach((item, index) => {
    if (
      !exactKeys(item, ["sequence", "action", "actorRefHash", "eventId", "at"]) ||
      item.sequence !== index + 1 ||
      !HISTORY_ACTIONS.has(item.action) ||
      typeof item.actorRefHash !== "string" ||
      !HASH_PATTERN.test(item.actorRefHash) ||
      typeof item.eventId !== "string" ||
      !IDENTIFIER_PATTERN.test(item.eventId) ||
      !canonicalTimestamp(item.at)
    ) invalid("pilot case history is invalid");
  });
  if (
    value.history[0].action !== "filed" ||
    value.history[0].actorRefHash !== value.filerActorRefHash ||
    value.history[0].at !== value.filedAt ||
    value.history.at(-1).at !== value.updatedAt
  ) invalid("pilot case history does not match its projection");
  const assigned = value.status !== PilotCaseStatus.OPEN;
  const resolved = value.status === PilotCaseStatus.RESOLVED_UPHELD ||
    value.status === PilotCaseStatus.RESOLVED_CORRECTED;
  if (
    (assigned && (!HASH_PATTERN.test(value.assignedOwnerRefHash ?? "") ||
      value.history[1]?.action !== "assigned")) ||
    (!assigned && value.assignedOwnerRefHash !== null) ||
    (resolved && value.history[2]?.action !== value.status) ||
    (!resolved && (value.resolution !== null || value.correction !== null)) ||
    (value.status === PilotCaseStatus.RESOLVED_UPHELD &&
      (value.resolution !== PilotCaseTransition.UPHOLD || value.correction !== null))
  ) invalid("pilot case lifecycle fields are inconsistent");
  if (value.status === PilotCaseStatus.RESOLVED_CORRECTED) {
    if (
      value.resolution !== PilotCaseTransition.CORRECT ||
      !exactKeys(value.correction, [
        "correctionCode", "originalTargetRefHash", "correctionEventId", "linkedAt",
        "additiveOnly", "originalRecordImmutable", "economicMutationAuthorized"
      ]) ||
      !CORRECTION_CODES.has(value.correction.correctionCode) ||
      value.correction.originalTargetRefHash !== value.targetRefHash ||
      value.correction.correctionEventId !== value.history[2].eventId ||
      value.correction.linkedAt !== value.updatedAt ||
      value.correction.additiveOnly !== true ||
      value.correction.originalRecordImmutable !== true ||
      value.correction.economicMutationAuthorized !== false
    ) invalid("pilot case correction link is invalid");
  }
  return value;
}

function action({ sequence, action, actorRefHash, eventId, at }) {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    typeof action !== "string" ||
    typeof actorRefHash !== "string" ||
    !HASH_PATTERN.test(actorRefHash) ||
    typeof eventId !== "string" ||
    !IDENTIFIER_PATTERN.test(eventId) ||
    !canonicalTimestamp(at)
  ) invalid("pilot case action is invalid");
  return Object.freeze({ sequence, action, actorRefHash, eventId, at });
}

export function createPilotCase({
  pilotCaseId,
  subjectId,
  entryMode,
  filerActorRefHash,
  targetType,
  targetId,
  targetRefHash,
  reasonCode,
  eventId,
  now = new Date()
}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalid("pilot case clock is invalid");
  }
  const filedAt = now.toISOString();
  const pilotCase = {
    pilotCaseId,
    caseIdentityHash: hashId("pilot_case_identity", {
      pilotCaseId,
      subjectId,
      filerActorRefHash,
      targetType,
      targetId,
      targetRefHash,
      reasonCode,
      filedAt
    }),
    subjectId,
    entryMode,
    filerActorRefHash,
    targetType,
    targetId,
    targetRefHash,
    reasonCode,
    status: PilotCaseStatus.OPEN,
    assignedOwnerRefHash: null,
    resolution: null,
    correction: null,
    sequence: 1,
    filedAt,
    updatedAt: filedAt,
    sandboxOnly: true,
    productionAuthority: false,
    economicMutationAuthorized: false,
    history: [action({
      sequence: 1,
      action: "filed",
      actorRefHash: filerActorRefHash,
      eventId,
      at: filedAt
    })],
    schemaVersion: PILOT_CASE_SCHEMA_VERSION
  };
  return Object.freeze(validateCase(pilotCase));
}

export function assignPilotCase(pilotCase, {
  ownerActorRefHash,
  operatorActorRefHash,
  eventId,
  now = new Date()
}) {
  const current = validateCase(structuredClone(pilotCase));
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalid("pilot case clock is invalid");
  }
  if (current.status !== PilotCaseStatus.OPEN) {
    invalid("only an open pilot case may be assigned");
  }
  if (!HASH_PATTERN.test(ownerActorRefHash ?? "")) {
    invalid("pilot case owner reference is invalid");
  }
  const updatedAt = now.toISOString();
  const next = {
    ...current,
    status: PilotCaseStatus.ASSIGNED,
    assignedOwnerRefHash: ownerActorRefHash,
    sequence: 2,
    updatedAt,
    history: [...current.history, action({
      sequence: 2,
      action: "assigned",
      actorRefHash: operatorActorRefHash,
      eventId,
      at: updatedAt
    })]
  };
  return Object.freeze(validateCase(next));
}

export function resolvePilotCase(pilotCase, {
  resolution,
  correctionCode = null,
  resolverActorRefHash,
  eventId,
  now = new Date()
}) {
  const current = validateCase(structuredClone(pilotCase));
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalid("pilot case clock is invalid");
  }
  if (current.status !== PilotCaseStatus.ASSIGNED) {
    invalid("only an assigned pilot case may be resolved");
  }
  if (!new Set([PilotCaseTransition.UPHOLD, PilotCaseTransition.CORRECT]).has(resolution)) {
    invalid("pilot case resolution is invalid");
  }
  if (
    (resolution === PilotCaseTransition.CORRECT && !CORRECTION_CODES.has(correctionCode)) ||
    (resolution === PilotCaseTransition.UPHOLD && correctionCode !== null)
  ) invalid("pilot case correction code is inconsistent");
  const updatedAt = now.toISOString();
  const corrected = resolution === PilotCaseTransition.CORRECT;
  const next = {
    ...current,
    status: corrected
      ? PilotCaseStatus.RESOLVED_CORRECTED
      : PilotCaseStatus.RESOLVED_UPHELD,
    resolution,
    correction: corrected ? Object.freeze({
      correctionCode,
      originalTargetRefHash: current.targetRefHash,
      correctionEventId: eventId,
      linkedAt: updatedAt,
      additiveOnly: true,
      originalRecordImmutable: true,
      economicMutationAuthorized: false
    }) : null,
    sequence: 3,
    updatedAt,
    history: [...current.history, action({
      sequence: 3,
      action: corrected ? "resolved_corrected" : "resolved_upheld",
      actorRefHash: resolverActorRefHash,
      eventId,
      at: updatedAt
    })]
  };
  return Object.freeze(validateCase(next));
}

export function isPilotCase(value) {
  try {
    validateCase(structuredClone(value));
    return true;
  } catch {
    return false;
  }
}

export function normalizePilotCaseFilePayload(payload) {
  const keys = ["targetType", "targetId", "reasonCode", "schemaVersion"];
  if (
    !exactKeys(payload, keys) ||
    payload.schemaVersion !== "pilot_case_file.v1" ||
    !TARGET_TYPES.has(payload.targetType) ||
    typeof payload.targetId !== "string" ||
    !IDENTIFIER_PATTERN.test(payload.targetId) ||
    !REASON_CODES.has(payload.reasonCode)
  ) invalid("pilot case filing payload must use the closed contract");
  return Object.freeze(structuredClone(payload));
}

export function normalizePilotCaseTransitionPayload(payload) {
  const baseKeys = ["transition", "schemaVersion"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalid("pilot case transition payload is invalid");
  }
  if (payload.transition === PilotCaseTransition.ASSIGN) {
    if (
      !exactKeys(payload, baseKeys) ||
      payload.schemaVersion !== "pilot_case_transition.v1"
    ) invalid("pilot case assignment payload is invalid");
  } else if (payload.transition === PilotCaseTransition.UPHOLD) {
    if (
      !exactKeys(payload, baseKeys) ||
      payload.schemaVersion !== "pilot_case_transition.v1"
    ) invalid("pilot case uphold payload is invalid");
  } else if (payload.transition === PilotCaseTransition.CORRECT) {
    if (
      !exactKeys(payload, [...baseKeys, "correctionCode"]) ||
      payload.schemaVersion !== "pilot_case_transition.v1" ||
      !CORRECTION_CODES.has(payload.correctionCode)
    ) invalid("pilot case correction payload is invalid");
  } else {
    invalid("pilot case transition is invalid");
  }
  return Object.freeze(structuredClone(payload));
}
