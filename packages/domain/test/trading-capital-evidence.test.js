import test from "node:test";
import assert from "node:assert/strict";
import {
  PrincipalStatus,
  PrincipalType,
  SubjectStatus,
  SubjectType,
  createTradingAccountBindingChallenge,
  finalizeTradingEvidenceSnapshot,
  importSyntheticTradingHistory
} from "../src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;

function subject(subjectType = SubjectType.HUMAN) {
  return {
    subjectId: `${subjectType}_subject_1`,
    subjectType,
    primaryPrincipalId: "principal_1",
    status: SubjectStatus.ACTIVE
  };
}

const principal = {
  principalId: "principal_1",
  principalType: PrincipalType.ORGANIZATION,
  status: PrincipalStatus.ACTIVE
};

function lifecycle(subjectType = SubjectType.HUMAN) {
  const challenge = createTradingAccountBindingChallenge({
    tenantId: "tenant_1",
    subject: subject(subjectType),
    principal,
    requestedByActorId: "actor_1",
    challengeNonce: HASH_A,
    now: new Date("2026-07-25T00:00:00.000Z")
  });
  const imported = importSyntheticTradingHistory({
    profile: challenge,
    requestedByActorId: "actor_1",
    challengeEventId: "event_challenge_1",
    challengeEvidenceHash: HASH_B,
    now: new Date("2026-07-25T00:01:00.000Z")
  });
  const finalized = finalizeTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH_C,
    historyImportEventId: "event_import_1",
    historyImportEvidenceHash: HASH_A,
    sourceFinality: "finalized",
    now: new Date("2026-07-25T00:02:00.000Z")
  });
  return { challenge, imported, finalized };
}

test("Trading Capital Evidence creates a closed no-funds Human lifecycle", () => {
  const { challenge, imported, finalized } = lifecycle();
  assert.equal(challenge.operatorType, "human_trader");
  assert.equal(imported.historyImport.fixtureId, "tc_synthetic_human_history_v1");
  assert.equal(imported.historyImport.dataQuality.freshness, "unknown");
  assert.equal(finalized.factorScorecard.factors.length, 5);
  assert.deepEqual(finalized.evidenceSnapshot.sourceEventIds, [
    "event_challenge_1",
    "event_import_1"
  ]);
  assert.equal(finalized.factorScorecard.compositeScore.available, false);
  assert.equal(finalized.factorScorecard.creditDecision.performed, false);
  assert.equal(finalized.factorScorecard.recommendedLimit.available, false);
  assert.equal(finalized.factorScorecard.pricing.available, false);
  assert.equal(finalized.externalSystemQueried, false);
  assert.equal(finalized.fundsAuthority, false);
});

test("Trading Capital Evidence preserves Agent Principal semantics", () => {
  const { finalized } = lifecycle(SubjectType.AGENT);
  assert.equal(finalized.operatorType, "agent_operator");
  assert.equal(finalized.historyImport.fixtureId, "tc_synthetic_agent_history_v1");
});

test("Trading Capital Evidence rejects actor replay, expiry, and non-final lineage", () => {
  const { challenge, imported } = lifecycle();
  assert.throws(
    () =>
      importSyntheticTradingHistory({
        profile: challenge,
        requestedByActorId: "actor_2",
        challengeEventId: "event_2",
        challengeEvidenceHash: HASH_B,
        now: new Date("2026-07-25T00:01:00.000Z")
      }),
    /not current/
  );
  assert.throws(
    () =>
      importSyntheticTradingHistory({
        profile: challenge,
        requestedByActorId: "actor_1",
        challengeEventId: "event_2",
        challengeEvidenceHash: HASH_B,
        now: new Date("2026-07-25T00:06:00.000Z")
      }),
    /not current/
  );
  assert.throws(
    () =>
      finalizeTradingEvidenceSnapshot({
        profile: imported,
        sourceProjectionHash: HASH_C,
        historyImportEventId: "event_2",
        historyImportEvidenceHash: HASH_A,
        sourceFinality: "pending"
      }),
    /must be finalized/
  );
});
