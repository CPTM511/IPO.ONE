import assert from "node:assert/strict";
import test from "node:test";
import { runScenario } from "../../../scripts/agent-credit-experience.mjs";

test("M2B-004 review API shows terminal shared Credit State without authority", async () => {
  const result = await runScenario("healthy");
  assert.equal(result.stage, "SETTLED");
  assert.equal(result.creditOutcomeStatus, "FINALIZED");
  assert.equal(result.creditOutcomeLabel, "on_time_repaid");
  assert.match(result.creditOutcomeHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.sharedCreditStateStatus, "PROJECTED");
  assert.match(result.sharedCreditStateHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.sharedCreditStateVersion, 1);
  assert.equal(result.creditStateAuthorizing, false);
  assert.equal(result.automaticLimitChange, false);
  assert.equal(result.collateralRelief, false);
  assert.equal(result.realFundsMoved, false);
  assert.equal(result.mainnetInteraction, false);
});

test("M2B-004 review API does not manufacture a terminal outcome from loss", async () => {
  const result = await runScenario("loss");
  assert.equal(result.stage, "PARTIAL_REPAYMENT");
  assert.equal(result.outstandingPrincipalMinor, "40");
  assert.equal(result.creditOutcomeStatus, "PENDING_TERMINAL");
  assert.equal(result.creditOutcomeLabel, "not_terminal");
  assert.equal(result.creditOutcomeHash, null);
  assert.equal(result.sharedCreditStateStatus, "PENDING_TERMINAL");
  assert.equal(result.sharedCreditStateHash, null);
  assert.equal(result.sharedCreditStateVersion, 0);
  assert.equal(result.automaticLimitChange, false);
  assert.equal(result.collateralRelief, false);
});

test("M2B-004 review API rejects unknown scenarios", async () => {
  await assert.rejects(runScenario("unknown"), /unknown_scenario/);
});
