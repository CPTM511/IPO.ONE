import {
  DomainError,
  assertFinalizedCreditOutcome,
  hashId
} from "../../../packages/domain/src/index.js";

export const CREDIT_STATE_PROJECTION_SCHEMA_VERSION =
  "credit_state_projection.v1";

const IMPACT_BY_OUTCOME = Object.freeze({
  on_time_repaid: "positive_repayment_history",
  late_or_modified_repaid: "modified_or_late_repayment_history",
  written_off: "loss_history"
});

function invalid(message) {
  throw new DomainError("invalid_credit_state_projection", message);
}

function compareOutcome(left, right) {
  return left.outcomeFinalizedAt.localeCompare(right.outcomeFinalizedAt) ||
    left.recordedAt.localeCompare(right.recordedAt) ||
    left.creditOutcomeId.localeCompare(right.creditOutcomeId);
}

function sumMinor(outcomes, key) {
  return outcomes.reduce((total, outcome) => total + BigInt(outcome[key]), 0n)
    .toString();
}

function factorState(counts, maximumDaysPastDue, outcomes) {
  const modified = outcomes.some(({ restructured, repurchased }) =>
    restructured || repurchased);
  return Object.freeze({
    repaymentReliability: counts.writtenOff > 0
      ? "adverse_loss_recorded"
      : counts.lateOrModifiedRepaid > 0
        ? "mixed_repayment_history"
        : "verified_on_time_history",
    servicingPerformance: maximumDaysPastDue > 0 || modified
      ? "delinquency_or_modification_recorded"
      : "no_delinquency_or_modification_recorded",
    lossExperience: counts.writtenOff > 0
      ? "loss_recorded"
      : "no_loss_recorded",
    evidenceBasis: "finalized_credit_outcomes_only",
    schemaVersion: "credit_state_factors.v1"
  });
}

export function createCreditStateProjection({ outcomes, updatedAt }) {
  if (!Array.isArray(outcomes) || outcomes.length < 1 || outcomes.length > 512) {
    invalid("one through 512 finalized outcomes are required");
  }
  const normalized = outcomes.map((outcome) =>
    structuredClone(assertFinalizedCreditOutcome(outcome))).sort(compareOutcome);
  const subjectId = normalized[0].subjectId;
  const principalId = normalized[0].principalId;
  if (normalized.some((outcome) =>
    outcome.subjectId !== subjectId || outcome.principalId !== principalId)) {
    invalid("all outcomes must bind one Subject and Principal");
  }
  const unique = new Set(normalized.map(({ creditOutcomeId }) => creditOutcomeId));
  if (unique.size !== normalized.length) invalid("duplicate outcomes are prohibited");
  const normalizedUpdatedAt = new Date(updatedAt).toISOString();
  if (normalizedUpdatedAt !== updatedAt) invalid("updatedAt must be canonical");

  const counts = Object.freeze({
    onTimeRepaid: normalized.filter(({ outcomeLabel }) =>
      outcomeLabel === "on_time_repaid").length,
    lateOrModifiedRepaid: normalized.filter(({ outcomeLabel }) =>
      outcomeLabel === "late_or_modified_repaid").length,
    writtenOff: normalized.filter(({ outcomeLabel }) =>
      outcomeLabel === "written_off").length
  });
  if (counts.onTimeRepaid + counts.lateOrModifiedRepaid + counts.writtenOff !==
      normalized.length) invalid("an outcome label is unsupported");
  const maximumDaysPastDue = Math.max(
    ...normalized.map(({ maxDaysPastDue }) => maxDaysPastDue)
  );
  const history = normalized.map((outcome) => Object.freeze({
    creditOutcomeId: outcome.creditOutcomeId,
    outcomeHash: outcome.outcomeHash,
    obligationId: outcome.obligationId,
    outcomeLabel: outcome.outcomeLabel,
    creditImpact: IMPACT_BY_OUTCOME[outcome.outcomeLabel],
    maxDaysPastDue: outcome.maxDaysPastDue,
    restructured: outcome.restructured,
    repurchased: outcome.repurchased,
    originalPrincipalMinor: outcome.originalPrincipalMinor,
    totalRepaidMinor: outcome.totalRepaidMinor,
    lossMinor: outcome.lossMinor,
    repaymentRatioBps: outcome.repaymentRatioBps,
    sourceEvidenceHashes: Object.freeze([...outcome.sourceEvidenceHashes]),
    outcomeFinalizedAt: outcome.outcomeFinalizedAt,
    recordedAt: outcome.recordedAt,
    schemaVersion: "credit_track_record_entry.v1"
  }));
  const latestOutcome = history.at(-1);
  const core = {
    subjectId,
    principalId,
    projectionVersion: normalized.length,
    metrics: {
      completedCycleCount: normalized.length,
      outcomeCounts: counts,
      maximumDaysPastDue,
      totalOriginalPrincipalMinor: sumMinor(normalized, "originalPrincipalMinor"),
      totalRepaidMinor: sumMinor(normalized, "totalRepaidMinor"),
      totalLossMinor: sumMinor(normalized, "lossMinor"),
      schemaVersion: "credit_state_metrics.v1"
    },
    factors: factorState(counts, maximumDaysPastDue, normalized),
    latestOutcome,
    trackRecord: history
  };
  const creditStateHash = hashId("credit_state_projection", core);
  return Object.freeze({
    creditStateHash,
    ...core,
    updatedAt,
    authorizing: false,
    automaticLimitChange: false,
    fundsAuthority: false,
    piiIncluded: false,
    productionAuthority: false,
    productionFundsMoved: false,
    rawTransactionDataIncluded: false,
    sandboxOnly: true,
    scoreAuthoritative: false,
    schemaVersion: CREDIT_STATE_PROJECTION_SCHEMA_VERSION
  });
}
