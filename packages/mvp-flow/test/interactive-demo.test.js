import assert from "node:assert/strict";
import test from "node:test";
import { createInteractiveDemo } from "../src/index.js";

test("interactive demo runs user-facing Agent Lockbox flow through API controller logic", () => {
  const demo = createInteractiveDemo();
  let status = demo.createAgent({ displayName: "Test Agent" });
  const agentId = status.agent.subjectId;

  status = demo.bindWallet(agentId);
  status = demo.createLockbox(agentId);
  status = demo.requestCreditLine(agentId);
  status = demo.submitSpendRequest({ agentId, providerId: status.providers[0].providerId, amountMinor: "50000" });
  status = demo.recordSettlement();
  status = demo.captureRevenue({ agentId, amountMinor: "65000" });
  status = demo.autoRepay({ agentId });
  status = demo.evaluateCreditLearning({ agentId });

  assert.equal(status.walletBinding.status, "active");
  assert.equal(status.lockbox.status, "active");
  assert.equal(status.spendRequests.at(-1).status, "settled");
  assert.equal(status.obligations.at(-1).status, "fully_repaid");
  assert.equal(status.creditLine.utilizedMinor, "0");
  assert.ok(status.creditProfile.currentScore > 500);
  assert.equal(status.safety.noRealFunds, true);
});

test("interactive demo cycles healthy/risky/recovery update score and recommendations", () => {
  const demo = createInteractiveDemo();
  const status = demo.requestCreditLine(demo.createAgent().agent.subjectId);
  const agentId = status.agent.subjectId;
  const healthy = demo.runCycle("healthy", agentId);
  const risky = demo.runCycle("risky", agentId);
  const recovery = demo.runCycle("recovery", agentId);

  assert.equal(healthy.creditProfile.currentScore, 595);
  assert.ok(risky.creditProfile.currentScore < healthy.creditProfile.currentScore);
  assert.ok(recovery.creditProfile.currentScore > risky.creditProfile.currentScore);
  assert.equal(risky.spendRequests.some((request) => request.status === "rejected"), true);
  assert.ok(recovery.auditTimeline.some((event) => event.eventType === "credit_learning_cycle_completed"));
});
