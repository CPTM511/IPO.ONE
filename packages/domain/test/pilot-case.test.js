import test from "node:test";
import assert from "node:assert/strict";
import {
  PilotCaseCorrectionCode,
  PilotCaseReasonCode,
  PilotCaseStatus,
  PilotCaseTargetType,
  PilotCaseTransition,
  assignPilotCase,
  createPilotCase,
  isPilotCase,
  normalizePilotCaseFilePayload,
  normalizePilotCaseTransitionPayload,
  resolvePilotCase
} from "../src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;

function filedCase() {
  return createPilotCase({
    pilotCaseId: "pilot_case_001",
    subjectId: "subject_001",
    entryMode: "human",
    filerActorRefHash: HASH_A,
    targetType: PilotCaseTargetType.DECISION,
    targetId: "risk_decision_001",
    targetRefHash: HASH_B,
    reasonCode: PilotCaseReasonCode.RECORD_INACCURATE,
    eventId: "event_case_filed_001",
    now: new Date("2026-08-29T00:00:00.000Z")
  });
}

test("pilot case preserves immutable target truth through additive correction", () => {
  const filed = filedCase();
  const assigned = assignPilotCase(filed, {
    ownerActorRefHash: HASH_B,
    operatorActorRefHash: HASH_B,
    eventId: "event_case_assigned_001",
    now: new Date("2026-08-29T00:01:00.000Z")
  });
  const resolved = resolvePilotCase(assigned, {
    resolution: PilotCaseTransition.CORRECT,
    correctionCode: PilotCaseCorrectionCode.RECORD_VERSION_ADDED,
    resolverActorRefHash: HASH_B,
    eventId: "event_case_resolved_001",
    now: new Date("2026-08-29T00:02:00.000Z")
  });

  assert.equal(resolved.status, PilotCaseStatus.RESOLVED_CORRECTED);
  assert.equal(resolved.targetId, filed.targetId);
  assert.equal(resolved.targetRefHash, filed.targetRefHash);
  assert.equal(resolved.correction.originalTargetRefHash, filed.targetRefHash);
  assert.equal(resolved.correction.additiveOnly, true);
  assert.equal(resolved.correction.originalRecordImmutable, true);
  assert.equal(resolved.economicMutationAuthorized, false);
  assert.equal(resolved.sequence, 3);
  assert.equal(resolved.history.length, 3);
  assert.equal(isPilotCase(resolved), true);
});

test("pilot case payloads are closed and reject free text", () => {
  assert.deepEqual(normalizePilotCaseFilePayload({
    targetType: PilotCaseTargetType.PAYMENT,
    targetId: "repayment_001",
    reasonCode: PilotCaseReasonCode.PAYMENT_MISMATCH,
    schemaVersion: "pilot_case_file.v1"
  }), {
    targetType: PilotCaseTargetType.PAYMENT,
    targetId: "repayment_001",
    reasonCode: PilotCaseReasonCode.PAYMENT_MISMATCH,
    schemaVersion: "pilot_case_file.v1"
  });
  assert.throws(() => normalizePilotCaseFilePayload({
    targetType: PilotCaseTargetType.PAYMENT,
    targetId: "repayment_001",
    reasonCode: PilotCaseReasonCode.PAYMENT_MISMATCH,
    summary: "free text",
    schemaVersion: "pilot_case_file.v1"
  }), /closed contract/);
  assert.throws(() => normalizePilotCaseTransitionPayload({
    transition: PilotCaseTransition.CORRECT,
    correctionCode: "custom_text",
    schemaVersion: "pilot_case_transition.v1"
  }), /correction payload/);
});

test("pilot case cannot resolve before assignment or rewrite after resolution", () => {
  const filed = filedCase();
  assert.throws(() => resolvePilotCase(filed, {
    resolution: PilotCaseTransition.UPHOLD,
    resolverActorRefHash: HASH_B,
    eventId: "event_case_resolved_early",
    now: new Date("2026-08-29T00:01:00.000Z")
  }), /only an assigned/);
  const assigned = assignPilotCase(filed, {
    ownerActorRefHash: HASH_B,
    operatorActorRefHash: HASH_B,
    eventId: "event_case_assigned_002",
    now: new Date("2026-08-29T00:01:00.000Z")
  });
  const resolved = resolvePilotCase(assigned, {
    resolution: PilotCaseTransition.UPHOLD,
    resolverActorRefHash: HASH_B,
    eventId: "event_case_resolved_002",
    now: new Date("2026-08-29T00:02:00.000Z")
  });
  assert.equal(resolved.status, PilotCaseStatus.RESOLVED_UPHELD);
  assert.throws(() => assignPilotCase(resolved, {
    ownerActorRefHash: HASH_B,
    operatorActorRefHash: HASH_B,
    eventId: "event_case_reassigned",
    now: new Date("2026-08-29T00:03:00.000Z")
  }), /only an open/);
});
