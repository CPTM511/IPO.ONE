import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCanonicalJson,
  validateLaunchPolicy
} from "../packages/release-governance/src/index.js";
import {
  parseDeployTopology
} from "../packages/deployment-topology/src/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  topologyText,
  nodeVersion,
  packageText,
  launchPolicyText,
  guide,
  task,
  vercelReadme,
  vercelPackageText
] = await Promise.all([
  source("deploy/closed-pilot/topology.v1.json"),
  source(".node-version"),
  source("package.json"),
  source("deploy/launch-policy.v1.json"),
  source("docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md"),
  source("docs/codex/tasks/DEPLOY_001_DURABLE_HOSTED_PILOT_TOPOLOGY.md"),
  source("deploy/vercel/README.md"),
  source("deploy/vercel/package.bundle.json")
]);

const topology = parseDeployTopology(topologyText);
const manifest = JSON.parse(packageText);
const launchPolicy = validateLaunchPolicy(
  parseCanonicalJson(launchPolicyText, "Launch policy")
);
const vercelPackage = JSON.parse(vercelPackageText);

assert.equal(topology.runtime.nodeVersion, nodeVersion.trim());
assert.equal(
  manifest.engines?.node,
  `>=24.19.0 <25 || >=${topology.runtime.nodeVersion} <27`
);
assert.equal(vercelPackage.engines?.node, "26.x");
assert.equal(launchPolicy.profiles.closed_non_funds_pilot.releaseEnabled, false);
assert.equal(topology.launchBlocked, true);
assert.equal(topology.authority.cloudMutationEnabled, false);
assert.equal(topology.authority.remoteParticipantAccessEnabled, false);
assert.equal(topology.currentPublicSurface.unchangedByDeploy001, true);
assert.match(guide, /`DEPLOY-001`/);
assert.match(task, /Status: Implemented locally/);
assert.match(vercelReadme, /process-local/);
assert.match(vercelReadme, /does not publish the PostgreSQL closed pilot/);

console.log(
  "DEPLOY-001 topology contract passed: Vercel Web, one OCI runtime, managed " +
  "PostgreSQL 17, and a separate disabled worker; launch remains blocked."
);
