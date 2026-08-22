import {
  M2_POOL_REFERENCE_POLICY,
  M2_POOL_REFERENCE_POLICY_VERSION,
  M2_POOL_REFERENCE_SCHEMA_VERSION,
  assertReferencePlainObject,
  assertReferenceUint,
  invalidPoolReference,
  mulDivDown,
  mulDivUp,
  unavailablePoolAction
} from "./secured-pool-reference-math.js";

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BLOCKED_ACCOUNT_IDS = new Set(["__proto__", "constructor", "prototype"]);

export function assertReferenceAccountId(value) {
  if (
    typeof value !== "string" ||
    !ACCOUNT_ID_PATTERN.test(value) ||
    BLOCKED_ACCOUNT_IDS.has(value)
  ) invalidPoolReference("accountId must be a bounded opaque identifier");
  return value;
}

export function emptyPoolReferencePosition(accountId) {
  return {
    accountId,
    supplyShares: 0n,
    collateralAssets: 0n,
    debtShares: 0n,
    badDebtAssets: 0n
  };
}

export function findPoolReferencePosition(state, accountId) {
  return state.positions.find((position) => position.accountId === accountId) ??
    emptyPoolReferencePosition(accountId);
}

export function poolReferencePerformingDebtAssets(state) {
  return state.grossDebtAssets - state.badDebtAssets;
}

export function poolReferenceLpClaimAssets(state) {
  const signedClaim = state.cashAssets + state.grossDebtAssets -
    state.reservesAssets - state.badDebtAssets;
  return signedClaim > 0n ? signedClaim : 0n;
}

export function positionPerformingDebtAssets(state, position) {
  if (position.debtShares === 0n) return 0n;
  const performingDebt = poolReferencePerformingDebtAssets(state);
  if (position.debtShares === state.totalDebtShares) return performingDebt;
  return mulDivUp(position.debtShares, performingDebt, state.totalDebtShares);
}

export function assertPoolReferenceOracleBinding(observation) {
  assertReferencePlainObject("oracleObservation", observation);
  const policy = M2_POOL_REFERENCE_POLICY;
  if (
    observation.chainId !== policy.chainId ||
    observation.assetId !== policy.collateralAssetId ||
    observation.sourceId !== policy.oracleSourceId ||
    observation.complete !== true ||
    typeof observation.roundId !== "string" ||
    !ACCOUNT_ID_PATTERN.test(observation.roundId)
  ) unavailablePoolAction("oracle observation binding is invalid");
  assertReferenceUint("oracleObservation.priceUsdWad", observation.priceUsdWad, { positive: true });
  assertReferenceUint("oracleObservation.observedAt", observation.observedAt);
}

export function assertPoolReferenceInvariants(state) {
  assertReferencePlainObject("state", state);
  if (
    state.schemaVersion !== M2_POOL_REFERENCE_SCHEMA_VERSION ||
    state.policyVersion !== M2_POOL_REFERENCE_POLICY_VERSION ||
    !Array.isArray(state.positions)
  ) invalidPoolReference("state schema or policy version is invalid");
  for (const field of [
    "cashAssets", "grossDebtAssets", "reservesAssets", "badDebtAssets",
    "totalSupplyShares", "totalDebtShares", "lastAccruedAt",
    "marketDebtCapAssets", "borrowerDebtCapAssets"
  ]) assertReferenceUint(`state.${field}`, state[field]);
  if (state.grossDebtAssets < state.badDebtAssets) {
    invalidPoolReference("recognized bad debt exceeds gross outstanding debt");
  }

  const seen = new Set();
  let supplyShares = 0n;
  let debtShares = 0n;
  let badDebt = 0n;
  let aggregateSupplyClaims = 0n;
  const claimAssets = poolReferenceLpClaimAssets(state);
  for (const position of state.positions) {
    assertReferencePlainObject("position", position);
    assertReferenceAccountId(position.accountId);
    if (seen.has(position.accountId)) invalidPoolReference("duplicate account position");
    seen.add(position.accountId);
    for (const field of ["supplyShares", "collateralAssets", "debtShares", "badDebtAssets"]) {
      assertReferenceUint(`position.${field}`, position[field]);
    }
    supplyShares += position.supplyShares;
    debtShares += position.debtShares;
    badDebt += position.badDebtAssets;
    if (state.totalSupplyShares > 0n) {
      aggregateSupplyClaims += mulDivDown(position.supplyShares, claimAssets, state.totalSupplyShares);
    }
  }
  if (
    supplyShares !== state.totalSupplyShares ||
    debtShares !== state.totalDebtShares ||
    badDebt !== state.badDebtAssets ||
    aggregateSupplyClaims > claimAssets
  ) invalidPoolReference("aggregate position accounting does not reconcile");
  const performingDebt = poolReferencePerformingDebtAssets(state);
  if ((performingDebt === 0n) !== (state.totalDebtShares === 0n)) {
    invalidPoolReference("performing debt and debt shares must become empty together");
  }
  if (performingDebt < state.totalDebtShares) {
    invalidPoolReference("performing debt assets cannot fall below debt shares");
  }
  if (state.lastAcceptedOracle !== null) assertPoolReferenceOracleBinding(state.lastAcceptedOracle);
  return {
    lpClaimAssets: claimAssets,
    performingDebtAssets: performingDebt,
    aggregateSupplyClaims,
    positions: BigInt(state.positions.length)
  };
}
