import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceEconomicAgent } from "../../../packages/reference-economic-agent/src/index.js";
import {
  AGENT_CREDIT_EXECUTION_POLICY,
  createAgentCreditExecutionRuntime
} from "../src/index.js";

const NOW = new Date("2026-08-14T08:00:00.000Z").getTime();

function agent(runtime, suffix = "default") {
  return createReferenceEconomicAgent({
    economicAgentWallet: `economic_agent_wallet_${suffix}_001`,
    creditProvider: runtime.creditProvider,
    executionVenue: runtime.executionVenue
  });
}

async function readyRuntime({ clock = () => NOW, suffix = "ready" } = {}) {
  const runtime = createAgentCreditExecutionRuntime({ clock });
  const runId = `agent_credit_run_${suffix}_001`;
  const credit = runtime.creditProvider;
  const venue = runtime.executionVenue;
  const authenticated = await credit.authenticate({
    economicAgentWallet: `economic_agent_wallet_${suffix}_001`,
    runId
  });
  const requested = await credit.requestCredit({
    authenticatedSubject: authenticated.authenticatedSubject,
    purposeCode: "trading_capital",
    requestedPrincipalMinor: "1000",
    runId
  });
  const offer = await credit.readOffer({ offerId: requested.offerId, runId });
  const accepted = await credit.acceptOffer({
    offerId: offer.offerId,
    expectedOfferHash: offer.offerHash,
    expectedTermsHash: offer.termsHash,
    runId
  });
  const facility = await credit.readFacility({
    facilityId: accepted.facilityId,
    runId
  });
  const binding = await venue.bindAccount({
    facilityId: facility.facilityId,
    authorizationVersion: facility.authorizationVersion,
    runId
  });
  return { runtime, credit, venue, runId, facility, binding };
}

test("L0 external Agent completes shared credit, controlled execution, repayment, and Evidence", async () => {
  const runtime = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    finalEquityMinor: "1100"
  });
  const result = await agent(runtime, "healthy").run({
    requestedPrincipalMinor: "1000",
    runId: "agent_credit_run_healthy_001"
  });
  assert.equal(runtime.inspect().state.stage, "SETTLED");
  assert.equal(result.repayment.appliedPrincipalMinor, "1000");
  assert.equal(result.repayment.outstandingPrincipalMinor, "0");
  assert.equal(result.repayment.residualReleaseMinor, "100");
  assert.equal(result.repayment.residualReleasedAfterRepayment, true);
  assert.equal(result.performance.creditState, "REPAID");
  assert.equal(result.performance.canonicalLedger, true);
  assert.equal(result.evidence.count, 10);
  assert.equal(result.account.agentCustody, false);
  assert.equal(result.account.keyExportable, false);
  assert.equal(result.account.withdrawalAuthority, false);
  assert.equal(result.account.transferAuthority, false);
  const durable = JSON.stringify(runtime.exportSnapshot());
  for (const forbidden of [
    "economic_agent_wallet_healthy_001",
    "synthetic-signature-not-persisted",
    "privateKey",
    "mnemonic",
    "seedPhrase",
    '"rawResponsePersisted":true'
  ]) assert.equal(durable.includes(forbidden), false, forbidden);
  assert.equal(runtime.inspect().executionSubmissionCount, 2);
});

test("loss performs partial canonical repayment and retains truthful outstanding state", async () => {
  const runtime = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    finalEquityMinor: "960"
  });
  const result = await agent(runtime, "loss").run({
    requestedPrincipalMinor: "1000",
    runId: "agent_credit_run_loss_001"
  });
  assert.equal(runtime.inspect().state.stage, "PARTIAL_REPAYMENT");
  assert.equal(result.repayment.appliedPrincipalMinor, "960");
  assert.equal(result.repayment.outstandingPrincipalMinor, "40");
  assert.equal(result.repayment.obligationStatus, "partially_repaid");
  assert.equal(result.performance.providerPrincipalShortfallMinor, "40");
  assert.equal(result.performance.subjectFirstLossMinor, "100");
  assert.equal(result.performance.creditState, "LOSS_OUTSTANDING");
  assert.equal(result.performance.riskState, "NEW_CAPACITY_HELD");
  assert.equal(result.performance.futureCapacity, "HELD_FOR_REVIEW");
  assert.equal(result.repayment.residualReleaseMinor, "0");
});

test("authorization envelope is versioned, server-controlled, and no-custody", () => {
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.mode, "L0_LOCAL_NO_FUNDS");
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.venue.environment, "testnet");
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.venue.networkAvailable, false);
  assert.deepEqual(
    AGENT_CREDIT_EXECUTION_POLICY.execution.allowedActions,
    ["order", "cancel", "cancelByCloid", "modify", "scheduleCancel"]
  );
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.execution.maxLeverage, 1);
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.withdrawal.allowed, false);
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.externalTransfer.allowed, false);
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.agentCustody.allowed, false);
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.mainnetAuthority, false);
  assert.equal(AGENT_CREDIT_EXECUTION_POLICY.fundsAuthority, false);
});

test("forbidden and unknown Agent actions deny before signer, adapter, or economics", async (t) => {
  const cases = [
    "withdraw3",
    "usdSend",
    "spotSend",
    "sendAsset",
    "usdClassTransfer",
    "vaultTransfer",
    "approveAgent",
    "approveBuilderFee",
    "bridge",
    "stake",
    "delegate",
    "transfer",
    "withdraw",
    "arbitrary",
    "unknownFutureAction"
  ];
  for (const [index, kind] of cases.entries()) {
    await t.test(kind, async () => {
      const harness = await readyRuntime({ suffix: `deny_${index}` });
      await assert.rejects(
        async () => harness.venue.prepareExecution({
          facilityId: harness.facility.facilityId,
          executionIntent: { kind },
          sequence: 1,
          runId: harness.runId
        }),
        (error) => error.code === "agent_credit_execution_action_denied"
      );
      const observed = harness.runtime.inspect();
      assert.equal(observed.executionSubmissionCount, 0);
      assert.equal(observed.executionRepository.records.length, 0);
      const denial = observed.state.denials.at(-1);
      assert.equal(denial.adapterInvoked, false);
      assert.equal(denial.externalExecution, false);
      assert.equal(denial.economicMutation, false);
      assert.equal(denial.authorityExpanded, false);
      assert.equal(denial.silentRetry, false);
    });
  }
});

test("market, notional, leverage, recipient, venue, account, raw action, target, and mainnet mutation deny", async (t) => {
  const intents = [
    { kind: "open", market: "ETH", requestedNotionalMinor: "1000" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1001" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", leverage: 2 },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", recipient: "changed" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", venue: "other" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", account: "other" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", rawAction: {} },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", target: "raw" },
    { kind: "open", market: "BTC", requestedNotionalMinor: "1000", mainnet: true }
  ];
  for (const [index, executionIntent] of intents.entries()) {
    await t.test(`mutation_${index}`, async () => {
      const harness = await readyRuntime({ suffix: `mutation_${index}` });
      await assert.rejects(
        async () => harness.venue.prepareExecution({
          facilityId: harness.facility.facilityId,
          executionIntent,
          sequence: 1,
          runId: harness.runId
        })
      );
      assert.equal(harness.runtime.inspect().executionSubmissionCount, 0);
    });
  }
});

test("revoked, expired, frozen, cross-Facility, and unreconciled authority deny", async (t) => {
  const base = await readyRuntime({ suffix: "authority_base" });
  const cases = [
    ["revoked", (snapshot) => { snapshot.state.identity.mandate.status = "revoked"; }],
    ["expired", (snapshot) => { snapshot.state.identity.mandate.expiresAt = new Date(NOW - 1).toISOString(); }],
    ["unreconciled", (snapshot) => { snapshot.state.reconciliationBlocked = true; }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const snapshot = base.runtime.exportSnapshot();
      mutate(snapshot);
      const runtime = createAgentCreditExecutionRuntime({
        clock: () => NOW,
        snapshot
      });
      await assert.rejects(async () => runtime.executionVenue.prepareExecution({
        facilityId: base.facility.facilityId,
        executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
        sequence: 1,
        runId: base.runId
      }));
      assert.equal(runtime.inspect().executionSubmissionCount, 0);
    });
  }
  await t.test("frozen", async () => {
    const harness = await readyRuntime({ suffix: "frozen" });
    harness.runtime.freeze("operator_freeze");
    await assert.rejects(async () => harness.venue.prepareExecution({
      facilityId: harness.facility.facilityId,
      executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
      sequence: 1,
      runId: harness.runId
    }));
  });
  await t.test("cross-facility", async () => {
    const harness = await readyRuntime({ suffix: "cross_facility" });
    await assert.rejects(async () => harness.venue.prepareExecution({
      facilityId: "trading_facility_other_tenant_001",
      executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
      sequence: 1,
      runId: harness.runId
    }));
  });
});

test("emergency freeze denies new risk, permits exact close, and holds residual", async () => {
  const harness = await readyRuntime({ suffix: "emergency" });
  const prepared = await harness.venue.prepareExecution({
    facilityId: harness.facility.facilityId,
    executionIntent: {
      kind: "open",
      market: "BTC",
      requestedNotionalMinor: "1000"
    },
    sequence: 1,
    runId: harness.runId
  });
  const opened = await harness.venue.submitExecution({
    preparedExecutionId: prepared.preparedExecutionId,
    preparedExecutionHash: prepared.preparedExecutionHash,
    runId: harness.runId
  });
  harness.runtime.freeze("operator_freeze");
  await assert.rejects(async () => harness.venue.prepareExecution({
    facilityId: harness.facility.facilityId,
    executionIntent: {
      kind: "open",
      market: "BTC",
      requestedNotionalMinor: "1000"
    },
    sequence: 2,
    runId: harness.runId
  }), { code: "agent_credit_authority_unavailable" });

  const close = await harness.venue.prepareExecution({
    facilityId: harness.facility.facilityId,
    executionIntent: {
      kind: "close",
      market: "BTC",
      openExecutionId: opened.executionId
    },
    sequence: 2,
    runId: harness.runId
  });
  await harness.venue.submitExecution({
    preparedExecutionId: close.preparedExecutionId,
    preparedExecutionHash: close.preparedExecutionHash,
    runId: harness.runId
  });
  const reconciliation = await harness.venue.reconcile({
    facilityId: harness.facility.facilityId,
    runId: harness.runId
  });
  const repayment = await harness.credit.repay({
    expectedReconciliationHash: reconciliation.reconciliationHash,
    facilityId: harness.facility.facilityId,
    reconciliationId: reconciliation.reconciliationId,
    runId: harness.runId
  });
  assert.equal(repayment.appliedPrincipalMinor, "1000");
  assert.equal(repayment.residualReleaseMinor, "0");
  assert.equal(repayment.residualReleasedAfterRepayment, false);
  assert.equal(harness.runtime.inspect().state.performance.riskState, "FROZEN");
  assert.equal(
    harness.runtime.inspect().state.performance.futureCapacity,
    "HELD_FOR_REVIEW"
  );
});

test("stale/mutated preparation and execution replay deny with one external simulation", async () => {
  let now = NOW;
  const harness = await readyRuntime({ clock: () => now, suffix: "replay" });
  const prepared = await harness.venue.prepareExecution({
    facilityId: harness.facility.facilityId,
    executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
    sequence: 1,
    runId: harness.runId
  });
  await assert.rejects(harness.venue.submitExecution({
    preparedExecutionId: prepared.preparedExecutionId,
    preparedExecutionHash: `0x${"f".repeat(64)}`,
    runId: harness.runId
  }));
  assert.equal(harness.runtime.inspect().executionSubmissionCount, 0);
  const submitted = await harness.venue.submitExecution({
    preparedExecutionId: prepared.preparedExecutionId,
    preparedExecutionHash: prepared.preparedExecutionHash,
    runId: harness.runId
  });
  assert.equal(submitted.status, "CONFIRMED");
  await assert.rejects(harness.venue.submitExecution({
    preparedExecutionId: prepared.preparedExecutionId,
    preparedExecutionHash: prepared.preparedExecutionHash,
    runId: harness.runId
  }), (error) => error.code === "execution_replay_denied");
  assert.equal(harness.runtime.inspect().executionSubmissionCount, 1);

  const staleHarness = await readyRuntime({ clock: () => now, suffix: "stale" });
  const stale = await staleHarness.venue.prepareExecution({
    facilityId: staleHarness.facility.facilityId,
    executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
    sequence: 1,
    runId: staleHarness.runId
  });
  now += 30_001;
  await assert.rejects(staleHarness.venue.submitExecution({
    preparedExecutionId: stale.preparedExecutionId,
    preparedExecutionHash: stale.preparedExecutionHash,
    runId: staleHarness.runId
  }), (error) => error.code === "stale_or_mutated_execution_denied");
  assert.equal(staleHarness.runtime.inspect().executionSubmissionCount, 0);
});

test("restart checkpoints preserve one Facility, order, reconciliation, and repayment", async (t) => {
  const base = await readyRuntime({ suffix: "restart" });
  await t.test("after Facility activation and capital allocation", async () => {
    const restarted = createAgentCreditExecutionRuntime({
      clock: () => NOW,
      snapshot: base.runtime.exportSnapshot()
    });
    const facility = await restarted.creditProvider.readFacility({
      facilityId: base.facility.facilityId,
      runId: base.runId
    });
    assert.equal(facility.lifecycleStatus, "active");
  });

  const prepared = await base.venue.prepareExecution({
    facilityId: base.facility.facilityId,
    executionIntent: { kind: "open", market: "BTC", requestedNotionalMinor: "1000" },
    sequence: 1,
    runId: base.runId
  });
  const afterPrepare = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    snapshot: base.runtime.exportSnapshot()
  });
  const opened = await afterPrepare.executionVenue.submitExecution({
    preparedExecutionId: prepared.preparedExecutionId,
    preparedExecutionHash: prepared.preparedExecutionHash,
    runId: base.runId
  });
  assert.equal(opened.status, "CONFIRMED");

  const afterOrder = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    snapshot: afterPrepare.exportSnapshot()
  });
  const observed = await afterOrder.executionVenue.readExecution({
    executionId: opened.executionId,
    runId: base.runId
  });
  assert.equal(observed.status, "CONFIRMED");
  assert.equal(afterOrder.inspect().executionRepository.records.length, 1);

  const closePrepared = await afterOrder.executionVenue.prepareExecution({
    facilityId: base.facility.facilityId,
    executionIntent: { kind: "close", market: "BTC", openExecutionId: opened.executionId },
    sequence: 2,
    runId: base.runId
  });
  await afterOrder.executionVenue.submitExecution({
    preparedExecutionId: closePrepared.preparedExecutionId,
    preparedExecutionHash: closePrepared.preparedExecutionHash,
    runId: base.runId
  });
  const afterClose = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    snapshot: afterOrder.exportSnapshot()
  });
  const reconciliation = await afterClose.executionVenue.reconcile({
    facilityId: base.facility.facilityId,
    runId: base.runId
  });
  assert.equal(reconciliation.status, "RECONCILED");
  assert.equal(afterClose.inspect().executionRepository.records.length, 2);

  const crashing = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    crashPoint: "during_repayment",
    snapshot: afterClose.exportSnapshot()
  });
  await assert.rejects(async () => crashing.creditProvider.repay({
    expectedReconciliationHash: reconciliation.reconciliationHash,
    facilityId: base.facility.facilityId,
    reconciliationId: reconciliation.reconciliationId,
    runId: base.runId
  }), (error) => error.code === "simulated_agent_credit_restart");
  assert.equal(crashing.inspect().state.repayment, null);
  assert.equal(crashing.inspect().state.repaymentPlan.economicMutationCreated, false);

  const recovered = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    snapshot: crashing.exportSnapshot()
  });
  const repaid = await recovered.creditProvider.repay({
    expectedReconciliationHash: reconciliation.reconciliationHash,
    facilityId: base.facility.facilityId,
    reconciliationId: reconciliation.reconciliationId,
    runId: base.runId
  });
  assert.equal(repaid.outstandingPrincipalMinor, "0");
  const afterRepayment = createAgentCreditExecutionRuntime({
    clock: () => NOW,
    snapshot: recovered.exportSnapshot()
  });
  assert.equal(afterRepayment.inspect().state.stage, "SETTLED");
  assert.equal(afterRepayment.inspect().state.executions.length, 2);
  await assert.rejects(async () => afterRepayment.creditProvider.repay({
    expectedReconciliationHash: reconciliation.reconciliationHash,
    facilityId: base.facility.facilityId,
    reconciliationId: reconciliation.reconciliationId,
    runId: base.runId
  }), (error) => error.code === "repayment_replay_denied");
});
