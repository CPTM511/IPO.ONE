import assert from "node:assert/strict";
import test from "node:test";
import {
  CreditAuthorityType,
  LedgerAccountType,
  SandboxRepaymentSource,
  accrueSimpleInterest,
  createAcceptedOfferObligation,
  createCreditOfferAcceptance,
  createCreditIntent,
  createDeterministicCreditDecisionOutcome,
  executeSandboxObligation,
  postSandboxRepayment
} from "../src/index.js";

const START = new Date("2026-07-16T00:00:00.000Z");
const DAY = 86_400_000;

function acceptedObligation(authorityType = CreditAuthorityType.CONSENT) {
  const authorityRef = authorityType === CreditAuthorityType.CONSENT
    ? "consent_sandbox_execution"
    : "mandate_sandbox_execution";
  const intent = createCreditIntent({
    subjectId: `subject_${authorityType}`,
    principalId: `principal_${authorityType}`,
    authorityType,
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
    authorityType,
    authorityRef,
    acknowledgementHash: `0x${"ab".repeat(32)}`,
    acceptedByActorId: `actor_${authorityType}`,
    now: START
  });
  const obligation = createAcceptedOfferObligation({
    offer,
    intent: decidedIntent,
    decision,
    acceptance,
    now: START
  });
  return { ...obligation, annualRateBps: 36500 };
}

function adapterReceipt(obligation) {
  return {
    obligationId: obligation.obligationId,
    assetId: obligation.assetId,
    amountMinor: obligation.originalPrincipalMinor,
    adapterId: "sandbox_rail_local",
    adapterVersion: "1.0.0",
    adapterKeyId: "sandbox-key-2026-07",
    messageHash: `0x${"cd".repeat(32)}`,
    signature: "ed25519:test-signature",
    issuedAt: START.toISOString(),
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false
  };
}

test("shared sandbox execution creates non-redeemable receipt and balanced principal accounting", () => {
  const pending = acceptedObligation();
  const result = executeSandboxObligation(pending, {
    adapterReceipt: adapterReceipt(pending),
    now: START
  });
  assert.equal(result.obligation.status, "active");
  assert.equal(result.obligation.executionStatus, "executed");
  assert.equal(result.obligation.withdrawable, false);
  assert.equal(result.receipt.productionFundsMoved, false);
  assert.equal(result.receipt.withdrawable, false);
  assert.equal(Object.keys(result.accounts).length, 8);
  assert.equal(result.accounts[LedgerAccountType.PRINCIPAL_RECEIVABLE].normalSide, "debit");
  assert.equal(result.accounts[LedgerAccountType.SANDBOX_FUNDING_SOURCE].normalSide, "credit");
  assert.equal(result.ledgerTransaction.debitTotalMinor, "10000");
  assert.equal(result.ledgerTransaction.creditTotalMinor, "10000");
  assert.deepEqual(result.ledgerTransaction.entries.map(({ direction, amountMinor }) => ({
    direction,
    amountMinor
  })), [
    { direction: "debit", amountMinor: "10000" },
    { direction: "credit", amountMinor: "10000" }
  ]);
});

test("Actual/365 integer remainder is identical across batched and daily accrual", () => {
  const pending = acceptedObligation(CreditAuthorityType.MANDATE);
  const executed = executeSandboxObligation(pending, {
    adapterReceipt: adapterReceipt(pending),
    now: START
  }).obligation;
  const batched = accrueSimpleInterest(executed, { now: new Date(START.getTime() + 3 * DAY) });
  const first = accrueSimpleInterest(executed, { now: new Date(START.getTime() + DAY) });
  const daily = accrueSimpleInterest(first.obligation, { now: new Date(START.getTime() + 3 * DAY) });
  assert.equal(batched.accruedInterestMinor, "300");
  assert.equal(daily.obligation.accruedInterestMinor, batched.obligation.accruedInterestMinor);
  assert.equal(daily.numeratorRemainder, batched.numeratorRemainder);
  assert.equal(daily.obligation.lastAccruedAt, batched.obligation.lastAccruedAt);
});

test("repayment allocates fee then interest then principal and never posts surplus", () => {
  const pending = acceptedObligation();
  const executed = executeSandboxObligation(pending, {
    adapterReceipt: adapterReceipt(pending),
    now: START
  }).obligation;
  const result = postSandboxRepayment(executed, {
    amountMinor: "10300",
    sourceCode: SandboxRepaymentSource.SYNTHETIC_WALLET,
    actorId: "actor_human",
    now: new Date(START.getTime() + 2 * DAY)
  });
  assert.equal(result.repayment.appliedFeeMinor, "0");
  assert.equal(result.repayment.appliedInterestMinor, "200");
  assert.equal(result.repayment.appliedPrincipalMinor, "10000");
  assert.equal(result.repayment.appliedMinor, "10200");
  assert.equal(result.repayment.surplusMinor, "100");
  assert.equal(result.ledgerTransaction.debitTotalMinor, "10200");
  assert.equal(result.ledgerTransaction.creditTotalMinor, "10200");
  assert.equal(result.interestTransaction.debitTotalMinor, "200");
  assert.equal(result.interestTransaction.creditTotalMinor, "200");
  assert.equal(result.obligation.status, "fully_repaid");
  assert.equal(result.obligation.outstandingPrincipalMinor, "0");
  assert.equal(result.obligation.outstandingInterestMinor, "0");
  assert.equal(result.obligation.installments.every(({ status }) => status === "paid"), true);
});

test("execution and repayment fail closed before eligible lifecycle states", () => {
  const pending = acceptedObligation();
  assert.throws(
    () => postSandboxRepayment(pending, {
      amountMinor: "1",
      sourceCode: SandboxRepaymentSource.SYNTHETIC_BANK,
      actorId: "actor_human",
      now: START
    }),
    (error) => error.code === "obligation_not_repayable"
  );
  const executed = executeSandboxObligation(pending, {
    adapterReceipt: adapterReceipt(pending),
    now: START
  }).obligation;
  assert.throws(
    () => executeSandboxObligation(executed, {
      adapterReceipt: adapterReceipt(pending),
      now: START
    }),
    (error) => error.code === "obligation_not_executable"
  );
});
