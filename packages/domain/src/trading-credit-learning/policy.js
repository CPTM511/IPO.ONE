import {
  DEMO_HASH_ALGORITHM,
  DEMO_HASH_DOMAIN,
  hashId
} from "../ids.js";
import {
  TRADING_CREDIT_SHADOW_POLICY_SCHEMA_VERSION
} from "./contracts.js";
import {
  assetId,
  exactObject,
  fail,
  hash,
  immutable,
  minor,
  nonNegativeInteger,
  positiveInteger,
  timestamp
} from "./shared.js";

export function assertPolicy(policy) {
  exactObject("policy", policy, [
    "policyVersion",
    "assetId",
    "assetDecimals",
    "productCapMinor",
    "validFrom",
    "thresholds",
    "factorWeightsBps",
    "capacity",
    "challengerPrior",
    "shadowOnly",
    "authorizing",
    "productionApproved",
    "autoPromotionAllowed",
    "autoLooseningAllowed",
    "fundsAuthority",
    "economicStateMutation",
    "hashAlgorithm",
    "hashDomain",
    "policyHash",
    "schemaVersion"
  ]);
  if (
    policy.schemaVersion !==
      TRADING_CREDIT_SHADOW_POLICY_SCHEMA_VERSION ||
    policy.policyVersion !== "trading_credit_mvp_shadow.v1" ||
    policy.shadowOnly !== true ||
    policy.authorizing !== false ||
    policy.productionApproved !== false ||
    policy.autoPromotionAllowed !== false ||
    policy.autoLooseningAllowed !== false ||
    policy.fundsAuthority !== false ||
    policy.economicStateMutation !== false ||
    policy.hashAlgorithm !== DEMO_HASH_ALGORITHM ||
    policy.hashDomain !== DEMO_HASH_DOMAIN
  ) {
    fail("Shadow Policy safety boundary is invalid");
  }
  assetId(policy.assetId);
  nonNegativeInteger("policy.assetDecimals", policy.assetDecimals, 18);
  minor("policy.productCapMinor", policy.productCapMinor, {
    positive: true
  });
  timestamp("policy.validFrom", policy.validFrom);
  exactObject("policy.thresholds", policy.thresholds, [
    "minimumObservationCount",
    "minimumObservationDays",
    "maximumEvidenceAgeSeconds",
    "maximumDrawdownBps",
    "maximumP95LeverageBps",
    "maximumLiquidationCount",
    "maximumMandateBreachCount",
    "maximumSevereAnomalyCount",
    "minimumCompletedOutcomesForChallenger",
    "challengerDefaultReviewBps"
  ]);
  exactObject("policy.factorWeightsBps", policy.factorWeightsBps, [
    "evidenceConfidence",
    "alphaQuality",
    "riskReliability",
    "strategyCapacity",
    "mandateCompliance",
    "repaymentHistory"
  ]);
  exactObject("policy.capacity", policy.capacity, [
    "equityP10MultiplierBps",
    "positiveNetPnlMultiplierBps"
  ]);
  exactObject("policy.challengerPrior", policy.challengerPrior, [
    "defaultCount",
    "nonDefaultCount"
  ]);
  for (const key of [
    "minimumObservationCount",
    "minimumObservationDays",
    "maximumEvidenceAgeSeconds",
    "maximumDrawdownBps",
    "maximumP95LeverageBps",
    "minimumCompletedOutcomesForChallenger"
  ]) {
    positiveInteger(`policy.thresholds.${key}`, policy.thresholds[key]);
  }
  for (const key of [
    "maximumLiquidationCount",
    "maximumMandateBreachCount",
    "maximumSevereAnomalyCount",
    "challengerDefaultReviewBps"
  ]) {
    nonNegativeInteger(`policy.thresholds.${key}`, policy.thresholds[key]);
  }
  const weightTotal = Object.values(policy.factorWeightsBps).reduce(
    (sum, value) =>
      sum + nonNegativeInteger("policy factor weight", value, 10_000),
    0
  );
  if (weightTotal !== 10_000) {
    fail("Shadow Policy factor weights must total 10000 bps");
  }
  positiveInteger(
    "policy.capacity.equityP10MultiplierBps",
    policy.capacity.equityP10MultiplierBps,
    10_000
  );
  positiveInteger(
    "policy.capacity.positiveNetPnlMultiplierBps",
    policy.capacity.positiveNetPnlMultiplierBps,
    10_000
  );
  nonNegativeInteger(
    "policy.challengerPrior.defaultCount",
    policy.challengerPrior.defaultCount
  );
  nonNegativeInteger(
    "policy.challengerPrior.nonDefaultCount",
    policy.challengerPrior.nonDefaultCount
  );
  if (
    policy.challengerPrior.defaultCount +
      policy.challengerPrior.nonDefaultCount ===
    0
  ) {
    fail("Shadow Policy challenger prior cannot be empty");
  }
  hash("policy.policyHash", policy.policyHash);
  const { policyHash, schemaVersion, ...core } = policy;
  if (policyHash !== hashId("trading_credit_shadow_policy", core)) {
    fail("Shadow Policy hash does not match its content");
  }
  return policy;
}

export function createTradingCreditMvpShadowPolicy({
  assetId: inputAssetId,
  assetDecimals,
  productCapMinor,
  validFrom
}) {
  const normalizedAssetId = assetId(inputAssetId);
  nonNegativeInteger("assetDecimals", assetDecimals, 18);
  minor("productCapMinor", productCapMinor, { positive: true });
  const normalizedValidFrom = timestamp("validFrom", validFrom);
  const thresholds = {
    minimumObservationCount: 30,
    minimumObservationDays: 29,
    maximumEvidenceAgeSeconds: 86_400,
    maximumDrawdownBps: 2_000,
    maximumP95LeverageBps: 30_000,
    maximumLiquidationCount: 0,
    maximumMandateBreachCount: 0,
    maximumSevereAnomalyCount: 0,
    minimumCompletedOutcomesForChallenger: 20,
    challengerDefaultReviewBps: 1_500
  };
  const factorWeightsBps = {
    evidenceConfidence: 2_000,
    alphaQuality: 2_000,
    riskReliability: 2_500,
    strategyCapacity: 1_500,
    mandateCompliance: 1_000,
    repaymentHistory: 1_000
  };
  const capacity = {
    equityP10MultiplierBps: 1_000,
    positiveNetPnlMultiplierBps: 2_500
  };
  const challengerPrior = {
    defaultCount: 1,
    nonDefaultCount: 9
  };
  const core = {
    policyVersion: "trading_credit_mvp_shadow.v1",
    assetId: normalizedAssetId,
    assetDecimals,
    productCapMinor,
    validFrom: normalizedValidFrom,
    thresholds,
    factorWeightsBps,
    capacity,
    challengerPrior,
    shadowOnly: true,
    authorizing: false,
    productionApproved: false,
    autoPromotionAllowed: false,
    autoLooseningAllowed: false,
    fundsAuthority: false,
    economicStateMutation: false,
    hashAlgorithm: DEMO_HASH_ALGORITHM,
    hashDomain: DEMO_HASH_DOMAIN
  };
  return immutable({
    ...core,
    policyHash: hashId("trading_credit_shadow_policy", core),
    schemaVersion: TRADING_CREDIT_SHADOW_POLICY_SCHEMA_VERSION
  });
}
