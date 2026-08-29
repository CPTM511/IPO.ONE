import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DeployTopologyError,
  parseDeployTopology,
  validateDeployTopology
} from "../src/index.js";

const topologyText = await readFile(
  new URL("../../../deploy/closed-pilot/topology.v1.json", import.meta.url),
  "utf8"
);
const topology = parseDeployTopology(topologyText);

function changed(change) {
  const value = structuredClone(topology);
  change(value);
  return value;
}

test("DEPLOY-001 selects the existing Vercel and Neon topology without cohort authority", () => {
  assert.equal(topology.launchBlocked, true);
  assert.equal(topology.currentPublicSurface.technicalRuntimeReady, true);
  assert.equal(topology.currentPublicSurface.participantAccessAuthorized, false);
  assert.equal(topology.runtime.provider, "vercel");
  assert.equal(topology.runtime.canonicalState, "managed_neon_postgresql");
  assert.equal(topology.runtime.processLocalPrivateStateAllowed, false);
  assert.equal(topology.database.provider, "neon");
  assert.equal(topology.database.forcedTenantRls, true);
  assert.equal(topology.database.additionalDatabaseRequired, false);
  assert.equal(topology.worker.cohortActivation, "blocked");
  assert.equal(topology.worker.signerEnabled, false);
  assert.equal(topology.authority.technicalReadinessDeploymentEnabled, true);
  assert.equal(topology.authority.remoteParticipantAccessEnabled, false);
  assert.equal(topology.authority.profileActivationEnabled, false);
});

test("DEPLOY-001 rejects authority, state, signer, and launch expansion", () => {
  for (const value of [
    changed((candidate) => { candidate.authority.remoteParticipantAccessEnabled = true; }),
    changed((candidate) => { candidate.authority.realFundsEnabled = true; }),
    changed((candidate) => { candidate.authority.testnetWritesEnabled = true; }),
    changed((candidate) => { candidate.runtime.processLocalPrivateStateAllowed = true; }),
    changed((candidate) => { candidate.runtime.signerEnabled = true; }),
    changed((candidate) => { candidate.worker.cohortActivation = "enabled"; }),
    changed((candidate) => { candidate.launchBlocked = false; }),
    changed((candidate) => { candidate.currentPublicSurface.participantAccessAuthorized = true; }),
    changed((candidate) => { candidate.authority.profileActivationEnabled = true; })
  ]) {
    assert.throws(
      () => validateDeployTopology(value),
      (error) => error instanceof DeployTopologyError && error.issues.length > 0
    );
  }
});

test("DEPLOY-001 rejects weaker durability, unreviewed runtime drift, and unknown fields", () => {
  for (const value of [
    changed((candidate) => { candidate.database.forcedTenantRls = false; }),
    changed((candidate) => { candidate.database.backupRestoreRequired = false; }),
    changed((candidate) => { candidate.database.additionalDatabaseRequired = true; }),
    changed((candidate) => { candidate.runtime.deployedNodeVersion = "26.0.0"; }),
    changed((candidate) => { candidate.runtime.provider = "google_cloud_run"; }),
    changed((candidate) => { candidate.activationGates.pop(); }),
    changed((candidate) => { candidate.runtime.endpoint = "https://example.invalid"; })
  ]) {
    assert.throws(
      () => validateDeployTopology(value),
      (error) => error instanceof DeployTopologyError && error.issues.length > 0
    );
  }
});

test("DEPLOY-001 requires canonical JSON", () => {
  assert.throws(
    () => parseDeployTopology(JSON.stringify(topology)),
    (error) => error instanceof DeployTopologyError
  );
});
