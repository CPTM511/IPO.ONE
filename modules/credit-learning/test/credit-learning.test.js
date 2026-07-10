import assert from "node:assert/strict";
import test from "node:test";
import { CreditLearningSignalType } from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { CreditLearningService } from "../src/index.js";

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
