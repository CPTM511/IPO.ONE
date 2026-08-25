import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { verifyM2BSecuredFacilityComposition } from "./m2b-secured-facility-composition.js";

export const M2B_DUAL_RISK_SNAPSHOT_SCHEMA_VERSION = "m2b_dual_risk_snapshot.v1";
export const M2B_DUAL_RISK_INCIDENT_SCHEMA_VERSION = "m2b_dual_risk_incident.v1";

export const M2BDualRiskFreshness = Object.freeze({
  FRESH: "FRESH",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN"
});

export const M2BDualRiskState = Object.freeze({
  NORMAL: "NORMAL",
  WARNING: "WARNING",
  REDUCE_ONLY: "REDUCE_ONLY",
  FLATTEN: "FLATTEN",
  SETTLEMENT: "SETTLEMENT"
});

export const M2BRecoveryStage = Object.freeze({
  FREEZE_NEW_RISK: "FREEZE_NEW_RISK",
  CANCEL: "CANCEL",
  REDUCE_OR_FLATTEN: "REDUCE_OR_FLATTEN",
  RECONCILE: "RECONCILE",
  REPAY_OR_LIQUIDATE: "REPAY_OR_LIQUIDATE",
  SETTLEMENT_REVIEW: "SETTLEMENT_REVIEW"
});

export const M2B_RECOVERY_STAGE_ORDER = Object.freeze([
  M2BRecoveryStage.FREEZE_NEW_RISK,
  M2BRecoveryStage.CANCEL,
  M2BRecoveryStage.REDUCE_OR_FLATTEN,
  M2BRecoveryStage.RECONCILE,
  M2BRecoveryStage.REPAY_OR_LIQUIDATE,
  M2BRecoveryStage.SETTLEMENT_REVIEW
]);

const HASH = /^0x[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{2,255}$/;
const FRESHNESS = new Set(Object.values(M2BDualRiskFreshness));
const STATES = Object.values(M2BDualRiskState);
const STATE_RANK = new Map(STATES.map((state, index) => [state, index]));
const POOL_HEALTH = new Set(["HEALTHY", "WARNING", "LIQUIDATABLE", "UNKNOWN"]);
const VENUE_MARGIN = new Set(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]);
const RECONCILIATION = new Set(["RECONCILED", "UNRECONCILED", "UNKNOWN"]);

function fail(code, message) {
  throw new DomainError(code, message);
}

function plain(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
}

function exact(name, value, fields) {
  if (!plain(value) || Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))) {
    fail("invalid_m2b_dual_risk_input", `${name} has an invalid closed shape`);
  }
}

function bytes32(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    fail("invalid_m2b_dual_risk_input", `${name} must be lowercase bytes32`);
  }
}

function trustedDate(name, value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("invalid_m2b_dual_risk_input", `${name} must be a trusted Date`);
  }
  return new Date(value.getTime());
}

function canonicalTime(name, value) {
  if (typeof value !== "string") {
    fail("invalid_m2b_dual_risk_input", `${name} must be canonical ISO time`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("invalid_m2b_dual_risk_input", `${name} must be canonical ISO time`);
  }
}

function maxState(...states) {
  return states.reduce((current, candidate) =>
    STATE_RANK.get(candidate) > STATE_RANK.get(current) ? candidate : current,
  M2BDualRiskState.NORMAL);
}

function validatePoolRisk(value, composition) {
  const fields = [
    "poolObservationHash", "poolProjectionHash", "freshness",
    "reconciliationStatus", "healthState", "riskState", "newRiskFrozen",
    "liquidatable"
  ];
  exact("poolRisk", value, fields);
  bytes32("poolObservationHash", value.poolObservationHash);
  bytes32("poolProjectionHash", value.poolProjectionHash);
  if (value.poolProjectionHash !== composition.poolProjectionHash ||
    !FRESHNESS.has(value.freshness) ||
    !RECONCILIATION.has(value.reconciliationStatus) ||
    !POOL_HEALTH.has(value.healthState) || !STATE_RANK.has(value.riskState) ||
    typeof value.newRiskFrozen !== "boolean" ||
    typeof value.liquidatable !== "boolean") {
    fail("m2b_pool_risk_binding_denied", "Pool risk is not exact current composition truth");
  }
}

function validateVenueRisk(value, composition) {
  const fields = [
    "venueObservationHash", "compositionHash", "freshness",
    "reconciliationStatus", "marginState", "riskState", "unknownOutcome"
  ];
  exact("venueRisk", value, fields);
  bytes32("venueObservationHash", value.venueObservationHash);
  bytes32("compositionHash", value.compositionHash);
  if (value.compositionHash !== composition.compositionHash ||
    !FRESHNESS.has(value.freshness) ||
    !RECONCILIATION.has(value.reconciliationStatus) ||
    !VENUE_MARGIN.has(value.marginState) || !STATE_RANK.has(value.riskState) ||
    typeof value.unknownOutcome !== "boolean") {
    fail("m2b_venue_risk_binding_denied", "Venue risk is not exact current composition truth");
  }
}

function snapshotCore(value) {
  return {
    compositionId: value.compositionId,
    compositionHash: value.compositionHash,
    subjectId: value.subjectId,
    principalId: value.principalId,
    obligationId: value.obligationId,
    tradingFacilityId: value.tradingFacilityId,
    poolObservationHash: value.poolObservationHash,
    poolProjectionHash: value.poolProjectionHash,
    poolFreshness: value.poolFreshness,
    poolReconciliationStatus: value.poolReconciliationStatus,
    poolHealthState: value.poolHealthState,
    poolRiskState: value.poolRiskState,
    poolNewRiskFrozen: value.poolNewRiskFrozen,
    poolLiquidatable: value.poolLiquidatable,
    venueObservationHash: value.venueObservationHash,
    venueFreshness: value.venueFreshness,
    venueReconciliationStatus: value.venueReconciliationStatus,
    venueMarginState: value.venueMarginState,
    venueRiskState: value.venueRiskState,
    venueUnknownOutcome: value.venueUnknownOutcome,
    combinedRiskState: value.combinedRiskState,
    freezeNewRiskRequired: value.freezeNewRiskRequired,
    lossDisposition: "CANONICAL_OBLIGATION_REMAINS_OUTSTANDING",
    reasonCodes: value.reasonCodes,
    observedAt: value.observedAt,
    protectiveAuthorityCanExpandRisk: false,
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: M2B_DUAL_RISK_SNAPSHOT_SCHEMA_VERSION
  };
}

const SNAPSHOT_FIELDS = [
  "dualRiskSnapshotId", "snapshotHash", "compositionId", "compositionHash",
  "subjectId", "principalId", "obligationId", "tradingFacilityId",
  "poolObservationHash", "poolProjectionHash", "poolFreshness",
  "poolReconciliationStatus", "poolHealthState", "poolRiskState",
  "poolNewRiskFrozen", "poolLiquidatable", "venueObservationHash",
  "venueFreshness", "venueReconciliationStatus", "venueMarginState",
  "venueRiskState", "venueUnknownOutcome", "combinedRiskState",
  "freezeNewRiskRequired", "lossDisposition", "reasonCodes", "observedAt",
  "protectiveAuthorityCanExpandRisk", "externalNonceAllocated",
  "signatureCreated", "networkCalled", "productionAuthority",
  "realFundsAuthority", "schemaVersion"
];

export function verifyM2BDualRiskSnapshot(value) {
  exact("dualRiskSnapshot", value, SNAPSHOT_FIELDS);
  for (const field of [
    "snapshotHash", "compositionHash", "poolObservationHash",
    "poolProjectionHash", "venueObservationHash"
  ]) bytes32(field, value[field]);
  canonicalTime("observedAt", value.observedAt);
  if (value.dualRiskSnapshotId !== `m2b_dual_risk_snapshot_${value.snapshotHash.slice(2)}` ||
    [value.compositionId, value.subjectId, value.principalId, value.obligationId,
      value.tradingFacilityId].some((item) => !IDENTIFIER.test(item ?? "")) ||
    !FRESHNESS.has(value.poolFreshness) || !FRESHNESS.has(value.venueFreshness) ||
    !RECONCILIATION.has(value.poolReconciliationStatus) ||
    !RECONCILIATION.has(value.venueReconciliationStatus) ||
    !POOL_HEALTH.has(value.poolHealthState) || !VENUE_MARGIN.has(value.venueMarginState) ||
    !STATE_RANK.has(value.poolRiskState) || !STATE_RANK.has(value.venueRiskState) ||
    typeof value.poolNewRiskFrozen !== "boolean" || typeof value.poolLiquidatable !== "boolean" ||
    typeof value.venueUnknownOutcome !== "boolean" ||
    typeof value.freezeNewRiskRequired !== "boolean" ||
    !Array.isArray(value.reasonCodes) ||
    value.reasonCodes.some((reason) => typeof reason !== "string") ||
    JSON.stringify(value.reasonCodes) !== JSON.stringify([...new Set(value.reasonCodes)].sort()) ||
    !STATE_RANK.has(value.combinedRiskState) ||
    value.schemaVersion !== M2B_DUAL_RISK_SNAPSHOT_SCHEMA_VERSION ||
    value.lossDisposition !== "CANONICAL_OBLIGATION_REMAINS_OUTSTANDING" ||
    value.protectiveAuthorityCanExpandRisk !== false ||
    value.externalNonceAllocated !== false || value.signatureCreated !== false ||
    value.networkCalled !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    hashId("m2b_dual_risk_snapshot", snapshotCore(value)) !== value.snapshotHash) {
    fail("invalid_m2b_dual_risk_snapshot", "dual-risk snapshot drifted");
  }
  return true;
}

export function createM2BDualRiskSnapshot({
  composition,
  poolRisk,
  venueRisk,
  observedAt = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0) {
    fail("invalid_m2b_dual_risk_input", "dual-risk snapshot input is open");
  }
  verifyM2BSecuredFacilityComposition(composition);
  validatePoolRisk(poolRisk, composition);
  validateVenueRisk(venueRisk, composition);
  const observationTime = trustedDate("observedAt", observedAt);
  if (observationTime < new Date(composition.preparedAt)) {
    fail("m2b_dual_risk_time_denied", "dual-risk observation predates composition");
  }

  const reasons = [];
  let combinedRiskState = maxState(poolRisk.riskState, venueRisk.riskState);
  if (poolRisk.freshness !== M2BDualRiskFreshness.FRESH) reasons.push("pool_truth_not_fresh");
  if (venueRisk.freshness !== M2BDualRiskFreshness.FRESH) reasons.push("venue_truth_not_fresh");
  if (poolRisk.reconciliationStatus !== "RECONCILED") reasons.push("pool_truth_not_reconciled");
  if (venueRisk.reconciliationStatus !== "RECONCILED") reasons.push("venue_truth_not_reconciled");
  if (venueRisk.unknownOutcome) reasons.push("venue_outcome_unknown");
  if (poolRisk.healthState === "UNKNOWN") reasons.push("pool_health_unknown");
  if (venueRisk.marginState === "UNKNOWN") reasons.push("venue_margin_unknown");
  if (poolRisk.liquidatable || poolRisk.healthState === "LIQUIDATABLE") {
    reasons.push("pool_liquidatable");
    combinedRiskState = maxState(combinedRiskState, M2BDualRiskState.FLATTEN);
  }
  if (venueRisk.marginState === "CRITICAL") {
    reasons.push("venue_margin_critical");
    combinedRiskState = maxState(combinedRiskState, M2BDualRiskState.FLATTEN);
  }
  if (reasons.some((reason) => reason.includes("not_fresh") ||
    reason.includes("not_reconciled") || reason.includes("unknown"))) {
    combinedRiskState = maxState(combinedRiskState, M2BDualRiskState.REDUCE_ONLY);
  }
  if (poolRisk.healthState === "WARNING" || venueRisk.marginState === "WARNING") {
    combinedRiskState = maxState(combinedRiskState, M2BDualRiskState.WARNING);
  }
  const freezeNewRiskRequired = combinedRiskState !== M2BDualRiskState.NORMAL ||
    poolRisk.newRiskFrozen;
  if (freezeNewRiskRequired) reasons.push("new_risk_must_remain_frozen");

  const value = snapshotCore({
    compositionId: composition.m2bHyperliquidCompositionId,
    compositionHash: composition.compositionHash,
    subjectId: composition.subjectId,
    principalId: composition.principalId,
    obligationId: composition.obligationId,
    tradingFacilityId: composition.tradingFacilityId,
    poolObservationHash: poolRisk.poolObservationHash,
    poolProjectionHash: poolRisk.poolProjectionHash,
    poolFreshness: poolRisk.freshness,
    poolReconciliationStatus: poolRisk.reconciliationStatus,
    poolHealthState: poolRisk.healthState,
    poolRiskState: poolRisk.riskState,
    poolNewRiskFrozen: poolRisk.newRiskFrozen,
    poolLiquidatable: poolRisk.liquidatable,
    venueObservationHash: venueRisk.venueObservationHash,
    venueFreshness: venueRisk.freshness,
    venueReconciliationStatus: venueRisk.reconciliationStatus,
    venueMarginState: venueRisk.marginState,
    venueRiskState: venueRisk.riskState,
    venueUnknownOutcome: venueRisk.unknownOutcome,
    combinedRiskState,
    freezeNewRiskRequired,
    reasonCodes: Object.freeze([...new Set(reasons)].sort()),
    observedAt: observationTime.toISOString()
  });
  const snapshotHash = hashId("m2b_dual_risk_snapshot", value);
  const snapshot = Object.freeze({
    dualRiskSnapshotId: `m2b_dual_risk_snapshot_${snapshotHash.slice(2)}`,
    snapshotHash,
    ...value
  });
  verifyM2BDualRiskSnapshot(snapshot);
  return snapshot;
}

function incidentCore(value) {
  return {
    compositionId: value.compositionId,
    compositionHash: value.compositionHash,
    snapshotHash: value.snapshotHash,
    subjectId: value.subjectId,
    principalId: value.principalId,
    obligationId: value.obligationId,
    tradingFacilityId: value.tradingFacilityId,
    combinedRiskState: value.combinedRiskState,
    lossDisposition: "CANONICAL_OBLIGATION_REMAINS_OUTSTANDING",
    state: value.state,
    currentStage: value.currentStage,
    stagePlan: value.stagePlan,
    reasonCodes: value.reasonCodes,
    openedAt: value.openedAt,
    version: value.version,
    priorIncidentHash: value.priorIncidentHash,
    protectiveAuthorityCanExpandRisk: false,
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    productionAuthority: false,
    realFundsAuthority: false,
    schemaVersion: M2B_DUAL_RISK_INCIDENT_SCHEMA_VERSION
  };
}

const INCIDENT_FIELDS = [
  "dualRiskIncidentId", "incidentHash", "compositionId", "compositionHash",
  "snapshotHash", "subjectId", "principalId", "obligationId",
  "tradingFacilityId", "combinedRiskState", "state", "currentStage",
  "stagePlan", "lossDisposition", "reasonCodes", "openedAt", "version", "priorIncidentHash",
  "protectiveAuthorityCanExpandRisk", "externalNonceAllocated",
  "signatureCreated", "networkCalled", "productionAuthority",
  "realFundsAuthority", "schemaVersion"
];

export function verifyM2BDualRiskRecoveryIncident(value) {
  exact("dualRiskIncident", value, INCIDENT_FIELDS);
  for (const field of ["incidentHash", "compositionHash", "snapshotHash"]) {
    bytes32(field, value[field]);
  }
  if (value.priorIncidentHash !== null) bytes32("priorIncidentHash", value.priorIncidentHash);
  canonicalTime("openedAt", value.openedAt);
  if (value.dualRiskIncidentId !== `m2b_dual_risk_incident_${value.incidentHash.slice(2)}` ||
    [value.compositionId, value.subjectId, value.principalId, value.obligationId,
      value.tradingFacilityId].some((item) => !IDENTIFIER.test(item ?? "")) ||
    value.state !== "OPEN" || value.version !== 1 ||
    !STATE_RANK.has(value.combinedRiskState) ||
    !M2B_RECOVERY_STAGE_ORDER.includes(value.currentStage) ||
    !Array.isArray(value.stagePlan) || value.stagePlan.length !== M2B_RECOVERY_STAGE_ORDER.length ||
    value.stagePlan.some((item, index) => !plain(item) ||
      JSON.stringify(Object.keys(item).sort()) !==
        JSON.stringify(["evidenceHash", "externalWriteAuthorized", "stage", "status"]) ||
      item.stage !== M2B_RECOVERY_STAGE_ORDER[index] ||
      typeof item.status !== "string" || item.externalWriteAuthorized !== false ||
      item.evidenceHash !== null) ||
    !Array.isArray(value.reasonCodes) ||
    value.lossDisposition !== "CANONICAL_OBLIGATION_REMAINS_OUTSTANDING" ||
    value.schemaVersion !== M2B_DUAL_RISK_INCIDENT_SCHEMA_VERSION ||
    value.protectiveAuthorityCanExpandRisk !== false ||
    value.externalNonceAllocated !== false || value.signatureCreated !== false ||
    value.networkCalled !== false || value.productionAuthority !== false ||
    value.realFundsAuthority !== false ||
    hashId("m2b_dual_risk_incident", incidentCore(value)) !== value.incidentHash) {
    fail("invalid_m2b_dual_risk_incident", "dual-risk incident drifted");
  }
  return true;
}

function initialStagePlan(snapshot) {
  return Object.freeze(M2B_RECOVERY_STAGE_ORDER.map((stage) => Object.freeze({
    stage,
    status: stage === M2BRecoveryStage.FREEZE_NEW_RISK
      ? (snapshot.poolNewRiskFrozen ? "COMPLETED_OBSERVED" : "REQUIRED_INTERNAL")
      : stage === M2BRecoveryStage.RECONCILE
        ? "REQUIRED_READ_ONLY"
        : stage === M2BRecoveryStage.SETTLEMENT_REVIEW
          ? "REQUIRED_HUMAN_REVIEW"
          : "BLOCKED_EXTERNAL_APPROVAL",
    externalWriteAuthorized: false,
    evidenceHash: null
  })));
}

export function createM2BDualRiskRecoveryIncident({
  snapshot,
  openedAt = new Date(),
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0 || !plain(snapshot) ||
    snapshot.schemaVersion !== M2B_DUAL_RISK_SNAPSHOT_SCHEMA_VERSION) {
    fail("invalid_m2b_dual_risk_incident", "verified dual-risk snapshot required");
  }
  bytes32("snapshotHash", snapshot.snapshotHash);
  if (snapshot.combinedRiskState === M2BDualRiskState.NORMAL &&
    snapshot.freezeNewRiskRequired === false) {
    fail("m2b_recovery_incident_not_required", "normal reconciled truth does not open an incident");
  }
  const opened = trustedDate("openedAt", openedAt);
  if (opened < new Date(snapshot.observedAt)) {
    fail("m2b_dual_risk_time_denied", "incident predates its risk snapshot");
  }
  const stagePlan = initialStagePlan(snapshot);
  const currentStage = stagePlan.find((item) => !item.status.startsWith("COMPLETED"))?.stage ??
    M2BRecoveryStage.SETTLEMENT_REVIEW;
  const value = incidentCore({
    compositionId: snapshot.compositionId,
    compositionHash: snapshot.compositionHash,
    snapshotHash: snapshot.snapshotHash,
    subjectId: snapshot.subjectId,
    principalId: snapshot.principalId,
    obligationId: snapshot.obligationId,
    tradingFacilityId: snapshot.tradingFacilityId,
    combinedRiskState: snapshot.combinedRiskState,
    state: "OPEN",
    currentStage,
    stagePlan,
    reasonCodes: snapshot.reasonCodes,
    openedAt: opened.toISOString(),
    version: 1,
    priorIncidentHash: null
  });
  const incidentHash = hashId("m2b_dual_risk_incident", value);
  const incident = Object.freeze({
    dualRiskIncidentId: `m2b_dual_risk_incident_${incidentHash.slice(2)}`,
    incidentHash,
    ...value
  });
  verifyM2BDualRiskRecoveryIncident(incident);
  return incident;
}

export function assertM2BRecoveryTransition({
  incident,
  nextCombinedRiskState,
  completedStage,
  evidenceHash,
  ...unknown
}) {
  if (Object.keys(unknown).length !== 0 ||
    incident?.schemaVersion !== M2B_DUAL_RISK_INCIDENT_SCHEMA_VERSION ||
    !STATE_RANK.has(nextCombinedRiskState) ||
    !M2B_RECOVERY_STAGE_ORDER.includes(completedStage)) {
    fail("invalid_m2b_recovery_transition", "closed current incident transition required");
  }
  bytes32("evidenceHash", evidenceHash);
  if (STATE_RANK.get(nextCombinedRiskState) < STATE_RANK.get(incident.combinedRiskState)) {
    fail("m2b_recovery_automatic_relaxation_denied", "recovery cannot automatically become less restrictive");
  }
  const currentIndex = M2B_RECOVERY_STAGE_ORDER.indexOf(incident.currentStage);
  const completedIndex = M2B_RECOVERY_STAGE_ORDER.indexOf(completedStage);
  if (completedIndex !== currentIndex ||
    ![M2BRecoveryStage.FREEZE_NEW_RISK, M2BRecoveryStage.RECONCILE].includes(completedStage)) {
    fail("m2b_recovery_external_action_denied", "only current local freeze or read-only reconciliation can advance");
  }
  return true;
}

export function createM2B003RecoveryReadiness({ snapshot = null, incident = null, ...unknown } = {}) {
  if (Object.keys(unknown).length !== 0) {
    fail("invalid_m2b_dual_risk_readiness", "readiness input is open");
  }
  const blockers = [];
  if (!snapshot) blockers.push("fresh_dual_risk_snapshot_missing");
  if (!incident) blockers.push("durable_recovery_incident_missing");
  if (snapshot && (snapshot.poolFreshness !== "FRESH" || snapshot.venueFreshness !== "FRESH" ||
    snapshot.poolReconciliationStatus !== "RECONCILED" ||
    snapshot.venueReconciliationStatus !== "RECONCILED")) {
    blockers.push("dual_risk_truth_not_fresh_and_reconciled");
  }
  blockers.push("external_protective_run_approval_missing");
  return Object.freeze({
    status: "BLOCKED_RECOVERY_PREWRITE",
    combinedRiskState: snapshot?.combinedRiskState ?? "UNKNOWN",
    currentStage: incident?.currentStage ?? M2BRecoveryStage.FREEZE_NEW_RISK,
    blockers: Object.freeze(blockers),
    externalWriteAuthorized: false,
    externalNonceAllocated: false,
    signatureCreated: false,
    networkCalled: false,
    protectiveAuthorityCanExpandRisk: false,
    schemaVersion: "m2b_003_recovery_readiness.v1"
  });
}
