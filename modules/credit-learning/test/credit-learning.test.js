import assert from "node:assert/strict";
import test from "node:test";
import {
  CreditLearningSignalType,
  createFinalizedCreditOutcome,
  hashId
} from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import {
  CreditLearningService,
  createCreditStateProjection
} from "../src/index.js";

function finalizedOutcome({
  sequence,
  status = "fully_repaid",
  maxDaysPastDue = 0,
  restructured = false,
  recordedAt = `2026-08-${String(sequence).padStart(2, "0")}T12:00:00.000Z`
}) {
  const subjectId = "subject_projection_test";
  const principalId = "principal_projection_test";
  const obligationId = `obligation_projection_${sequence}`;
  const riskDecisionId = `risk_decision_projection_${sequence}`;
  const decisionHash = hashId("projection_test_decision", { sequence });
  const featureSnapshotHash = hashId("projection_test_features", { sequence });
  const policyHash = hashId("projection_test_policy", { sequence });
  const originalPrincipalMinor = "12000";
  return createFinalizedCreditOutcome({
    decision: {
      riskDecisionId,
      decisionHash,
      subjectId,
      principalId,
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      status: "approved",
      policyHash,
      featureSnapshotHash,
      riskFeatureSnapshot: {
        featureSnapshotHash,
        policyHash,
        sandboxOnly: true,
        productionAuthority: false,
        schemaVersion: "risk_feature_snapshot.v1"
      },
      decisionPassport: {
        riskDecisionId,
        decisionHash,
        featureSnapshotHash,
        policyHash,
        decisionPassportHash: hashId("projection_test_passport", { sequence }),
        schemaVersion: "risk_decision_passport.v1"
      },
      sandboxOnly: true,
      productionAuthority: false,
      schemaVersion: "risk_decision.v3"
    },
    obligation: {
      obligationId,
      obligationHash: hashId("projection_test_obligation", { sequence }),
      riskDecisionId,
      subjectId,
      principalId,
      assetId: "urn:ipo-one:sandbox-asset:usd-cent",
      originalPrincipalMinor,
      totalRepaidMinor: status === "written_off" ? "4000" : originalPrincipalMinor,
      outstandingPrincipalMinor: status === "written_off" ? "8000" : "0",
      outstandingInterestMinor: "0",
      outstandingFeesMinor: "0",
      writtenOffPrincipalMinor: status === "written_off" ? "8000" : "0",
      writtenOffInterestMinor: "0",
      writtenOffFeesMinor: "0",
      status,
      executionStatus: "executed",
      sandboxOnly: true,
      productionFundsMoved: false,
      updatedAt: recordedAt,
      schemaVersion: "obligation.v2"
    },
    servicingSummary: {
      maxDaysPastDue,
      restructured,
      repurchased: false,
      outcomeFinalizedAt: recordedAt
    },
    sourceEvidenceHashes: [
      hashId("projection_test_evidence", { sequence, item: 1 }),
      hashId("projection_test_evidence", { sequence, item: 2 })
    ],
    recordedAt
  });
}

test("credit learning creates explainable profile and healthy cycle improves terms", () => {
  const store = new EventStore();
  const service = new CreditLearningService({ eventStore: store });
  service.createProfile({ subjectId: "subject_1", initialScore: 500, currentCreditLimitMinor: "1000" });

  const result = service.runHealthyCycle("subject_1", {
    currentCreditLimitMinor: "1000",
    currentDemoInterestRateBps: 2800
  });

  assert.equal(result.profile.currentScore, 585);
  assert.equal(result.profile.riskTier, "standard");
  assert.equal(result.limitRecommendation.recommendedLimitMinor, "1100");
  assert.equal(result.interestRateRecommendation.recommendedDemoInterestRateBps, 1800);
  assert.equal(result.signals.length, 5);
  assert.equal(store.listCreditEvents({ subjectId: "subject_1" }).some((event) => event.eventType === "credit_score_updated"), true);
});

test("risky and recovery cycles degrade then partially restore score", () => {
  const service = new CreditLearningService({ eventStore: new EventStore() });
  service.createProfile({ subjectId: "subject_1", initialScore: 500, currentCreditLimitMinor: "1000" });
  const healthy = service.runHealthyCycle("subject_1", { currentCreditLimitMinor: "1000" });
  const risky = service.runRiskyCycle("subject_1", { currentCreditLimitMinor: healthy.profile.recommendedNextCreditLimitMinor });
  const recovery = service.runRecoveryCycle("subject_1", { currentCreditLimitMinor: risky.profile.recommendedNextCreditLimitMinor });

  assert.equal(healthy.profile.currentScore, 585);
  assert.equal(risky.profile.currentScore, 510);
  assert.equal(risky.profile.riskTier, "watch");
  assert.equal(recovery.profile.currentScore, 560);
  assert.equal(recovery.profile.riskTier, "standard");
});

test("manual evaluation rejects unknown signals", () => {
  const service = new CreditLearningService({ eventStore: new EventStore() });
  service.createProfile({ subjectId: "subject_1" });

  assert.throws(
    () =>
      service.evaluate({
        subjectId: "subject_1",
        signals: ["opaque_ai_score"],
        currentCreditLimitMinor: "1000"
      }),
    /unknown_reputation_signal/
  );

  const result = service.evaluate({
    subjectId: "subject_1",
    signals: [CreditLearningSignalType.DEFAULT_EVENT],
    currentCreditLimitMinor: "1000"
  });
  assert.equal(result.profile.currentScore, 380);
  assert.equal(result.profile.riskTier, "restricted");
});

test("empty evaluations do not manufacture positive behavior", () => {
  const service = new CreditLearningService({ eventStore: new EventStore() });
  service.createProfile({ subjectId: "subject_1", initialScore: 500, currentCreditLimitMinor: "1000" });

  const result = service.evaluate({
    subjectId: "subject_1",
    signals: [],
    currentCreditLimitMinor: "1000"
  });

  assert.equal(result.profile.currentScore, 500);
  assert.equal(result.signals.length, 0);
});

test("score events record the applied delta after score clamping", () => {
  const service = new CreditLearningService({ eventStore: new EventStore() });
  service.createProfile({ subjectId: "subject_1", initialScore: 840, currentCreditLimitMinor: "1000" });

  const result = service.evaluate({
    subjectId: "subject_1",
    signals: [CreditLearningSignalType.ON_TIME_REPAYMENT],
    currentCreditLimitMinor: "1000"
  });

  assert.equal(result.profile.currentScore, 850);
  assert.equal(result.signals[0].scoreDelta, 10);
});

test("Credit State projects finalized outcomes without granting authority", () => {
  const outcomes = [
    finalizedOutcome({ sequence: 1 }),
    finalizedOutcome({ sequence: 2, maxDaysPastDue: 4, restructured: true }),
    finalizedOutcome({ sequence: 3, status: "written_off", maxDaysPastDue: 95 })
  ];
  const projection = createCreditStateProjection({
    outcomes,
    updatedAt: outcomes.at(-1).recordedAt
  });

  assert.equal(projection.metrics.completedCycleCount, 3);
  assert.deepEqual(projection.metrics.outcomeCounts, {
    onTimeRepaid: 1,
    lateOrModifiedRepaid: 1,
    writtenOff: 1
  });
  assert.equal(projection.metrics.maximumDaysPastDue, 95);
  assert.equal(projection.metrics.totalLossMinor, "8000");
  assert.equal(projection.factors.repaymentReliability, "adverse_loss_recorded");
  assert.equal(projection.latestOutcome.outcomeLabel, "written_off");
  assert.deepEqual(
    projection.trackRecord.map(({ creditImpact }) => creditImpact),
    [
      "positive_repayment_history",
      "modified_or_late_repayment_history",
      "loss_history"
    ]
  );
  assert.equal(projection.authorizing, false);
  assert.equal(projection.automaticLimitChange, false);
  assert.equal(projection.scoreAuthoritative, false);
  assert.equal(projection.productionFundsMoved, false);
});

test("Credit State replay is deterministic and rejects duplicates", () => {
  const first = finalizedOutcome({ sequence: 1 });
  const second = finalizedOutcome({ sequence: 2, maxDaysPastDue: 2 });
  const ordered = createCreditStateProjection({
    outcomes: [first, second],
    updatedAt: second.recordedAt
  });
  const replayed = createCreditStateProjection({
    outcomes: [second, first],
    updatedAt: second.recordedAt
  });

  assert.deepEqual(replayed, ordered);
  assert.throws(
    () => createCreditStateProjection({
      outcomes: [first, first],
      updatedAt: first.recordedAt
    }),
    (error) => error?.code === "invalid_credit_state_projection"
  );
});
