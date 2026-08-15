import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseDeployTopology,
  parseProviderSelection
} from "../packages/deployment-topology/src/index.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  selectionText,
  topologyText,
  task,
  audit,
  marketplaceReadme
] = await Promise.all([
  source("deploy/closed-pilot/provider-selection.pending.json"),
  source("deploy/closed-pilot/topology.v1.json"),
  source("docs/codex/tasks/DEPLOY_001B_HOSTED_PILOT_PROVIDER_SELECTION.md"),
  source("docs/codex/audits/DEPLOY_001B_PROVIDER_SELECTION/README.md"),
  source("deploy/vercel/README.md")
]);

const selection = parseProviderSelection(selectionText);
const topology = parseDeployTopology(topologyText);

assert.equal(selection.provisioningBlocked, true);
assert.equal(selection.authority.databaseProvisioningEnabled, false);
assert.equal(selection.authority.runtimeProvisioningEnabled, false);
assert.equal(selection.authority.remoteAccessEnabled, false);
assert.equal(selection.recommendation.workerActivation, "disabled");
assert.equal(selection.compatibility.nodeVersion, topology.runtime.nodeVersion);
assert.equal(selection.compatibility.postgresMajorVersion, topology.database.majorVersion);
assert.equal(topology.runtime.providerDecisionState, "human_review_required");
assert.equal(topology.database.providerDecisionState, "human_review_required");
assert.equal(topology.worker.providerDecisionState, "human_review_required");
assert.match(task, /Status: Recommended; founder approval pending/);
assert.match(task, /No provider was installed or provisioned/);
assert.match(audit, /direct TLS endpoint/);
assert.match(audit, /PgBouncer transaction mode/);
assert.match(marketplaceReadme, /process-local/);

console.log(
  "DEPLOY-001B provider recommendation passed: Vercel + Neon Launch + Cloud Run " +
  "is recommended, but procurement, provisioning, access, and launch remain blocked."
);
