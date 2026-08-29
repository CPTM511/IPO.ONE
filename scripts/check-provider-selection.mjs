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
  audit
] = await Promise.all([
  source("deploy/closed-pilot/provider-selection.pending.json"),
  source("deploy/closed-pilot/topology.v1.json"),
  source("docs/codex/tasks/DEPLOY_001B_HOSTED_PILOT_PROVIDER_SELECTION.md"),
  source("docs/codex/audits/DEPLOY_001B_PROVIDER_SELECTION/README.md")
]);

const selection = parseProviderSelection(selectionText);
const topology = parseDeployTopology(topologyText);

assert.equal(selection.newProviderProvisioningBlocked, true);
assert.equal(selection.authority.existingVercelProjectUseEnabled, true);
assert.equal(selection.authority.existingNeonProjectUseEnabled, true);
assert.equal(selection.authority.newProviderProvisioningEnabled, false);
assert.equal(selection.authority.remoteParticipantAccessEnabled, false);
assert.equal(selection.recommendation.workerActivation, "configured_not_cohort_activated");
assert.equal(selection.compatibility.deployedNodeVersion, topology.runtime.deployedNodeVersion);
assert.equal(selection.compatibility.postgresMajorVersion, topology.database.majorVersion);
assert.equal(topology.runtime.providerDecisionState, "founder_approved_existing");
assert.equal(topology.database.providerDecisionState, "founder_approved_existing");
assert.equal(topology.worker.providerDecisionState, "founder_approved_existing");
assert.match(task, /Status: Founder-approved existing stack; cohort activation pending/);
assert.match(task, /Do not provision a\s+second database provider/);
assert.match(audit, /Founder-selected existing stack/);
assert.match(audit, /Cloud SQL and Cloud Run are not\s+selected/);

console.log(
  "DEPLOY-001B provider selection passed: the existing Vercel + Neon Launch " +
  "stack is selected; new-provider provisioning, cohort access, profile " +
  "activation and real funds remain blocked."
);
