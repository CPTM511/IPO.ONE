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
  "vercel_deployment_receipt",
  "migration_receipt",
  "rollback_target",
  "pilot_region",
  "provider_selection",
  "database_project",
  "database_plan",
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

export const PILOT_008B_OBSOLETE_GCP_REQUIREMENTS = Object.freeze([
  "cloud_sql_instance_state",
  "cloud_run_service_and_job",
  "gcp_billing_and_compute_api",
  "gcp_secret_manager",
  "gcp_edge_and_waf"
]);

const AUTHORITY = Object.freeze({
  readOnlyEvidenceEnabled: true,
  existingStackSelectionEnabled: true,
  technicalDeploymentPreparationEnabled: true,
  approvedAdditiveMigrationEnabled: true,
  newProviderProvisioningEnabled: false,
  planOrBillingMutationEnabled: false,
  secretValueExportEnabled: false,
  identityCredentialIssuanceEnabled: false,
  remoteParticipantAccessEnabled: false,
  profileActivationEnabled: false,
  trafficCutoverEnabled: false,
  notificationDeliveryEnabled: false,
  realFundsEnabled: false,
  externalProviderExecutionEnabled: false,
  venueSignerEnabled: false,
  chainWriteEnabled: false
});

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
    "infrastructureObservation",
    "obsoleteGcpRequirements",
    "verdict"
  ], "gate0", issues)) {
    throw new Pilot008BGate0Error(issues);
  }

  exact(value.schemaVersion, "ipo.one.pilot-008b-gate0/v1", "gate0.schemaVersion", issues);
  exact(value.issueId, "PILOT-008B", "gate0.issueId", issues);
  exact(value.status, "technical_readiness_in_progress_activation_blocked", "gate0.status", issues);
  exact(value.profile, "closed_non_funds_pilot", "gate0.profile", issues);
  exact(value.launchBlocked, true, "gate0.launchBlocked", issues);

  if (exactKeys(value.prerequisite, [
    "issueId",
    "localCommitSha",
    "verdict",
    "mergedToOriginMainAtObservation",
    "deployedAtObservation"
  ], "gate0.prerequisite", issues)) {
    exact(value.prerequisite.issueId, "PILOT-008A", "gate0.prerequisite.issueId", issues);
    sha(value.prerequisite.localCommitSha, "gate0.prerequisite.localCommitSha", issues);
    exact(value.prerequisite.verdict, "PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT AUTHORIZED", "gate0.prerequisite.verdict", issues);
    exact(value.prerequisite.mergedToOriginMainAtObservation, false, "gate0.prerequisite.mergedToOriginMainAtObservation", issues);
    exact(value.prerequisite.deployedAtObservation, false, "gate0.prerequisite.deployedAtObservation", issues);
  }

  if (exactKeys(value.deploymentCandidate, [
    "commitSha",
    "ciRunUrl",
    "deploymentUrl",
    "migrationEvidenceUrl",
    "rollbackTarget",
    "ready"
  ], "gate0.deploymentCandidate", issues)) {
    for (const key of ["commitSha", "ciRunUrl", "deploymentUrl", "migrationEvidenceUrl", "rollbackTarget"]) {
      exact(value.deploymentCandidate[key], null, `gate0.deploymentCandidate.${key}`, issues);
    }
    exact(value.deploymentCandidate.ready, false, "gate0.deploymentCandidate.ready", issues);
  }

  if (exactKeys(value.authority, Object.keys(AUTHORITY), "gate0.authority", issues)) {
    for (const [key, expected] of Object.entries(AUTHORITY)) {
      exact(value.authority[key], expected, `gate0.authority.${key}`, issues);
    }
  }

  if (exactKeys(value.sourceTruth, [
    "launchPolicyPath",
    "launchPolicyVersion",
    "launchPolicyReleaseEnabled",
    "approvalTemplatePath",
    "topologyPath",
    "providerSelectionPath",
    "operationsPath",
    "operationsSourceCommitSha",
    "operationsSourceCurrentCandidate",
    "vercelManifestPath",
    "vercelConfigurationPath"
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
    exact(value.sourceTruth.vercelManifestPath, "deploy/vercel/m1-b-sandbox.manifest.v2.json", "gate0.sourceTruth.vercelManifestPath", issues);
    exact(value.sourceTruth.vercelConfigurationPath, "vercel.json", "gate0.sourceTruth.vercelConfigurationPath", issues);
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
      if (exactKeys(entry, ["id", "status"], `gate0.decisionInputs[${index}]`, issues) && !["pending", "unavailable", "satisfied"].includes(entry.status)) {
        issues.push(`gate0.decisionInputs[${index}].status must be pending, unavailable or satisfied.`);
      }
    }
  }

  const observation = value.infrastructureObservation;
  if (exactKeys(observation, [
    "observedAt",
    "classification",
    "vercelProject",
    "vercelProjectState",
    "runtimeReleaseSha",
    "runtimeProfile",
    "runtimeRealFundsEnabled",
    "databaseProvider",
    "databaseProject",
    "databaseProjectState",
    "databasePlan",
    "databaseManagedBy",
    "databaseRegion",
    "databaseBranch",
    "databaseBranchState",
    "postgresMajorVersion",
    "migrationCount",
    "migrationHead",
    "candidateMigrationHead",
    "tenantScopedTables",
    "tenantTablesWithRls",
    "tenantTablesWithForcedRls",
    "policyCount",
    "expectedCoreTablesPresent",
    "expectedCoreTableCount",
    "durableStatePresent",
    "secretValuesRecorded",
    "activationEvidence"
  ], "gate0.infrastructureObservation", issues)) {
    if (Number.isNaN(Date.parse(observation.observedAt))) issues.push("gate0.infrastructureObservation.observedAt must be an ISO timestamp.");
    exact(observation.classification, "read_only_non_authorizing", "gate0.infrastructureObservation.classification", issues);
    exact(observation.vercelProject, "ipo-one-internal", "gate0.infrastructureObservation.vercelProject", issues);
    exact(observation.vercelProjectState, "ready", "gate0.infrastructureObservation.vercelProjectState", issues);
    sha(observation.runtimeReleaseSha, "gate0.infrastructureObservation.runtimeReleaseSha", issues);
    exact(observation.runtimeProfile, "closed_non_funds_pilot", "gate0.infrastructureObservation.runtimeProfile", issues);
    exact(observation.runtimeRealFundsEnabled, false, "gate0.infrastructureObservation.runtimeRealFundsEnabled", issues);
    exact(observation.databaseProvider, "neon", "gate0.infrastructureObservation.databaseProvider", issues);
    exact(observation.databaseProject, "ipo-one-m1-b-sandbox", "gate0.infrastructureObservation.databaseProject", issues);
    exact(observation.databaseProjectState, "active", "gate0.infrastructureObservation.databaseProjectState", issues);
    exact(observation.databasePlan, "launch", "gate0.infrastructureObservation.databasePlan", issues);
    exact(observation.databaseManagedBy, "vercel", "gate0.infrastructureObservation.databaseManagedBy", issues);
    exact(observation.databaseRegion, "aws-us-east-1", "gate0.infrastructureObservation.databaseRegion", issues);
    exact(observation.databaseBranch, "main", "gate0.infrastructureObservation.databaseBranch", issues);
    exact(observation.databaseBranchState, "ready", "gate0.infrastructureObservation.databaseBranchState", issues);
    exact(observation.postgresMajorVersion, 17, "gate0.infrastructureObservation.postgresMajorVersion", issues);
    exact(observation.migrationCount, 69, "gate0.infrastructureObservation.migrationCount", issues);
    exact(observation.migrationHead, "0069_auth_reference_hash_key_rotation", "gate0.infrastructureObservation.migrationHead", issues);
    exact(observation.candidateMigrationHead, "0070_pilot_cases", "gate0.infrastructureObservation.candidateMigrationHead", issues);
    exact(observation.tenantTablesWithRls, observation.tenantScopedTables, "gate0.infrastructureObservation.tenantTablesWithRls", issues);
    exact(observation.tenantTablesWithForcedRls, observation.tenantScopedTables, "gate0.infrastructureObservation.tenantTablesWithForcedRls", issues);
    exact(observation.expectedCoreTablesPresent, observation.expectedCoreTableCount, "gate0.infrastructureObservation.expectedCoreTablesPresent", issues);
    exact(observation.durableStatePresent, true, "gate0.infrastructureObservation.durableStatePresent", issues);
    exact(observation.secretValuesRecorded, false, "gate0.infrastructureObservation.secretValuesRecorded", issues);
    exact(observation.activationEvidence, false, "gate0.infrastructureObservation.activationEvidence", issues);
  }

  if (!Array.isArray(value.obsoleteGcpRequirements)) {
    issues.push("gate0.obsoleteGcpRequirements must be an array.");
  } else {
    exactArray(value.obsoleteGcpRequirements.map((entry) => entry?.id), PILOT_008B_OBSOLETE_GCP_REQUIREMENTS, "gate0.obsoleteGcpRequirements ids", issues);
    for (const [index, entry] of value.obsoleteGcpRequirements.entries()) {
      if (exactKeys(entry, ["id", "status"], `gate0.obsoleteGcpRequirements[${index}]`, issues)) {
        exact(entry.status, "not_applicable", `gate0.obsoleteGcpRequirements[${index}].status`, issues);
      }
    }
  }

  exact(value.verdict, "GATE 0 REBASED — TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED", "gate0.verdict", issues);

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
