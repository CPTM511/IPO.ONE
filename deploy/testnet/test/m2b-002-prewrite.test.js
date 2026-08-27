import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectM2B002PrewritePolicy } from "../m2b-002-prewrite.mjs";

test("M2B-002 launch policy inspection stops before nonce, signature or network", async () => {
  const launchPolicy = JSON.parse(await readFile("deploy/launch-policy.v1.json", "utf8"));
  const report = inspectM2B002PrewritePolicy(launchPolicy, {
    inspectedAt: new Date("2026-08-25T16:00:00.000Z"),
    releaseCommitSha: "2e27c35d09530404a2eea9b35168abcbb7306cbc"
  });
  assert.equal(report.status, "BLOCKED_PREWRITE");
  assert.equal(report.requestedProfilePresent, false);
  assert.equal(report.currentPoolAgentVenueExecutionEnabled, false);
  assert.deepEqual(report.blockers, [
    "distinct_agent_venue_launch_profile_missing",
    "secured_pool_profile_agent_venue_execution_disabled",
    "durable_exact_composition_not_supplied",
    "fresh_reconciled_hyperliquid_account_observation_missing",
    "fresh_non_exporting_signer_handoff_missing",
    "exact_one_use_founder_run_approval_missing"
  ]);
  assert.equal(report.externalNonceAllocated, false);
  assert.equal(report.signatureCreated, false);
  assert.equal(report.networkCalled, false);
  assert.equal(report.exchangeRequestCreated, false);
  assert.equal(report.profileMutated, false);
  assert.equal(report.submissionAuthorizedByReport, false);
});
