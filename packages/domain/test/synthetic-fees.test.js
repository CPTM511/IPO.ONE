import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNTHETIC_FEE_PROFILE, SYNTHETIC_FEE_ASSET,
  createSyntheticFeeTerms, initialSyntheticFees, transitionSyntheticFeeBasis,
  syntheticFeeTarget, createSyntheticFeeStatement, assertSyntheticFeeProvenance,
  createCreditIntent, createDeterministicCreditDecisionOutcome,
  createCreditOfferAcceptance, createAcceptedOfferObligation,
  executeSandboxObligation, postSandboxRepayment, reviewSyntheticFeeSourceCorrection, correctSyntheticFeeSource
} from "../src/index.js";
const start = new Date("2026-10-01T00:00:00Z");
const digest = `0x${"ab".repeat(32)}`;
function state() {
  return initialSyntheticFees(createSyntheticFeeTerms({
    profile: SYNTHETIC_FEE_PROFILE, assetId: SYNTHETIC_FEE_ASSET,
    economicLoanId: "intent_b4", principalMinor: "12000"
  }));
}
function step(current, baseDeltaMinor, kind = "borrower", extra = {}) {
  return transitionSyntheticFeeBasis(current, {
    obligationId: "obligation_b4", sourceId: `source_${current.revision}`,
    sourceHash: digest, kind, baseDeltaMinor, now: start, ...extra
  });
}
function fixture(amount = "12000", enabled = true, term = 30) {
  const intent = createCreditIntent({ subjectId: "subject_b4", principalId: "principal_b4",
    authorityType: "consent", authorityRef: "consent_b4", assetId: SYNTHETIC_FEE_ASSET,
    requestedPrincipalMinor: amount, purposeCode: "working_capital", requestedTermDays: term,
    repaymentFrequency: "end_of_term", installmentCount: 1, now: start });
  const { decision, offer } = createDeterministicCreditDecisionOutcome({
    intent, feeProfile: enabled ? SYNTHETIC_FEE_PROFILE : undefined, now: start });
  const decidedIntent = { ...intent, status: "decided" };
  const acceptance = createCreditOfferAcceptance({ intent: decidedIntent, offer, decision,
    authorityType: "consent", authorityRef: "consent_b4", acknowledgementHash: digest,
    acceptedByActorId: "actor_b4", now: start });
  const obligation = createAcceptedOfferObligation({ intent: decidedIntent, offer, decision, acceptance, now: start });
  const adapterReceipt = { obligationId: obligation.obligationId, assetId: obligation.assetId,
    amountMinor: amount, adapterId: "sandbox_rail_local", adapterVersion: "1.0.0",
    adapterKeyId: "sandbox-key-2026-07", messageHash: digest,
    signature: "ed25519:test-signature", issuedAt: start.toISOString(),
    sandboxOnly: true, productionFundsMoved: false, withdrawable: false };
  return { offer, obligation, adapterReceipt };
}
test("B4 exact integer boundaries, no minimum, cap and precision", () => {
  for (const [base, expected] of [["10000","10"],["100000","100"],["1000000","1000"],["2000000","1000"],["999","0"],["1000","1"],["0","0"]]) {
    assert.equal(syntheticFeeTarget("borrower",base),expected);
  }
  assert.equal(syntheticFeeTarget("institution","90071992547409931"),"9007199254740993");
  for (const bad of [0, 0.1, "0.1", "-1", "001", "1e3"]) assert.throws(()=>syntheticFeeTarget("borrower",bad));
});
test("B4 cumulative fragments and fractional interest cannot overcharge or lose cents", () => {
  let current = state();
  const deltas=[];
  for (const amount of ["400000","600000","500000"]) {
    const next=step(current,amount);current=next.state;deltas.push(next.entry.feeDeltaMinor);
  }
  assert.deepEqual(deltas,["400","600","0"]);
  assert.equal(current.borrowerAssessedMinor,"1000");
  current=state();
  const a=step(current,"986","institution"), b=step(a.state,"4","institution");
  assert.equal(a.entry.feeDeltaMinor,"98");assert.equal(a.entry.remainderNumerator,"6000");
  assert.equal(b.entry.feeDeltaMinor,"1");assert.equal(b.state.institutionAssessedMinor,"99");
  current=state();const pennies=[];
  for (const amount of ["1","4","5"]) {const n=step(current,amount,"institution");current=n.state;pennies.push(n.entry.feeDeltaMinor);}
  assert.deepEqual(pennies,["0","0","1"]);
});
test("B4 corrections recompute net targets and reject unlinked/wrong/negative bases", () => {
  const funded=step(state(),"1000000");
  const correction=step(funded.state,"-100000","borrower",{reversesEntryId:funded.entry.feeEntryId,reasonCode:"funding_correction"});
  assert.equal(correction.entry.feeDeltaMinor,"-100");
  const interest=step(state(),"986","institution");
  const refund=step(interest.state,"-86","institution",{reversesEntryId:interest.entry.feeEntryId,reasonCode:"normal_interest_refund"});
  assert.equal(refund.entry.feeDeltaMinor,"-8");
  assert.throws(()=>step(funded.state,"-1"));
  assert.throws(()=>step(funded.state,"-1000001","borrower",{reversesEntryId:funded.entry.feeEntryId,reasonCode:"funding_correction"}));
  assert.throws(()=>step(funded.state,"-1","borrower",{reversesEntryId:funded.entry.feeEntryId,reasonCode:"normal_interest_refund"}));
});
test("B4 accepted fee terms preserve legacy and bind the exact new loan policy", () => {
  const old=fixture("12000",false);assert.equal(old.obligation.syntheticFees,undefined);
  const next=fixture();assert.equal(next.offer.termsVersion,"credit_terms.synthetic_fee.v1");
  assert.equal(next.obligation.syntheticFees.borrowerAssessedMinor,"0");
  assertSyntheticFeeProvenance(next);
  const removed=structuredClone(next.obligation);delete removed.syntheticFees;
  assert.throws(()=>assertSyntheticFeeProvenance({...next,obligation:removed}));
  const changed=structuredClone(next);changed.obligation.syntheticFees.terms.borrowerRateBps=100;
  assert.throws(()=>assertSyntheticFeeProvenance(changed));
  assert.throws(()=>createSyntheticFeeTerms({profile:SYNTHETIC_FEE_PROFILE,assetId:"EUR",economicLoanId:"loan",principalMinor:"10000"}));
});
test("B4 actual execute/repay charges 12 cents separately and fully reconciles", () => {
  const f=fixture();const e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  assert.equal(e.receipt.amountMinor,"12000");assert.equal(e.obligation.outstandingFeesMinor,"12");
  assert.equal(e.feeTransaction.debitTotalMinor,"12");assert.equal(e.feeTransaction.creditTotalMinor,"12");
  const partial=postSandboxRepayment(e.obligation,{amountMinor:"12000",sourceCode:"synthetic_wallet",actorId:"actor_b4",syntheticFeeAssessmentEnabled:true,now:start});
  assert.equal(partial.repayment.appliedFeeMinor,"12");assert.equal(partial.obligation.outstandingPrincipalMinor,"12");
  assert.notEqual(partial.obligation.status,"fully_repaid");
  const final=postSandboxRepayment(partial.obligation,{amountMinor:"12",sourceCode:"synthetic_wallet",actorId:"actor_b4",syntheticFeeAssessmentEnabled:true,now:start});
  assert.equal(final.obligation.status,"fully_repaid");assert.equal(final.obligation.totalRepaidMinor,"12012");
  assert.equal(final.obligation.syntheticFees.borrowerPaidMinor,"12");
});
test("B4 institution share derives from actual received normal interest, not principal or borrower fee", () => {
  const f=fixture("100000",true,90), e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const repayment=postSandboxRepayment(e.obligation,{amountMinor:"101086",sourceCode:"synthetic_wallet",actorId:"actor_b4",syntheticFeeAssessmentEnabled:true,now:new Date("2026-11-10T00:00:00Z")});
  assert.equal(repayment.repayment.appliedInterestMinor,"986");
  assert.equal(repayment.obligation.syntheticFees.institutionAssessedMinor,"98");
  assert.equal(repayment.obligation.outstandingFeesMinor,"0");
  assert.equal(repayment.feeTransaction.debitTotalMinor,"98");
  assert.equal(repayment.obligation.totalRepaidMinor,"101086");
});
test("B4 UTC monthly statement freezes sources, leaves unpaid amounts open and carries cross-month reversal", () => {
  const a=step(state(),"986","institution");
  const b=step(a.state,"-86","institution",{reversesEntryId:a.entry.feeEntryId,reasonCode:"normal_interest_refund",now:new Date("2026-11-09T00:00:00Z")});
  const institutionId=a.entry.institutionId;
  const october=createSyntheticFeeStatement({institutionId,month:"2026-10",entries:[a.entry],closed:true,now:new Date("2026-11-09T00:00:00Z")});
  assert.equal(october.closingMinor,"98");assert.equal(october.settledMinor,"0");
  assert.deepEqual(createSyntheticFeeStatement({institutionId,month:"2026-10",entries:[a.entry,b.entry],closed:true,now:new Date("2026-11-10T00:00:00Z")}),october);
  const november=createSyntheticFeeStatement({institutionId,month:"2026-11",entries:[a.entry,b.entry],now:new Date("2026-11-10T00:00:00Z")});
  assert.equal(november.openingMinor,"98");assert.equal(november.reversalsMinor,"8");assert.equal(november.closingMinor,"90");
  assert.throws(()=>createSyntheticFeeStatement({institutionId,month:"2026-11",entries:[a.entry],closed:true,now:new Date("2026-11-09T00:00:00Z")}));
  assert.throws(()=>createSyntheticFeeStatement({institutionId,month:"2026-10",entries:[a.entry,a.entry],now:new Date("2026-11-09T00:00:00Z")}));
});

test("B4 disabled profile accepts repayment but defers institution assessment with durable source references",()=>{
  const f=fixture("100000",true,90), e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const r=postSandboxRepayment(e.obligation,{amountMinor:"101086",sourceCode:"synthetic_wallet",actorId:"actor_b4",now:new Date("2026-11-10T00:00:00Z")});
  assert.equal(r.obligation.status,"fully_repaid");
  assert.equal(r.obligation.syntheticFees.institutionAssessedMinor,"0");
  assert.equal(r.obligation.syntheticFees.pendingNormalInterestMinor,"986");
  assert.deepEqual(r.obligation.syntheticFees.pendingEntryIds,[r.feeEntry.feeEntryId]);
  assert.equal(r.feeTransaction,undefined);assert.equal(r.feeEntry.assessmentStatus,"pending_profile_disabled");
  const admitted=step(r.obligation.syntheticFees,"0","institution",{sourceId:"approved_pending_admission"});
  assert.equal(admitted.entry.feeDeltaMinor,"98");
  assert.deepEqual(admitted.entry.reconcilesPendingEntryIds,[r.feeEntry.feeEntryId]);
  assert.equal(admitted.state.pendingNormalInterestMinor,"0");
  assert.deepEqual(admitted.state.pendingEntryIds,[]);
});

function correction(obligation, originalEntry, amountMinor, remainingSourceBaseMinor=originalEntry.baseDeltaMinor, now=start) {
  const input={originalEntry,amountMinor,remainingSourceBaseMinor,now};
  return correctSyntheticFeeSource(obligation,{...input,...reviewSyntheticFeeSourceCorrection(obligation,input),approvalExecutionId:"approval_execution_b4_source",actorId:"operator_b4"});
}
test("F1 unpaid funding credit changes debt and fees without inventing repayment",()=>{
  const f=fixture(),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const c=correction(e.obligation,e.feeEntry,"3000");
  assert.equal(c.obligation.outstandingPrincipalMinor,"9000");assert.equal(c.obligation.outstandingFeesMinor,"9");
  assert.equal(c.obligation.totalRepaidMinor,"0");assert.equal(c.obligation.syntheticFees.principalUnpaidCreditMinor,"3000");
  assert.equal(c.obligation.syntheticFees.borrowerAssessedMinor,"9");assert.equal(c.receipt.effects.feeCreditMinor,"3");
  assert.equal(c.sourceTransaction.debitTotalMinor,"3000");assert.equal(c.sourceTransaction.creditTotalMinor,"3000");
  assert.equal(c.feeTransaction.debitTotalMinor,"3");assert.equal(c.feeTransaction.creditTotalMinor,"3");
  assert.equal(c.obligation.originalPrincipalMinor,"12000");assert.equal(c.receipt.refundStatus,"credit_due_only");
  assert.equal(e.obligation.outstandingPrincipalMinor,"12000");
});
test("F1 already paid funding/fees create credit liabilities and preserve original receipts",()=>{
  const f=fixture(),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const r=postSandboxRepayment(e.obligation,{amountMinor:"12012",sourceCode:"synthetic_wallet",actorId:"actor_b4",syntheticFeeAssessmentEnabled:true,now:start});
  const c=correction(r.obligation,e.feeEntry,"3000");
  assert.equal(c.obligation.totalRepaidMinor,"12012");assert.equal(c.obligation.outstandingPrincipalMinor,"0");
  assert.equal(c.obligation.syntheticFees.principalRefundCreditDueMinor,"3000");assert.equal(c.obligation.syntheticFees.borrowerRefundDueMinor,"3");
  assert.equal(c.obligation.syntheticFees.borrowerPaidMinor,"12");assert.equal(c.receipt.effects.paidFeeCreditMinor,"3");
  assert.equal(c.feeTransaction.metadata.refundPaidMinor,"3");assert.equal(c.receipt.effects.cashRefundRecorded,false);
  assert.equal(r.repayment.appliedPrincipalMinor,"12000");
});
test("F1 partial repayment separates unpaid source credits from paid refund credits",()=>{
  const f=fixture(),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const r=postSandboxRepayment(e.obligation,{amountMinor:"11012",sourceCode:"synthetic_wallet",actorId:"actor_b4",now:start});
  const c=correction(r.obligation,e.feeEntry,"3000");
  assert.equal(c.obligation.syntheticFees.principalUnpaidCreditMinor,"1000");
  assert.equal(c.obligation.syntheticFees.principalRefundCreditDueMinor,"2000");
  assert.equal(c.obligation.totalRepaidMinor,"11012");assert.equal(c.obligation.status,"fully_repaid");
  const actualPaid=BigInt(c.obligation.originalPrincipalMinor)-BigInt(c.obligation.outstandingPrincipalMinor)-BigInt(c.obligation.syntheticFees.principalUnpaidCreditMinor);
  assert.equal(actualPaid,11000n);
});
test("F1 received interest credit reverses only the corresponding institution share",()=>{
  const f=fixture("100000",true,90),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const now=new Date("2026-11-10T00:00:00Z");
  const r=postSandboxRepayment(e.obligation,{amountMinor:"101086",sourceCode:"synthetic_wallet",actorId:"actor_b4",syntheticFeeAssessmentEnabled:true,now});
  const c=correction(r.obligation,r.feeEntry,"86","986",now);
  assert.equal(c.obligation.syntheticFees.normalInterestBaseMinor,"900");assert.equal(c.obligation.syntheticFees.institutionAssessedMinor,"90");
  assert.equal(c.obligation.syntheticFees.interestRefundCreditDueMinor,"86");assert.equal(c.obligation.totalRepaidMinor,"101086");
  assert.equal(c.feeEntry.feeDeltaMinor,"-8");assert.equal(c.sourceTransaction.debitTotalMinor,"86");
  assert.equal(c.obligation.originalPrincipalMinor,"100000");
});
test("F1 pending interest source can be credited while charging is disabled",()=>{
  const f=fixture("100000",true,90),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const now=new Date("2026-11-10T00:00:00Z");
  const r=postSandboxRepayment(e.obligation,{amountMinor:"101086",sourceCode:"synthetic_wallet",actorId:"actor_b4",now});
  const c=correction(r.obligation,r.feeEntry,"86","986",now);
  assert.equal(c.obligation.syntheticFees.pendingNormalInterestMinor,"900");assert.equal(c.obligation.syntheticFees.institutionAssessedMinor,"0");
  assert.equal(c.feeTransaction,undefined);assert.equal(c.feeEntry.assessmentStatus,"pending_profile_disabled");
  assert.equal(c.obligation.syntheticFees.pendingEntryIds.length,2);
  const admitted=step(c.obligation.syntheticFees,"0","institution",{sourceId:"post_credit_admission",now});
  assert.equal(admitted.entry.feeDeltaMinor,"90");
});
test("F1 source limits, replayed state and interest-day changes fail closed",()=>{
  const f=fixture(),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  assert.throws(()=>correction(e.obligation,e.feeEntry,"101","100"),{code:"synthetic_fee_source_exceeded"});
  const args={originalEntry:e.feeEntry,amountMinor:"3000",remainingSourceBaseMinor:"12000",now:start};
  const review=reviewSyntheticFeeSourceCorrection(e.obligation,args);
  assert.throws(()=>correctSyntheticFeeSource(e.obligation,{...args,...review,now:new Date(start.getTime()+86400000),approvalExecutionId:"approval_day_stale",actorId:"operator_b4"}),{code:"synthetic_fee_correction_stale"});
  const c=correction(e.obligation,e.feeEntry,"3000");
  assert.throws(()=>correctSyntheticFeeSource(c.obligation,{...args,...review,approvalExecutionId:"approval_replay",actorId:"operator_b4"}),{code:"synthetic_fee_correction_stale"});
});

test('F1 write-off credit recovers loss before creating any refund credit',async()=>{
  const {writeOffSandboxObligation,advanceSandboxServicing}=await import('../src/index.js');
  const f=fixture(),e=executeSandboxObligation(f.obligation,{adapterReceipt:f.adapterReceipt,now:start});
  const now=new Date('2027-04-01T00:00:00Z');
  const advanced=advanceSandboxServicing(e.obligation,{actorId:'operator_b4',now});
  const w=writeOffSandboxObligation(advanced.obligation,{actorId:'operator_b4',approvalProposalId:'proposal_b4_writeoff',approvalExecutionId:'execution_b4_writeoff',reasonCode:'sandbox_uncollectible_writeoff',now});
  const c=correction(w.obligation,e.feeEntry,'3000','12000',now);
  assert.equal(c.receipt.effects.unpaidPrincipalCreditMinor,'0');
  assert.equal(c.receipt.effects.writtenOffPrincipalCreditMinor,'3000');
  assert.equal(c.receipt.effects.principalRefundCreditMinor,'0');
  assert.equal(c.obligation.writtenOffPrincipalMinor,w.obligation.writtenOffPrincipalMinor);
  assert.equal(c.obligation.totalRepaidMinor,'0');assert.equal(c.obligation.status,'written_off');
});
test('F1 protected source credit releases only its own exposure and preserves freeze',async()=>{
  const {releaseAgentCreditLineForSourceCredit,createAgentCreditExposureHash,hashId}=await import('../src/index.js');
  const exposure={schemaVersion:'agent_credit_exposure.v1',subjectId:'agent_b4',assetId:SYNTHETIC_FEE_ASSET,
    outstandingPrincipalMinor:'15000',committedLimitMinor:'20000',obligations:[{obligationId:'one',outstandingPrincipalMinor:'12000'},{obligationId:'two',outstandingPrincipalMinor:'3000'}]};
  exposure.exposureHash=createAgentCreditExposureHash(exposure);
  const core={schemaVersion:'credit_line.v2',creditLineId:'line_b4',subjectId:'agent_b4',assetId:SYNTHETIC_FEE_ASSET,
    utilizedMinor:'15000',limitMinor:'20000',status:'frozen',sandboxOnly:true,productionAuthority:false,exposureHash:exposure.exposureHash};
  const currentProjection={...core,projectionHash:hashId('credit_line_projection',core)};
  const next=releaseAgentCreditLineForSourceCredit({currentProjection,exposure,obligationId:'one',principalCreditMinor:'3000',now:start});
  assert.equal(next.utilizedMinor,'12000');assert.equal(next.limitMinor,'20000');assert.equal(next.status,'frozen');
  assert.throws(()=>releaseAgentCreditLineForSourceCredit({currentProjection,exposure,obligationId:'two',principalCreditMinor:'3001',now:start}));
});
