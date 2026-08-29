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
  vercelPackageText,
  vercelConfigurationText,
  vercelManifestText
] = await Promise.all([
  source("deploy/closed-pilot/topology.v1.json"),
  source(".node-version"),
  source("package.json"),
  source("deploy/launch-policy.v1.json"),
  source("deploy/vercel/package.m1-b-sandbox.json"),
  source("vercel.json"),
  source("deploy/vercel/m1-b-sandbox.manifest.v2.json")
]);

const topology = parseDeployTopology(topologyText);
const manifest = JSON.parse(packageText);
const launchPolicy = validateLaunchPolicy(
  parseCanonicalJson(launchPolicyText, "Launch policy")
);
const vercelPackage = JSON.parse(vercelPackageText);
const vercelConfiguration = JSON.parse(vercelConfigurationText);
const vercelManifest = JSON.parse(vercelManifestText);

assert.equal(topology.runtime.buildNodeVersion, nodeVersion.trim());
assert.equal(
  manifest.engines?.node,
  `>=24.19.0 <25 || >=${topology.runtime.buildNodeVersion} <27`
);
assert.equal(vercelPackage.engines?.node, topology.runtime.deployedNodeVersion);
assert.equal(launchPolicy.profiles.closed_non_funds_pilot.releaseEnabled, false);
assert.equal(topology.launchBlocked, true);
assert.equal(topology.authority.technicalReadinessDeploymentEnabled, true);
assert.equal(topology.authority.remoteParticipantAccessEnabled, false);
assert.equal(topology.authority.profileActivationEnabled, false);
assert.equal(topology.currentPublicSurface.technicalRuntimeReady, true);
assert.equal(topology.currentPublicSurface.participantAccessAuthorized, false);
assert.equal(topology.runtime.provider, "vercel");
assert.equal(topology.database.provider, "neon");
assert.equal(topology.database.additionalDatabaseRequired, false);
assert.equal(topology.costControls.vercelProjectCount, 1);
assert.equal(topology.costControls.neonProjectCount, 1);
assert.equal(topology.costControls.cloudRunEnabled, false);
assert.equal(topology.costControls.cloudSqlEnabled, false);
assert.equal(vercelConfiguration.fluid, true);
assert.equal(vercelConfiguration.functions["api/vercel-sandbox.mjs"].maxDuration, 30);
assert.equal(vercelConfiguration.functions["api/vercel-sandbox-cron.mjs"].maxDuration, 30);
assert.equal(vercelManifest.topology.canonicalState, "neon_postgresql");
assert.equal(vercelManifest.topology.projectCount, 1);
assert.equal(vercelManifest.topology.continuousWorker, false);

console.log(
  "DEPLOY-001 topology contract passed: one Vercel Functions/Cron project and " +
  "the existing Neon PostgreSQL 17 project are selected; Cloud Run, Cloud SQL " +
  "and cohort activation remain disabled."
);
