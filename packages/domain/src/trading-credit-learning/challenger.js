import { createOperationalId, hashId } from "../ids.js";
import { TRADING_CREDIT_CHALLENGER_SCHEMA_VERSION } from "./contracts.js";
import { assertOutcome } from "./outcomes.js";
import { assertPolicy } from "./policy.js";
import {
  fail,
  immutable,
  ratioBps,
  safeId,
  timestamp
} from "./shared.js";

const CALIBRATION_BAND_IDS = Object.freeze([
  "0_3999",
  "4000_5999",
  "6000_7999",
  "8000_10000"
]);

function calibrationBand(score) {
  if (score === null || score < 4_000) {
    return "0_3999";
  }
  if (score < 6_000) {
    return "4000_5999";
  }
  if (score < 8_000) {
    return "6000_7999";
  }
  return "8000_10000";
}

export function evaluateTradingCreditChallenger({
  outcomes,
  policy: inputPolicy,
  candidateVersion,
  evaluatedAt
}) {
  if (!Array.isArray(outcomes) || outcomes.length > 100_000) {
    fail("outcomes are invalid");
  }

  const policy = assertPolicy(inputPolicy);
  safeId("candidateVersion", candidateVersion);
  const normalizedEvaluatedAt = timestamp("evaluatedAt", evaluatedAt);
  const evaluatedAtMs = new Date(normalizedEvaluatedAt).getTime();
  const normalized = outcomes.map(assertOutcome);

  if (
    new Set(normalized.map((outcome) => outcome.outcomeHash)).size !==
    normalized.length
  ) {
    fail("challenger outcomes contain duplicates");
  }

  let defaultCount = 0;
  let lateOrModifiedCount = 0;
  const calibrationCounts = new Map(
    CALIBRATION_BAND_IDS.map((bandId) => [
      bandId,
      { completedCount: 0, defaultCount: 0 }
    ])
  );

  for (const outcome of normalized) {
    if (
      outcome.assetId !== policy.assetId ||
      outcome.policyHash !== policy.policyHash ||
      new Date(outcome.recordedAt).getTime() > evaluatedAtMs
    ) {
      fail(
        "challenger outcome policy, asset, or point-in-time binding is invalid"
      );
    }

    if (outcome.defaulted) {
      defaultCount += 1;
    }
    if (outcome.outcomeLabel === "late_or_modified_repaid") {
      lateOrModifiedCount += 1;
    }

    const bandId = calibrationBand(
      outcome.decisionFeatureSnapshot.compositeScoreBps ?? null
    );
    const counts = calibrationCounts.get(bandId);
    counts.completedCount += 1;
    if (outcome.defaulted) {
      counts.defaultCount += 1;
    }
  }

  const posteriorDefaultBps = ratioBps(
    BigInt(defaultCount + policy.challengerPrior.defaultCount),
    BigInt(
      normalized.length +
        policy.challengerPrior.defaultCount +
        policy.challengerPrior.nonDefaultCount
    ),
    { cap: 10_000 }
  );
  const enoughSample =
    normalized.length >=
    policy.thresholds.minimumCompletedOutcomesForChallenger;
  const recommendation = !enoughSample
    ? "insufficient_sample"
    : posteriorDefaultBps >=
        policy.thresholds.challengerDefaultReviewBps
      ? "tighten_review"
      : "hold_review";
  const calibrationBands = CALIBRATION_BAND_IDS.map((bandId) => {
    const counts = calibrationCounts.get(bandId);
    return {
      bandId,
      completedCount: counts.completedCount,
      defaultCount: counts.defaultCount,
      posteriorDefaultBps: ratioBps(
        BigInt(
          counts.defaultCount + policy.challengerPrior.defaultCount
        ),
        BigInt(
          counts.completedCount +
            policy.challengerPrior.defaultCount +
            policy.challengerPrior.nonDefaultCount
        ),
        { cap: 10_000 }
      ),
      schemaVersion: "trading_credit_calibration_band.v1"
    };
  });
  const reportCore = {
    candidateVersion,
    policyHash: policy.policyHash,
    sourceOutcomeHashes: normalized
      .map((outcome) => outcome.outcomeHash)
      .sort(),
    completedOutcomeCount: normalized.length,
    defaultCount,
    lateOrModifiedCount,
    posteriorDefaultBps,
    calibrationBands,
    recommendation,
    proposedCapacityMultiplierBps:
      recommendation === "tighten_review" ? 8_000 : 10_000,
    evaluatedAt: normalizedEvaluatedAt
  };

  return immutable({
    challengerReportId: createOperationalId(
      "trading_credit_challenger_report"
    ),
    challengerReportHash: hashId(
      "trading_credit_challenger_report",
      reportCore
    ),
    candidateVersion,
    baselinePolicyHash: policy.policyHash,
    assetId: policy.assetId,
    sourceOutcomeHashes: reportCore.sourceOutcomeHashes,
    completedOutcomeCount: normalized.length,
    defaultCount,
    lateOrModifiedCount,
    posteriorDefaultBps,
    calibrationBands,
    recommendation,
    proposedCapacityMultiplierBps:
      reportCore.proposedCapacityMultiplierBps,
    shadowOnly: true,
    promotionAllowed: false,
    autoApplied: false,
    autoLooseningAllowed: false,
    requiresNamedHumanReview: true,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false,
    productionAuthority: false,
    evaluatedAt: normalizedEvaluatedAt,
    schemaVersion: TRADING_CREDIT_CHALLENGER_SCHEMA_VERSION
  });
}
