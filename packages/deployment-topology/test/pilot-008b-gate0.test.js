import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  Pilot008BGate0Error,
  parsePilot008BGate0,
  validatePilot008BGate0
} from "../src/index.js";

const text = await readFile(
  new URL("../../../deploy/closed-pilot/pilot-008b-gate0.v1.json", import.meta.url),
  "utf8"
);
const record = parsePilot008BGate0(text);

function changed(change) {
  const candidate = structuredClone(record);
  change(candidate);
  return candidate;
}

test("PILOT-008B Gate 0 records a blocked exact prerequisite", () => {
  assert.equal(record.prerequisite.issueId, "PILOT-008A");
  assert.equal(record.prerequisite.mergedToOriginMain, false);
  assert.equal(record.prerequisite.deployed, false);
  assert.equal(record.deploymentCandidate.ready, false);
  assert.equal(record.launchBlocked, true);
  assert.equal(record.approvalGates.length, 8);
  assert.equal(record.approvalGates.every((gate) => gate.status === "pending"), true);
  assert.equal(Object.values(record.authority).every((value) => value === false), true);
});

test("PILOT-008B Gate 0 rejects premature authority and activation", () => {
  for (const value of [
    changed((candidate) => { candidate.authority.cloudMutationEnabled = true; }),
    changed((candidate) => { candidate.authority.identityCredentialIssuanceEnabled = true; }),
    changed((candidate) => { candidate.authority.profileActivationEnabled = true; }),
    changed((candidate) => { candidate.authority.trafficCutoverEnabled = true; }),
    changed((candidate) => { candidate.launchBlocked = false; })
  ]) {
    assert.throws(
      () => validatePilot008BGate0(value),
      (error) => error instanceof Pilot008BGate0Error && error.issues.length > 0
    );
  }
});

test("PILOT-008B Gate 0 rejects invented readiness and approval", () => {
  for (const value of [
    changed((candidate) => { candidate.deploymentCandidate.ready = true; }),
    changed((candidate) => { candidate.deploymentCandidate.commitSha = "0".repeat(40); }),
    changed((candidate) => { candidate.approvalGates[0].status = "approved"; }),
    changed((candidate) => { candidate.decisionInputs[0].status = "approved"; }),
    changed((candidate) => { candidate.sourceTruth.launchPolicyReleaseEnabled = true; }),
    changed((candidate) => { candidate.sourceTruth.operationsSourceCurrentCandidate = true; })
  ]) {
    assert.throws(
      () => validatePilot008BGate0(value),
      (error) => error instanceof Pilot008BGate0Error && error.issues.length > 0
    );
  }
});

test("PILOT-008B Gate 0 rejects stronger cloud claims and unknown fields", () => {
  for (const value of [
    changed((candidate) => { candidate.cloudObservation.databaseState = "running"; }),
    changed((candidate) => { candidate.cloudObservation.activationEvidence = true; }),
    changed((candidate) => { candidate.endpoint = "https://example.invalid"; })
  ]) {
    assert.throws(
      () => validatePilot008BGate0(value),
      (error) => error instanceof Pilot008BGate0Error && error.issues.length > 0
    );
  }
});

test("PILOT-008B Gate 0 requires canonical JSON", () => {
  assert.throws(
    () => parsePilot008BGate0(JSON.stringify(record)),
    (error) => error instanceof Pilot008BGate0Error
  );
});
