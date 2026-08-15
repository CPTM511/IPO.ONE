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

test("DEPLOY-001 fixes the low-cost durable topology without launch authority", () => {
  assert.equal(topology.launchBlocked, true);
  assert.equal(topology.currentPublicSurface.privatePilotAttached, false);
  assert.equal(topology.runtime.canonicalState, "managed_postgresql");
  assert.equal(topology.runtime.processLocalPrivateStateAllowed, false);
  assert.equal(topology.database.forcedTenantRls, true);
  assert.equal(topology.worker.activation, "disabled");
  assert.equal(topology.worker.signerEnabled, false);
  assert.equal(Object.values(topology.authority).every((value) => value === false), true);
});

test("DEPLOY-001 rejects authority, state, signer, and launch expansion", () => {
  for (const value of [
    changed((candidate) => { candidate.authority.remoteParticipantAccessEnabled = true; }),
    changed((candidate) => { candidate.authority.realFundsEnabled = true; }),
    changed((candidate) => { candidate.authority.testnetWritesEnabled = true; }),
    changed((candidate) => { candidate.runtime.processLocalPrivateStateAllowed = true; }),
    changed((candidate) => { candidate.runtime.signerEnabled = true; }),
    changed((candidate) => { candidate.worker.activation = "enabled"; }),
    changed((candidate) => { candidate.launchBlocked = false; }),
    changed((candidate) => { candidate.currentPublicSurface.privatePilotAttached = true; })
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
    changed((candidate) => { candidate.database.automatedBackups = false; }),
    changed((candidate) => { candidate.database.pointInTimeRecovery = false; }),
    changed((candidate) => { candidate.runtime.nodeVersion = "26.0.0"; }),
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
