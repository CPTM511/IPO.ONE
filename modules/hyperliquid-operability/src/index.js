import { DomainError, hashId } from "../../../packages/domain/src/index.js";

export const HYPERLIQUID_TESTNET_OPERABILITY_POLICY_VERSION =
  "tc_403_testnet_operability.v1";
export const HYPERLIQUID_TESTNET_OPERABILITY_SCHEMA_VERSION =
  "hyperliquid_testnet_operability_assurance.v1";
export const HYPERLIQUID_TESTNET_OPERABILITY_APPROVED_POLICY_HASH =
  "0x295c4e61e823694e62795af6d977649eceb420a93aec0ff3510c8b69e0bd9da0";

export const HyperliquidOperabilityImplementationStatus = Object.freeze({
  IMPLEMENTED_UNVERIFIED: "IMPLEMENTED_UNVERIFIED",
  BLOCKED: "BLOCKED"
});

export const HyperliquidOperabilityReleaseStatus = Object.freeze({
  READY_FOR_HUMAN_ACCEPTANCE: "READY_FOR_HUMAN_ACCEPTANCE",
  BLOCKED_ASSURANCE: "BLOCKED_ASSURANCE",
  BLOCKED_FINDINGS: "BLOCKED_FINDINGS",
  BLOCKED_INDEPENDENT_REVIEW: "BLOCKED_INDEPENDENT_REVIEW"
});

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const FINDING_ID = /^[A-Z0-9][A-Z0-9_-]{0,95}$/;
const SIGNAL = /^[a-z0-9][a-z0-9_]{0,95}$/;
const SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const FINDING_STATUSES = new Set([
  "open",
  "accepted_launch_blocker",
  "resolved",
  "not_applicable"
]);
const REVIEW_STATUSES = new Set(["NOT_PERFORMED", "PASSED", "FAILED"]);
const DRILL_STATUSES = new Set(["PASSED", "FAILED"]);
const SAFE_STATES = new Set(["WARNING", "REDUCE_ONLY", "FLATTEN", "SETTLEMENT"]);
const RESTORE_COMPARISON_FIELDS = Object.freeze([
  "databaseFingerprint",
  "facilityFingerprint",
  "ledgerFingerprint",
  "evidenceFingerprint",
  "executionFingerprint",
  "riskFingerprint",
  "reconciliationFingerprint",
  "fundingFingerprint",
  "settlementFingerprint",
  "facilityCount",
  "ledgerTransactionCount",
  "ledgerEntryCount",
  "evidenceCount",
  "settlementCount"
]);
const FAILURE_SCENARIO_SAFE_STATES = Object.freeze({
  application_process_restart: "SETTLEMENT",
  database_process_restart: "SETTLEMENT",
  database_backup_restore: "SETTLEMENT",
  signer_loss: "REDUCE_ONLY",
  venue_outage: "REDUCE_ONLY",
  adapter_staleness: "REDUCE_ONLY",
  unknown_exchange_outcome: "REDUCE_ONLY"
});
const FAILURE_SCENARIO_RUNNERS = Object.freeze({
  application_process_restart: "tc402_postgres_event_runtime",
  database_process_restart: "tc402_postgres_event_runtime",
  database_backup_restore: "tc403_physical_pg17_drill",
  signer_loss: "tc403_network_disabled_simulation_suite",
  venue_outage: "tc403_network_disabled_simulation_suite",
  adapter_staleness: "tc403_network_disabled_simulation_suite",
  unknown_exchange_outcome: "tc403_network_disabled_simulation_suite"
});
const CAPACITY_PROBE_KIND = "boundary_arithmetic_self_test";

function invalid(message) {
  throw new DomainError("invalid_testnet_operability_assurance", message);
}

function plainObject(value, name) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${name} must be a plain object`);
  }
  return value;
}

function exactKeys(value, expected, name) {
  plainObject(value, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    invalid(`${name} has an open or incomplete shape`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    invalid(`${name} must be a bounded identifier`);
  }
  return value;
}

function findingId(value) {
  if (typeof value !== "string" || !FINDING_ID.test(value)) {
    invalid("findingId must be a bounded uppercase identifier");
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    invalid(`${name} must be a lowercase 32-byte hash`);
  }
  return value;
}

function nonNegativeInteger(name, value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    invalid(`${name} must be a bounded non-negative integer`);
  }
  return value;
}

function positiveInteger(name, value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    invalid(`${name} must be a bounded positive integer`);
  }
  return value;
}

function dateTime(name, value) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    invalid(`${name} must be an offset-qualified timestamp`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function assertSafetyBoundary(value) {
  exactKeys(
    value,
    [
      "automaticRecoveryEnabled",
      "automaticUnfreezeEnabled",
      "automaticKeyOperationEnabled",
      "notificationDeliveryEnabled",
      "protectedSchedulingEnabled",
      "exchangeWritesEnabled",
      "apiWalletOperationsEnabled",
      "mainnetAuthority",
      "productionAuthority",
      "fundsAuthority",
      "realFunds"
    ],
    "policy.safetyBoundary"
  );
  if (Object.values(value).some((item) => item !== false)) {
    invalid("every TC-403 safety-boundary capability must remain false");
  }
}

export function assertHyperliquidTestnetOperabilityPolicy(policy) {
  exactKeys(
    policy,
    [
      "schemaVersion",
      "policyVersion",
      "environment",
      "mode",
      "accountability",
      "objectives",
      "capacity",
      "requiredFailureScenarios",
      "alerts",
      "safetyBoundary"
    ],
    "policy"
  );
  if (
    policy.schemaVersion !== "hyperliquid_testnet_operability_policy.v1" ||
    policy.policyVersion !== HYPERLIQUID_TESTNET_OPERABILITY_POLICY_VERSION ||
    policy.environment !== "hyperliquid_testnet" ||
    policy.mode !== "simulation_and_local_drill_only"
  ) {
    invalid("policy identity or environment is invalid");
  }
  exactKeys(
    policy.accountability,
    [
      "incidentOwner",
      "recoveryOwner",
      "signerLifecycleOwner",
      "evidenceCustodian",
      "independentReviewCommissioningOwner",
      "independentReviewer",
      "independentReviewerType"
    ],
    "policy.accountability"
  );
  for (const [name, owner] of Object.entries(policy.accountability)) {
    if (
      ["independentReviewer", "independentReviewerType"].includes(name) &&
      owner === null
    ) {
      continue;
    }
    identifier(`policy.accountability.${name}`, owner);
  }
  if (
    (policy.accountability.independentReviewer === null) !==
      (policy.accountability.independentReviewerType === null) ||
    (
      policy.accountability.independentReviewerType !== null &&
      policy.accountability.independentReviewerType !==
        "external_human_or_organization"
    )
  ) {
    invalid("independent reviewer identity and external reviewer type must be assigned together");
  }
  exactKeys(
    policy.objectives,
    [
      "riskDataWarningAfterMs",
      "riskDataCriticalAfterMs",
      "unknownOutcomeWarningAfterMs",
      "unknownOutcomeCriticalAfterMs",
      "reconciliationWarningAfterMs",
      "reconciliationCriticalAfterMs",
      "backupMaximumAgeMs",
      "localRestoreExerciseRtoMs",
      "localRestoreExerciseRpoMs"
    ],
    "policy.objectives"
  );
  for (const [name, value] of Object.entries(policy.objectives)) {
    if (name === "localRestoreExerciseRpoMs") {
      nonNegativeInteger(`policy.objectives.${name}`, value, 86_400_000);
    } else {
      positiveInteger(`policy.objectives.${name}`, value, 86_400_000);
    }
  }
  if (
    policy.objectives.riskDataWarningAfterMs >=
      policy.objectives.riskDataCriticalAfterMs ||
    policy.objectives.unknownOutcomeWarningAfterMs >=
      policy.objectives.unknownOutcomeCriticalAfterMs ||
    policy.objectives.reconciliationWarningAfterMs >=
      policy.objectives.reconciliationCriticalAfterMs
  ) {
    invalid("warning objectives must be lower than critical objectives");
  }
  exactKeys(
    policy.capacity,
    [
      "maximumAssuranceInputBytes",
      "maximumFindings",
      "maximumAlertRoutes",
      "maximumFailureDrills",
      "maximumConcurrentEvaluations",
      "loadProbeEvaluations"
    ],
    "policy.capacity"
  );
  for (const [name, value] of Object.entries(policy.capacity)) {
    positiveInteger(`policy.capacity.${name}`, value, 10_000_000);
  }
  if (
    !Array.isArray(policy.requiredFailureScenarios) ||
    policy.requiredFailureScenarios.length === 0 ||
    new Set(policy.requiredFailureScenarios).size !==
      policy.requiredFailureScenarios.length
  ) {
    invalid("required failure scenarios must be a unique non-empty list");
  }
  for (const scenario of policy.requiredFailureScenarios) {
    identifier("required failure scenario", scenario);
  }
  if (
    !Array.isArray(policy.alerts) ||
    policy.alerts.length === 0 ||
    policy.alerts.length > policy.capacity.maximumAlertRoutes
  ) {
    invalid("policy alerts are invalid");
  }
  const signals = new Set();
  for (const alert of policy.alerts) {
    exactKeys(
      alert,
      [
        "signalType",
        "severity",
        "owner",
        "runbookRef",
        "blocksNewRisk"
      ],
      "policy alert"
    );
    if (
      typeof alert.signalType !== "string" ||
      !SIGNAL.test(alert.signalType) ||
      signals.has(alert.signalType) ||
      !["critical", "high"].includes(alert.severity) ||
      alert.blocksNewRisk !== true
    ) {
      invalid("policy alert identity or fail-closed posture is invalid");
    }
    signals.add(alert.signalType);
    identifier("alert.owner", alert.owner);
    identifier("alert.runbookRef", alert.runbookRef);
  }
  assertSafetyBoundary(policy.safetyBoundary);
  const checkedPolicy = deepFreeze(clone(policy));
  if (
    hashId("tc_403_operability_policy", checkedPolicy) !==
    HYPERLIQUID_TESTNET_OPERABILITY_APPROVED_POLICY_HASH
  ) {
    invalid("operability policy is not the source-approved policy artifact");
  }
  return checkedPolicy;
}

const TIMED_ALERT_OBJECTIVES = Object.freeze({
  risk_data_stale: [
    "riskDataWarningAfterMs",
    "riskDataCriticalAfterMs"
  ],
  reconciliation_slo_breached: [
    "reconciliationWarningAfterMs",
    "reconciliationCriticalAfterMs"
  ],
  unknown_exchange_outcome_aging: [
    "unknownOutcomeWarningAfterMs",
    "unknownOutcomeCriticalAfterMs"
  ]
});

export function evaluateHyperliquidOperabilitySignal(
  input,
  { policy, clock = Date.now }
) {
  const checkedPolicy = assertHyperliquidTestnetOperabilityPolicy(policy);
  exactKeys(
    input,
    ["signalType", "sourceEvidenceHash", "observedAt"],
    "operability signal"
  );
  if (typeof input.signalType !== "string" || !SIGNAL.test(input.signalType)) {
    invalid("operability signal type is invalid");
  }
  hash("operability signal sourceEvidenceHash", input.sourceEvidenceHash);
  dateTime("operability signal observedAt", input.observedAt);
  const rule = checkedPolicy.alerts.find(
    (candidate) => candidate.signalType === input.signalType
  );
  if (!rule) invalid("operability signal is not in the closed alert policy");
  const nowMs = clock();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    invalid("operability signal clock is invalid");
  }
  const observedMs = new Date(input.observedAt).getTime();
  if (observedMs > nowMs) {
    invalid("operability signal observation cannot be in the future");
  }
  const ageMs = nowMs - observedMs;
  const objectiveNames = TIMED_ALERT_OBJECTIVES[input.signalType];
  let severity = rule.severity;
  let thresholdMs = 0;
  if (objectiveNames) {
    const [warningName, criticalName] = objectiveNames;
    const warningMs = checkedPolicy.objectives[warningName];
    const criticalMs = checkedPolicy.objectives[criticalName];
    if (ageMs < warningMs) return null;
    severity = ageMs >= criticalMs ? "critical" : "high";
    thresholdMs = ageMs >= criticalMs ? criticalMs : warningMs;
  }
  const alertBody = {
    signalType: input.signalType,
    sourceEvidenceHash: input.sourceEvidenceHash,
    observedAt: input.observedAt,
    evaluatedAt: new Date(nowMs).toISOString(),
    ageMs,
    thresholdMs,
    severity,
    owner: rule.owner,
    runbookRef: rule.runbookRef,
    blocksNewRisk: true,
    newRiskBlocked: true,
    notificationDeliveryAttempted: false,
    automaticActionTaken: false,
    productionReleaseAuthority: false,
    exchangeWriteSubmitted: false,
    credentialOperationPerformed: false,
    productionFundsMoved: false,
    policyVersion: checkedPolicy.policyVersion,
    schemaVersion: "hyperliquid_testnet_operability_alert.v1"
  };
  const alertHash = hashId("tc_403_operability_alert", alertBody);
  return deepFreeze({
    alertId: `hyperliquid_testnet_operability_alert_${alertHash.slice(2)}`,
    alertHash,
    ...alertBody
  });
}

export function createHyperliquidRestoreManifest(snapshot) {
  exactKeys(
    snapshot,
    [
      "databaseFingerprint",
      "facilityFingerprint",
      "ledgerFingerprint",
      "evidenceFingerprint",
      "executionFingerprint",
      "riskFingerprint",
      "reconciliationFingerprint",
      "fundingFingerprint",
      "settlementFingerprint",
      "facilityCount",
      "ledgerTransactionCount",
      "ledgerEntryCount",
      "evidenceCount",
      "settlementCount",
      "capturedAt"
    ],
    "restore snapshot"
  );
  for (const [name, value] of Object.entries(snapshot)) {
    if (name.endsWith("Fingerprint")) hash(name, value);
    if (name.endsWith("Count")) nonNegativeInteger(name, value, 10_000_000);
  }
  dateTime("capturedAt", snapshot.capturedAt);
  if (
    snapshot.facilityCount === 0 ||
    snapshot.ledgerTransactionCount === 0 ||
    snapshot.ledgerEntryCount === 0 ||
    snapshot.evidenceCount === 0 ||
    snapshot.settlementCount === 0
  ) {
    invalid("restore snapshot must contain Facility, Ledger, Evidence, and settlement truth");
  }
  const manifest = {
    ...clone(snapshot),
    manifestHash: hashId("tc_403_restore_manifest", snapshot),
    schemaVersion: "hyperliquid_testnet_restore_manifest.v1"
  };
  return deepFreeze(manifest);
}

function assertRestoreManifest(value, name) {
  exactKeys(
    value,
    [
      "databaseFingerprint",
      "facilityFingerprint",
      "ledgerFingerprint",
      "evidenceFingerprint",
      "executionFingerprint",
      "riskFingerprint",
      "reconciliationFingerprint",
      "fundingFingerprint",
      "settlementFingerprint",
      "facilityCount",
      "ledgerTransactionCount",
      "ledgerEntryCount",
      "evidenceCount",
      "settlementCount",
      "capturedAt",
      "manifestHash",
      "schemaVersion"
    ],
    name
  );
  if (value.schemaVersion !== "hyperliquid_testnet_restore_manifest.v1") {
    invalid(`${name} schema version is invalid`);
  }
  const {
    manifestHash,
    schemaVersion: _schemaVersion,
    ...snapshot
  } = value;
  hash(`${name}.manifestHash`, manifestHash);
  const rebuilt = createHyperliquidRestoreManifest(snapshot);
  if (rebuilt.manifestHash !== manifestHash) {
    invalid(`${name} hash does not match its complete snapshot`);
  }
  return rebuilt;
}

export function compareHyperliquidRestoreManifests(source, restored, {
  durationMs,
  completedAt
}) {
  const checkedSource = assertRestoreManifest(source, "source restore manifest");
  const checkedRestored = assertRestoreManifest(
    restored,
    "restored restore manifest"
  );
  nonNegativeInteger("durationMs", durationMs, 86_400_000);
  dateTime("completedAt", completedAt);
  const comparedFields = [...RESTORE_COMPARISON_FIELDS];
  const mismatches = RESTORE_COMPARISON_FIELDS.filter(
    (field) => checkedSource[field] !== checkedRestored[field]
  );
  return deepFreeze({
    status: mismatches.length === 0 ? "EXACT_MATCH" : "MISMATCH",
    sourceManifestHash: checkedSource.manifestHash,
    restoredManifestHash: checkedRestored.manifestHash,
    comparedFields,
    mismatchFields: mismatches,
    exactMatch: mismatches.length === 0,
    durationMs,
    completedAt,
    rawDataIncluded: false,
    sourceManifest: checkedSource,
    restoredManifest: checkedRestored,
    schemaVersion: "hyperliquid_testnet_restore_comparison.v1"
  });
}

function assertRestoreResult(value, policy) {
  exactKeys(
    value,
    [
      "status",
      "sourceManifestHash",
      "restoredManifestHash",
      "comparedFields",
      "mismatchFields",
      "exactMatch",
      "durationMs",
      "completedAt",
      "rawDataIncluded",
      "sourceManifest",
      "restoredManifest",
      "schemaVersion"
    ],
    "restoreResult"
  );
  nonNegativeInteger("restoreResult.durationMs", value.durationMs, 86_400_000);
  dateTime("restoreResult.completedAt", value.completedAt);
  if (value.rawDataIncluded !== false) {
    invalid("restore result cannot include raw data");
  }
  const rebuilt = compareHyperliquidRestoreManifests(
    value.sourceManifest,
    value.restoredManifest,
    {
      durationMs: value.durationMs,
      completedAt: value.completedAt
    }
  );
  const fieldsToMatch = [
    "status",
    "sourceManifestHash",
    "restoredManifestHash",
    "exactMatch",
    "rawDataIncluded",
    "schemaVersion"
  ];
  if (
    fieldsToMatch.some((name) => value[name] !== rebuilt[name]) ||
    JSON.stringify(value.comparedFields) !==
      JSON.stringify(rebuilt.comparedFields) ||
    JSON.stringify(value.mismatchFields) !==
      JSON.stringify(rebuilt.mismatchFields)
  ) {
    invalid("restore result does not match its complete manifests");
  }
  const completedMs = new Date(value.completedAt).getTime();
  const capturedMs = new Date(rebuilt.sourceManifest.capturedAt).getTime();
  const backupAgeMs = completedMs - capturedMs;
  if (
    backupAgeMs < 0 ||
    backupAgeMs > policy.objectives.backupMaximumAgeMs ||
    policy.objectives.localRestoreExerciseRpoMs !== 0
  ) {
    invalid("restore result violates backup age or zero-RPO policy");
  }
  if (
    value.durationMs > policy.objectives.localRestoreExerciseRtoMs ||
    rebuilt.exactMatch !== true
  ) {
    invalid("restore result is invalid");
  }
  return rebuilt;
}

function assertFailureDrill(value, { artifactSetHash, policy }) {
  exactKeys(
    value,
    [
      "scenario",
      "status",
      "safeState",
      "newRiskBlocked",
      "uncertainEffectRetried",
      "historyPreserved",
      "externalWriteSubmitted",
      "credentialOperationPerformed",
      "runnerId",
      "artifactSetHash",
      "outputHash",
      "startedAt",
      "evidenceHash",
      "completedAt"
    ],
    "failure drill"
  );
  identifier("failure drill scenario", value.scenario);
  if (
    !DRILL_STATUSES.has(value.status) ||
    !SAFE_STATES.has(value.safeState)
  ) {
    invalid("failure drill status or safe state is invalid");
  }
  hash("failure drill evidenceHash", value.evidenceHash);
  hash("failure drill artifactSetHash", value.artifactSetHash);
  hash("failure drill outputHash", value.outputHash);
  identifier("failure drill runnerId", value.runnerId);
  dateTime("failure drill startedAt", value.startedAt);
  dateTime("failure drill completedAt", value.completedAt);
  for (const name of [
    "newRiskBlocked",
    "uncertainEffectRetried",
    "historyPreserved",
    "externalWriteSubmitted",
    "credentialOperationPerformed"
  ]) {
    if (typeof value[name] !== "boolean") invalid(`failure drill ${name} must be boolean`);
  }
  const expectedSafeState = FAILURE_SCENARIO_SAFE_STATES[value.scenario];
  if (
    !expectedSafeState ||
    value.safeState !== expectedSafeState ||
    value.runnerId !== FAILURE_SCENARIO_RUNNERS[value.scenario] ||
    value.artifactSetHash !== artifactSetHash
  ) {
    invalid("failure drill is not bound to the approved scenario and artifact set");
  }
  const durationMs =
    new Date(value.completedAt).getTime() - new Date(value.startedAt).getTime();
  if (
    durationMs < 0 ||
    durationMs > policy.objectives.localRestoreExerciseRtoMs
  ) {
    invalid("failure drill duration is invalid");
  }
  const { evidenceHash, ...evidenceBody } = value;
  if (hashId("tc_403_failure_drill", evidenceBody) !== evidenceHash) {
    invalid("failure drill hash does not match its complete evidence binding");
  }
}

function assertCapacityResult(value, policy) {
  exactKeys(
    value,
    [
      "probeKind",
      "attemptedEvaluations",
      "completedEvaluations",
      "rejectedOversizeInputs",
      "configuredConcurrencyCeiling",
      "bounded",
      "failClosed",
      "evidenceHash"
    ],
    "capacityResult"
  );
  for (const name of [
    "attemptedEvaluations",
    "completedEvaluations",
    "rejectedOversizeInputs",
    "configuredConcurrencyCeiling"
  ]) {
    nonNegativeInteger(`capacityResult.${name}`, value[name], 10_000_000);
  }
  if (typeof value.bounded !== "boolean" || typeof value.failClosed !== "boolean") {
    invalid("capacity result booleans are invalid");
  }
  hash("capacityResult.evidenceHash", value.evidenceHash);
  if (
    value.probeKind !== CAPACITY_PROBE_KIND ||
    value.attemptedEvaluations !== policy.capacity.loadProbeEvaluations ||
    value.completedEvaluations + value.rejectedOversizeInputs !==
      value.attemptedEvaluations ||
    value.rejectedOversizeInputs < 1 ||
    value.configuredConcurrencyCeiling !==
      policy.capacity.maximumConcurrentEvaluations ||
    value.bounded !== true ||
    value.failClosed !== true
  ) {
    invalid("capacity result does not match the source-fixed boundary probe");
  }
  const expectedHash = hashId("tc_403_capacity_probe", {
    probeKind: value.probeKind,
    attempted: value.attemptedEvaluations,
    completed: value.completedEvaluations,
    rejected: value.rejectedOversizeInputs,
    maximumAssuranceInputBytes:
      policy.capacity.maximumAssuranceInputBytes,
    configuredConcurrencyCeiling:
      value.configuredConcurrencyCeiling
  });
  if (value.evidenceHash !== expectedHash) {
    invalid("capacity result hash does not match its complete evidence binding");
  }
}

function assertFinding(value) {
  exactKeys(
    value,
    [
      "findingId",
      "severity",
      "status",
      "summary",
      "evidenceHash",
      "retestEvidenceHash"
    ],
    "finding"
  );
  findingId(value.findingId);
  if (!SEVERITIES.has(value.severity) || !FINDING_STATUSES.has(value.status)) {
    invalid("finding severity or status is invalid");
  }
  identifier("finding.summary", value.summary);
  hash("finding.evidenceHash", value.evidenceHash);
  if (value.retestEvidenceHash !== null) {
    hash("finding.retestEvidenceHash", value.retestEvidenceHash);
  }
  if (
    value.status === "resolved" &&
    value.retestEvidenceHash === null
  ) {
    invalid("resolved findings require retest evidence");
  }
}

function assertIndependentReview(value, context) {
  exactKeys(
    value,
    [
      "status",
      "reviewerId",
      "reviewerType",
      "reportHash",
      "attestationHash",
      "reviewedAt",
      "reviewedReleaseCommit",
      "reviewedArtifactSetHash",
      "reviewedPolicyHash",
      "findingsHash",
      "independentFromCommissioningOwner"
    ],
    "independentReview"
  );
  if (!REVIEW_STATUSES.has(value.status)) {
    invalid("independent review status is invalid");
  }
  if (value.status === "NOT_PERFORMED") {
    if (
      value.reviewerId !== null ||
      value.reviewerType !== null ||
      value.reportHash !== null ||
      value.attestationHash !== null ||
      value.reviewedAt !== null ||
      value.reviewedReleaseCommit !== null ||
      value.reviewedArtifactSetHash !== null ||
      value.reviewedPolicyHash !== null ||
      value.findingsHash !== null ||
      value.independentFromCommissioningOwner !== false
    ) {
      invalid("unperformed independent review cannot contain review evidence");
    }
    return;
  }
  identifier("independentReview.reviewerId", value.reviewerId);
  if (value.reviewerType !== "external_human_or_organization") {
    invalid("independent review must come from an external human or organization");
  }
  hash("independentReview.reportHash", value.reportHash);
  hash("independentReview.attestationHash", value.attestationHash);
  hash("independentReview.reviewedArtifactSetHash", value.reviewedArtifactSetHash);
  hash("independentReview.reviewedPolicyHash", value.reviewedPolicyHash);
  hash("independentReview.findingsHash", value.findingsHash);
  dateTime("independentReview.reviewedAt", value.reviewedAt);
  const expectedReportHash = hashId("tc_403_independent_review_report", {
    reviewerId: value.reviewerId,
    reviewerType: value.reviewerType,
    reviewedAt: value.reviewedAt,
    reviewedReleaseCommit: value.reviewedReleaseCommit,
    reviewedArtifactSetHash: value.reviewedArtifactSetHash,
    reviewedPolicyHash: value.reviewedPolicyHash,
    findingsHash: value.findingsHash,
    independentFromCommissioningOwner:
      value.independentFromCommissioningOwner
  });
  if (
    value.independentFromCommissioningOwner !== true ||
    value.reviewerId === context.commissioningOwner ||
    context.assignedIndependentReviewer !== value.reviewerId ||
    context.assignedIndependentReviewerType !== value.reviewerType ||
    value.reviewedReleaseCommit !== context.releaseCommit ||
    value.reviewedArtifactSetHash !== context.artifactSetHash ||
    value.reviewedPolicyHash !== context.policyHash ||
    value.findingsHash !== context.findingsHash ||
    value.reportHash !== expectedReportHash ||
    new Date(value.reviewedAt).getTime() >
      new Date(context.completedAt).getTime()
  ) {
    invalid(
      "independent review must be externally assigned and bound to the exact release, artifact set, policy, findings, and completion time"
    );
  }
}

export function createHyperliquidFailureDrill({
  scenario,
  status = "PASSED",
  safeState,
  evidence,
  runnerId,
  artifactSetHash,
  startedAt,
  completedAt
}) {
  identifier("scenario", scenario);
  identifier("runnerId", runnerId);
  hash("artifactSetHash", artifactSetHash);
  if (!DRILL_STATUSES.has(status) || !SAFE_STATES.has(safeState)) {
    invalid("failure drill status or safe state is invalid");
  }
  if (FAILURE_SCENARIO_SAFE_STATES[scenario] !== safeState) {
    invalid("failure drill safe state is not source-fixed for the scenario");
  }
  if (FAILURE_SCENARIO_RUNNERS[scenario] !== runnerId) {
    invalid("failure drill runner is not source-fixed for the scenario");
  }
  dateTime("startedAt", startedAt);
  dateTime("completedAt", completedAt);
  const passed = status === "PASSED";
  const evidenceBody = {
    scenario,
    status,
    safeState,
    newRiskBlocked: true,
    uncertainEffectRetried: false,
    historyPreserved: passed,
    externalWriteSubmitted: false,
    credentialOperationPerformed: false,
    runnerId,
    artifactSetHash,
    outputHash: hashId("tc_403_failure_drill_output", evidence),
    startedAt,
    completedAt
  };
  return deepFreeze({
    ...evidenceBody,
    evidenceHash: hashId("tc_403_failure_drill", evidenceBody)
  });
}

export function runHyperliquidOperabilityCapacityProbe(policy) {
  const checked = assertHyperliquidTestnetOperabilityPolicy(policy);
  const attempted = checked.capacity.loadProbeEvaluations;
  let completed = 0;
  let rejected = 0;
  for (let index = 0; index < attempted; index += 1) {
    const bytes = index % 257 === 0
      ? checked.capacity.maximumAssuranceInputBytes + 1
      : 512 + (index % 4096);
    if (bytes > checked.capacity.maximumAssuranceInputBytes) {
      rejected += 1;
      continue;
    }
    completed += 1;
  }
  const result = {
    probeKind: CAPACITY_PROBE_KIND,
    attemptedEvaluations: attempted,
    completedEvaluations: completed,
    rejectedOversizeInputs: rejected,
    configuredConcurrencyCeiling:
      checked.capacity.maximumConcurrentEvaluations,
    bounded: completed + rejected === attempted,
    failClosed: rejected > 0,
    evidenceHash: hashId("tc_403_capacity_probe", {
      probeKind: CAPACITY_PROBE_KIND,
      attempted,
      completed,
      rejected,
      maximumAssuranceInputBytes:
        checked.capacity.maximumAssuranceInputBytes,
      configuredConcurrencyCeiling:
        checked.capacity.maximumConcurrentEvaluations
    })
  };
  return deepFreeze(result);
}

export function evaluateHyperliquidTestnetOperabilityAssurance(
  input,
  { policy }
) {
  const checkedPolicy = assertHyperliquidTestnetOperabilityPolicy(policy);
  plainObject(input, "assurance input");
  let inputBytes;
  try {
    inputBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  } catch {
    invalid("assurance input must be safely serializable");
  }
  if (inputBytes > checkedPolicy.capacity.maximumAssuranceInputBytes) {
    invalid("assurance input exceeds the policy byte bound");
  }
  exactKeys(
    input,
    [
      "facilityId",
      "facilityHash",
      "releaseCommit",
      "artifactSetHash",
      "restoreResult",
      "failureDrills",
      "alertRoutes",
      "capacityResult",
      "findings",
      "independentReview",
      "completedAt"
    ],
    "assurance input"
  );
  identifier("facilityId", input.facilityId);
  hash("facilityHash", input.facilityHash);
  if (!/^[0-9a-f]{40}$/.test(input.releaseCommit)) {
    invalid("releaseCommit must be an exact Git SHA-1");
  }
  hash("artifactSetHash", input.artifactSetHash);
  assertRestoreResult(input.restoreResult, checkedPolicy);
  if (
    !Array.isArray(input.failureDrills) ||
    input.failureDrills.length > checkedPolicy.capacity.maximumFailureDrills
  ) {
    invalid("failureDrills exceed the policy bound");
  }
  const scenarios = new Set();
  for (const drill of input.failureDrills) {
    assertFailureDrill(drill, {
      artifactSetHash: input.artifactSetHash,
      policy: checkedPolicy
    });
    if (scenarios.has(drill.scenario)) invalid("failure drill scenarios must be unique");
    scenarios.add(drill.scenario);
  }
  if (
    !Array.isArray(input.alertRoutes) ||
    input.alertRoutes.length > checkedPolicy.capacity.maximumAlertRoutes
  ) {
    invalid("alertRoutes exceed the policy bound");
  }
  const expectedAlerts = new Map(
    checkedPolicy.alerts.map((alert) => [alert.signalType, alert])
  );
  const alertSignals = new Set();
  for (const alert of input.alertRoutes) {
    exactKeys(
      alert,
      ["signalType", "owner", "runbookRef", "configured"],
      "alert route"
    );
    if (
      typeof alert.signalType !== "string" ||
      !SIGNAL.test(alert.signalType) ||
      alertSignals.has(alert.signalType)
    ) {
      invalid("alert route signal is invalid or duplicated");
    }
    alertSignals.add(alert.signalType);
    identifier("alert route owner", alert.owner);
    identifier("alert route runbookRef", alert.runbookRef);
    if (typeof alert.configured !== "boolean") invalid("alert route configured must be boolean");
  }
  assertCapacityResult(input.capacityResult, checkedPolicy);
  if (
    !Array.isArray(input.findings) ||
    input.findings.length > checkedPolicy.capacity.maximumFindings
  ) {
    invalid("findings exceed the policy bound");
  }
  const findingIds = new Set();
  for (const finding of input.findings) {
    assertFinding(finding);
    if (findingIds.has(finding.findingId)) invalid("finding IDs must be unique");
    findingIds.add(finding.findingId);
  }
  dateTime("completedAt", input.completedAt);
  const policyHash = hashId("tc_403_operability_policy", checkedPolicy);
  const findingsHash = hashId(
    "tc_403_independent_review_findings",
    input.findings
  );
  assertIndependentReview(
    input.independentReview,
    {
      commissioningOwner:
        checkedPolicy.accountability.independentReviewCommissioningOwner,
      assignedIndependentReviewer:
        checkedPolicy.accountability.independentReviewer,
      assignedIndependentReviewerType:
        checkedPolicy.accountability.independentReviewerType,
      releaseCommit: input.releaseCommit,
      artifactSetHash: input.artifactSetHash,
      policyHash,
      findingsHash,
      completedAt: input.completedAt
    }
  );

  const missingScenarios = checkedPolicy.requiredFailureScenarios.filter(
    (scenario) => !scenarios.has(scenario)
  );
  const failedScenarios = input.failureDrills
    .filter(
      (drill) =>
        drill.status !== "PASSED" ||
        drill.newRiskBlocked !== true ||
        drill.uncertainEffectRetried !== false ||
        drill.historyPreserved !== true ||
        drill.externalWriteSubmitted !== false ||
        drill.credentialOperationPerformed !== false
    )
    .map((drill) => drill.scenario);
  const missingAlertRoutes = checkedPolicy.alerts
    .filter((expected) => {
      const actual = input.alertRoutes.find(
        (route) => route.signalType === expected.signalType
      );
      return (
        !actual ||
        actual.configured !== true ||
        actual.owner !== expected.owner ||
        actual.runbookRef !== expected.runbookRef
      );
    })
    .map((alert) => alert.signalType);
  const openP0 = input.findings.filter(
    (finding) =>
      finding.severity === "P0" &&
      ["open", "accepted_launch_blocker"].includes(finding.status)
  );
  const openP1 = input.findings.filter(
    (finding) =>
      finding.severity === "P1" &&
      ["open", "accepted_launch_blocker"].includes(finding.status)
  );
  const assurancePassed =
    input.restoreResult.status === "EXACT_MATCH" &&
    input.restoreResult.exactMatch === true &&
    input.restoreResult.mismatchFields.length === 0 &&
    input.restoreResult.rawDataIncluded === false &&
    input.restoreResult.durationMs <=
      checkedPolicy.objectives.localRestoreExerciseRtoMs &&
    missingScenarios.length === 0 &&
    failedScenarios.length === 0 &&
    missingAlertRoutes.length === 0 &&
    input.capacityResult.bounded === true &&
    input.capacityResult.failClosed === true;
  const findingsPassed = openP0.length === 0 && openP1.length === 0;
  const independentReviewPassed =
    input.independentReview.status === "PASSED";

  let releaseStatus =
    HyperliquidOperabilityReleaseStatus.READY_FOR_HUMAN_ACCEPTANCE;
  const blockerReasonCodes = [];
  if (!assurancePassed) {
    releaseStatus = HyperliquidOperabilityReleaseStatus.BLOCKED_ASSURANCE;
    blockerReasonCodes.push("operability_assurance_incomplete");
  }
  if (!findingsPassed) {
    releaseStatus = HyperliquidOperabilityReleaseStatus.BLOCKED_FINDINGS;
    blockerReasonCodes.push("open_p0_p1_findings");
  }
  if (assurancePassed && findingsPassed && !independentReviewPassed) {
    releaseStatus =
      HyperliquidOperabilityReleaseStatus.BLOCKED_INDEPENDENT_REVIEW;
    blockerReasonCodes.push("independent_review_not_accepted");
  }
  if (assurancePassed && findingsPassed && independentReviewPassed) {
    blockerReasonCodes.push("founder_acceptance_required");
  }
  const implementationStatus =
    assurancePassed && findingsPassed
      ? HyperliquidOperabilityImplementationStatus.IMPLEMENTED_UNVERIFIED
      : HyperliquidOperabilityImplementationStatus.BLOCKED;
  const assuranceBody = {
    facilityId: input.facilityId,
    facilityHash: input.facilityHash,
    releaseCommit: input.releaseCommit,
    artifactSetHash: input.artifactSetHash,
    policyVersion: checkedPolicy.policyVersion,
    policyHash,
    owners: checkedPolicy.accountability,
    objectives: checkedPolicy.objectives,
    restoreResult: input.restoreResult,
    failureDrills: input.failureDrills,
    alertRoutes: input.alertRoutes,
    capacityResult: input.capacityResult,
    findings: input.findings,
    independentReview: input.independentReview,
    missingFailureScenarios: missingScenarios,
    failedFailureScenarios: failedScenarios,
    missingAlertRoutes,
    openP0Count: openP0.length,
    openP1Count: openP1.length,
    implementationStatus,
    releaseStatus,
    launchBlocked: true,
    blockerReasonCodes,
    completedAt: input.completedAt,
    automaticRecoveryEnabled: false,
    automaticUnfreezeEnabled: false,
    automaticKeyOperationEnabled: false,
    notificationDeliveryEnabled: false,
    protectedSchedulingEnabled: false,
    exchangeWritesEnabled: false,
    apiWalletOperationsEnabled: false,
    mainnetAuthority: false,
    productionAuthority: false,
    fundsAuthority: false,
    realFunds: false,
    productionFundsMoved: false,
    piiIncluded: false,
    secretsIncluded: false,
    schemaVersion: HYPERLIQUID_TESTNET_OPERABILITY_SCHEMA_VERSION
  };
  const assuranceHash = hashId(
    "tc_403_operability_assurance",
    assuranceBody
  );
  return deepFreeze({
    assuranceId: `hyperliquid_testnet_operability_${assuranceHash.slice(2)}`,
    assuranceHash,
    ...clone(assuranceBody)
  });
}
