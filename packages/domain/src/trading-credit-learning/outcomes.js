import { ObligationStatus } from "../enums.js";
import { createOperationalId, hashId } from "../ids.js";
import { assessmentSafety } from "./assessment-contract.js";
import {
  TRADING_CREDIT_OUTCOME_SCHEMA_VERSION,
  TRADING_CREDIT_PRIOR_OUTCOME_SUMMARY_SCHEMA_VERSION
} from "./contracts.js";
import {
  assetId,
  exactObject,
  fail,
  hash,
  immutable,
  minor,
  nonNegativeInteger,
  plainObject,
  ratioBps,
  safeId,
  timestamp,
  uniqueHashes
} from "./shared.js";

export function assertPriorOutcomeSummary(
  value,
  assessmentTime,
  asset,
  subjectId,
  principalId
) {
  if (value === undefined) return undefined;
  exactObject("priorOutcomeSummary", value, [
    "summaryId",
    "summaryHash",
    "subjectId",
    "principalId",
    "assetId",
    "asOf",
    "sourceOutcomeHashes",
    "completedCount",
    "onTimeRepaidCount",
    "lateOrModifiedRepaidCount",
    "writtenOffCount",
    "totalPrincipalMinor",
    "totalLossMinor",
    "finalizedOutcomesOnly",
    "authorizing",
    "fundsAuthority",
    "economicStateMutation",
    "schemaVersion"
  ]);
  if (
    value.schemaVersion !==
      TRADING_CREDIT_PRIOR_OUTCOME_SUMMARY_SCHEMA_VERSION ||
    value.assetId !== asset ||
    value.subjectId !== subjectId ||
    value.principalId !== principalId ||
    value.finalizedOutcomesOnly !== true ||
    value.authorizing !== false ||
    value.fundsAuthority !== false ||
    value.economicStateMutation !== false
  ) {
    fail("priorOutcomeSummary binding is invalid");
  }
  safeId("priorOutcomeSummary.summaryId", value.summaryId);
  hash("priorOutcomeSummary.summaryHash", value.summaryHash);
  const sourceOutcomeHashes = uniqueHashes(
    "priorOutcomeSummary.sourceOutcomeHashes",
    value.sourceOutcomeHashes
  );
  const asOf = timestamp("priorOutcomeSummary.asOf", value.asOf);
  if (new Date(asOf).getTime() > assessmentTime.getTime()) {
    fail("priorOutcomeSummary contains future outcome data");
  }
  const completed = nonNegativeInteger(
    "priorOutcomeSummary.completedCount",
    value.completedCount
  );
  const onTime = nonNegativeInteger(
    "priorOutcomeSummary.onTimeRepaidCount",
    value.onTimeRepaidCount
  );
  const late = nonNegativeInteger(
    "priorOutcomeSummary.lateOrModifiedRepaidCount",
    value.lateOrModifiedRepaidCount
  );
  const writtenOff = nonNegativeInteger(
    "priorOutcomeSummary.writtenOffCount",
    value.writtenOffCount
  );
  if (completed !== onTime + late + writtenOff) {
    fail("priorOutcomeSummary counts do not reconcile");
  }
  minor(
    "priorOutcomeSummary.totalPrincipalMinor",
    value.totalPrincipalMinor
  );
  minor("priorOutcomeSummary.totalLossMinor", value.totalLossMinor);
  const summaryCore = {
    subjectId: value.subjectId,
    principalId: value.principalId,
    assetId: value.assetId,
    asOf: value.asOf,
    sourceOutcomeHashes,
    completedCount: value.completedCount,
    onTimeRepaidCount: value.onTimeRepaidCount,
    lateOrModifiedRepaidCount: value.lateOrModifiedRepaidCount,
    writtenOffCount: value.writtenOffCount,
    totalPrincipalMinor: value.totalPrincipalMinor,
    totalLossMinor: value.totalLossMinor,
    finalizedOutcomesOnly: true,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false
  };
  if (
    value.summaryHash !==
    hashId("trading_credit_prior_outcome_summary", summaryCore)
  ) {
    fail("priorOutcomeSummary hash does not match its content");
  }
  return structuredClone(value);
}

export function createTradingCreditPriorOutcomeSummary({
  outcomes,
  assetId: inputAssetId,
  asOf
}) {
  if (
    !Array.isArray(outcomes) ||
    outcomes.length < 1 ||
    outcomes.length > 100_000
  ) {
    fail("prior outcomes are invalid");
  }
  const normalizedAssetId = assetId(inputAssetId);
  const normalizedAsOf = timestamp("asOf", asOf);
  const normalized = outcomes.map(assertOutcome);
  if (
    new Set(normalized.map((outcome) => outcome.outcomeHash)).size !==
    normalized.length
  ) {
    fail("prior outcomes contain duplicates");
  }
  const [{ subjectId, principalId }] = normalized;
  for (const outcome of normalized) {
    if (
      outcome.subjectId !== subjectId ||
      outcome.principalId !== principalId ||
      outcome.assetId !== normalizedAssetId ||
      new Date(outcome.recordedAt).getTime() >
        new Date(normalizedAsOf).getTime()
    ) {
      fail(
        "prior outcome identity, asset, or point-in-time binding is invalid"
      );
    }
  }
  const sourceOutcomeHashes = normalized
    .map((outcome) => outcome.outcomeHash)
    .sort();
  const onTimeRepaidCount = normalized.filter(
    (outcome) => outcome.outcomeLabel === "on_time_repaid"
  ).length;
  const lateOrModifiedRepaidCount = normalized.filter(
    (outcome) => outcome.outcomeLabel === "late_or_modified_repaid"
  ).length;
  const writtenOffCount = normalized.filter(
    (outcome) => outcome.outcomeLabel === "written_off"
  ).length;
  const totalPrincipalMinor = normalized
    .reduce(
      (sum, outcome) => sum + BigInt(outcome.originalPrincipalMinor),
      0n
    )
    .toString();
  const totalLossMinor = normalized
    .reduce((sum, outcome) => sum + BigInt(outcome.lossMinor), 0n)
    .toString();
  const summaryCore = {
    subjectId,
    principalId,
    assetId: normalizedAssetId,
    asOf: normalizedAsOf,
    sourceOutcomeHashes,
    completedCount: normalized.length,
    onTimeRepaidCount,
    lateOrModifiedRepaidCount,
    writtenOffCount,
    totalPrincipalMinor,
    totalLossMinor,
    finalizedOutcomesOnly: true,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false
  };
  return immutable({
    summaryId: createOperationalId("trading_credit_prior_outcome_summary"),
    summaryHash: hashId(
      "trading_credit_prior_outcome_summary",
      summaryCore
    ),
    ...summaryCore,
    schemaVersion:
      TRADING_CREDIT_PRIOR_OUTCOME_SUMMARY_SCHEMA_VERSION
  });
}

function assertTerminalObligation(obligation, assessment) {
  plainObject("obligation", obligation);
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false ||
    ![
      ObligationStatus.FULLY_REPAID,
      ObligationStatus.WRITTEN_OFF
    ].includes(obligation.status) ||
    obligation.subjectId !== assessment.subjectId ||
    obligation.principalId !== assessment.principalId ||
    obligation.assetId !== assessment.assetId
  ) {
    fail("terminal sandbox Obligation is invalid or not assessment-bound");
  }
  safeId("obligation.obligationId", obligation.obligationId);
  timestamp("obligation.createdAt", obligation.createdAt);
  timestamp("obligation.updatedAt", obligation.updatedAt);
  if (
    new Date(obligation.createdAt).getTime() <
      new Date(assessment.evaluatedAt).getTime() ||
    new Date(obligation.updatedAt).getTime() <
      new Date(obligation.createdAt).getTime()
  ) {
    fail("Obligation chronology would leak future data into the assessment");
  }
  minor(
    "obligation.originalPrincipalMinor",
    obligation.originalPrincipalMinor,
    { positive: true }
  );
  minor("obligation.totalRepaidMinor", obligation.totalRepaidMinor);
  minor(
    "obligation.outstandingPrincipalMinor",
    obligation.outstandingPrincipalMinor
  );
  minor(
    "obligation.outstandingInterestMinor",
    obligation.outstandingInterestMinor
  );
  minor("obligation.outstandingFeesMinor", obligation.outstandingFeesMinor);
  return obligation;
}

function assertServicingSummary(value, obligation) {
  exactObject("servicingSummary", value, [
    "maxDaysPastDue",
    "restructured",
    "repurchased",
    "manualInterventionCount",
    "outcomeFinalizedAt",
    "evidenceHashes",
    "schemaVersion"
  ]);
  if (
    value.schemaVersion !== "trading_credit_servicing_summary.v1" ||
    typeof value.restructured !== "boolean" ||
    typeof value.repurchased !== "boolean"
  ) {
    fail("servicingSummary is invalid");
  }
  nonNegativeInteger("servicingSummary.maxDaysPastDue", value.maxDaysPastDue);
  nonNegativeInteger(
    "servicingSummary.manualInterventionCount",
    value.manualInterventionCount
  );
  const finalizedAt = timestamp(
    "servicingSummary.outcomeFinalizedAt",
    value.outcomeFinalizedAt
  );
  if (
    new Date(finalizedAt).getTime() <
    new Date(obligation.updatedAt).getTime()
  ) {
    fail("servicing outcome cannot precede the terminal Obligation");
  }
  uniqueHashes(
    "servicingSummary.evidenceHashes",
    value.evidenceHashes
  );
  return value;
}

export function createTradingCreditOutcome({
  assessment,
  obligation,
  servicingSummary,
  repaymentEvidenceHashes,
  outcomeEvidenceHash,
  recordedAt
}) {
  const current = assessmentSafety(assessment);
  const terminal = assertTerminalObligation(obligation, current);
  const servicing = assertServicingSummary(servicingSummary, terminal);
  const normalizedRecordedAt = timestamp("recordedAt", recordedAt);
  if (
    new Date(normalizedRecordedAt).getTime() <
    new Date(servicing.outcomeFinalizedAt).getTime()
  ) {
    fail("outcome record cannot precede finalized servicing Evidence");
  }
  const repaymentHashes = uniqueHashes(
    "repaymentEvidenceHashes",
    repaymentEvidenceHashes,
    {
      minimum:
        terminal.status === ObligationStatus.FULLY_REPAID ? 1 : 0
    }
  );
  const finalEvidenceHash = hash(
    "outcomeEvidenceHash",
    outcomeEvidenceHash
  );
  const writtenOff =
    terminal.status === ObligationStatus.WRITTEN_OFF;
  const outcomeLabel = writtenOff
    ? "written_off"
    : servicing.maxDaysPastDue === 0 &&
        servicing.restructured === false &&
        servicing.repurchased === false
      ? "on_time_repaid"
      : "late_or_modified_repaid";
  const writtenOffLossMinor = writtenOff
    ? [
        "writtenOffPrincipalMinor",
        "writtenOffInterestMinor",
        "writtenOffFeesMinor"
      ]
        .map((key) => {
          if (terminal[key] === undefined) {
            fail(`obligation.${key} is required for a write-off outcome`);
          }
          return minor(`obligation.${key}`, terminal[key]);
        })
        .reduce((sum, value) => sum + value, 0n)
    : 0n;
  const repaymentRatioBps = ratioBps(
    BigInt(terminal.totalRepaidMinor),
    BigInt(terminal.originalPrincipalMinor),
    { cap: 10_000 }
  );
  const outcomeCore = {
    assessmentHash: current.assessmentHash,
    featureSnapshotHash: current.featureSnapshotHash,
    policyHash: current.policy.policyHash,
    obligationId: terminal.obligationId,
    obligationHash: hashId("trading_credit_outcome_obligation", {
      obligationId: terminal.obligationId,
      status: terminal.status,
      originalPrincipalMinor: terminal.originalPrincipalMinor,
      totalRepaidMinor: terminal.totalRepaidMinor,
      outstandingPrincipalMinor: terminal.outstandingPrincipalMinor,
      outstandingInterestMinor: terminal.outstandingInterestMinor,
      outstandingFeesMinor: terminal.outstandingFeesMinor,
      updatedAt: terminal.updatedAt
    }),
    outcomeLabel,
    maxDaysPastDue: servicing.maxDaysPastDue,
    restructured: servicing.restructured,
    repurchased: servicing.repurchased,
    manualInterventionCount: servicing.manualInterventionCount,
    defaulted: writtenOff,
    originalPrincipalMinor: terminal.originalPrincipalMinor,
    totalRepaidMinor: terminal.totalRepaidMinor,
    lossMinor: writtenOffLossMinor.toString(),
    repaymentRatioBps,
    outcomeEvidenceHash: finalEvidenceHash,
    repaymentEvidenceHashes: repaymentHashes,
    servicingEvidenceHashes: [...servicing.evidenceHashes].sort(),
    outcomeFinalizedAt: servicing.outcomeFinalizedAt,
    recordedAt: normalizedRecordedAt
  };
  const outcomeHash = hashId("trading_credit_outcome", outcomeCore);
  return immutable({
    outcomeId: createOperationalId("trading_credit_outcome"),
    outcomeHash,
    subjectId: current.subjectId,
    principalId: current.principalId,
    assetId: current.assetId,
    assessmentHash: current.assessmentHash,
    featureSnapshotHash: current.featureSnapshotHash,
    policyHash: current.policy.policyHash,
    decisionFeatureSnapshot: current.featureSnapshot,
    obligationId: terminal.obligationId,
    obligationHash: outcomeCore.obligationHash,
    outcomeLabel,
    maxDaysPastDue: servicing.maxDaysPastDue,
    restructured: servicing.restructured,
    repurchased: servicing.repurchased,
    manualInterventionCount: servicing.manualInterventionCount,
    defaulted: writtenOff,
    originalPrincipalMinor: terminal.originalPrincipalMinor,
    totalRepaidMinor: terminal.totalRepaidMinor,
    lossMinor: writtenOffLossMinor.toString(),
    repaymentRatioBps,
    outcomeEvidenceHash: finalEvidenceHash,
    repaymentEvidenceHashes: repaymentHashes,
    servicingEvidenceHashes: outcomeCore.servicingEvidenceHashes,
    outcomeFinalizedAt: servicing.outcomeFinalizedAt,
    recordedAt: normalizedRecordedAt,
    outcomeFinalized: true,
    futureFeatureSubstitutionAllowed: false,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false,
    productionAuthority: false,
    schemaVersion: TRADING_CREDIT_OUTCOME_SCHEMA_VERSION
  });
}

export function assertOutcome(value) {
  plainObject("outcome", value);
  if (
    value.schemaVersion !== TRADING_CREDIT_OUTCOME_SCHEMA_VERSION ||
    value.outcomeFinalized !== true ||
    value.futureFeatureSubstitutionAllowed !== false ||
    value.authorizing !== false ||
    value.fundsAuthority !== false ||
    value.economicStateMutation !== false ||
    value.productionAuthority !== false ||
    value.featureSnapshotHash !==
      hashId("trading_credit_feature_snapshot", value.decisionFeatureSnapshot)
  ) {
    fail("finalized Trading Credit Outcome is invalid");
  }
  hash("outcome.outcomeHash", value.outcomeHash);
  hash("outcome.assessmentHash", value.assessmentHash);
  hash("outcome.policyHash", value.policyHash);
  const outcomeCore = {
    assessmentHash: value.assessmentHash,
    featureSnapshotHash: value.featureSnapshotHash,
    policyHash: value.policyHash,
    obligationId: value.obligationId,
    obligationHash: value.obligationHash,
    outcomeLabel: value.outcomeLabel,
    maxDaysPastDue: value.maxDaysPastDue,
    restructured: value.restructured,
    repurchased: value.repurchased,
    manualInterventionCount: value.manualInterventionCount,
    defaulted: value.defaulted,
    originalPrincipalMinor: value.originalPrincipalMinor,
    totalRepaidMinor: value.totalRepaidMinor,
    lossMinor: value.lossMinor,
    repaymentRatioBps: value.repaymentRatioBps,
    outcomeEvidenceHash: value.outcomeEvidenceHash,
    repaymentEvidenceHashes: value.repaymentEvidenceHashes,
    servicingEvidenceHashes: value.servicingEvidenceHashes,
    outcomeFinalizedAt: value.outcomeFinalizedAt,
    recordedAt: value.recordedAt
  };
  if (
    value.outcomeHash !== hashId("trading_credit_outcome", outcomeCore)
  ) {
    fail("Trading Credit Outcome hash does not match its content");
  }
  return value;
}
