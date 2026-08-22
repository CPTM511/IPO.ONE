import { DomainError } from "./errors.js";

export const M2_POOL_REFERENCE_SCHEMA_VERSION = "secured_pool_reference_model.v1";
export const M2_POOL_REFERENCE_POLICY_VERSION = "m2_secured_pool_fixture_policy.v1";

export const M2_POOL_REFERENCE_POLICY = Object.freeze({
  bps: 10_000n,
  wad: 10n ** 18n,
  debtAssetScale: 10n ** 6n,
  collateralAssetScale: 10n ** 18n,
  priceScale: 10n ** 18n,
  secondsPerYear: 365n * 24n * 60n * 60n,
  maxAccrualChunkSeconds: 7n * 24n * 60n * 60n,
  maxAccrualChunksPerTransition: 1_024n,
  kinkBps: 8_000n,
  baseBorrowAprBps: 200n,
  slope1Bps: 800n,
  slope2Bps: 6_000n,
  reserveFactorBps: 1_000n,
  loanToValueBps: 7_500n,
  liquidationThresholdBps: 8_000n,
  closeFactorBps: 5_000n,
  liquidationBonusBps: 500n,
  maxOracleAgeSeconds: 3_600n,
  maxOracleFutureSkewSeconds: 60n,
  maxOracleDeviationBps: 2_000n,
  chainId: "eip155:84532",
  collateralAssetId: "weth",
  oracleSourceId: "deterministic_m2_fixture.v1"
});

const MAX_MODEL_UINT = (1n << 256n) - 1n;

export function invalidPoolReference(message, details = {}) {
  throw new DomainError("invalid_secured_pool_reference_model", message, details);
}

export function unavailablePoolAction(message, details = {}) {
  throw new DomainError("secured_pool_action_unavailable", message, details);
}

export function assertReferenceUint(name, value, { positive = false } = {}) {
  if (
    typeof value !== "bigint" ||
    value < 0n ||
    value > MAX_MODEL_UINT ||
    (positive && value === 0n)
  ) {
    invalidPoolReference(`${name} must be a bounded ${positive ? "positive" : "unsigned"} BigInt`, {
      name
    });
  }
  return value;
}

export function assertReferencePlainObject(name, value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalidPoolReference(`${name} must be a closed plain object`, { name });
  }
  return value;
}

export function mulDivDown(left, right, denominator) {
  assertReferenceUint("left", left);
  assertReferenceUint("right", right);
  assertReferenceUint("denominator", denominator, { positive: true });
  return (left * right) / denominator;
}

export function mulDivUp(left, right, denominator) {
  const floor = mulDivDown(left, right, denominator);
  return left === 0n || right === 0n || (left * right) % denominator === 0n
    ? floor
    : floor + 1n;
}

export function minReference(...values) {
  if (values.length === 0) invalidPoolReference("minReference requires values");
  values.forEach((value, index) => assertReferenceUint(`values[${index}]`, value));
  return values.reduce((current, value) => value < current ? value : current);
}

export function calculateUtilizationBps(cashAssets, performingDebtAssets) {
  assertReferenceUint("cashAssets", cashAssets);
  assertReferenceUint("performingDebtAssets", performingDebtAssets);
  const grossAssets = cashAssets + performingDebtAssets;
  return grossAssets === 0n
    ? 0n
    : mulDivDown(performingDebtAssets, M2_POOL_REFERENCE_POLICY.bps, grossAssets);
}

export function calculateBorrowAprBps(cashAssets, performingDebtAssets) {
  const utilizationBps = calculateUtilizationBps(cashAssets, performingDebtAssets);
  const policy = M2_POOL_REFERENCE_POLICY;
  if (utilizationBps <= policy.kinkBps) {
    return policy.baseBorrowAprBps +
      mulDivDown(policy.slope1Bps, utilizationBps, policy.kinkBps);
  }
  return policy.baseBorrowAprBps + policy.slope1Bps + mulDivDown(
    policy.slope2Bps,
    utilizationBps - policy.kinkBps,
    policy.bps - policy.kinkBps
  );
}

export function calculateSupplyAprBps(cashAssets, performingDebtAssets) {
  const policy = M2_POOL_REFERENCE_POLICY;
  const borrowAprBps = calculateBorrowAprBps(cashAssets, performingDebtAssets);
  const utilizationBps = calculateUtilizationBps(cashAssets, performingDebtAssets);
  const grossSupplyAprBps = mulDivDown(borrowAprBps, utilizationBps, policy.bps);
  return mulDivDown(
    grossSupplyAprBps,
    policy.bps - policy.reserveFactorBps,
    policy.bps
  );
}

export function calculateInterestAtRate(debtAssets, borrowAprBps, elapsedSeconds) {
  assertReferenceUint("debtAssets", debtAssets);
  assertReferenceUint("borrowAprBps", borrowAprBps);
  assertReferenceUint("elapsedSeconds", elapsedSeconds);
  const policy = M2_POOL_REFERENCE_POLICY;
  const interestAssets = mulDivUp(
    debtAssets,
    borrowAprBps * elapsedSeconds,
    policy.secondsPerYear * policy.bps
  );
  return {
    interestAssets,
    reserveAssets: mulDivDown(interestAssets, policy.reserveFactorBps, policy.bps)
  };
}

export function calculateCollateralValueAssets(collateralAssets, priceUsdWad) {
  assertReferenceUint("collateralAssets", collateralAssets);
  assertReferenceUint("priceUsdWad", priceUsdWad, { positive: true });
  const policy = M2_POOL_REFERENCE_POLICY;
  return mulDivDown(
    collateralAssets,
    priceUsdWad * policy.debtAssetScale,
    policy.collateralAssetScale * policy.priceScale
  );
}

export function calculateCollateralRequiredForValue(valueAssets, priceUsdWad) {
  assertReferenceUint("valueAssets", valueAssets);
  assertReferenceUint("priceUsdWad", priceUsdWad, { positive: true });
  const policy = M2_POOL_REFERENCE_POLICY;
  return mulDivUp(
    valueAssets,
    policy.collateralAssetScale * policy.priceScale,
    priceUsdWad * policy.debtAssetScale
  );
}
