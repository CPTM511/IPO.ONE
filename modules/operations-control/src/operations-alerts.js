import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import {
  OPERATIONAL_ALERT_SCHEMA_VERSION,
  PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY,
  assertOperationalAlertPolicy,
  getOperationalAlertRule
} from "./operations-policy.js";
import { assertOperationalSignal } from "./operations-signals.js";

const MAX_SIGNALS = 1_000;
const MAX_EVIDENCE_REFS = 32;
const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

function invalid(message) {
  throw new DomainError("invalid_operational_alert_input", message);
}

function alertForGroup({ rule, signals, policy }) {
  const ordered = [...signals.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) || left.sourceRefHash.localeCompare(right.sourceRefHash)
  );
  const first = ordered[0];
  const last = ordered.at(-1);
  const fingerprint = hashId("operations_control.alert_fingerprint", {
    policyVersion: policy.policyVersion,
    alertType: rule.alertType,
    scopeRefHash: first.scopeRefHash
  });
  const evidenceRefHashes = ordered.slice(-MAX_EVIDENCE_REFS).map(({ sourceRefHash }) => sourceRefHash);
  return Object.freeze({
    alertId: `operational_alert_${fingerprint.slice(2)}`,
    alertFingerprint: fingerprint,
    alertType: rule.alertType,
    signalType: rule.signalType,
    severity: rule.severity,
    route: rule.route,
    ownerRole: rule.ownerRole,
    readinessEffect: rule.readinessEffect,
    runbookRef: rule.runbookRef,
    actionCodes: Object.freeze([...rule.actionCodes]),
    scopeRefHash: first.scopeRefHash,
    occurrenceCount: ordered.length,
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
    evidenceRefHashes: Object.freeze(evidenceRefHashes),
    evidenceTruncated: ordered.length > MAX_EVIDENCE_REFS,
    deliveryStatus: policy.delivery.notificationTargetStatus,
    requiresNamedOwner: policy.delivery.namedOwnerStatus !== "configured",
    automaticActionTaken: false,
    productionReleaseAuthority: false,
    environment: policy.environment,
    sandboxOnly: true,
    productionFundsMoved: false,
    policyVersion: policy.policyVersion,
    schemaVersion: OPERATIONAL_ALERT_SCHEMA_VERSION
  });
}

export function evaluateOperationalSignals(
  input,
  { policy = PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY } = {}
) {
  assertOperationalAlertPolicy(policy);
  if (!Array.isArray(input) || input.length > MAX_SIGNALS) {
    invalid(`signals must be an array with at most ${MAX_SIGNALS} entries`);
  }
  const groups = new Map();
  for (const candidate of input) {
    const signal = assertOperationalSignal(candidate);
    const rule = getOperationalAlertRule(signal.signalType, policy);
    const groupKey = `${rule.alertType}\0${signal.scopeRefHash}`;
    const group = groups.get(groupKey) ?? { rule, signals: new Map() };
    group.signals.set(signal.sourceRefHash, signal);
    groups.set(groupKey, group);
  }
  return Object.freeze([...groups.values()]
    .map(({ rule, signals }) => alertForGroup({ rule, signals, policy }))
    .sort((left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      right.lastObservedAt.localeCompare(left.lastObservedAt) ||
      left.alertId.localeCompare(right.alertId)
    ));
}
