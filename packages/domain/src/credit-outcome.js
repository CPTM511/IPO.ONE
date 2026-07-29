import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";

export const CREDIT_OUTCOME_SCHEMA_VERSION = "credit_outcome.v1";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const TERMINAL_STATUSES = new Set(["fully_repaid", "written_off"]);

function invalid(message, details) {
  throw new DomainError("invalid_credit_outcome", message, details);
}

function assertObject(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${name} must be an object`);
  }
  return value;
}

function assertHash(name, value) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    invalid(`${name} must be a canonical hash`);
  }
  return value;
}

function assertTimestamp(name, value) {
  if (
    typeof value !== "string" ||
    Number.isNaN(new Date(value).getTime()) ||
    new Date(value).toISOString() !== value
  ) {
    invalid(`${name} must be an ISO timestamp`);
  }
  return value;
}

function assertMinor(name, value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    invalid(`${name} must be non-negative minor units`);
  }
  return BigInt(value);
}

function normalizeEvidenceHashes(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 256) {
    invalid("sourceEvidenceHashes must contain 2 through 256 Evidence hashes");
  }
  const normalized = [...new Set(values.map((value) =>
    assertHash("sourceEvidenceHashes[]", value)
  ))].sort();
  if (normalized.length !== values.length) {
    invalid("sourceEvidenceHashes must be unique");
  }
  return normalized;
}

function assertDecision(decision) {
  assertObject("decision", decision);
  if (
    decision.schemaVersion !== "risk_decision.v3" ||
    decision.status !== "approved" ||
    decision.sandboxOnly !== true ||
    decision.productionAuthority !== false ||
    decision.decisionPassport?.schemaVersion !== "risk_decision_passport.v1" ||
    decision.riskFeatureSnapshot?.schemaVersion !== "risk_feature_snapshot.v1"
  ) {
    invalid("decision must be an approved, Evidence-derived sandbox decision");
  }
  for (const [name, value] of Object.entries({
    decisionHash: decision.decisionHash,
    featureSnapshotHash: decision.featureSnapshotHash,
    policyHash: decision.policyHash,
    decisionPassportHash: decision.decisionPassport.decisionPassportHash
  })) {
    assertHash(name, value);
  }
  if (
    decision.decisionPassport.riskDecisionId !== decision.riskDecisionId ||
    decision.decisionPassport.decisionHash !== decision.decisionHash ||
    decision.decisionPassport.featureSnapshotHash !== decision.featureSnapshotHash ||
    decision.decisionPassport.policyHash !== decision.policyHash
  ) {
    invalid("decision passport does not bind the source decision");
  }
  return decision;
}

function assertObligation(obligation, decision) {
  assertObject("obligation", obligation);
  if (
    obligation.schemaVersion !== "obligation.v2" ||
    !TERMINAL_STATUSES.has(obligation.status) ||
    obligation.executionStatus !== "executed" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false ||
    obligation.riskDecisionId !== decision.riskDecisionId ||
    obligation.subjectId !== decision.subjectId ||
    obligation.principalId !== decision.principalId ||
    obligation.assetId !== decision.assetId
  ) {
    invalid("obligation must be a terminal sandbox Obligation bound to the decision");
  }
  assertTimestamp("obligation.updatedAt", obligation.updatedAt);
  assertHash("obligation.obligationHash", obligation.obligationHash);
  assertMinor("obligation.originalPrincipalMinor", obligation.originalPrincipalMinor);
  assertMinor("obligation.totalRepaidMinor", obligation.totalRepaidMinor);
  assertMinor("obligation.outstandingPrincipalMinor", obligation.outstandingPrincipalMinor);
  assertMinor("obligation.outstandingInterestMinor", obligation.outstandingInterestMinor);
  assertMinor("obligation.outstandingFeesMinor", obligation.outstandingFeesMinor);
  return obligation;
}

function assertServicingSummary(summary, obligation) {
  assertObject("servicingSummary", summary);
  if (
    !Number.isSafeInteger(summary.maxDaysPastDue) ||
    summary.maxDaysPastDue < 0 ||
    typeof summary.restructured !== "boolean" ||
    typeof summary.repurchased !== "boolean"
  ) {
    invalid("servicingSummary is invalid");
  }
  const finalizedAt = assertTimestamp(
    "servicingSummary.outcomeFinalizedAt",
    summary.outcomeFinalizedAt
  );
  if (new Date(finalizedAt).getTime() < new Date(obligation.updatedAt).getTime()) {
    invalid("credit outcome cannot precede the terminal Obligation");
  }
  return summary;
}

export function createFinalizedCreditOutcome({
  decision,
  obligation,
  servicingSummary,
  sourceEvidenceHashes,
  recordedAt
}) {
  const sourceDecision = assertDecision(decision);
  const terminal = assertObligation(obligation, sourceDecision);
  const servicing = assertServicingSummary(servicingSummary, terminal);
  const evidenceHashes = normalizeEvidenceHashes(sourceEvidenceHashes);
  const normalizedRecordedAt = assertTimestamp("recordedAt", recordedAt);
  if (
    new Date(normalizedRecordedAt).getTime() <
    new Date(servicing.outcomeFinalizedAt).getTime()
  ) {
    invalid("recordedAt cannot precede outcomeFinalizedAt");
  }

  const originalPrincipal = assertMinor(
    "obligation.originalPrincipalMinor",
    terminal.originalPrincipalMinor
  );
  const totalRepaid = assertMinor(
    "obligation.totalRepaidMinor",
    terminal.totalRepaidMinor
  );
  const writtenOff = terminal.status === "written_off";
  const lossMinor = writtenOff
    ? [
        terminal.writtenOffPrincipalMinor,
        terminal.writtenOffInterestMinor,
        terminal.writtenOffFeesMinor
      ].reduce(
        (sum, value, index) =>
          sum + assertMinor(`obligation.writtenOffAmount[${index}]`, value),
        0n
      )
    : 0n;
  const repaymentRatioBps = originalPrincipal === 0n
    ? 0
    : Number((totalRepaid * 10_000n) / originalPrincipal > 10_000n
      ? 10_000n
      : (totalRepaid * 10_000n) / originalPrincipal);
  const outcomeLabel = writtenOff
    ? "written_off"
    : servicing.maxDaysPastDue === 0 &&
        servicing.restructured === false &&
        servicing.repurchased === false
      ? "on_time_repaid"
      : "late_or_modified_repaid";
  const obligationTerminalHash = hashId("credit_outcome_terminal_obligation", {
    obligationId: terminal.obligationId,
    obligationHash: terminal.obligationHash,
    status: terminal.status,
    originalPrincipalMinor: terminal.originalPrincipalMinor,
    totalRepaidMinor: terminal.totalRepaidMinor,
    outstandingPrincipalMinor: terminal.outstandingPrincipalMinor,
    outstandingInterestMinor: terminal.outstandingInterestMinor,
    outstandingFeesMinor: terminal.outstandingFeesMinor,
    writtenOffPrincipalMinor: terminal.writtenOffPrincipalMinor,
    writtenOffInterestMinor: terminal.writtenOffInterestMinor,
    writtenOffFeesMinor: terminal.writtenOffFeesMinor,
    updatedAt: terminal.updatedAt
  });
  const outcomeCore = {
    riskDecisionId: sourceDecision.riskDecisionId,
    decisionHash: sourceDecision.decisionHash,
    decisionPassportHash: sourceDecision.decisionPassport.decisionPassportHash,
    featureSnapshotHash: sourceDecision.featureSnapshotHash,
    policyHash: sourceDecision.policyHash,
    subjectId: sourceDecision.subjectId,
    principalId: sourceDecision.principalId,
    assetId: sourceDecision.assetId,
    obligationId: terminal.obligationId,
    obligationTerminalHash,
    outcomeLabel,
    maxDaysPastDue: servicing.maxDaysPastDue,
    restructured: servicing.restructured,
    repurchased: servicing.repurchased,
    originalPrincipalMinor: terminal.originalPrincipalMinor,
    totalRepaidMinor: terminal.totalRepaidMinor,
    lossMinor: lossMinor.toString(),
    repaymentRatioBps,
    sourceEvidenceHashes: evidenceHashes,
    outcomeFinalizedAt: servicing.outcomeFinalizedAt
  };
  const outcomeHash = hashId("credit_outcome", outcomeCore);
  return Object.freeze({
    creditOutcomeId: `credit_outcome_${outcomeHash.slice(2)}`,
    outcomeHash,
    ...outcomeCore,
    decisionFeatureSnapshot: structuredClone(sourceDecision.riskFeatureSnapshot),
    recordedAt: normalizedRecordedAt,
    outcomeFinalized: true,
    futureFeatureSubstitutionAllowed: false,
    authorizing: false,
    fundsAuthority: false,
    economicStateMutation: false,
    productionAuthority: false,
    piiIncluded: false,
    rawTransactionDataIncluded: false,
    scoreAuthoritative: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: CREDIT_OUTCOME_SCHEMA_VERSION
  });
}

export function assertFinalizedCreditOutcome(value) {
  assertObject("creditOutcome", value);
  if (
    value.schemaVersion !== CREDIT_OUTCOME_SCHEMA_VERSION ||
    value.outcomeFinalized !== true ||
    value.futureFeatureSubstitutionAllowed !== false ||
    value.authorizing !== false ||
    value.fundsAuthority !== false ||
    value.economicStateMutation !== false ||
    value.productionAuthority !== false ||
    value.piiIncluded !== false ||
    value.rawTransactionDataIncluded !== false ||
    value.scoreAuthoritative !== false ||
    value.sandboxOnly !== true ||
    value.productionFundsMoved !== false
  ) {
    invalid("creditOutcome safety boundary is invalid");
  }
  assertHash("creditOutcome.outcomeHash", value.outcomeHash);
  assertHash("creditOutcome.featureSnapshotHash", value.featureSnapshotHash);
  assertObject("creditOutcome.decisionFeatureSnapshot", value.decisionFeatureSnapshot);
  return value;
}
