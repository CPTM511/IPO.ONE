import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ClosedPilotOperationsError,
  parseClosedPilotOperations,
  validateClosedPilotOperations
} from "../src/index.js";

const text = await readFile(
  new URL("../../../deploy/closed-pilot/operations.v1.json", import.meta.url),
  "utf8"
);
const operations = parseClosedPilotOperations(text);

function changed(change) {
  const candidate = structuredClone(operations);
  change(candidate);
  return candidate;
}

test("OPS-004 fixes a fail-closed hosted operations and recovery baseline", () => {
  assert.equal(operations.launchBlocked, true);
  assert.equal(
    operations.sourceRelease.commitSha,
    "3a466c4a3267923de96f4c31c1f1d2b1531e73c6"
  );
  assert.equal(operations.databaseRecovery.restoreDrillActivation, "disabled");
  assert.equal(operations.workerOperations.activation, "disabled");
  assert.equal(operations.alerting.deliveryActivation, "disabled");
  assert.equal(operations.secrets.rotationActivation, "disabled");
  assert.equal(operations.rollback.activation, "disabled");
  assert.deepEqual(operations.satisfiedActivationGates, []);
  assert.equal(
    Object.values(operations.authority).every((value) => value === false),
    true
  );
});

test("OPS-004 rejects authority, schedule, delivery, and secret activation", () => {
  for (const value of [
    changed((candidate) => { candidate.authority.cloudMutationEnabled = true; }),
    changed((candidate) => { candidate.authority.remoteParticipantAccessEnabled = true; }),
    changed((candidate) => { candidate.workerOperations.activation = "enabled"; }),
    changed((candidate) => { candidate.reconciliation.scheduleActivation = "enabled"; }),
    changed((candidate) => { candidate.synthetics.scheduleActivation = "enabled"; }),
    changed((candidate) => { candidate.alerting.deliveryActivation = "enabled"; }),
    changed((candidate) => { candidate.secrets.runtimeSecretInjectionActivation = "enabled"; }),
    changed((candidate) => { candidate.secrets.rotationActivation = "enabled"; })
  ]) {
    assert.throws(
      () => validateClosedPilotOperations(value),
      (error) =>
        error instanceof ClosedPilotOperationsError &&
        error.issues.length > 0
    );
  }
});

test("OPS-004 rejects weaker restore, reconciliation, rollback, and secret boundaries", () => {
  for (const value of [
    changed((candidate) => { candidate.databaseRecovery.pointInTimeRecoveryRequired = false; }),
    changed((candidate) => { candidate.databaseRecovery.destructiveRestoreIntoCanonicalDatabaseAllowed = true; }),
    changed((candidate) => { candidate.workerOperations.overlappingRunsAllowed = true; }),
    changed((candidate) => { candidate.workerOperations.automaticRepairAllowed = true; }),
    changed((candidate) => { candidate.reconciliation.manualRepairApprovalRequired = false; }),
    changed((candidate) => { candidate.alerting.piiFreeLowCardinalitySignalsRequired = false; }),
    changed((candidate) => { candidate.secrets.browserSecretExposureAllowed = true; }),
    changed((candidate) => { candidate.secrets.longLivedCloudKeyAllowed = true; }),
    changed((candidate) => { candidate.rollback.automaticDatabaseRollbackAllowed = true; }),
    changed((candidate) => { candidate.rollback.preserveEvidence = false; })
  ]) {
    assert.throws(
      () => validateClosedPilotOperations(value),
      (error) =>
        error instanceof ClosedPilotOperationsError &&
        error.issues.length > 0
    );
  }
});

test("OPS-004 rejects release drift, premature gates, and unknown fields", () => {
  for (const value of [
    changed((candidate) => { candidate.sourceRelease.commitSha = "0".repeat(40); }),
    changed((candidate) => { candidate.sourceRelease.manifestSha256 = "0".repeat(64); }),
    changed((candidate) => { candidate.satisfiedActivationGates.push("OPS-004-RESTORE-DRILL"); }),
    changed((candidate) => { candidate.launchBlocked = false; }),
    changed((candidate) => { candidate.endpoint = "https://example.invalid"; })
  ]) {
    assert.throws(
      () => validateClosedPilotOperations(value),
      (error) =>
        error instanceof ClosedPilotOperationsError &&
        error.issues.length > 0
    );
  }
});

test("OPS-004 requires canonical JSON", () => {
  assert.throws(
    () => parseClosedPilotOperations(JSON.stringify(operations)),
    (error) => error instanceof ClosedPilotOperationsError
  );
});
