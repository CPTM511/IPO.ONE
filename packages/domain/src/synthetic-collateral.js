import { ObligationStatus, ObligationExecutionStatus } from "./enums.js";
import { DomainError } from "./errors.js";
import { hashId } from "./ids.js";
import {
  M2_POOL_REFERENCE_POLICY as M2,
  M2_POOL_REFERENCE_POLICY_VERSION,
  calculateCollateralRequiredForValue,
  mulDivUp
} from "./secured-pool-reference-math.js";

export const SYNTHETIC_COLLATERAL_PROFILE = "m2_synthetic_weth_usd_cent.v1";
const USD_CENT = "urn:ipo-one:sandbox-asset:usd-cent";
const PRICE = 2_000n * M2.priceScale;

function fail(code, message) { throw new DomainError(code, message); }

export function createSyntheticCollateralTerms({ profile, assetId, principalMinor }) {
  if (profile === undefined) return undefined;
  if (
    profile !== SYNTHETIC_COLLATERAL_PROFILE || assetId !== USD_CENT ||
    typeof principalMinor !== "string" || !/^[1-9][0-9]{0,4}$/.test(principalMinor) ||
    BigInt(principalMinor) > 25_000n
  ) fail("synthetic_collateral_profile_invalid", "Synthetic collateral requires the exact bounded M2 scenario");
  // USD cents -> the existing M2 reference model's six-decimal USD units.
  const debtAssets = BigInt(principalMinor) * (M2.debtAssetScale / 100n);
  const valueAssets = mulDivUp(debtAssets, M2.bps, M2.loanToValueBps);
  const requiredAssets = calculateCollateralRequiredForValue(valueAssets, PRICE).toString();
  const core = {
    profile, chainId: M2.chainId, collateralAssetId: M2.collateralAssetId,
    collateralDecimals: 18, debtAssetId: assetId, principalMinor,
    requiredAssets, loanToValueBps: M2.loanToValueBps.toString(),
    liquidationThresholdBps: M2.liquidationThresholdBps.toString(),
    scenarioPriceUsdWad: PRICE.toString(), policyVersion: M2_POOL_REFERENCE_POLICY_VERSION,
    source: "deterministic_synthetic_scenario", marketPrice: false,
    withdrawable: false, productionFundsMoved: false, transactionHash: null,
    schemaVersion: "synthetic_collateral_terms.v1"
  };
  return Object.freeze({ ...core, termsHash: hashId("synthetic_collateral_terms", core) });
}

export function initialSyntheticCollateral(terms) {
  return Object.freeze({
    terms, state: "awaiting_confirmation", version: 0, amountAssets: "0",
    finality: "not_applicable", transactionHash: null,
    syntheticOnly: true, productionFundsMoved: false
  });
}

// Typed Offer indexes retain the immutable terms tuple. Recover this versioned
// scenario for reads and compare its digest before returning any inferred field.
export function restoreSyntheticCollateralOfferTerms(offer) {
  if (offer.termsVersion !== "credit_terms.synthetic_secured.v1") return offer;
  const collateralTerms = createSyntheticCollateralTerms({
    profile: SYNTHETIC_COLLATERAL_PROFILE, assetId: offer.assetId,
    principalMinor: offer.approvedPrincipalMinor
  });
  const keys = ["assetId", "approvedPrincipalMinor", "annualRateBps", "originationFeeMinor",
    "repaymentFrequency", "installmentCount", "firstPaymentAt", "maturityAt", "disclosureRef", "termsVersion"];
  const core = { ...Object.fromEntries(keys.map(key => [key, offer[key]])), collateralTerms };
  if (hashId("credit_terms", core) !== offer.termsHash) {
    fail("projection_integrity_mismatch", "Stored synthetic collateral Offer terms cannot be reproduced");
  }
  return { ...offer, collateralTerms };
}

export function assertSyntheticCollateralProvenance({ intent, offer, obligation }) {
  const expected = createSyntheticCollateralTerms({
    profile: intent.collateralProfile, assetId: offer.assetId,
    principalMinor: offer.approvedPrincipalMinor
  });
  if (
    (expected && offer.termsVersion !== "credit_terms.synthetic_secured.v1") ||
    (!expected && offer.termsVersion === "credit_terms.synthetic_secured.v1") ||
    hashId("collateral_verify", expected) !== hashId("collateral_verify", offer.collateralTerms) ||
    (obligation && hashId("collateral_verify", expected) !==
      hashId("collateral_verify", obligation.syntheticCollateral?.terms))
  ) fail("synthetic_collateral_terms_mismatch", "Collateral must match the exact accepted Offer and Intent");
}

export function assertSyntheticCollateralAllowsExecution(obligation) {
  const collateral = obligation.syntheticCollateral;
  if (!collateral) return;
  if (
    collateral.terms?.profile !== SYNTHETIC_COLLATERAL_PROFILE ||
    collateral.state !== "confirmed" || collateral.version !== 1 ||
    collateral.amountAssets !== collateral.terms.requiredAssets ||
    !collateral.confirmationReceiptId || collateral.syntheticOnly !== true ||
    collateral.productionFundsMoved !== false || collateral.transactionHash !== null
  ) fail("synthetic_collateral_not_confirmed", "Confirm the exact synthetic collateral before execution");
}

export function transitionSyntheticCollateral(obligation, {
  action, expectedVersion, termsHash, chainId, amountAssets, now = new Date()
}) {
  const current = obligation.syntheticCollateral;
  if (
    obligation.schemaVersion !== "obligation.v2" || !obligation.sandboxOnly ||
    obligation.productionFundsMoved !== false || obligation.poolObligationBindingId ||
    current?.terms?.profile !== SYNTHETIC_COLLATERAL_PROFILE ||
    current.syntheticOnly !== true || current.productionFundsMoved !== false ||
    current.transactionHash !== null || !["confirm", "release"].includes(action)
  ) fail("synthetic_collateral_unavailable", "This Obligation has no available synthetic collateral profile");
  if (current.version !== expectedVersion) {
    fail("synthetic_collateral_state_conflict", "Reload the current collateral state before confirming");
  }
  if (
    termsHash !== current.terms.termsHash || chainId !== current.terms.chainId ||
    amountAssets !== current.terms.requiredAssets
  ) fail("synthetic_collateral_terms_mismatch", "Amount, scenario network and accepted terms must match exactly");
  if (action === "confirm") {
    if (current.state !== "awaiting_confirmation" || current.version !== 0 ||
      obligation.status !== ObligationStatus.CREATED || obligation.executionStatus !== ObligationExecutionStatus.PENDING) {
      fail("synthetic_collateral_state_conflict", "Synthetic collateral is not awaiting confirmation");
    }
  } else {
    assertSyntheticCollateralAllowsExecution(obligation);
    if (obligation.status !== ObligationStatus.FULLY_REPAID || obligation.executionStatus !== ObligationExecutionStatus.EXECUTED ||
      ["outstandingPrincipalMinor", "outstandingInterestMinor", "outstandingFeesMinor"]
        .some(key => obligation[key] !== "0")) {
      fail("synthetic_collateral_release_blocked", "Repay the full shared Obligation before releasing synthetic collateral");
    }
  }
  const receiptCore = {
    obligationId: obligation.obligationId, subjectId: obligation.subjectId,
    action, termsHash, chainId, collateralAssetId: current.terms.collateralAssetId,
    amountAssets, previousVersion: current.version, version: current.version + 1,
    state: action === "confirm" ? "confirmed" : "released",
    source: "deterministic_synthetic_scenario", finality: "not_applicable",
    syntheticOnly: true, productionFundsMoved: false, transactionHash: null,
    withdrawable: false, recordedAt: now.toISOString(),
    schemaVersion: "synthetic_collateral_receipt.v1"
  };
  const receiptId = hashId("synthetic_collateral_receipt", receiptCore);
  const receipt = Object.freeze({ ...receiptCore, receiptId });
  const next = Object.freeze({
    ...current, state: receipt.state, version: receipt.version,
    amountAssets: action === "confirm" ? amountAssets : "0",
    ...(action === "confirm" ? { confirmationReceiptId: receiptId } : { releaseReceiptId: receiptId }),
    lastReceipt: receipt
  });
  return Object.freeze({
    obligation: Object.freeze({ ...obligation, syntheticCollateral: next, updatedAt: now.toISOString() }),
    receipt
  });
}
