import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  parseClosedPilotOperations,
  parseDeployTopology,
  parsePilot008BGate0,
  parseProviderSelection
} from "../packages/deployment-topology/src/index.js";

const record = parsePilot008BGate0(
  await readFile("deploy/closed-pilot/pilot-008b-gate0.v1.json", "utf8")
);
const policy = JSON.parse(await readFile("deploy/launch-policy.v1.json", "utf8"));
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

const publicBeta = policy.profiles.public_authenticated_no_funds_beta;
assert.equal(policy.policyVersion, "1.5.0");
assert.equal(publicBeta.releaseEnabled, true);
assert.equal(publicBeta.capabilities.realFundsEnabled, false);
assert.equal(publicBeta.capabilities.privateTenantDataEnabled, true);
assert.equal(publicBeta.capabilities.syntheticMeteredResourceEnabled, true);
assert.equal(
  publicBeta.gates.some(({ id }) => id === "pilot_participant_approval"),
  false
);
assert.equal(Object.hasOwn(policy.profiles, record.profile), false);
assert.equal(record.sourceTruth.launchPolicyVersion, "1.3.3");
assert.equal(record.sourceTruth.launchPolicyReleaseEnabled, false);
assert.equal(
  record.sourceTruth.approvalTemplatePath,
  "deploy/approvals/closed-non-funds-pilot.pending.json"
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
  "PILOT-008B archival check passed: the old Gate 0 record remains internally " +
    "consistent as historical evidence, while the current Public Beta policy " +
    "supersedes its cohort and participant-activation assumptions."
);
