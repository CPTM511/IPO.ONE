import assert from "node:assert/strict";
import test from "node:test";
import {
  CreditAuthorityType,
  createAcceptedOfferObligation,
  createCreditOfferAcceptance,
  createDeterministicCreditDecisionOutcome,
  createCreditIntent
} from "../src/index.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");

function outcome(authorityType, authorityRef) {
  const intent = createCreditIntent({
    subjectId: `subject_${authorityType}`,
    principalId: `principal_${authorityType}`,
    authorityType,
    authorityRef,
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12001",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2,
    now: NOW
  });
  const evaluated = createDeterministicCreditDecisionOutcome({ intent, now: NOW });
  return {
    intent: { ...intent, status: "decided", updatedAt: NOW.toISOString() },
    decision: evaluated.decision,
    offer: evaluated.offer
  };
}

function acceptedObligation(authorityType, authorityRef) {
  const values = outcome(authorityType, authorityRef);
  const acceptance = createCreditOfferAcceptance({
    ...values,
    authorityType,
    authorityRef,
    acknowledgementHash: `0x${"ab".repeat(32)}`,
    acceptedByActorId: `actor_${authorityType}`,
    now: new Date(NOW.getTime() + 60_000)
  });
  return createAcceptedOfferObligation({ ...values, acceptance, now: new Date(NOW.getTime() + 60_000) });
}

test("Human Consent and Agent Mandate produce one canonical Obligation terms and schedule shape", () => {
  const human = acceptedObligation(CreditAuthorityType.CONSENT, "consent_acceptance_test");
  const agent = acceptedObligation(CreditAuthorityType.MANDATE, "mandate_acceptance_test");
  const economicShape = (obligation) => ({
    assetId: obligation.assetId,
    originalPrincipalMinor: obligation.originalPrincipalMinor,
    outstandingPrincipalMinor: obligation.outstandingPrincipalMinor,
    annualRateBps: obligation.annualRateBps,
    originationFeeMinor: obligation.originationFeeMinor,
    accruedInterestMinor: obligation.accruedInterestMinor,
    outstandingInterestMinor: obligation.outstandingInterestMinor,
    accruedFeesMinor: obligation.accruedFeesMinor,
    outstandingFeesMinor: obligation.outstandingFeesMinor,
    totalRepaidMinor: obligation.totalRepaidMinor,
    repaymentFrequency: obligation.repaymentFrequency,
    installmentCount: obligation.installmentCount,
    firstPaymentAt: obligation.firstPaymentAt,
    maturityAt: obligation.maturityAt,
    scheduleVersion: obligation.scheduleVersion,
    installments: obligation.installments.map((row) => ({
      installmentNumber: row.installmentNumber,
      dueAt: row.dueAt,
      scheduledPrincipalMinor: row.scheduledPrincipalMinor,
      scheduledInterestMinor: row.scheduledInterestMinor,
      scheduledFeeMinor: row.scheduledFeeMinor,
      status: row.status,
      scheduleVersion: row.scheduleVersion
    })),
    executionStatus: obligation.executionStatus,
    sandboxOnly: obligation.sandboxOnly,
    productionFundsMoved: obligation.productionFundsMoved,
    status: obligation.status,
    schemaVersion: obligation.schemaVersion
  });
  assert.deepEqual(economicShape(human), economicShape(agent));
  assert.deepEqual(human.installments.map((row) => row.scheduledPrincipalMinor), ["6000", "6001"]);
  assert.equal(human.installments.at(-1).dueAt, human.maturityAt);
  assert.equal(human.installments.reduce(
    (sum, row) => sum + BigInt(row.scheduledPrincipalMinor), 0n
  ), 12001n);
  assert.equal(human.executionStatus, "pending");
  assert.equal(human.productionFundsMoved, false);
});

test("acceptance rejects stale hashes and does not create execution authority", async () => {
  const values = outcome(CreditAuthorityType.CONSENT, "consent_acceptance_test");
  assert.throws(
    () => createCreditOfferAcceptance({
      ...values,
      authorityType: CreditAuthorityType.MANDATE,
      authorityRef: "mandate_wrong",
      acknowledgementHash: `0x${"ab".repeat(32)}`,
      acceptedByActorId: "actor_human",
      now: NOW
    }),
    (error) => error.code === "authority_not_current"
  );
});
