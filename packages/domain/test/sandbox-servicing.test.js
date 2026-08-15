import assert from "node:assert/strict";
import test from "node:test";
import {
  CreditAuthorityType,
  SandboxRepaymentSource,
  advanceSandboxServicing,
  createAcceptedOfferObligation,
  createCreditOfferAcceptance,
  createCreditIntent,
  createDeterministicCreditDecisionOutcome,
  createSandboxWriteOffTransaction,
  executeSandboxObligation,
  postSandboxRepayment,
  repurchaseSandboxObligation,
  restructureSandboxObligation,
  writeOffSandboxObligation
} from "../src/index.js";

const START = new Date("2026-07-16T00:00:00.000Z");
const DAY = 86_400_000;

function executedObligation() {
  const authorityRef = "consent_servicing";
  const intent = createCreditIntent({
    subjectId: "subject_servicing",
    principalId: "principal_servicing",
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "10000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2,
    now: START
  });
  const { decision, offer } = createDeterministicCreditDecisionOutcome({ intent, now: START });
  const decidedIntent = { ...intent, status: "decided", updatedAt: START.toISOString() };
  const acceptance = createCreditOfferAcceptance({
    offer,
    intent: decidedIntent,
    decision,
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef,
    acknowledgementHash: `0x${"ab".repeat(32)}`,
    acceptedByActorId: "actor_servicing",
    now: START
  });
  const pending = {
    ...createAcceptedOfferObligation({
      offer,
      intent: decidedIntent,
      decision,
      acceptance,
      now: START
    }),
    annualRateBps: 3650
  };
  return executeSandboxObligation(pending, {
    adapterReceipt: {
      obligationId: pending.obligationId,
      assetId: pending.assetId,
      amountMinor: pending.originalPrincipalMinor,
      adapterId: "sandbox_rail_local",
      adapterVersion: "1.0.0",
      adapterKeyId: "sandbox-key-2026-07",
      messageHash: `0x${"cd".repeat(32)}`,
      signature: "ed25519:test-signature",
      issuedAt: START.toISOString(),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false
    },
    now: START
  }).obligation;
}

function atDaysAfterFirstDue(obligation, days) {
  return new Date(new Date(obligation.firstPaymentAt).getTime() + days * DAY);
}

test("trusted UTC servicing deterministically derives grace, DPD buckets, and default", () => {
  const obligation = executedObligation();
  const samples = [
    [1, "grace_period", "delinquent", 1],
    [4, "dpd_1_30", "delinquent", 4],
    [31, "dpd_31_60", "delinquent", 31],
    [61, "dpd_61_89", "delinquent", 61],
    [90, "defaulted", "defaulted", 90]
  ];
  for (const [days, classification, status, expectedDpd] of samples) {
    const result = advanceSandboxServicing(obligation, {
      actorId: "worker_servicing",
      now: atDaysAfterFirstDue(obligation, days)
    });
    assert.equal(result.obligation.servicingClassification, classification);
    assert.equal(result.obligation.status, status);
    assert.equal(result.obligation.daysPastDue, expectedDpd);
    assert.equal(result.obligation.oldestUnpaidInstallmentId, obligation.installments[0].installmentId);
    assert.equal(result.servicingAction.source, "system_worker");
    assert.equal(result.servicingAction.productionFundsMoved, false);
  }
});

test("repayment cures all past-due components without erasing immutable late evidence", () => {
  const executed = executedObligation();
  const overdueAt = atDaysAfterFirstDue(executed, 20);
  const delinquent = advanceSandboxServicing(executed, {
    actorId: "worker_servicing",
    now: overdueAt
  });
  const elapsedDays = Math.floor((overdueAt.getTime() - START.getTime()) / DAY);
  const accruedInterest = elapsedDays * 10;
  const result = postSandboxRepayment(delinquent.obligation, {
    amountMinor: (5000 + accruedInterest).toString(),
    sourceCode: SandboxRepaymentSource.SYNTHETIC_BANK,
    actorId: "actor_servicing",
    now: overdueAt
  });
  assert.equal(result.cured, true);
  assert.equal(result.obligation.status, "partially_repaid");
  assert.equal(result.obligation.servicingClassification, "cured");
  assert.equal(result.obligation.daysPastDue, 0);
  assert.equal(result.servicingAction.actionType, "cure");
  assert.equal(delinquent.servicingAction.nextClassification, "dpd_1_30");
});

test("dual-controlled resolutions preserve schedules and never fabricate repayment", () => {
  const executed = executedObligation();
  const defaulted = advanceSandboxServicing(executed, {
    actorId: "worker_servicing",
    now: atDaysAfterFirstDue(executed, 90)
  }).obligation;
  const approval = {
    actorId: "operator_servicing",
    approvalProposalId: "approval_proposal_servicing",
    approvalExecutionId: "approval_execution_servicing",
    reasonCode: "sandbox_hardship_restructure"
  };
  const restructured = restructureSandboxObligation(defaulted, {
    ...approval,
    additionalTermDays: 30,
    now: atDaysAfterFirstDue(executed, 91)
  });
  assert.equal(restructured.obligation.status, "restructured");
  assert.equal(restructured.obligation.scheduleSequence, 2);
  assert.equal(restructured.obligation.installments.length, 1);
  assert.equal(restructured.servicingAction.previousSchedule.installments.length, 2);
  assert.equal(restructured.obligation.totalRepaidMinor, defaulted.totalRepaidMinor);

  const repurchased = repurchaseSandboxObligation(restructured.obligation, {
    ...approval,
    approvalExecutionId: "approval_execution_repurchase",
    reasonCode: "sandbox_contractual_repurchase",
    servicingOwnerCode: "sandbox_originator",
    now: atDaysAfterFirstDue(executed, 92)
  });
  assert.equal(repurchased.obligation.status, "repurchased");
  assert.equal(repurchased.obligation.servicingOwnerCode, "sandbox_originator");
  assert.equal(repurchased.obligation.outstandingPrincipalMinor, defaulted.outstandingPrincipalMinor);
});

test("write-off posts a balanced synthetic loss but does not mark the Obligation repaid", () => {
  const executed = executedObligation();
  const defaulted = advanceSandboxServicing(executed, {
    actorId: "worker_servicing",
    now: atDaysAfterFirstDue(executed, 90)
  }).obligation;
  const resolved = writeOffSandboxObligation(defaulted, {
    actorId: "operator_servicing",
    approvalProposalId: "approval_proposal_writeoff",
    approvalExecutionId: "approval_execution_writeoff",
    reasonCode: "sandbox_uncollectible_writeoff",
    now: atDaysAfterFirstDue(executed, 91)
  });
  const transaction = createSandboxWriteOffTransaction(defaulted, {
    servicingActionId: resolved.servicingAction.servicingActionId,
    now: atDaysAfterFirstDue(executed, 91)
  });
  assert.equal(resolved.obligation.status, "written_off");
  assert.equal(resolved.obligation.outstandingPrincipalMinor, "10000");
  assert.equal(resolved.obligation.totalRepaidMinor, "0");
  assert.equal(transaction.debitTotalMinor, transaction.creditTotalMinor);
  assert.equal(transaction.transactionType, "sandbox_write_off");
});
