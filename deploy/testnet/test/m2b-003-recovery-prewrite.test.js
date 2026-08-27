import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectM2B003RecoveryPrewrite } from "../m2b-003-recovery-prewrite.mjs";

test("M2B-003 recovery inspection is ordered and stops before every external write", async () => {
  const launchPolicy = JSON.parse(await readFile("deploy/launch-policy.v1.json", "utf8"));
  const report = inspectM2B003RecoveryPrewrite(launchPolicy, {
    inspectedAt: new Date("2026-08-25T17:00:00.000Z"),
    releaseCommitSha: "944f344196f6a63a86ba817d750d466b09887142"
  });
  assert.equal(report.status, "BLOCKED_RECOVERY_PREWRITE");
  assert.deepEqual(report.stageOrder, [
    "FREEZE_NEW_RISK", "CANCEL", "REDUCE_OR_FLATTEN", "RECONCILE",
    "REPAY_OR_LIQUIDATE", "SETTLEMENT_REVIEW"
  ]);
  assert.deepEqual(report.blockers, [
    "fresh_dual_risk_snapshot_missing",
    "durable_recovery_incident_missing",
    "external_protective_run_approval_missing"
  ]);
  assert.equal(report.launchPolicyMutated, false);
  assert.equal(report.externalWriteAuthorized, false);
  assert.equal(report.externalNonceAllocated, false);
  assert.equal(report.signatureCreated, false);
  assert.equal(report.networkCalled, false);
  assert.equal(report.protectiveAuthorityCanExpandRisk, false);
});
