import {
  DEMO_HASH_ALGORITHM,
  DEMO_HASH_DOMAIN,
  createOperationalId,
  hashId
} from "../ids.js";
import {
  factorAssessment,
  weightedComposite
} from "./assessment-contract.js";
import {
  TRADING_CREDIT_ASSESSMENT_SCHEMA_VERSION
} from "./contracts.js";
import { assertPriorOutcomeSummary } from "./outcomes.js";
import { assertPolicy } from "./policy.js";
import { assertExistingProfile } from "./profile.js";
import {
  calculateSeriesMetrics,
  assertSupplement
} from "./supplemental-evidence.js";
import {
  BPS,
  decimalToMinor,
  fail,
  immutable,
  minBigInt,
  minor,
  observedDecimalFeature,
  ratioBps,
  timestamp
} from "./shared.js";

function evaluateSupplement({
  supplement,
  policy,
  assessmentTime,
  evidenceDeficiencies,
  eligibilityFailures
}) {
  if (!supplement) {
    evidenceDeficiencies.push("supplemental_evidence_unavailable");
    return {
      seriesMetrics: undefined,
      severeAnomalyCount: null
    };
  }
  const seriesMetrics = calculateSeriesMetrics(supplement.equitySeries);
  const assessmentTimeMs = assessmentTime.getTime();
  const firstObservedMs = new Date(
    supplement.equitySeries[0].observedAt
  ).getTime();
  const lastObservedMs = new Date(
    supplement.equitySeries.at(-1).observedAt
  ).getTime();
  const ageSeconds = Math.floor(
    (assessmentTimeMs - new Date(supplement.observedAt).getTime()) / 1_000
  );
  const lastEquityAgeSeconds = Math.floor(
    (assessmentTimeMs - lastObservedMs) / 1_000
  );
  const observationDays = Math.floor(
    (lastObservedMs - firstObservedMs) / 86_400_000
  );
  if (ageSeconds < 0 || lastEquityAgeSeconds < 0) {
    fail("assessment cannot precede supplemental Evidence");
  }
  if (ageSeconds > policy.thresholds.maximumEvidenceAgeSeconds) {
    evidenceDeficiencies.push("supplemental_evidence_stale");
  }
  if (lastEquityAgeSeconds > policy.thresholds.maximumEvidenceAgeSeconds) {
    evidenceDeficiencies.push("equity_series_stale");
  }
  if (
    supplement.equitySeries.length <
    policy.thresholds.minimumObservationCount
  ) {
    evidenceDeficiencies.push("observation_count_below_policy_minimum");
  }
  if (observationDays < policy.thresholds.minimumObservationDays) {
    evidenceDeficiencies.push("observation_window_below_policy_minimum");
  }
  if (
    seriesMetrics.maximumDrawdownBps >
    policy.thresholds.maximumDrawdownBps
  ) {
    eligibilityFailures.push("maximum_drawdown_above_shadow_limit");
  }
  if (
    seriesMetrics.p95LeverageBps >
    policy.thresholds.maximumP95LeverageBps
  ) {
    eligibilityFailures.push("p95_leverage_above_shadow_limit");
  }
  if (
    supplement.liquidationCount >
    policy.thresholds.maximumLiquidationCount
  ) {
    eligibilityFailures.push("liquidation_count_above_shadow_limit");
  }
  if (
    supplement.mandateBreachCount >
    policy.thresholds.maximumMandateBreachCount
  ) {
    eligibilityFailures.push("mandate_breach_count_above_shadow_limit");
  }
  const severeAnomalyCount = [
    supplement.integrityChecks.walletCluster,
    supplement.integrityChecks.selfTransfer,
    supplement.integrityChecks.washTrading
  ].filter((state) => state === "flagged").length;
  if (
    severeAnomalyCount >
    policy.thresholds.maximumSevereAnomalyCount
  ) {
    eligibilityFailures.push("severe_integrity_anomaly_above_shadow_limit");
  }
  return { seriesMetrics, severeAnomalyCount };
}

function evaluateBaseProfile({
  current,
  policy,
  assessmentTime,
  netRealizedPnlMinor,
  evidenceDeficiencies,
  eligibilityFailures
}) {
  if (current.historyImport.dataQuality?.freshness !== "fresh") {
    evidenceDeficiencies.push("base_profile_snapshot_stale");
  }
  const baseObservedAt =
    current.historyImport.reconciliation?.currentObservedAt;
  if (baseObservedAt === undefined) {
    evidenceDeficiencies.push("base_profile_observation_time_unavailable");
  } else {
    const baseAgeSeconds = Math.floor(
      (assessmentTime.getTime() -
        new Date(
          timestamp("baseProfile.currentObservedAt", baseObservedAt)
        ).getTime()) /
        1_000
    );
    if (baseAgeSeconds < 0) {
      fail("assessment cannot precede the base Profile Evidence");
    }
    if (baseAgeSeconds > policy.thresholds.maximumEvidenceAgeSeconds) {
      evidenceDeficiencies.push("base_profile_snapshot_stale");
    }
  }
  if (netRealizedPnlMinor === null) {
    evidenceDeficiencies.push("net_realized_pnl_unavailable");
  } else if (netRealizedPnlMinor <= 0n) {
    eligibilityFailures.push("net_realized_pnl_not_positive");
  }
}

function calculateCapacity({
  supplement,
  seriesMetrics,
  netRealizedPnlMinor,
  policy,
  outstanding
}) {
  const grossCapacity =
    supplement && seriesMetrics && netRealizedPnlMinor !== null
      ? minBigInt([
          BigInt(policy.productCapMinor),
          (seriesMetrics.equityP10Minor *
            BigInt(policy.capacity.equityP10MultiplierBps)) /
            BPS,
          ((netRealizedPnlMinor > 0n ? netRealizedPnlMinor : 0n) *
            BigInt(policy.capacity.positiveNetPnlMultiplierBps)) /
            BPS,
          BigInt(supplement.repaymentCashflowCapacityMinor)
        ])
      : 0n;
  const recommendedLimit =
    grossCapacity > outstanding ? grossCapacity - outstanding : 0n;
  return { grossCapacity, recommendedLimit };
}

function createFeatureSnapshot({
  netRealizedPnlMinor,
  positiveFillRateBps,
  supplement,
  seriesMetrics,
  severeAnomalyCount,
  summary,
  priorDefaultRateBps,
  priorLateRateBps,
  evaluatedAt
}) {
  return {
    netRealizedPnlMinor:
      netRealizedPnlMinor === null ? null : netRealizedPnlMinor.toString(),
    positiveFillRateBps,
    observationCount: supplement?.equitySeries.length ?? 0,
    equityP10Minor:
      seriesMetrics?.equityP10Minor.toString() ?? null,
    maximumDrawdownBps: seriesMetrics?.maximumDrawdownBps ?? null,
    p95LeverageBps: seriesMetrics?.p95LeverageBps ?? null,
    positivePeriodRateBps:
      seriesMetrics?.positivePeriodRateBps ?? null,
    liquidationCount: supplement?.liquidationCount ?? null,
    mandateBreachCount: supplement?.mandateBreachCount ?? null,
    severeAnomalyCount,
    priorCompletedOutcomeCount: summary?.completedCount ?? 0,
    priorDefaultRateBps,
    priorLateOrModifiedRateBps: priorLateRateBps,
    pointInTimeAt: evaluatedAt,
    futureOutcomeDataIncluded: false,
    schemaVersion: "trading_credit_feature_snapshot.v1"
  };
}

function createFactors({
  policy,
  supplement,
  seriesMetrics,
  netRealizedPnlMinor,
  positiveFillRateBps,
  recommendedLimit,
  featureSnapshot,
  priorDefaultRateBps,
  priorLateRateBps
}) {
  const evidenceScore = supplement ? 10_000 : null;
  const alphaScore =
    netRealizedPnlMinor !== null &&
    positiveFillRateBps !== null &&
    seriesMetrics
      ? Math.min(
          10_000,
          (netRealizedPnlMinor > 0n ? 5_000 : 0) +
            Math.floor(seriesMetrics.positivePeriodRateBps / 2)
        )
      : null;
  const riskScore = seriesMetrics
    ? Math.max(
        0,
        10_000 -
          Math.min(
            5_000,
            Math.floor(
              (seriesMetrics.maximumDrawdownBps * 5_000) /
                policy.thresholds.maximumDrawdownBps
            )
          ) -
          Math.min(
            5_000,
            Math.floor(
              (seriesMetrics.p95LeverageBps * 5_000) /
                policy.thresholds.maximumP95LeverageBps
            )
          )
      )
    : null;
  const capacityScore = supplement
    ? recommendedLimit > 0n
      ? 10_000
      : 0
    : null;
  const mandateScore = supplement
    ? supplement.mandateBreachCount === 0 &&
      featureSnapshot.severeAnomalyCount === 0
      ? 10_000
      : 0
    : null;
  const repaymentScore =
    priorDefaultRateBps === null || priorLateRateBps === null
      ? null
      : Math.max(
          0,
          10_000 - priorDefaultRateBps - Math.floor(priorLateRateBps / 2)
        );
  const weights = policy.factorWeightsBps;
  return [
    factorAssessment(
      "evidence_confidence",
      evidenceScore,
      weights.evidenceConfidence,
      supplement
        ? ["finalized_reconciled_supplemental_evidence"]
        : ["supplemental_evidence_unavailable"]
    ),
    factorAssessment(
      "alpha_quality",
      alphaScore,
      weights.alphaQuality,
      alphaScore === null
        ? ["alpha_inputs_incomplete"]
        : ["positive_pnl_and_period_consistency_formula"]
    ),
    factorAssessment(
      "risk_reliability",
      riskScore,
      weights.riskReliability,
      riskScore === null
        ? ["equity_or_leverage_series_unavailable"]
        : ["drawdown_and_p95_leverage_formula"]
    ),
    factorAssessment(
      "strategy_capacity",
      capacityScore,
      weights.strategyCapacity,
      supplement
        ? ["minimum_of_visible_capacity_constraints"]
        : ["capacity_inputs_unavailable"]
    ),
    factorAssessment(
      "mandate_compliance",
      mandateScore,
      weights.mandateCompliance,
      supplement
        ? ["mandate_and_integrity_checks_evaluated"]
        : ["mandate_and_integrity_checks_unavailable"]
    ),
    factorAssessment(
      "repayment_history",
      repaymentScore,
      weights.repaymentHistory,
      repaymentScore === null
        ? ["no_completed_prior_outcome_history"]
        : ["prior_finalized_outcomes_only"]
    )
  ];
}

export function createTradingCreditAssessment({
  profile,
  policy: inputPolicy,
  supplementalEvidence,
  currentOutstandingMinor = "0",
  priorOutcomeSummary,
  evaluatedAt
}) {
  const current = assertExistingProfile(profile);
  const policy = assertPolicy(inputPolicy);
  const assessmentTime = new Date(timestamp("evaluatedAt", evaluatedAt));
  if (assessmentTime < new Date(policy.validFrom)) {
    fail("assessment predates the Shadow Policy");
  }
  const outstanding = minor(
    "currentOutstandingMinor",
    currentOutstandingMinor
  );
  const summary = assertPriorOutcomeSummary(
    priorOutcomeSummary,
    assessmentTime,
    policy.assetId,
    current.subjectId,
    current.principalId
  );
  const supplement =
    supplementalEvidence === undefined
      ? undefined
      : assertSupplement(supplementalEvidence, current, policy);
  const netRealizedPnl = observedDecimalFeature(
    current,
    "net_realized_pnl"
  );
  const positiveFillRate = observedDecimalFeature(
    current,
    "positive_realized_fill_rate"
  );
  const netRealizedPnlMinor =
    netRealizedPnl === null
      ? null
      : decimalToMinor(
          "net_realized_pnl",
          netRealizedPnl,
          policy.assetDecimals
        );
  const positiveFillRateBps =
    positiveFillRate === null
      ? null
      : ratioBps(
          decimalToMinor("positive_realized_fill_rate", positiveFillRate, 18),
          10n ** 18n,
          { cap: 10_000 }
        );
  const evidenceDeficiencies = [];
  const eligibilityFailures = [];
  const { seriesMetrics, severeAnomalyCount } = evaluateSupplement({
    supplement,
    policy,
    assessmentTime,
    evidenceDeficiencies,
    eligibilityFailures
  });
  evaluateBaseProfile({
    current,
    policy,
    assessmentTime,
    netRealizedPnlMinor,
    evidenceDeficiencies,
    eligibilityFailures
  });
  const { grossCapacity, recommendedLimit } = calculateCapacity({
    supplement,
    seriesMetrics,
    netRealizedPnlMinor,
    policy,
    outstanding
  });
  if (
    evidenceDeficiencies.length === 0 &&
    recommendedLimit === 0n
  ) {
    eligibilityFailures.push("capacity_exhausted_or_zero");
  }
  const priorDefaultRateBps =
    summary && summary.completedCount > 0
      ? ratioBps(
          BigInt(summary.writtenOffCount),
          BigInt(summary.completedCount),
          { cap: 10_000 }
        )
      : null;
  const priorLateRateBps =
    summary && summary.completedCount > 0
      ? ratioBps(
          BigInt(summary.lateOrModifiedRepaidCount),
          BigInt(summary.completedCount),
          { cap: 10_000 }
        )
      : null;
  const featureSnapshot = createFeatureSnapshot({
    netRealizedPnlMinor,
    positiveFillRateBps,
    supplement,
    seriesMetrics,
    severeAnomalyCount,
    summary,
    priorDefaultRateBps,
    priorLateRateBps,
    evaluatedAt
  });
  const factors = createFactors({
    policy,
    supplement,
    seriesMetrics,
    netRealizedPnlMinor,
    positiveFillRateBps,
    recommendedLimit,
    featureSnapshot,
    priorDefaultRateBps,
    priorLateRateBps
  });
  const compositeScoreBps = weightedComposite(factors);
  featureSnapshot.compositeScoreBps = compositeScoreBps;
  const status =
    evidenceDeficiencies.length > 0
      ? "insufficient_evidence"
      : eligibilityFailures.length > 0
        ? "ineligible_shadow"
        : "eligible_shadow";
  const sourceEvidenceHashes = [
    ...new Set([
      current.accountBinding.accountBindingHash,
      current.historyImport.historyHash,
      current.evidenceSnapshot.snapshotHash,
      current.factorScorecard.shadowRisk.shadowRiskProfileHash,
      ...(supplement ? [supplement.supplementalEvidenceHash] : []),
      ...(summary ? [summary.summaryHash] : [])
    ])
  ].sort();
  const evidenceRoot = hashId(
    "trading_credit_evidence_root",
    sourceEvidenceHashes
  );
  const featureSnapshotHash = hashId(
    "trading_credit_feature_snapshot",
    featureSnapshot
  );
  const capacity = {
    productCapMinor: policy.productCapMinor,
    equityP10ConstraintMinor:
      seriesMetrics === undefined
        ? null
        : (
            (seriesMetrics.equityP10Minor *
              BigInt(policy.capacity.equityP10MultiplierBps)) /
            BPS
          ).toString(),
    positiveNetPnlConstraintMinor:
      netRealizedPnlMinor === null
        ? null
        : (
            ((netRealizedPnlMinor > 0n ? netRealizedPnlMinor : 0n) *
              BigInt(policy.capacity.positiveNetPnlMultiplierBps)) /
            BPS
          ).toString(),
    repaymentCashflowConstraintMinor:
      supplement?.repaymentCashflowCapacityMinor ?? null,
    grossLimitMinor: grossCapacity.toString(),
    currentOutstandingMinor: outstanding.toString(),
    recommendedLimitMinor:
      status === "eligible_shadow" ? recommendedLimit.toString() : "0",
    authorizing: false,
    schemaVersion: "trading_credit_capacity_recommendation.v1"
  };
  const assessmentCore = {
    subjectId: current.subjectId,
    principalId: current.principalId,
    accountReferenceHash: current.accountReferenceHash,
    accountBindingHash: current.accountBinding.accountBindingHash,
    assetId: policy.assetId,
    policyHash: policy.policyHash,
    evidenceRoot,
    featureSnapshotHash,
    status,
    evidenceDeficiencies: [...new Set(evidenceDeficiencies)].sort(),
    eligibilityFailures: [...new Set(eligibilityFailures)].sort(),
    factors,
    compositeScoreBps,
    capacity,
    evaluatedAt
  };
  const assessmentHash = hashId(
    "trading_credit_assessment",
    assessmentCore
  );
  const creditStateHash = hashId("trading_credit_state", {
    assessmentHash,
    status,
    recommendedLimitMinor: capacity.recommendedLimitMinor,
    policyHash: policy.policyHash
  });
  return immutable({
    assessmentId: createOperationalId("trading_credit_assessment"),
    assessmentHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    accountReferenceHash: current.accountReferenceHash,
    accountBindingHash: current.accountBinding.accountBindingHash,
    assetId: policy.assetId,
    policy,
    status,
    evidenceDeficiencies: assessmentCore.evidenceDeficiencies,
    eligibilityFailures: assessmentCore.eligibilityFailures,
    featureSnapshot,
    featureSnapshotHash,
    factors,
    compositeScoreBps,
    compositeScoreAuthorizing: false,
    capacity,
    proofBundle: {
      evidenceRoot,
      sourceEvidenceHashes,
      featureSnapshotHash,
      policyHash: policy.policyHash,
      assessmentHash,
      creditStateHash,
      hashAlgorithm: DEMO_HASH_ALGORITHM,
      hashDomain: DEMO_HASH_DOMAIN,
      bytes32Compatible: true,
      onchainRecomputationClaimed: false,
      verificationMode: "offchain_recompute_plus_testnet_anchor",
      schemaVersion: "trading_credit_proof_bundle.v1"
    },
    evaluatedAt,
    testnetOnly: true,
    shadowOnly: true,
    authorizing: false,
    creditApproval: false,
    fundsAuthority: false,
    economicStateMutation: false,
    productionAuthority: false,
    modelOutput: false,
    recommendationOnly: true,
    schemaVersion: TRADING_CREDIT_ASSESSMENT_SCHEMA_VERSION
  });
}
