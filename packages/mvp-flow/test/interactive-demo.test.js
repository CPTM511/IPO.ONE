import assert from "node:assert/strict";
import test from "node:test";
import { createInteractiveDemo } from "../src/index.js";

test("interactive demo runs user-facing Agent Lockbox flow through API controller logic", async () => {
  const demo = createInteractiveDemo();
  let status = await demo.createAgent({ displayName: "Test Agent" });
  const agentId = status.agent.subjectId;

  status = await demo.bindWallet(agentId);
  status = await demo.createLockbox(agentId);
  status = await demo.requestCreditLine(agentId);
  status = await demo.submitSpendRequest({ agentId, providerId: status.providers[0].providerId, amountMinor: "50000" });
  status = await demo.recordSettlement();
  status = await demo.captureRevenue({ agentId, amountMinor: "65000" });
  status = await demo.autoRepay({ agentId });
  status = await demo.evaluateCreditLearning({ agentId });

  assert.equal(status.walletBinding.status, "active");
  assert.equal(status.mandate.status, "active");
  assert.equal(status.pluginManifests.every((plugin) => plugin.status === "active"), true);
  assert.equal(status.pluginConformance.every((result) => result.remoteConformanceTested === false), true);
  assert.equal(status.lockbox.status, "active");
  assert.equal(status.spendRequests.at(-1).status, "settled");
  assert.equal(status.obligations.at(-1).status, "fully_repaid");
  assert.equal(status.creditLine.utilizedMinor, "0");
  assert.equal(status.ledger.integrity.balanced, true);
  assert.equal(status.ledger.transactionCount, 2);
  assert.ok(status.evidence.envelopeCount > 0);
  assert.ok(status.creditProfile.currentScore > 500);
  assert.equal(status.safety.noRealFunds, true);
});

test("interactive demo cycles healthy/risky/recovery update score and recommendations", async () => {
  const demo = createInteractiveDemo();
  const created = await demo.createAgent();
  const status = await demo.requestCreditLine(created.agent.subjectId);
  const agentId = status.agent.subjectId;
  const healthy = await demo.runCycle("healthy", agentId);
  const risky = await demo.runCycle("risky", agentId);
  const recovery = await demo.runCycle("recovery", agentId);

  assert.equal(healthy.creditProfile.currentScore, 585);
  assert.ok(risky.creditProfile.currentScore < healthy.creditProfile.currentScore);
  assert.ok(recovery.creditProfile.currentScore > risky.creditProfile.currentScore);
  assert.equal(risky.spendRequests.some((request) => request.status === "rejected"), true);
  assert.ok(recovery.auditTimeline.some((event) => event.eventType === "credit_learning_cycle_completed"));
  assert.equal(recovery.lastCycleSimulation.synthetic, true);
});

test("interactive evidence evaluation does not reward the same events twice", async () => {
  const demo = createInteractiveDemo();
  let status = await demo.createAgent({ displayName: "Evidence Agent" });
  const agentId = status.agent.subjectId;
  status = await demo.requestCreditLine(agentId);
  status = await demo.submitSpendRequest({ agentId, providerId: status.providers[0].providerId, amountMinor: "50000" });
  status = await demo.captureRevenue({ agentId, amountMinor: "65000" });
  status = await demo.autoRepay({ agentId });
  const first = await demo.evaluateCreditLearning({ agentId });
  const second = await demo.evaluateCreditLearning({ agentId });

  assert.ok(first.creditProfile.currentScore > 500);
  assert.equal(second.creditProfile.currentScore, first.creditProfile.currentScore);
});

test("interactive flow enforces live mandate revocation for provider spend", async () => {
  const demo = createInteractiveDemo();
  let status = await demo.createAgent({ displayName: "Revoked Agent" });
  const agentId = status.agent.subjectId;
  status = await demo.requestCreditLine(agentId);
  demo.services.mandateService.revokeMandate({
    mandateId: status.mandate.mandateId,
    actorId: status.principal.principalId,
    reason: "principal revoked delegated spend"
  });
  status = await demo.submitSpendRequest({
    agentId,
    providerId: status.providers[0].providerId,
    amountMinor: "50000"
  });

  assert.equal(status.mandate.status, "revoked");
  assert.equal(status.spendRequests.at(-1).status, "rejected");
  assert.equal(status.spendRequests.at(-1).rejectionReason, "mandate_not_active");
});
