import assert from "node:assert/strict";
import test from "node:test";
import {
  createFinalizedCreditOutcome, createSyntheticFeeTerms, SYNTHETIC_FEE_PROFILE,
  hashId
} from "../src/index.js";

const NOW = "2026-07-28T12:00:00.000Z";
const DECIDED_AT = "2026-07-01T00:00:00.000Z";
const TERMINAL_AT = "2026-07-28T11:59:00.000Z";

function decision() {
  const riskDecisionId = "risk_decision_test";
  const decisionHash = hashId("test_decision", { riskDecisionId });
  const featureSnapshotHash = hashId("test_feature_snapshot", { riskDecisionId });
  const policyHash = hashId("test_policy", { version: 1 });
  return {
    riskDecisionId,
    decisionHash,
    subjectId: "subject_test",
    principalId: "principal_test",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    status: "approved",
    policyHash,
    featureSnapshotHash,
    riskFeatureSnapshot: {
      schemaVersion: "risk_feature_snapshot.v1",
      featureSnapshotHash,
      policyHash,
      sandboxOnly: true,
      productionAuthority: false,
      evaluatedAt: DECIDED_AT,
      features: { requestedPrincipalMinor: "12000" }
    },
    decisionPassport: {
      schemaVersion: "risk_decision_passport.v1",
      riskDecisionId,
      decisionHash,
      featureSnapshotHash,
      policyHash,
      decisionPassportHash: hashId("test_decision_passport", { riskDecisionId })
    },
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "risk_decision.v3"
  };
}

function obligation(status = "fully_repaid") {
  return {
    obligationId: "obligation_test",
    obligationHash: hashId("test_obligation", { id: "obligation_test" }),
    riskDecisionId: "risk_decision_test",
    subjectId: "subject_test",
    principalId: "principal_test",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    originalPrincipalMinor: "12000",
    totalRepaidMinor: status === "fully_repaid" ? "12000" : "4000",
    outstandingPrincipalMinor: status === "fully_repaid" ? "0" : "8000",
    outstandingInterestMinor: "0",
    outstandingFeesMinor: "0",
    writtenOffPrincipalMinor: status === "written_off" ? "8000" : "0",
    writtenOffInterestMinor: "0",
    writtenOffFeesMinor: "0",
    status,
    executionStatus: "executed",
    sandboxOnly: true,
    productionFundsMoved: false,
    updatedAt: TERMINAL_AT,
    schemaVersion: "obligation.v2"
  };
}

function create(overrides = {}) {
  return createFinalizedCreditOutcome({
    decision: decision(),
    obligation: obligation(),
    servicingSummary: {
      maxDaysPastDue: 0,
      restructured: false,
      repurchased: false,
      outcomeFinalizedAt: TERMINAL_AT
    },
    sourceEvidenceHashes: [
      hashId("test_evidence", { sequence: 1 }),
      hashId("test_evidence", { sequence: 2 })
    ],
    recordedAt: NOW,
    ...overrides
  });
}

test("finalized credit outcome preserves decision features without granting authority", () => {
  const outcome = create();
  assert.equal(outcome.outcomeLabel, "on_time_repaid");
  assert.equal(outcome.repaymentRatioBps, 10_000);
  assert.equal(outcome.lossMinor, "0");
  assert.deepEqual(
    outcome.decisionFeatureSnapshot,
    decision().riskFeatureSnapshot
  );
  assert.equal(outcome.authorizing, false);
  assert.equal(outcome.fundsAuthority, false);
  assert.equal(outcome.economicStateMutation, false);
  assert.equal(outcome.productionAuthority, false);
  assert.equal(outcome.scoreAuthoritative, false);
});

test("write-off and late labels are closed and explainable", () => {
  const writtenOff = create({
    obligation: obligation("written_off"),
    servicingSummary: {
      maxDaysPastDue: 95,
      restructured: false,
      repurchased: false,
      outcomeFinalizedAt: TERMINAL_AT
    }
  });
  assert.equal(writtenOff.outcomeLabel, "written_off");
  assert.equal(writtenOff.lossMinor, "8000");
  assert.equal(writtenOff.repaymentRatioBps, 3_333);

  const late = create({
    servicingSummary: {
      maxDaysPastDue: 4,
      restructured: false,
      repurchased: false,
      outcomeFinalizedAt: TERMINAL_AT
    }
  });
  assert.equal(late.outcomeLabel, "late_or_modified_repaid");
});

test("outcome rejects non-terminal, production-authorizing, and incomplete Evidence inputs", () => {
  assert.throws(
    () => create({ obligation: { ...obligation(), status: "partially_repaid" } }),
    (error) => error?.code === "invalid_credit_outcome"
  );
  assert.throws(
    () => create({ decision: { ...decision(), productionAuthority: true } }),
    (error) => error?.code === "invalid_credit_outcome"
  );
  assert.throws(
    () => create({
      sourceEvidenceHashes: [hashId("test_evidence", { sequence: 1 })]
    }),
    (error) => error?.code === "invalid_credit_outcome"
  );
});

test('F1 credit attribution uses effective exposure without counting cancelled principal as payment',()=>{
  const terminal={...obligation(),totalRepaidMinor:'9009',syntheticFees:{terms:createSyntheticFeeTerms({profile:SYNTHETIC_FEE_PROFILE,assetId:"urn:ipo-one:sandbox-asset:usd-cent",economicLoanId:"intent_credit_outcome_fixture",principalMinor:"12000"}),fundedBaseMinor:'9000',sourceCorrectionCount:1,lastSourceCorrectionReceiptId:hashId('receipt',{}),principalUnpaidCreditMinor:'3000',principalRefundCreditDueMinor:'0',interestRefundCreditDueMinor:'0',borrowerRefundDueMinor:'0'}};
  const outcome=create({obligation:terminal});
  assert.equal(outcome.originalPrincipalMinor,'12000');assert.equal(outcome.totalRepaidMinor,'9009');
  assert.equal(outcome.syntheticFeeCreditContext.effectivePrincipalMinor,'9000');assert.equal(outcome.syntheticFeeCreditContext.netRepaidMinor,'9009');
  assert.equal(outcome.repaymentRatioBps,10000);
  assert.throws(()=>create({obligation:{...terminal,totalRepaidMinor:'0',syntheticFees:{...terminal.syntheticFees,fundedBaseMinor:'0'}}}),e=>e.code==='synthetic_fee_cycle_cancelled');
});
test('F1 paid source credit preserves gross receipts but removes refund credits from net performance',()=>{
  const terminal={...obligation(),totalRepaidMinor:'12012',syntheticFees:{terms:createSyntheticFeeTerms({profile:SYNTHETIC_FEE_PROFILE,assetId:"urn:ipo-one:sandbox-asset:usd-cent",economicLoanId:"intent_credit_outcome_fixture",principalMinor:"12000"}),fundedBaseMinor:'9000',sourceCorrectionCount:1,lastSourceCorrectionReceiptId:hashId('receipt',{}),principalRefundCreditDueMinor:'3000',interestRefundCreditDueMinor:'0',borrowerRefundDueMinor:'3'}};
  const outcome=create({obligation:terminal});assert.equal(outcome.totalRepaidMinor,'12012');assert.equal(outcome.syntheticFeeCreditContext.netRepaidMinor,'9009');
});
