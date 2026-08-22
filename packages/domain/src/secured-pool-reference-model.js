import {
  M2_POOL_REFERENCE_POLICY,
  M2_POOL_REFERENCE_POLICY_VERSION,
  M2_POOL_REFERENCE_SCHEMA_VERSION,
  assertReferenceUint,
  calculateBorrowAprBps,
  calculateCollateralRequiredForValue,
  calculateCollateralValueAssets,
  calculateInterestAtRate,
  calculateSupplyAprBps,
  calculateUtilizationBps,
  minReference,
  mulDivDown,
  mulDivUp,
  unavailablePoolAction
} from "./secured-pool-reference-math.js";
import {
  assertPoolReferenceInvariants,
  assertPoolReferenceOracleBinding as assertOracleBinding,
  assertReferenceAccountId as accountId,
  emptyPoolReferencePosition as emptyPosition,
  findPoolReferencePosition as findPosition,
  poolReferenceLpClaimAssets as lpClaimAssets,
  poolReferencePerformingDebtAssets as performingDebtAssets,
  positionPerformingDebtAssets
} from "./secured-pool-reference-state.js";

function clone(value) {
  return structuredClone(value);
}

function mutablePosition(state, id) {
  let position = state.positions.find((entry) => entry.accountId === id);
  if (!position) {
    position = emptyPosition(id);
    state.positions.push(position);
  }
  return position;
}

function assertCurrentOracle(state, now) {
  assertReferenceUint("now", now);
  const observation = state.lastAcceptedOracle;
  if (!observation) unavailablePoolAction("a valid accepted oracle observation is required");
  assertOracleBinding(observation);
  const policy = M2_POOL_REFERENCE_POLICY;
  if (
    observation.observedAt > now + policy.maxOracleFutureSkewSeconds ||
    (now > observation.observedAt && now - observation.observedAt > policy.maxOracleAgeSeconds)
  ) {
    unavailablePoolAction("oracle observation is stale or too far in the future");
  }
  return observation;
}

function accrueInternal(state, now) {
  assertReferenceUint("now", now);
  assertPoolReferenceInvariants(state);
  if (now < state.lastAccruedAt) unavailablePoolAction("accrual timestamp regressed");
  const next = clone(state);
  const elapsed = now - next.lastAccruedAt;
  const policy = M2_POOL_REFERENCE_POLICY;
  const requiredChunks = elapsed === 0n
    ? 0n
    : mulDivUp(elapsed, 1n, policy.maxAccrualChunkSeconds);
  if (requiredChunks > policy.maxAccrualChunksPerTransition) {
    unavailablePoolAction("accrual catch-up exceeds the bounded reference-model window");
  }

  let interestAccruedAssets = 0n;
  let reservesAccruedAssets = 0n;
  let chunks = 0n;
  while (next.lastAccruedAt < now) {
    const remaining = now - next.lastAccruedAt;
    const elapsedSeconds = minReference(remaining, policy.maxAccrualChunkSeconds);
    const performingDebt = performingDebtAssets(next);
    if (performingDebt > 0n) {
      const borrowAprBps = calculateBorrowAprBps(next.cashAssets, performingDebt);
      const accrual = calculateInterestAtRate(performingDebt, borrowAprBps, elapsedSeconds);
      next.grossDebtAssets += accrual.interestAssets;
      next.reservesAssets += accrual.reserveAssets;
      interestAccruedAssets += accrual.interestAssets;
      reservesAccruedAssets += accrual.reserveAssets;
    }
    next.lastAccruedAt += elapsedSeconds;
    chunks += 1n;
  }
  assertPoolReferenceInvariants(next);
  return { state: next, interestAccruedAssets, reservesAccruedAssets, chunks };
}

function repayPerformingInternal(state, position, amountAssets) {
  const performingDebt = performingDebtAssets(state);
  const quotedDebtAssets = positionPerformingDebtAssets(state, position);
  if (quotedDebtAssets === 0n || amountAssets > quotedDebtAssets) {
    unavailablePoolAction("repayment exceeds the current performing debt quote");
  }

  let sharesBurned;
  let debtReducedAssets;
  if (amountAssets === quotedDebtAssets) {
    sharesBurned = position.debtShares;
    debtReducedAssets = amountAssets;
  } else {
    sharesBurned = mulDivDown(amountAssets, state.totalDebtShares, performingDebt);
    if (sharesBurned === 0n) unavailablePoolAction("repayment would burn zero debt shares");
    debtReducedAssets = mulDivUp(sharesBurned, performingDebt, state.totalDebtShares);
  }
  const reserveDustAssets = amountAssets - debtReducedAssets;
  state.cashAssets += amountAssets;
  state.grossDebtAssets -= debtReducedAssets;
  state.reservesAssets += reserveDustAssets;
  state.totalDebtShares -= sharesBurned;
  position.debtShares -= sharesBurned;
  return { sharesBurned, debtReducedAssets, reserveDustAssets };
}

function recognizeBadDebtInternal(state, position) {
  if (position.collateralAssets !== 0n || position.debtShares === 0n) {
    unavailablePoolAction("bad debt requires exhausted collateral and remaining debt shares");
  }
  const recognizedBadDebtAssets = positionPerformingDebtAssets(state, position);
  state.totalDebtShares -= position.debtShares;
  position.debtShares = 0n;
  position.badDebtAssets += recognizedBadDebtAssets;
  state.badDebtAssets += recognizedBadDebtAssets;
  return recognizedBadDebtAssets;
}

export function createSecuredPoolReferenceState({
  initialTimestamp,
  marketDebtCapAssets,
  borrowerDebtCapAssets
}) {
  assertReferenceUint("initialTimestamp", initialTimestamp);
  assertReferenceUint("marketDebtCapAssets", marketDebtCapAssets, { positive: true });
  assertReferenceUint("borrowerDebtCapAssets", borrowerDebtCapAssets, { positive: true });
  const state = {
    schemaVersion: M2_POOL_REFERENCE_SCHEMA_VERSION,
    policyVersion: M2_POOL_REFERENCE_POLICY_VERSION,
    cashAssets: 0n,
    grossDebtAssets: 0n,
    reservesAssets: 0n,
    badDebtAssets: 0n,
    totalSupplyShares: 0n,
    totalDebtShares: 0n,
    lastAccruedAt: initialTimestamp,
    marketDebtCapAssets,
    borrowerDebtCapAssets,
    lastAcceptedOracle: null,
    positions: []
  };
  assertPoolReferenceInvariants(state);
  return state;
}

export function poolReferenceAccounting(state) {
  assertPoolReferenceInvariants(state);
  const performingDebt = performingDebtAssets(state);
  const claimAssets = lpClaimAssets(state);
  return {
    cashAssets: state.cashAssets,
    grossDebtAssets: state.grossDebtAssets,
    performingDebtAssets: performingDebt,
    reservesAssets: state.reservesAssets,
    badDebtAssets: state.badDebtAssets,
    grossAssets: state.cashAssets + state.grossDebtAssets,
    lpClaimAssets: claimAssets,
    utilizationBps: calculateUtilizationBps(state.cashAssets, performingDebt),
    borrowAprBps: calculateBorrowAprBps(state.cashAssets, performingDebt),
    supplyAprBps: calculateSupplyAprBps(state.cashAssets, performingDebt),
    exchangeRateWad: state.totalSupplyShares === 0n
      ? M2_POOL_REFERENCE_POLICY.wad
      : mulDivDown(claimAssets, M2_POOL_REFERENCE_POLICY.wad, state.totalSupplyShares)
  };
}

export function poolReferencePosition(state, requestedAccountId) {
  assertPoolReferenceInvariants(state);
  const id = accountId(requestedAccountId);
  const position = clone(findPosition(state, id));
  return {
    ...position,
    performingDebtAssets: positionPerformingDebtAssets(state, position),
    totalOutstandingDebtAssets: positionPerformingDebtAssets(state, position) +
      position.badDebtAssets
  };
}

export function acceptPoolReferenceOracle(state, observation, now) {
  assertPoolReferenceInvariants(state);
  assertReferenceUint("now", now);
  assertOracleBinding(observation);
  const policy = M2_POOL_REFERENCE_POLICY;
  if (
    observation.observedAt > now + policy.maxOracleFutureSkewSeconds ||
    (now > observation.observedAt && now - observation.observedAt > policy.maxOracleAgeSeconds)
  ) {
    unavailablePoolAction("oracle observation is stale or too far in the future");
  }
  const previous = state.lastAcceptedOracle;
  if (previous) {
    if (observation.observedAt < previous.observedAt) {
      unavailablePoolAction("oracle timestamp regressed");
    }
    const difference = observation.priceUsdWad > previous.priceUsdWad
      ? observation.priceUsdWad - previous.priceUsdWad
      : previous.priceUsdWad - observation.priceUsdWad;
    if (difference * policy.bps > previous.priceUsdWad * policy.maxOracleDeviationBps) {
      unavailablePoolAction("oracle deviation exceeds the fixture bound");
    }
    if (
      observation.observedAt === previous.observedAt &&
      (observation.roundId !== previous.roundId || observation.priceUsdWad !== previous.priceUsdWad)
    ) {
      unavailablePoolAction("oracle observation conflicts at the accepted timestamp");
    }
  }
  const next = clone(state);
  next.lastAcceptedOracle = clone(observation);
  assertPoolReferenceInvariants(next);
  return next;
}

export function accruePoolReferenceInterest(state, now) {
  return accrueInternal(state, now);
}

export function supplyPoolReferenceAssets(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const claimBefore = lpClaimAssets(next);
  const sharesMinted = next.totalSupplyShares === 0n
    ? amountAssets
    : mulDivDown(amountAssets, next.totalSupplyShares, claimBefore);
  if (sharesMinted === 0n) unavailablePoolAction("supply would mint zero shares");
  next.cashAssets += amountAssets;
  next.totalSupplyShares += sharesMinted;
  mutablePosition(next, id).supplyShares += sharesMinted;
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, sharesMinted };
}

export function donatePoolReferenceCash(state, { amountAssets, now }) {
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  accrued.state.cashAssets += amountAssets;
  assertPoolReferenceInvariants(accrued.state);
  return { ...accrued, donatedAssets: amountAssets };
}

export function withdrawPoolReferenceAssets(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  if (amountAssets > next.cashAssets) unavailablePoolAction("withdrawal exceeds available cash");
  const claimAssets = lpClaimAssets(next);
  if (claimAssets === 0n || next.totalSupplyShares === 0n) {
    unavailablePoolAction("no LP claim is available");
  }
  const sharesBurned = mulDivUp(amountAssets, next.totalSupplyShares, claimAssets);
  const position = mutablePosition(next, id);
  if (sharesBurned === 0n || sharesBurned > position.supplyShares) {
    unavailablePoolAction("withdrawal exceeds the account share claim");
  }
  next.cashAssets -= amountAssets;
  next.totalSupplyShares -= sharesBurned;
  position.supplyShares -= sharesBurned;
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, sharesBurned };
}

export function redeemAllPoolReferenceShares(state, { requestedAccountId, now }) {
  const id = accountId(requestedAccountId);
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const position = mutablePosition(next, id);
  if (position.supplyShares === 0n) unavailablePoolAction("account has no supply shares");
  const amountAssets = position.supplyShares === next.totalSupplyShares
    ? lpClaimAssets(next)
    : mulDivDown(position.supplyShares, lpClaimAssets(next), next.totalSupplyShares);
  if (amountAssets === 0n || amountAssets > next.cashAssets) {
    unavailablePoolAction("full redemption is not currently liquid");
  }
  const sharesBurned = position.supplyShares;
  next.cashAssets -= amountAssets;
  next.totalSupplyShares -= sharesBurned;
  position.supplyShares = 0n;
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, amountAssets, sharesBurned };
}

export function addPoolReferenceCollateral(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  mutablePosition(accrued.state, id).collateralAssets += amountAssets;
  assertPoolReferenceInvariants(accrued.state);
  return { ...accrued, collateralAddedAssets: amountAssets };
}

function healthFromState(state, id, now, collateralOverride = undefined, debtIncrease = 0n) {
  const oracle = assertCurrentOracle(state, now);
  const position = findPosition(state, id);
  const collateralAssets = collateralOverride ?? position.collateralAssets;
  const debtAssets = positionPerformingDebtAssets(state, position) +
    position.badDebtAssets + debtIncrease;
  const collateralValueAssets = calculateCollateralValueAssets(collateralAssets, oracle.priceUsdWad);
  const policy = M2_POOL_REFERENCE_POLICY;
  const borrowCapacityAssets = mulDivDown(collateralValueAssets, policy.loanToValueBps, policy.bps);
  const liquidationThresholdAssets = mulDivDown(
    collateralValueAssets,
    policy.liquidationThresholdBps,
    policy.bps
  );
  return {
    priceUsdWad: oracle.priceUsdWad,
    collateralValueAssets,
    borrowCapacityAssets,
    liquidationThresholdAssets,
    debtAssets,
    healthFactorWad: debtAssets === 0n
      ? null
      : mulDivDown(liquidationThresholdAssets, policy.wad, debtAssets),
    liquidatable: position.debtShares > 0n && debtAssets > liquidationThresholdAssets
  };
}

export function poolReferenceHealth(state, { requestedAccountId, now }) {
  assertPoolReferenceInvariants(state);
  return healthFromState(state, accountId(requestedAccountId), now);
}

export function borrowPoolReferenceAssets(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const position = mutablePosition(next, id);
  if (position.badDebtAssets > 0n) unavailablePoolAction("recognized bad debt blocks new risk");
  if (amountAssets > next.cashAssets) unavailablePoolAction("borrow exceeds available cash");
  const debtBefore = positionPerformingDebtAssets(next, position);
  const healthAfter = healthFromState(next, id, now, undefined, amountAssets);
  if (debtBefore + amountAssets > next.borrowerDebtCapAssets) {
    unavailablePoolAction("borrow exceeds the borrower fixture cap");
  }
  if (next.grossDebtAssets + amountAssets > next.marketDebtCapAssets) {
    unavailablePoolAction("borrow exceeds the market fixture cap");
  }
  if (healthAfter.debtAssets > healthAfter.borrowCapacityAssets) {
    unavailablePoolAction("borrow exceeds collateral capacity");
  }
  const performingBefore = performingDebtAssets(next);
  const debtSharesMinted = next.totalDebtShares === 0n
    ? amountAssets
    : mulDivUp(amountAssets, next.totalDebtShares, performingBefore);
  next.cashAssets -= amountAssets;
  next.grossDebtAssets += amountAssets;
  next.totalDebtShares += debtSharesMinted;
  position.debtShares += debtSharesMinted;
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, debtSharesMinted, healthAfter };
}

export function repayPoolReferenceAssets(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const position = mutablePosition(next, id);
  if (position.badDebtAssets > 0n) {
    if (position.debtShares !== 0n || amountAssets > position.badDebtAssets) {
      unavailablePoolAction("bad-debt recovery must remain within the recognized amount");
    }
    next.cashAssets += amountAssets;
    next.grossDebtAssets -= amountAssets;
    next.badDebtAssets -= amountAssets;
    position.badDebtAssets -= amountAssets;
    assertPoolReferenceInvariants(next);
    return { ...accrued, state: next, badDebtRecoveredAssets: amountAssets };
  }
  const repayment = repayPerformingInternal(next, position, amountAssets);
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, ...repayment, badDebtRecoveredAssets: 0n };
}

export function releasePoolReferenceCollateral(state, { requestedAccountId, amountAssets, now }) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("amountAssets", amountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const position = mutablePosition(next, id);
  if (amountAssets > position.collateralAssets) {
    unavailablePoolAction("collateral release exceeds the account balance");
  }
  const remainingCollateral = position.collateralAssets - amountAssets;
  const healthAfter = healthFromState(next, id, now, remainingCollateral);
  if (healthAfter.debtAssets > healthAfter.borrowCapacityAssets) {
    unavailablePoolAction("collateral release would exceed borrowing capacity");
  }
  position.collateralAssets = remainingCollateral;
  assertPoolReferenceInvariants(next);
  return { ...accrued, state: next, collateralReleasedAssets: amountAssets, healthAfter };
}

export function liquidatePoolReferencePosition(state, {
  requestedAccountId,
  repayAmountAssets,
  now
}) {
  const id = accountId(requestedAccountId);
  assertReferenceUint("repayAmountAssets", repayAmountAssets, { positive: true });
  const accrued = accrueInternal(state, now);
  const next = accrued.state;
  const position = mutablePosition(next, id);
  const healthBefore = healthFromState(next, id, now);
  if (!healthBefore.liquidatable) unavailablePoolAction("position is not liquidatable");
  const policy = M2_POOL_REFERENCE_POLICY;
  const performingDebt = positionPerformingDebtAssets(next, position);
  const closeLimit = mulDivDown(performingDebt, policy.closeFactorBps, policy.bps);
  const collateralCoverageLimit = mulDivUp(
    healthBefore.collateralValueAssets,
    policy.bps,
    policy.bps + policy.liquidationBonusBps
  );
  const repaymentLimitAssets = minReference(performingDebt, closeLimit, collateralCoverageLimit);
  if (repayAmountAssets > repaymentLimitAssets) {
    unavailablePoolAction("liquidation repayment exceeds the close or collateral limit");
  }
  const repayment = repayPerformingInternal(next, position, repayAmountAssets);
  const seizeValueAssets = mulDivUp(
    repayAmountAssets,
    policy.bps + policy.liquidationBonusBps,
    policy.bps
  );
  const collateralQuotedAssets = calculateCollateralRequiredForValue(
    seizeValueAssets,
    healthBefore.priceUsdWad
  );
  const collateralSeizedAssets = minReference(position.collateralAssets, collateralQuotedAssets);
  position.collateralAssets -= collateralSeizedAssets;
  const badDebtRecognizedAssets = position.collateralAssets === 0n && position.debtShares > 0n
    ? recognizeBadDebtInternal(next, position)
    : 0n;
  assertPoolReferenceInvariants(next);
  return {
    ...accrued,
    state: next,
    ...repayment,
    collateralSeizedAssets,
    badDebtRecognizedAssets,
    repaymentLimitAssets,
    healthBefore
  };
}
