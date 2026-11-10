import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNTHETIC_FEE_PROFILE, SYNTHETIC_FEE_POLICY_HASH, HOSTED_SYNTHETIC_FEE_PROFILE,
  HOSTED_SYNTHETIC_FEE_POLICY_HASH, SYNTHETIC_FEE_ASSET,
  createSyntheticFeeTerms, assertSyntheticFeeTerms, createCreditIntent,
  createDeterministicCreditDecisionOutcome, createCreditOfferAcceptance, createAcceptedOfferObligation,
  executeSandboxObligation, reviewSyntheticFeeSourceCorrection, correctSyntheticFeeSource,
  postSandboxRepayment, restoreSyntheticFeeOfferTerms,
  SYNTHETIC_FEE_SOURCE_POLICY_HASH, HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH
} from "../src/index.js";
const institution = "urn:ipo-one:hosted:synthetic-capital-partner:tenant_hosted:primary";
const now = new Date("2026-11-10T00:00:00Z"), hash = `0x${"ab".repeat(32)}`;

test("B4-H has a separate policy and preserves exact frozen L0 terms", () => {
  assert.equal(SYNTHETIC_FEE_POLICY_HASH,"0x0672e224b332ce6809160e633ede365456b3dd852fbffde2fbf188ff019edb70");
  assert.equal(SYNTHETIC_FEE_SOURCE_POLICY_HASH,"0xc0d300f7395703cb64ba198d4d6d97d02e3aaaf33c4f10cd59559b8224b4939d");
  const input={profile:SYNTHETIC_FEE_PROFILE,assetId:SYNTHETIC_FEE_ASSET,economicLoanId:"intent_stability",principalMinor:"12000",annualRateBps:900,scheduledTermDays:30};
  assert.equal(createSyntheticFeeTerms(input).termsHash,"0xb371b814d094af149d502f6b7c29c67a6511da2ebeeb9e1e489c87e140bb9033");
  const hosted=createSyntheticFeeTerms({...input,profile:HOSTED_SYNTHETIC_FEE_PROFILE,institutionId:institution});
  assert.equal(hosted.scope,"L2_PUBLIC_AUTHENTICATED_NO_FUNDS");assert.equal(hosted.policyHash,HOSTED_SYNTHETIC_FEE_POLICY_HASH);
  assert.equal(hosted.borrowerFeeAtFullFundingMinor,"12");assert.equal(hosted.netProceedsMinor,"12000");
  assert.equal(hosted.productionPolicyAvailable,false);assert.equal(hosted.productionFundsMoved,false);
  assert.notEqual(hosted.termsHash,createSyntheticFeeTerms(input).termsHash);
  assert.throws(()=>createSyntheticFeeTerms({...input,profile:HOSTED_SYNTHETIC_FEE_PROFILE}));
  assert.throws(()=>createSyntheticFeeTerms({...input,institutionId:institution}));
  for(const update of [{scope:"L0_LOCAL_NO_FUNDS"},{policyHash:SYNTHETIC_FEE_POLICY_HASH},{borrowerRateBps:11},{institutionId:"actual_lender"}])assert.throws(()=>assertSyntheticFeeTerms({...hosted,...update}));
});

test("B4-H accepts, executes and credits one shared hosted obligation without creating repayment", () => {
  const intent=createCreditIntent({subjectId:"subject_hosted",principalId:"principal_hosted",authorityType:"consent",authorityRef:"consent_hosted",assetId:SYNTHETIC_FEE_ASSET,requestedPrincipalMinor:"12000",purposeCode:"working_capital",requestedTermDays:30,repaymentFrequency:"end_of_term",installmentCount:1,now});
  const {decision,offer}=createDeterministicCreditDecisionOutcome({intent,feeProfile:HOSTED_SYNTHETIC_FEE_PROFILE,feeInstitutionId:institution,now});
  assert.equal(offer.termsVersion,"credit_terms.synthetic_fee_hosted.v1");assert.equal(offer.feeTerms.institutionId,institution);
  assert.equal(restoreSyntheticFeeOfferTerms(offer).termsHash,offer.termsHash);
  assert.throws(()=>restoreSyntheticFeeOfferTerms({...offer,termsVersion:"credit_terms.synthetic_fee.v1"}));
  const decided={...intent,status:"decided"};
  const acceptance=createCreditOfferAcceptance({intent:decided,offer,decision,authorityType:"consent",authorityRef:"consent_hosted",acknowledgementHash:hash,acceptedByActorId:"actor_hosted",now});
  const obligation=createAcceptedOfferObligation({intent:decided,offer,decision,acceptance,now});
  const e=executeSandboxObligation(obligation,{adapterReceipt:{obligationId:obligation.obligationId,assetId:obligation.assetId,amountMinor:"12000",adapterId:"sandbox_rail_local",adapterVersion:"1.0.0",adapterKeyId:"sandbox-key-2026-07",messageHash:hash,signature:"ed25519:test-signature",issuedAt:now.toISOString(),sandboxOnly:true,productionFundsMoved:false,withdrawable:false},now});
  const input={originalEntry:e.feeEntry,amountMinor:"3000",remainingSourceBaseMinor:"12000",now};
  const review=reviewSyntheticFeeSourceCorrection(e.obligation,input);
  assert.equal(review.sourcePolicyHash,HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH);
  assert.throws(()=>correctSyntheticFeeSource(e.obligation,{...input,...review,sourcePolicyHash:SYNTHETIC_FEE_SOURCE_POLICY_HASH,approvalExecutionId:"approval_wrong_policy",actorId:"operator_hosted"}));
  const c=correctSyntheticFeeSource(e.obligation,{...input,...review,approvalExecutionId:"approval_hosted",actorId:"operator_hosted"});
  assert.equal(c.receipt.sourcePolicyHash,HOSTED_SYNTHETIC_FEE_SOURCE_POLICY_HASH);assert.equal(c.receipt.scope,"L2_PUBLIC_AUTHENTICATED_NO_FUNDS");
  assert.equal(c.obligation.totalRepaidMinor,"0");assert.equal(c.obligation.outstandingPrincipalMinor,"9000");assert.equal(c.obligation.outstandingFeesMinor,"9");
  const r=postSandboxRepayment(c.obligation,{amountMinor:"9009",sourceCode:"synthetic_wallet",actorId:"actor_hosted",syntheticFeeAssessmentEnabled:true,now});
  assert.equal(r.obligation.status,"fully_repaid");assert.equal(r.obligation.totalRepaidMinor,"9009");
  assert.equal(r.obligation.originalPrincipalMinor,"12000");assert.equal(r.obligation.syntheticFees.terms.termsHash,offer.feeTerms.termsHash);
});
