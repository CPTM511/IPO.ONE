import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";

export const RISK_003B_SOURCE_MANIFEST_SCHEMA_VERSION =
  "risk_003b_source_manifest.v1";
export const RISK_003B_FEATURE_SNAPSHOT_SCHEMA_VERSION =
  "risk_003b_feature_snapshot.v1";
export const RISK_003B_OUTCOME_LABEL_SCHEMA_VERSION =
  "risk_003b_outcome_label.v1";
export const RISK_003B_CHALLENGER_SCHEMA_VERSION =
  "risk_003b_challenger_evaluation.v1";
export const RISK_003B_OFFLINE_REPORT_SCHEMA_VERSION =
  "risk_003b_offline_report.v1";
export const RISK_003B_SHADOW_RUN_SCHEMA_VERSION =
  "risk_003b_shadow_run.v1";

const HASH = /^0x[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/;

function fail(message) {
  throw new DomainError("invalid_risk_003b_shadow_learning", message);
}

function plainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

function exactObject(name, value, keys) {
  plainObject(name, value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${name} has an open shape`);
  }
  return value;
}

function timestamp(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    fail(`${name} is invalid`);
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function sha256(name, value) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function safeId(name, value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function decimal(name, value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    fail(`${name} is invalid`);
  }
  return value;
}

function minor(name, value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(`${name} is invalid`);
  }
  return BigInt(value);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function deterministicId(prefix, valueHash) {
  return `${prefix}_${valueHash.slice(2, 34)}`;
}

function ratioBps(numerator, denominator) {
  if (denominator <= 0n) fail("ratio denominator must be positive");
  return Number((numerator * 10_000n) / denominator);
}

function decimalToScaled(value, decimals = 6) {
  decimal("decimal", value);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  const scaled =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -scaled : scaled;
}

function requireBoolean(name, value, expected) {
  if (typeof value !== "boolean" || value !== expected) {
    fail(`${name} must be ${expected}`);
  }
}

function requireNumber(name, value, { minimum = 0, maximum = 1_000_000 } = {}) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${name} is invalid`);
  }
  return value;
}

function validateActivePolicySnapshot(value, source) {
  exactObject("activePolicySnapshot", value, [
    "policyId",
    "policyVersion",
    "authorizationVersion",
    "decisionMode",
    "maximumNotionalUsd",
    "maximumEffectiveLeverage",
    "candidateCommit",
    "authorizingSource"
  ]);
  safeId("activePolicySnapshot.policyId", value.policyId);
  safeId("activePolicySnapshot.policyVersion", value.policyVersion);
  safeId(
    "activePolicySnapshot.authorizationVersion",
    value.authorizationVersion
  );
  if (
    value.decisionMode !== "deterministic_active" ||
    value.authorizingSource !== "hl_testnet_001b_exact_run" ||
    value.maximumNotionalUsd !== source.binding.maximumNotionalUsd ||
    value.maximumEffectiveLeverage !==
      source.binding.maximumEffectiveLeverage ||
    value.candidateCommit !== source.authority.operationalRepairCommit ||
    !COMMIT.test(value.candidateCommit)
  ) {
    fail("active policy snapshot is not bound to the finalized source");
  }
  return structuredClone(value);
}

function validateAdmission(value, sourceCompletedAt, evaluatedAt) {
  exactObject("admission", value, [
    "owner",
    "privacyReview",
    "finality",
    "reconciled",
    "revoked",
    "invalidated",
    "admittedAt"
  ]);
  safeId("admission.owner", value.owner);
  if (
    value.owner !== "risk_operations_shadow_owner" ||
    value.privacyReview !== "passed" ||
    value.finality !== "finalized"
  ) {
    fail("source admission owner, privacy review, or finality is invalid");
  }
  requireBoolean("admission.reconciled", value.reconciled, true);
  requireBoolean("admission.revoked", value.revoked, false);
  requireBoolean("admission.invalidated", value.invalidated, false);
  const admittedAt = timestamp("admission.admittedAt", value.admittedAt);
  if (
    new Date(admittedAt).getTime() < new Date(sourceCompletedAt).getTime() ||
    new Date(admittedAt).getTime() > new Date(evaluatedAt).getTime()
  ) {
    fail("source admission chronology is invalid");
  }
  return structuredClone(value);
}

function validateScope(value, expectedScope) {
  exactObject("scope", value, [
    "subjectReferenceHash",
    "principalReferenceHash"
  ]);
  exactObject("expectedScope", expectedScope, [
    "subjectReferenceHash",
    "principalReferenceHash"
  ]);
  for (const key of ["subjectReferenceHash", "principalReferenceHash"]) {
    hash(`scope.${key}`, value[key]);
    hash(`expectedScope.${key}`, expectedScope[key]);
    if (value[key] !== expectedScope[key]) fail("source scope is not approved");
  }
  return structuredClone(value);
}

function validateFinalizedEvidence(source) {
  plainObject("sourceEvidence", source);
  if (
    source.schemaVersion !== "hl_testnet_001b_final_evidence.v1" ||
    source.issueId !== "HL-TESTNET-001B" ||
    source.verdict !== "PASS_TESTNET_VERIFIED" ||
    source.mode !== "L3_LIVE_TESTNET" ||
    source.venue !== "hyperliquid" ||
    source.environment !== "testnet" ||
    source.origin !== "https://api.hyperliquid-testnet.xyz"
  ) {
    fail("source is not the finalized HL-TESTNET-001B Evidence");
  }
  safeId("source.runId", source.runId);
  hash("source.execution.runnerEvidenceHash", source.execution?.runnerEvidenceHash);
  hash("source.authority.preparationHash", source.authority?.preparationHash);
  hash("source.authority.handoffHash", source.authority?.handoffHash);
  if (
    !COMMIT.test(source.authority?.operationalRepairCommit ?? "") ||
    source.authority?.runCount !== 1 ||
    source.execution?.result !== "L3_VERIFIED" ||
    source.registration?.status !== "REGISTERED_AND_READ_BACK" ||
    source.registration?.rawSignaturePersisted !== false ||
    source.registration?.rawVenueResponsePersisted !== false
  ) {
    fail("source authority, registration, or execution is not final");
  }
  requireBoolean(
    "source.execution.automaticRetryUsed",
    source.execution.automaticRetryUsed,
    false
  );
  requireBoolean(
    "source.execution.unknownOutcome",
    source.execution.unknownOutcome,
    false
  );
  requireBoolean(
    "source.execution.close.reduceOnly",
    source.execution.close?.reduceOnly,
    true
  );
  if (
    source.execution.open?.disposition !== "FILLED" ||
    source.execution.close?.disposition !== "FILLED" ||
    source.independentReconciliation?.status !== "RECONCILED" ||
    source.independentReconciliation?.positionsCount !== 0 ||
    source.independentReconciliation?.openOrdersCount !== 0 ||
    source.independentReconciliation?.openFillCount !== 1 ||
    source.independentReconciliation?.closeFillCount !== 1 ||
    source.independentReconciliation?.openOrderRemainingSize !== "0.0" ||
    source.independentReconciliation?.closeOrderRemainingSize !== "0.0"
  ) {
    fail("source execution is not cleanly reconciled");
  }
  const principal = minor(
    "source.canonicalOutcome.principalMinor",
    source.canonicalOutcome?.principalMinor
  );
  const repaid = minor(
    "source.canonicalOutcome.repaymentMinor",
    source.canonicalOutcome?.repaymentMinor
  );
  const outstanding = minor(
    "source.canonicalOutcome.outstandingPrincipalMinor",
    source.canonicalOutcome?.outstandingPrincipalMinor
  );
  if (
    principal !== repaid + outstanding ||
    source.canonicalOutcome?.obligationStatus !== "partially_repaid" ||
    source.canonicalOutcome?.creditState !== "LOSS_OUTSTANDING" ||
    source.canonicalOutcome?.residualMinor !== "0" ||
    source.canonicalOutcome?.externalAssetTransfer !== false
  ) {
    fail("source repayment and Obligation outcome do not reconcile");
  }
  requireNumber(
    "source.execution.actualEffectiveLeverage",
    source.execution.actualEffectiveLeverage,
    { maximum: source.binding.maximumEffectiveLeverage }
  );
  if (
    source.signerRetirement?.status !== "LOGICALLY_DESTROYED" ||
    source.signerRetirement?.keyAbsentAfterDestruction !== true ||
    source.signerRetirement?.addressReuseAllowed !== false
  ) {
    fail("source signer is not retired");
  }
  for (const key of [
    "mainnetInteraction",
    "realFundsMoved",
    "externalFundingTransfer",
    "withdrawalsPerformed",
    "transfersPerformed",
    "leverageChangePerformed",
    "productionAuthority",
    "mainnetAuthority",
    "realFundsAuthority",
    "rawPrivateKeyPersisted",
    "rawSignaturePersisted",
    "rawVenueResponsePersisted"
  ]) {
    requireBoolean(`source.safety.${key}`, source.safety?.[key], false);
  }
  for (const [key, value] of Object.entries(source.successorAuthority ?? {})) {
    requireBoolean(`source.successorAuthority.${key}`, value, false);
  }
  const openAt = timestamp(
    "source.execution.open.submittedAt",
    source.execution.open.submittedAt
  );
  const closeAt = timestamp(
    "source.execution.close.submittedAt",
    source.execution.close.submittedAt
  );
  const reconciledAt = timestamp(
    "source.independentReconciliation.observedAt",
    source.independentReconciliation.observedAt
  );
  const completedAt = timestamp("source.completedAt", source.completedAt);
  if (
    new Date(openAt).getTime() > new Date(closeAt).getTime() ||
    new Date(closeAt).getTime() > new Date(reconciledAt).getTime() ||
    new Date(reconciledAt).getTime() > new Date(completedAt).getTime()
  ) {
    fail("source execution chronology is invalid");
  }
  return source;
}

function buildSourceManifest({
  sourceEvidence,
  sourceArtifactPath,
  sourceArtifactSha256,
  scope,
  expectedScope,
  admission,
  activePolicySnapshot,
  evaluatedAt
}) {
  const source = validateFinalizedEvidence(sourceEvidence);
  if (
    sourceArtifactPath !==
    "artifacts/testnet/hl-testnet-001b-live-20260901-001.json"
  ) {
    fail("source artifact path is not approved");
  }
  sha256("sourceArtifactSha256", sourceArtifactSha256);
  const normalizedScope = validateScope(scope, expectedScope);
  const normalizedAdmission = validateAdmission(
    admission,
    source.completedAt,
    evaluatedAt
  );
  const policy = validateActivePolicySnapshot(activePolicySnapshot, source);
  const policyHash = hashId("risk_003b_active_policy_snapshot", policy);
  const scopeCore = {
    ...normalizedScope,
    facilityReferenceHash: hashId(
      "risk_003b_facility_reference",
      source.canonicalOutcome.facilityId
    ),
    obligationReferenceHash: hashId(
      "risk_003b_obligation_reference",
      source.canonicalOutcome.obligationId
    ),
    authorizationReferenceHash: hashId(
      "risk_003b_authorization_reference",
      source.canonicalOutcome.authorizationId
    )
  };
  const core = {
    sourceArtifactPath,
    sourceArtifactSha256,
    sourceEvidenceHash: source.execution.runnerEvidenceHash,
    sourceIssueId: source.issueId,
    sourceRunId: source.runId,
    sourceMode: source.mode,
    sourceCandidateCommit: source.authority.operationalRepairCommit,
    scope: scopeCore,
    finality: normalizedAdmission.finality,
    reconciled: normalizedAdmission.reconciled,
    revoked: normalizedAdmission.revoked,
    invalidated: normalizedAdmission.invalidated,
    privacyReview: normalizedAdmission.privacyReview,
    owner: normalizedAdmission.owner,
    sourceCompletedAt: source.completedAt,
    admittedAt: normalizedAdmission.admittedAt,
    activePolicyHash: policyHash
  };
  const sourceManifestHash = hashId("risk_003b_source_manifest", core);
  return immutable({
    sourceManifestId: deterministicId(
      "risk_003b_source_manifest",
      sourceManifestHash
    ),
    sourceManifestHash,
    ...core,
    activePolicySnapshot: policy,
    authorizing: false,
    externalActionAllowed: false,
    productionAuthority: false,
    realValueAuthority: false,
    schemaVersion: RISK_003B_SOURCE_MANIFEST_SCHEMA_VERSION
  });
}

function buildFeatureSnapshot(source, manifest) {
  const principal = BigInt(source.canonicalOutcome.principalMinor);
  const repaid = BigInt(source.canonicalOutcome.repaymentMinor);
  const outstanding = BigInt(
    source.canonicalOutcome.outstandingPrincipalMinor
  );
  const notional = decimalToScaled(
    source.execution.open.positionValueUsd
  );
  const maximumNotional = decimalToScaled(
    source.binding.maximumNotionalUsd
  );
  const equityBefore = decimalToScaled(
    source.execution.accountEquityBeforeUsd
  );
  const equityAfter = decimalToScaled(
    source.execution.accountEquityAfterUsd
  );
  const drawdown = equityBefore > equityAfter ? equityBefore - equityAfter : 0n;
  const decisionCutoffAt = source.execution.open.submittedAt;
  const outcomeFinalizedAt = source.completedAt;
  const core = {
    sourceManifestHash: manifest.sourceManifestHash,
    decisionCutoffAt,
    outcomeWindow: {
      startedAt: source.execution.open.submittedAt,
      finalizedAt: outcomeFinalizedAt
    },
    decisionFeatures: {
      accountEquityBeforeUsd: source.execution.accountEquityBeforeUsd,
      maximumNotionalUsd: source.binding.maximumNotionalUsd,
      maximumEffectiveLeverage:
        source.binding.maximumEffectiveLeverage,
      runCountCap: source.authority.runCount,
      automaticRetryAllowed: false
    },
    outcomeFeatures: {
      realizedNotionalUsd: source.execution.open.positionValueUsd,
      utilizationBps: ratioBps(notional, maximumNotional),
      effectiveLeverageBps: Math.round(
        source.execution.actualEffectiveLeverage * 10_000
      ),
      repaymentRatioBps: ratioBps(repaid, principal),
      lossRateBps: ratioBps(outstanding, principal),
      outstandingPrincipalMinor:
        source.canonicalOutcome.outstandingPrincipalMinor,
      realizedPnlMinor: source.canonicalOutcome.realizedPnlMinor,
      realizedPnlUsd: source.canonicalOutcome.realizedPnlUsd,
      feeUsd: source.canonicalOutcome.feeUsd,
      maximumDrawdownBps: ratioBps(drawdown, equityBefore),
      drawdownObservationCount: 2,
      concentrationBps: 10_000,
      manualInterventionCount: 0,
      unknownOutcomeCount: 0,
      emergencyCloseCount: source.execution.emergencyCloseUsed ? 1 : 0,
      reconciliationQualityBps: 10_000,
      outcomeWindowMs:
        new Date(outcomeFinalizedAt).getTime() -
        new Date(decisionCutoffAt).getTime()
    },
    missingFeatures: [
      "calibration_baseline",
      "cure_recovery_window",
      "days_past_due",
      "drift_baseline",
      "false_approval_rejection_labels",
      "human_entry_sample"
    ],
    dataQuality: "limited_single_finalized_testnet_cycle",
    futureOutcomeDataIncludedInDecisionFeatures: false
  };
  const featureSnapshotHash = hashId("risk_003b_feature_snapshot", core);
  return immutable({
    featureSnapshotId: deterministicId(
      "risk_003b_feature_snapshot",
      featureSnapshotHash
    ),
    featureSnapshotHash,
    ...core,
    authorizing: false,
    activePolicyMutationAllowed: false,
    externalActionAllowed: false,
    schemaVersion: RISK_003B_FEATURE_SNAPSHOT_SCHEMA_VERSION
  });
}

function buildOutcomeLabel(source, manifest, featureSnapshot) {
  const principal = BigInt(source.canonicalOutcome.principalMinor);
  const repaid = BigInt(source.canonicalOutcome.repaymentMinor);
  const outstanding = BigInt(
    source.canonicalOutcome.outstandingPrincipalMinor
  );
  const core = {
    sourceManifestHash: manifest.sourceManifestHash,
    featureSnapshotHash: featureSnapshot.featureSnapshotHash,
    label: "loss_outstanding",
    obligationStatus: source.canonicalOutcome.obligationStatus,
    creditState: source.canonicalOutcome.creditState,
    originalPrincipalMinor: principal.toString(),
    repaidPrincipalMinor: repaid.toString(),
    outstandingPrincipalMinor: outstanding.toString(),
    repaymentRatioBps: ratioBps(repaid, principal),
    lossRateBps: ratioBps(outstanding, principal),
    defaulted: false,
    writtenOff: false,
    executionCycleClosed: true,
    obligationStillOutstanding: true,
    outcomeFinalizedAt: source.completedAt
  };
  const outcomeLabelHash = hashId("risk_003b_outcome_label", core);
  return immutable({
    outcomeLabelId: deterministicId(
      "risk_003b_outcome_label",
      outcomeLabelHash
    ),
    outcomeLabelHash,
    ...core,
    sourceObligationRewritten: false,
    authorizing: false,
    economicStateMutation: false,
    schemaVersion: RISK_003B_OUTCOME_LABEL_SCHEMA_VERSION
  });
}

function buildChallenger({
  manifest,
  featureSnapshot,
  outcomeLabel,
  candidateVersion,
  challengerEnabled,
  evaluatedAt
}) {
  safeId("candidateVersion", candidateVersion);
  if (typeof challengerEnabled !== "boolean") {
    fail("challengerEnabled is invalid");
  }
  const core = {
    candidateVersion,
    baselinePolicyHash: manifest.activePolicyHash,
    sourceManifestHashes: [manifest.sourceManifestHash],
    featureSnapshotHashes: [featureSnapshot.featureSnapshotHash],
    outcomeLabelHashes: [outcomeLabel.outcomeLabelHash],
    completedOutcomeCount: 1,
    challengerEnabled,
    evaluationStatus: challengerEnabled ? "evaluated" : "disabled",
    recommendation: challengerEnabled ? "insufficient_sample" : "disabled",
    reasonCodes: challengerEnabled
      ? [
          "loss_outstanding_observed",
          "sample_size_below_minimum",
          "no_active_policy_change_authorized"
        ]
      : ["challenger_disabled"],
    proposedCapacityMultiplierBps: null,
    evaluatedAt
  };
  const challengerHash = hashId("risk_003b_challenger_evaluation", core);
  return immutable({
    challengerEvaluationId: deterministicId(
      "risk_003b_challenger_evaluation",
      challengerHash
    ),
    challengerHash,
    ...core,
    promotionState: "shadow",
    promotionAllowed: false,
    autoApplied: false,
    autoLooseningAllowed: false,
    requiresNamedHumanReview: true,
    authorizing: false,
    activePolicyMutationAllowed: false,
    externalActionAllowed: false,
    productionAuthority: false,
    schemaVersion: RISK_003B_CHALLENGER_SCHEMA_VERSION
  });
}

function buildOfflineReport({
  manifest,
  featureSnapshot,
  outcomeLabel,
  challenger,
  evaluatedAt
}) {
  const core = {
    sourceManifestHashes: [manifest.sourceManifestHash],
    featureSnapshotHashes: [featureSnapshot.featureSnapshotHash],
    outcomeLabelHashes: [outcomeLabel.outcomeLabelHash],
    challengerHash: challenger.challengerHash,
    observationWindow: {
      startedAt: featureSnapshot.outcomeWindow.startedAt,
      finalizedAt: featureSnapshot.outcomeWindow.finalizedAt
    },
    sampleSize: 1,
    agentSampleCount: 1,
    humanSampleCount: 0,
    repaymentRatioBps: outcomeLabel.repaymentRatioBps,
    outstandingLossOutcomeCount: 1,
    defaultCount: 0,
    cureCount: null,
    recoveryCount: null,
    utilizationBps: featureSnapshot.outcomeFeatures.utilizationBps,
    concentrationBps: featureSnapshot.outcomeFeatures.concentrationBps,
    maximumDrawdownBps:
      featureSnapshot.outcomeFeatures.maximumDrawdownBps,
    calibration: "unavailable_insufficient_sample",
    falseApprovalRateBps: null,
    falseRejectionRateBps: null,
    stability: "unavailable_single_observation",
    drift: "unavailable_no_baseline",
    uncertainty: "very_high_single_testnet_observation",
    missingness: featureSnapshot.missingFeatures,
    activePolicyHashBefore: manifest.activePolicyHash,
    activePolicyHashAfter: manifest.activePolicyHash,
    recommendedActivePolicyChange: null,
    evaluatedAt
  };
  const offlineReportHash = hashId("risk_003b_offline_report", core);
  return immutable({
    offlineReportId: deterministicId(
      "risk_003b_offline_report",
      offlineReportHash
    ),
    offlineReportHash,
    ...core,
    aggregateOnly: true,
    participantIdentifiersIncluded: false,
    productionValidityClaimed: false,
    authorizing: false,
    activePolicyMutationAllowed: false,
    externalActionAllowed: false,
    schemaVersion: RISK_003B_OFFLINE_REPORT_SCHEMA_VERSION
  });
}

export function createRisk003BShadowRun({
  sources,
  expectedScope,
  candidateVersion,
  challengerEnabled = true,
  evaluatedAt
}) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 100) {
    fail("sources are invalid");
  }
  const normalizedEvaluatedAt = timestamp("evaluatedAt", evaluatedAt);
  const manifests = sources.map((source) =>
    buildSourceManifest({
      ...source,
      expectedScope,
      evaluatedAt: normalizedEvaluatedAt
    })
  );
  const unique = new Map();
  for (const manifest of manifests) {
    const existing = unique.get(manifest.sourceArtifactSha256);
    if (existing && existing.sourceManifestHash !== manifest.sourceManifestHash) {
      fail("duplicate source artifact has conflicting admission truth");
    }
    unique.set(manifest.sourceArtifactSha256, manifest);
  }
  if (unique.size !== 1) {
    fail("only the exact approved finalized Testnet source is admitted");
  }
  const manifest = [...unique.values()][0];
  const source = sources[0].sourceEvidence;
  if (
    new Date(source.completedAt).getTime() >
    new Date(normalizedEvaluatedAt).getTime()
  ) {
    fail("evaluation precedes source finality");
  }
  const featureSnapshot = buildFeatureSnapshot(source, manifest);
  const outcomeLabel = buildOutcomeLabel(
    source,
    manifest,
    featureSnapshot
  );
  const challenger = buildChallenger({
    manifest,
    featureSnapshot,
    outcomeLabel,
    candidateVersion,
    challengerEnabled,
    evaluatedAt: normalizedEvaluatedAt
  });
  const offlineReport = buildOfflineReport({
    manifest,
    featureSnapshot,
    outcomeLabel,
    challenger,
    evaluatedAt: normalizedEvaluatedAt
  });
  const runCore = {
    sourceManifestHash: manifest.sourceManifestHash,
    featureSnapshotHash: featureSnapshot.featureSnapshotHash,
    outcomeLabelHash: outcomeLabel.outcomeLabelHash,
    challengerHash: challenger.challengerHash,
    offlineReportHash: offlineReport.offlineReportHash,
    activePolicyHashBefore: manifest.activePolicyHash,
    activePolicyHashAfter: manifest.activePolicyHash,
    evaluatedAt: normalizedEvaluatedAt
  };
  const shadowRunHash = hashId("risk_003b_shadow_run", runCore);
  return immutable({
    shadowRunId: deterministicId("risk_003b_shadow_run", shadowRunHash),
    shadowRunHash,
    idempotencyIdentity: hashId("risk_003b_shadow_idempotency", {
      sourceManifestHash: manifest.sourceManifestHash,
      candidateVersion,
      evaluatedAt: normalizedEvaluatedAt
    }),
    issueId: "RISK-003B",
    mode: "shadow",
    status: "succeeded",
    sourceManifest: manifest,
    featureSnapshot,
    outcomeLabel,
    challenger,
    offlineReport,
    activePolicyHashBefore: manifest.activePolicyHash,
    activePolicyHashAfter: manifest.activePolicyHash,
    activePolicyUnchanged: true,
    duplicateDeliveryCount: manifests.length - unique.size,
    retryCount: 0,
    nextRetryAt: null,
    economicStateMutation: false,
    externalActionPerformed: false,
    authorizing: false,
    activePolicyMutationAllowed: false,
    modelPromotionAllowed: false,
    productionAuthority: false,
    mainnetAuthority: false,
    realValueAuthority: false,
    evaluatedAt: normalizedEvaluatedAt,
    schemaVersion: RISK_003B_SHADOW_RUN_SCHEMA_VERSION
  });
}
