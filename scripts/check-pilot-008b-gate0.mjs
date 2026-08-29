import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  PILOT_008B_APPROVAL_GATES,
  parseClosedPilotOperations,
  parseDeployTopology,
  parsePilot008BGate0,
  parseProviderSelection
} from "../packages/deployment-topology/src/index.js";

const record = parsePilot008BGate0(
  await readFile("deploy/closed-pilot/pilot-008b-gate0.v1.json", "utf8")
);
const policy = JSON.parse(await readFile(record.sourceTruth.launchPolicyPath, "utf8"));
const approvalTemplate = JSON.parse(
  await readFile(record.sourceTruth.approvalTemplatePath, "utf8")
);
const topology = parseDeployTopology(
  await readFile(record.sourceTruth.topologyPath, "utf8")
);
const providers = parseProviderSelection(
  await readFile(record.sourceTruth.providerSelectionPath, "utf8")
);
const operations = parseClosedPilotOperations(
  await readFile(record.sourceTruth.operationsPath, "utf8")
);
const vercelManifest = JSON.parse(
  await readFile(record.sourceTruth.vercelManifestPath, "utf8")
);
const vercelConfiguration = JSON.parse(
  await readFile(record.sourceTruth.vercelConfigurationPath, "utf8")
);

const profile = policy.profiles[record.profile];
assert.equal(policy.policyVersion, record.sourceTruth.launchPolicyVersion);
assert.equal(profile.releaseEnabled, false);
assert.equal(record.sourceTruth.launchPolicyReleaseEnabled, false);
assert.equal(approvalTemplate.policyVersion, policy.policyVersion);
assert.equal(approvalTemplate.profile, record.profile);
assert.deepEqual(
  profile.gates.map((gate) => gate.id),
  PILOT_008B_APPROVAL_GATES
);
assert.deepEqual(
  approvalTemplate.gates.map((gate) => gate.id),
  PILOT_008B_APPROVAL_GATES
);
assert.equal(
  approvalTemplate.gates.every((gate) => gate.status === "pending"),
  true
);

assert.equal(topology.launchBlocked, true);
assert.equal(topology.runtime.provider, "vercel");
assert.equal(topology.database.provider, "neon");
assert.equal(topology.database.additionalDatabaseRequired, false);
assert.equal(providers.status, "founder_approved_existing_stack");
assert.equal(providers.newProviderProvisioningBlocked, true);
assert.equal(providers.recommendation.optionId, "existing_vercel_neon");
assert.equal(operations.launchBlocked, true);
assert.deepEqual(operations.satisfiedActivationGates, []);
assert.equal(
  operations.sourceRelease.commitSha,
  record.sourceTruth.operationsSourceCommitSha
);
assert.notEqual(
  operations.sourceRelease.commitSha,
  record.prerequisite.localCommitSha
);
assert.equal(record.sourceTruth.operationsSourceCurrentCandidate, false);
assert.equal(record.authority.technicalDeploymentPreparationEnabled, true);
assert.equal(record.authority.approvedAdditiveMigrationEnabled, true);
for (const boundary of [
  "newProviderProvisioningEnabled",
  "planOrBillingMutationEnabled",
  "secretValueExportEnabled",
  "identityCredentialIssuanceEnabled",
  "remoteParticipantAccessEnabled",
  "profileActivationEnabled",
  "trafficCutoverEnabled",
  "notificationDeliveryEnabled",
  "realFundsEnabled",
  "externalProviderExecutionEnabled",
  "venueSignerEnabled",
  "chainWriteEnabled"
]) {
  assert.equal(record.authority[boundary], false, `${boundary} must remain false`);
}
assert.equal(record.deploymentCandidate.ready, false);
assert.equal(record.infrastructureObservation.activationEvidence, false);
assert.equal(record.infrastructureObservation.databaseProvider, "neon");
assert.equal(record.infrastructureObservation.databaseProject, "ipo-one-m1-b-sandbox");
assert.equal(record.infrastructureObservation.databasePlan, "launch");
assert.equal(record.infrastructureObservation.databaseRegion, "aws-us-east-1");
assert.equal(record.infrastructureObservation.tenantTablesWithRls, record.infrastructureObservation.tenantScopedTables);
assert.equal(record.infrastructureObservation.tenantTablesWithForcedRls, record.infrastructureObservation.tenantScopedTables);
assert.equal(
  record.obsoleteGcpRequirements.every((requirement) => requirement.status === "not_applicable"),
  true
);

assert.equal(vercelManifest.topology.canonicalState, "neon_postgresql");
assert.equal(vercelManifest.topology.projectCount, 1);
assert.equal(vercelManifest.topology.continuousWorker, false);
assert.equal(vercelConfiguration.fluid, true);
assert.deepEqual(vercelConfiguration.crons, [{
  path: "/api/cron",
  schedule: "*/15 * * * *"
}]);

execFileSync(
  "git",
  ["cat-file", "-e", `${record.prerequisite.localCommitSha}^{commit}`],
  { stdio: "ignore" }
);
assert.equal(record.prerequisite.mergedToOriginMainAtObservation, false);
assert.equal(record.prerequisite.deployedAtObservation, false);

const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(
  packageManifest.scripts["check:pilot-008b-gate0"],
  "node scripts/check-pilot-008b-gate0.mjs"
);
assert.match(packageManifest.scripts.check, /pnpm run check:pilot-008b-gate0/);

console.log(
  "PILOT-008B Gate 0 passed: the existing Vercel + Neon Launch stack is " +
    "selected and observed without secret disclosure; Cloud SQL/Cloud Run " +
    "requirements are not applicable, while cohort activation, credentials, " +
    "traffic, external execution and funds remain blocked."
);
