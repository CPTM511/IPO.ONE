import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNTHETIC_COLLATERAL_PROFILE as PROFILE, createSyntheticCollateralTerms,
  createCreditIntent, createDeterministicCreditDecisionOutcome,
  createCreditOfferAcceptance, createAcceptedOfferObligation,
  transitionSyntheticCollateral, assertSyntheticCollateralAllowsExecution,
  assertSyntheticCollateralProvenance, restoreSyntheticCollateralOfferTerms
} from "../src/index.js";

const now = new Date("2026-11-08T00:00:00Z");
function fixture(profile = PROFILE) {
  const intent = { ...createCreditIntent({
    subjectId: "subject_b3", principalId: "principal_b3", authorityType: "consent",
    authorityRef: "consent_b3", assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12000", collateralProfile: profile ?? undefined, purposeCode: "working_capital",
    requestedTermDays: 30, repaymentFrequency: "end_of_term", installmentCount: 1, now
  }), status: "decided" };
  const { decision, offer } = createDeterministicCreditDecisionOutcome({ intent: { ...intent, status: "submitted" }, now });
  const acceptance = createCreditOfferAcceptance({
    offer, intent, decision, authorityType: "consent", authorityRef: intent.authorityRef,
    acknowledgementHash: `0x${"ab".repeat(32)}`, acceptedByActorId: "actor_b3", now
  });
  return { intent, offer, obligation: createAcceptedOfferObligation({ intent, offer, decision, acceptance, now }) };
}
function input(obligation, action = "confirm") {
  const c = obligation.syntheticCollateral;
  return { action, expectedVersion: c.version, termsHash: c.terms.termsHash,
    chainId: c.terms.chainId, amountAssets: c.terms.requiredAssets, now };
}

test("B3 exact scenario binds M2 constraints into accepted terms without chain claims", () => {
  const { intent, offer, obligation } = fixture();
  assert.equal(offer.termsVersion, "credit_terms.synthetic_secured.v1");
  assert.equal(obligation.syntheticCollateral.terms.requiredAssets, "80000000000000000");
  assert.equal(offer.collateralTerms.loanToValueBps, "7500");
  assert.equal(offer.collateralTerms.marketPrice, false);
  assert.notEqual(fixture(null).offer.termsHash, offer.termsHash);
  assertSyntheticCollateralProvenance({ intent, offer, obligation });
  const rekeyed = JSON.parse(JSON.stringify(obligation));
  rekeyed.syntheticCollateral.terms = Object.fromEntries(Object.entries(rekeyed.syntheticCollateral.terms).reverse());
  assertSyntheticCollateralProvenance({ intent, offer, obligation: rekeyed });
});

test("B3 unconfirmed, removed or changed collateral cannot bypass accepted provenance/execution", () => {
  const f = fixture();
  assert.throws(() => assertSyntheticCollateralAllowsExecution(f.obligation), { code: "synthetic_collateral_not_confirmed" });
  const removed = { ...f.obligation }; delete removed.syntheticCollateral;
  assert.throws(() => assertSyntheticCollateralProvenance({ ...f, obligation: removed }), { code: "synthetic_collateral_terms_mismatch" });
  assert.throws(() => assertSyntheticCollateralProvenance({ ...f, offer: { ...f.offer, collateralTerms: undefined } }), { code: "synthetic_collateral_terms_mismatch" });
});

test("B3 confirmation is exact, bounded and versioned; duplicate transition is rejected", () => {
  const f = fixture(), before = structuredClone(f.obligation);
  const result = transitionSyntheticCollateral(f.obligation, input(f.obligation));
  assert.deepEqual(f.obligation, before);
  assertSyntheticCollateralAllowsExecution(result.obligation);
  assert.equal(result.receipt.transactionHash, null);
  assert.equal(result.receipt.finality, "not_applicable");
  assert.equal(result.receipt.withdrawable, false);
  assert.throws(() => transitionSyntheticCollateral(result.obligation, input(f.obligation)), { code: "synthetic_collateral_state_conflict" });
  for (const changed of [{ chainId: "eip155:56" }, { amountAssets: "1" }, { amountAssets: "9999999999999999999" }, { termsHash: `0x${"ff".repeat(32)}` }]) {
    assert.throws(() => transitionSyntheticCollateral(f.obligation, { ...input(f.obligation), ...changed }), { code: "synthetic_collateral_terms_mismatch" });
  }
});

test("B3 release requires executed, fully repaid shared Obligation and cannot repeat", () => {
  const f = fixture();
  const { obligation: confirmed } = transitionSyntheticCollateral(f.obligation, input(f.obligation));
  assert.throws(() => transitionSyntheticCollateral(confirmed, input(confirmed, "release")), { code: "synthetic_collateral_release_blocked" });
  const repaid = { ...confirmed, status: "fully_repaid", executionStatus: "executed", outstandingPrincipalMinor: "0", outstandingInterestMinor: "0", outstandingFeesMinor: "0" };
  for (const key of ["outstandingPrincipalMinor", "outstandingInterestMinor", "outstandingFeesMinor"]) {
    assert.throws(() => transitionSyntheticCollateral({ ...repaid, [key]: "1" }, input(repaid, "release")), { code: "synthetic_collateral_release_blocked" });
  }
  const released = transitionSyntheticCollateral(repaid, input(repaid, "release"));
  assert.equal(released.obligation.syntheticCollateral.state, "released");
  assert.equal(released.obligation.syntheticCollateral.amountAssets, "0");
  assert.equal(released.obligation.syntheticCollateral.confirmationReceiptId, confirmed.syntheticCollateral.confirmationReceiptId);
  assert.throws(() => transitionSyntheticCollateral(released.obligation, input(repaid, "release")), { code: "synthetic_collateral_state_conflict" });
});

test("B3 unknown profile, unsupported debt asset and excess scenario exposure fail closed", () => {
  for (const change of [{ profile: "other" }, { assetId: "weth" }, { principalMinor: "25001" }]) {
    assert.throws(() => createSyntheticCollateralTerms({ profile: PROFILE, assetId: "urn:ipo-one:sandbox-asset:usd-cent", principalMinor: "12000", ...change }), { code: "synthetic_collateral_profile_invalid" });
  }
});

test("B3 stored Offer restoration verifies the accepted digest before exposing collateral terms",()=>{
  const {offer}=fixture();const stored={...offer};delete stored.collateralTerms;
  assert.deepEqual(restoreSyntheticCollateralOfferTerms(stored).collateralTerms,offer.collateralTerms);
  assert.throws(()=>restoreSyntheticCollateralOfferTerms({...stored,approvedPrincipalMinor:'12100'}),{code:'projection_integrity_mismatch'});
  const legacy=fixture(null).offer;assert.equal(restoreSyntheticCollateralOfferTerms(legacy),legacy);
});
