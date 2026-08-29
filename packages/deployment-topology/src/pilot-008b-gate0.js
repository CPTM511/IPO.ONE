import {
  LaunchEvidenceError,
  parseCanonicalJson
} from "../../release-governance/src/index.js";

const SHA = /^[a-f0-9]{40}$/;

export const PILOT_008B_APPROVAL_GATES = Object.freeze([
  "security_001_approval",
  "tenant_authn_authz_tests",
  "durable_data_restore",
  "reconciliation_operations",
  "independent_pentest",
  "privacy_legal_terms",
  "support_slo_oncall",
  "pilot_participant_approval"
]);

export const PILOT_008B_DECISION_INPUTS = Object.freeze([
  "exact_merged_candidate",
  "green_ci_run",
  "immutable_image_digest",
  "migration_receipt",
  "rollback_target",
  "pilot_region",
  "monthly_cost_ceiling_usd",
  "billing_owner",
  "provider_account_owner",
  "pilot_jurisdiction",
  "legal_privacy_approval",
  "retention_policy",
  "ordinary_support_channel",
  "support_owner",
  "incident_owner",
  "on_call_owner",
  "restore_owner",
  "rollback_owner",
  "notification_recipients",
  "secret_manager",
  "independent_security_reviewer",
  "participant_references",
  "launch_policy_revision"
]);

const AUTHORITY_KEYS = Object.freeze([
  "cloudMutationEnabled",
  "billingOrApiEnablementEnabled",
  "databaseStartEnabled",
  "secretOrIamWriteEnabled",
  "identityCredentialIssuanceEnabled",
  "remoteParticipantAccessEnabled",
  "profileActivationEnabled",
  "trafficCutoverEnabled",
  "workerScheduleEnabled",
  "notificationDeliveryEnabled",
  "realFundsEnabled",
  "externalProviderExecutionEnabled",
  "venueSignerEnabled",
  "chainWriteEnabled"
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, path, issues) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object.`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of expected) {
    if (!actual.includes(key)) issues.push(`${path}.${key} is required.`);
  }
  for (const key of actual) {
    if (!expected.includes(key)) issues.push(`${path}.${key} is not allowed.`);
  }
  return true;
}

function exact(value, expected, path, issues) {
  if (value !== expected) issues.push(`${path} must be ${JSON.stringify(expected)}.`);
}

function exactArray(value, expected, path, issues) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    issues.push(`${path} must match the reviewed ordered set.`);
  }
}

function allFalse(value, path, issues) {
  if (!exactKeys(value, AUTHORITY_KEYS, path, issues)) return;
  for (const key of AUTHORITY_KEYS) exact(value[key], false, `${path}.${key}`, issues);
}

function boundedString(value, path, issues, max = 256) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /\p{Cc}/u.test(value)
  ) {
    issues.push(`${path} must be a non-empty bounded string without control characters.`);
  }
}

function sha(value, path, issues) {
  if (typeof value !== "string" || !SHA.test(value)) {
    issues.push(`${path} must be an exact lowercase Git commit SHA.`);
  }
}

export class Pilot008BGate0Error extends Error {
  constructor(issues) {
    super("PILOT-008B Gate 0 record is invalid.");
    this.name = "Pilot008BGate0Error";
    this.issues = Object.freeze([...issues]);
  }
}

export function validatePilot008BGate0(value) {
  const issues = [];
  if (!exactKeys(value, [
    "schemaVersion",
    "issueId",
    "status",
    "profile",
    "launchBlocked",
    "prerequisite",
    "deploymentCandidate",
    "authority",
    "sourceTruth",
    "approvalGates",
    "decisionInputs",
    "cloudObservation",
    "verdict"
  ], "gate0", issues)) {
    throw new Pilot008BGate0Error(issues);
  }

  exact(value.schemaVersion, "ipo.one.pilot-008b-gate0/v1", "gate0.schemaVersion", issues);
  exact(value.issueId, "PILOT-008B", "gate0.issueId", issues);
  exact(value.status, "blocked_pending_named_approvals", "gate0.status", issues);
  exact(value.profile, "closed_non_funds_pilot", "gate0.profile", issues);
  exact(value.launchBlocked, true, "gate0.launchBlocked", issues);

  if (exactKeys(value.prerequisite, [
    "issueId",
    "localCommitSha",
    "verdict",
    "mergedToOriginMain",
    "deployed"
  ], "gate0.prerequisite", issues)) {
    exact(value.prerequisite.issueId, "PILOT-008A", "gate0.prerequisite.issueId", issues);
    sha(value.prerequisite.localCommitSha, "gate0.prerequisite.localCommitSha", issues);
    exact(
      value.prerequisite.verdict,
      "PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT AUTHORIZED",
      "gate0.prerequisite.verdict",
      issues
    );
    exact(value.prerequisite.mergedToOriginMain, false, "gate0.prerequisite.mergedToOriginMain", issues);
    exact(value.prerequisite.deployed, false, "gate0.prerequisite.deployed", issues);
  }

  if (exactKeys(value.deploymentCandidate, [
    "commitSha",
    "ciRunUrl",
    "imageUri",
    "migrationEvidenceUrl",
    "rollbackTarget",
    "ready"
  ], "gate0.deploymentCandidate", issues)) {
    for (const key of [
      "commitSha",
      "ciRunUrl",
      "imageUri",
      "migrationEvidenceUrl",
      "rollbackTarget"
    ]) {
      exact(value.deploymentCandidate[key], null, `gate0.deploymentCandidate.${key}`, issues);
    }
    exact(value.deploymentCandidate.ready, false, "gate0.deploymentCandidate.ready", issues);
  }

  allFalse(value.authority, "gate0.authority", issues);

  if (exactKeys(value.sourceTruth, [
    "launchPolicyPath",
    "launchPolicyVersion",
    "launchPolicyReleaseEnabled",
    "approvalTemplatePath",
    "topologyPath",
    "providerSelectionPath",
    "operationsPath",
    "operationsSourceCommitSha",
    "operationsSourceCurrentCandidate"
  ], "gate0.sourceTruth", issues)) {
    exact(value.sourceTruth.launchPolicyPath, "deploy/launch-policy.v1.json", "gate0.sourceTruth.launchPolicyPath", issues);
    exact(value.sourceTruth.launchPolicyVersion, "1.3.3", "gate0.sourceTruth.launchPolicyVersion", issues);
    exact(value.sourceTruth.launchPolicyReleaseEnabled, false, "gate0.sourceTruth.launchPolicyReleaseEnabled", issues);
    exact(value.sourceTruth.approvalTemplatePath, "deploy/approvals/closed-non-funds-pilot.pending.json", "gate0.sourceTruth.approvalTemplatePath", issues);
    exact(value.sourceTruth.topologyPath, "deploy/closed-pilot/topology.v1.json", "gate0.sourceTruth.topologyPath", issues);
    exact(value.sourceTruth.providerSelectionPath, "deploy/closed-pilot/provider-selection.pending.json", "gate0.sourceTruth.providerSelectionPath", issues);
    exact(value.sourceTruth.operationsPath, "deploy/closed-pilot/operations.v1.json", "gate0.sourceTruth.operationsPath", issues);
    sha(value.sourceTruth.operationsSourceCommitSha, "gate0.sourceTruth.operationsSourceCommitSha", issues);
    exact(value.sourceTruth.operationsSourceCurrentCandidate, false, "gate0.sourceTruth.operationsSourceCurrentCandidate", issues);
  }

  if (!Array.isArray(value.approvalGates)) {
    issues.push("gate0.approvalGates must be an array.");
  } else {
    exactArray(value.approvalGates.map((entry) => entry?.id), PILOT_008B_APPROVAL_GATES, "gate0.approvalGates ids", issues);
    for (const [index, entry] of value.approvalGates.entries()) {
      if (exactKeys(entry, ["id", "status"], `gate0.approvalGates[${index}]`, issues)) {
        exact(entry.status, "pending", `gate0.approvalGates[${index}].status`, issues);
      }
    }
  }

  if (!Array.isArray(value.decisionInputs)) {
    issues.push("gate0.decisionInputs must be an array.");
  } else {
    exactArray(value.decisionInputs.map((entry) => entry?.id), PILOT_008B_DECISION_INPUTS, "gate0.decisionInputs ids", issues);
    for (const [index, entry] of value.decisionInputs.entries()) {
      if (exactKeys(entry, ["id", "status"], `gate0.decisionInputs[${index}]`, issues)) {
        if (!["pending", "unavailable"].includes(entry.status)) {
          issues.push(`gate0.decisionInputs[${index}].status must be pending or unavailable.`);
        }
      }
    }
  }

  if (exactKeys(value.cloudObservation, [
    "observedAt",
    "classification",
    "projectState",
    "databaseState",
    "closedPilotServiceState",
    "closedPilotJobState",
    "billingState",
    "secretManagerState",
    "computeApiState",
    "activationEvidence"
  ], "gate0.cloudObservation", issues)) {
    boundedString(value.cloudObservation.observedAt, "gate0.cloudObservation.observedAt", issues);
    if (Number.isNaN(Date.parse(value.cloudObservation.observedAt))) {
      issues.push("gate0.cloudObservation.observedAt must be an ISO timestamp.");
    }
    exact(value.cloudObservation.classification, "read_only_non_authorizing", "gate0.cloudObservation.classification", issues);
    exact(value.cloudObservation.projectState, "active", "gate0.cloudObservation.projectState", issues);
    exact(value.cloudObservation.databaseState, "stopped", "gate0.cloudObservation.databaseState", issues);
    exact(value.cloudObservation.closedPilotServiceState, "absent", "gate0.cloudObservation.closedPilotServiceState", issues);
    exact(value.cloudObservation.closedPilotJobState, "absent", "gate0.cloudObservation.closedPilotJobState", issues);
    exact(value.cloudObservation.billingState, "disabled", "gate0.cloudObservation.billingState", issues);
    exact(value.cloudObservation.secretManagerState, "unavailable_billing_disabled", "gate0.cloudObservation.secretManagerState", issues);
    exact(value.cloudObservation.computeApiState, "disabled", "gate0.cloudObservation.computeApiState", issues);
    exact(value.cloudObservation.activationEvidence, false, "gate0.cloudObservation.activationEvidence", issues);
  }

  exact(value.verdict, "GATE 0 READY — DEPLOYMENT/ACTIVATION BLOCKED", "gate0.verdict", issues);

  if (issues.length > 0) throw new Pilot008BGate0Error(issues);
  return value;
}

export function parsePilot008BGate0(text) {
  let value;
  try {
    value = parseCanonicalJson(text, "PILOT-008B Gate 0 record");
  } catch (error) {
    if (error instanceof LaunchEvidenceError) {
      throw new Pilot008BGate0Error([error.message]);
    }
    throw error;
  }
  return validatePilot008BGate0(value);
}
