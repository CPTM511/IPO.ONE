import policyDocument from "../policy/private-pilot-alert-policy.v1.json" with { type: "json" };
import { DomainError } from "../../../packages/domain/src/index.js";

export const OPERATIONAL_ALERT_POLICY_VERSION = "ops_001b.v1";
export const OPERATIONAL_SIGNAL_SCHEMA_VERSION = "operational_signal.v1";
export const OPERATIONAL_ALERT_SCHEMA_VERSION = "operational_alert.v1";

export const OperationalSignalType = Object.freeze({
  RECONCILIATION_FAILED: "reconciliation_failed",
  CHAIN_PAYMENT_INVALIDATED: "chain_payment_invalidated",
  BREAK_GLASS_ACTIVATED: "break_glass_activated",
  ADMISSION_CONTROL_UNAVAILABLE: "admission_control_unavailable",
  SYNTHETIC_LIFECYCLE_FAILED: "synthetic_lifecycle_failed",
  SERVICING_DEFAULTED: "servicing_defaulted",
  SERVICING_WRITTEN_OFF: "servicing_written_off"
});

export const OperationalAlertSeverity = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});

export const OperationalAlertRoute = Object.freeze({
  PAGE: "page",
  OPERATIONS_QUEUE: "operations_queue",
  RISK_QUEUE: "risk_queue"
});

export const OperationalReadinessEffect = Object.freeze({
  FAIL_CLOSED: "fail_closed",
  REVIEW_REQUIRED: "review_required",
  OBSERVE: "observe"
});

export const OperationalActionCode = Object.freeze({
  PRESERVE_EVIDENCE: "preserve_evidence",
  STOP_AFFECTED_WRITES: "stop_affected_writes",
  OPEN_INCIDENT: "open_incident",
  RUN_RECONCILIATION: "run_reconciliation",
  VERIFY_CHAIN_FINALITY: "verify_chain_finality",
  REVIEW_BREAK_GLASS_SCOPE: "review_break_glass_scope",
  REVIEW_ADMISSION_STORE: "review_admission_store",
  RUN_SYNTHETIC_DIAGNOSTICS: "run_synthetic_diagnostics",
  OPEN_SERVICING_CASE: "open_servicing_case",
  REVIEW_SERVICING_OPTIONS: "review_servicing_options",
  CONFIRM_DUAL_CONTROL_EVIDENCE: "confirm_dual_control_evidence"
});

const SIGNAL_TYPES = new Set(Object.values(OperationalSignalType));
const SEVERITIES = new Set(Object.values(OperationalAlertSeverity));
const ROUTES = new Set(Object.values(OperationalAlertRoute));
const READINESS_EFFECTS = new Set(Object.values(OperationalReadinessEffect));
const ACTION_CODES = new Set(Object.values(OperationalActionCode));

function invalid(message) {
  throw new DomainError("invalid_operational_alert_policy", message);
}

function exactKeys(name, value, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  const keys = Object.keys(value).sort();
  const expected = [...required].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    invalid(`${name} has an invalid shape`);
  }
}

function boundedString(name, value, { pattern, maximum = 160 } = {}) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    (pattern && !pattern.test(value))
  ) invalid(`${name} is invalid`);
  return value;
}

function assertRule(rule, index) {
  exactKeys(`rules[${index}]`, rule, [
    "signalType",
    "alertType",
    "severity",
    "route",
    "ownerRole",
    "readinessEffect",
    "runbookRef",
    "actionCodes"
  ]);
  if (!SIGNAL_TYPES.has(rule.signalType)) invalid(`rules[${index}].signalType is invalid`);
  boundedString(`rules[${index}].alertType`, rule.alertType, { pattern: /^[a-z][a-z0-9_]{2,95}$/ });
  if (!SEVERITIES.has(rule.severity)) invalid(`rules[${index}].severity is invalid`);
  if (!ROUTES.has(rule.route)) invalid(`rules[${index}].route is invalid`);
  boundedString(`rules[${index}].ownerRole`, rule.ownerRole, { pattern: /^[A-Za-z][A-Za-z/ -]{1,95}$/ });
  if (!READINESS_EFFECTS.has(rule.readinessEffect)) invalid(`rules[${index}].readinessEffect is invalid`);
  boundedString(`rules[${index}].runbookRef`, rule.runbookRef, { pattern: /^OPS-RUNBOOK-[A-Z0-9-]{3,80}$/ });
  if (
    !Array.isArray(rule.actionCodes) || rule.actionCodes.length < 1 || rule.actionCodes.length > 8 ||
    new Set(rule.actionCodes).size !== rule.actionCodes.length ||
    rule.actionCodes.some((actionCode) => !ACTION_CODES.has(actionCode))
  ) invalid(`rules[${index}].actionCodes is invalid`);
}

export function assertOperationalAlertPolicy(value) {
  exactKeys("policy", value, [
    "schemaVersion",
    "policyVersion",
    "environment",
    "mode",
    "delivery",
    "safetyBoundary",
    "rules"
  ]);
  if (value.schemaVersion !== "operational_alert_policy.v1") invalid("schemaVersion is invalid");
  if (value.policyVersion !== OPERATIONAL_ALERT_POLICY_VERSION) invalid("policyVersion is invalid");
  if (value.environment !== "closed-pilot" || value.mode !== "no-real-funds") {
    invalid("policy boundary is invalid");
  }
  exactKeys("delivery", value.delivery, ["notificationTargetStatus", "namedOwnerStatus"]);
  if (
    value.delivery.notificationTargetStatus !== "unconfigured" ||
    value.delivery.namedOwnerStatus !== "unconfigured"
  ) invalid("delivery must remain unconfigured in the local baseline");
  exactKeys("safetyBoundary", value.safetyBoundary, [
    "automaticActionsEnabled",
    "realFundsActionsEnabled",
    "productionReleaseAuthority"
  ]);
  if (
    value.safetyBoundary.automaticActionsEnabled !== false ||
    value.safetyBoundary.realFundsActionsEnabled !== false ||
    value.safetyBoundary.productionReleaseAuthority !== false
  ) invalid("policy safety boundary cannot authorize actions, funds, or release");
  if (!Array.isArray(value.rules) || value.rules.length !== SIGNAL_TYPES.size) {
    invalid("policy must contain exactly one rule for every supported signal");
  }
  value.rules.forEach(assertRule);
  const signalTypes = value.rules.map(({ signalType }) => signalType);
  const alertTypes = value.rules.map(({ alertType }) => alertType);
  if (new Set(signalTypes).size !== signalTypes.length || new Set(alertTypes).size !== alertTypes.length) {
    invalid("policy signal and alert types must be unique");
  }
  if (signalTypes.some((signalType) => !SIGNAL_TYPES.has(signalType))) invalid("policy coverage is invalid");
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY = deepFreeze(
  structuredClone(assertOperationalAlertPolicy(policyDocument))
);

export function getOperationalAlertRule(signalType, policy = PRIVATE_PILOT_OPERATIONAL_ALERT_POLICY) {
  assertOperationalAlertPolicy(policy);
  if (!SIGNAL_TYPES.has(signalType)) invalid("signalType is not supported");
  return policy.rules.find((rule) => rule.signalType === signalType);
}
