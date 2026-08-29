import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
assert.equal(providers.provisioningBlocked, true);
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
assert.equal(
  Object.values(record.authority).every((value) => value === false),
  true
);
assert.equal(record.deploymentCandidate.ready, false);
assert.equal(record.cloudObservation.activationEvidence, false);

execFileSync(
  "git",
  ["cat-file", "-e", `${record.prerequisite.localCommitSha}^{commit}`],
  { stdio: "ignore" }
);
const mergedToMain = spawnSync(
  "git",
  ["merge-base", "--is-ancestor", record.prerequisite.localCommitSha, "origin/main"],
  { stdio: "ignore" }
).status === 0;
assert.equal(mergedToMain, record.prerequisite.mergedToOriginMain);

const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(
  packageManifest.scripts["check:pilot-008b-gate0"],
  "node scripts/check-pilot-008b-gate0.mjs"
);
assert.match(packageManifest.scripts.check, /pnpm run check:pilot-008b-gate0/);

console.log(
  "PILOT-008B Gate 0 passed: the exact local prerequisite and current " +
    "read-only cloud observation are recorded; deployment, credentials, " +
    "profile activation, traffic, external execution and funds remain blocked."
);
