import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainError,
  M2_POOL_REFERENCE_POLICY,
  acceptPoolReferenceOracle,
  accruePoolReferenceInterest,
  addPoolReferenceCollateral,
  assertPoolReferenceInvariants,
  borrowPoolReferenceAssets,
  calculateBorrowAprBps,
  calculateInterestAtRate,
  calculateSupplyAprBps,
  calculateUtilizationBps,
  createSecuredPoolReferenceState,
  donatePoolReferenceCash,
  liquidatePoolReferencePosition,
  poolReferenceAccounting,
  poolReferenceHealth,
  poolReferencePosition,
  redeemAllPoolReferenceShares,
  releasePoolReferenceCollateral,
  repayPoolReferenceAssets,
  supplyPoolReferenceAssets,
  withdrawPoolReferenceAssets
} from "../src/index.js";

const USDC = 10n ** 6n;
const WETH = 10n ** 18n;
const USD_WAD = 10n ** 18n;
const T0 = 1_800_000_000n;

function amount(units) {
  return BigInt(units) * USDC;
}

function price(units) {
  return BigInt(units) * USD_WAD;
}

function state(overrides = {}) {
  return createSecuredPoolReferenceState({
    initialTimestamp: T0,
    marketDebtCapAssets: amount(1_000_000),
    borrowerDebtCapAssets: amount(100_000),
    ...overrides
  });
}

function oracle(priceUsdWad, observedAt = T0, roundId = "round_1") {
  return {
    chainId: M2_POOL_REFERENCE_POLICY.chainId,
    assetId: M2_POOL_REFERENCE_POLICY.collateralAssetId,
    sourceId: M2_POOL_REFERENCE_POLICY.oracleSourceId,
    priceUsdWad,
    observedAt,
    roundId,
    complete: true
  };
}

function withLiquidity(poolState, suppliedAssets = amount(500_000)) {
  return supplyPoolReferenceAssets(poolState, {
    requestedAccountId: "lp_primary",
    amountAssets: suppliedAssets,
    now: poolState.lastAccruedAt
  }).state;
}

function healthyBorrowFixture() {
  let current = withLiquidity(state());
  current = acceptPoolReferenceOracle(current, oracle(price(2_000)), T0);
  current = addPoolReferenceCollateral(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: 10n * WETH,
    now: T0
  }).state;
  current = borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: amount(14_000),
    now: T0
  }).state;
  return current;
}

test("ADR M2 rate and native-base-unit interest vectors are exact", () => {
  const cash = amount(500_000);
  const debt = amount(500_000);
  assert.equal(calculateUtilizationBps(cash, debt), 5_000n);
  assert.equal(calculateBorrowAprBps(cash, debt), 700n);
  assert.equal(calculateSupplyAprBps(cash, debt), 315n);

  const accrual = calculateInterestAtRate(debt, 700n, 2_592_000n);
  assert.deepEqual(accrual, {
    interestAssets: 2_876_712_329n,
    reserveAssets: 287_671_232n
  });
});

test("healthy collateral produces the approved capacity and health vector", () => {
  const current = healthyBorrowFixture();
  const health = poolReferenceHealth(current, {
    requestedAccountId: "borrower_primary",
    now: T0
  });
  assert.deepEqual(health, {
    priceUsdWad: price(2_000),
    collateralValueAssets: amount(20_000),
    borrowCapacityAssets: amount(15_000),
    liquidationThresholdAssets: amount(16_000),
    debtAssets: amount(14_000),
    healthFactorWad: 1_142_857_142_857_142_857n,
    liquidatable: false
  });
  assert.throws(() => borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: amount(1_001),
    now: T0
  }), DomainError);
  assert.throws(() => releasePoolReferenceCollateral(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: WETH,
    now: T0
  }), DomainError);
});

test("pool accrual is monotonic, seven-day chunked, bounded, and replayable", () => {
  let current = withLiquidity(state({
    marketDebtCapAssets: amount(1_000_000),
    borrowerDebtCapAssets: amount(1_000_000)
  }), amount(1_000_000));
  current = acceptPoolReferenceOracle(current, oracle(price(2_000)), T0);
  current = addPoolReferenceCollateral(current, {
    requestedAccountId: "borrower_kink",
    amountAssets: 1_000n * WETH,
    now: T0
  }).state;
  current = borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_kink",
    amountAssets: amount(500_000),
    now: T0
  }).state;
  assert.equal(poolReferenceAccounting(current).borrowAprBps, 700n);

  const first = accruePoolReferenceInterest(current, T0 + 2_592_000n);
  const second = accruePoolReferenceInterest(current, T0 + 2_592_000n);
  assert.equal(first.chunks, 5n);
  assert.ok(first.interestAccruedAssets > 2_876_712_329n);
  assert.ok(first.reservesAccruedAssets > 0n);
  assert.deepEqual(first, second);
  assert.ok(first.state.grossDebtAssets > current.grossDebtAssets);
  assert.ok(first.state.reservesAssets > current.reservesAssets);

  const before = structuredClone(current);
  const beyondBound = T0 +
    M2_POOL_REFERENCE_POLICY.maxAccrualChunkSeconds *
      M2_POOL_REFERENCE_POLICY.maxAccrualChunksPerTransition + 1n;
  assert.throws(() => accruePoolReferenceInterest(current, beyondBound), DomainError);
  assert.deepEqual(current, before);
});

test("market and borrower fixture caps are atomic current-state checks", () => {
  let current = withLiquidity(state({
    marketDebtCapAssets: amount(10_000),
    borrowerDebtCapAssets: amount(20_000)
  }), amount(100_000));
  current = acceptPoolReferenceOracle(current, oracle(price(2_000)), T0);
  current = addPoolReferenceCollateral(current, {
    requestedAccountId: "borrower_capped",
    amountAssets: 100n * WETH,
    now: T0
  }).state;
  current = borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_capped",
    amountAssets: amount(10_000),
    now: T0
  }).state;
  const before = structuredClone(current);
  assert.throws(() => borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_capped",
    amountAssets: 1n,
    now: T0
  }), DomainError);
  assert.deepEqual(current, before);
});

test("the approved 20 percent shock permits exact close-factor liquidation", () => {
  const borrowed = healthyBorrowFixture();
  const shocked = acceptPoolReferenceOracle(
    borrowed,
    oracle(price(1_600), T0 + 1n, "round_2"),
    T0 + 1n
  );
  const before = structuredClone(shocked);
  const liquidation = liquidatePoolReferencePosition(shocked, {
    requestedAccountId: "borrower_primary",
    repayAmountAssets: amount(7_000),
    now: T0 + 1n
  });
  assert.deepEqual(shocked, before);
  assert.equal(liquidation.healthBefore.liquidatable, true);
  assert.equal(liquidation.collateralSeizedAssets, 4_593_750_000_000_000_000n);
  assert.equal(liquidation.badDebtRecognizedAssets, 0n);
  assert.equal(poolReferencePosition(liquidation.state, "borrower_primary").collateralAssets,
    5_406_250_000_000_000_000n);
});

test("stale price denies new risk, release, and seizure while protection remains open", () => {
  const borrowed = healthyBorrowFixture();
  const staleAt = T0 + 3_601n;
  for (const action of [
    () => borrowPoolReferenceAssets(borrowed, {
      requestedAccountId: "borrower_primary",
      amountAssets: USDC,
      now: staleAt
    }),
    () => releasePoolReferenceCollateral(borrowed, {
      requestedAccountId: "borrower_primary",
      amountAssets: 1n,
      now: staleAt
    }),
    () => liquidatePoolReferencePosition(borrowed, {
      requestedAccountId: "borrower_primary",
      repayAmountAssets: USDC,
      now: staleAt
    })
  ]) assert.throws(action, DomainError);

  const collateral = addPoolReferenceCollateral(borrowed, {
    requestedAccountId: "borrower_primary",
    amountAssets: 1n,
    now: staleAt
  });
  assert.equal(collateral.collateralAddedAssets, 1n);
  const debt = poolReferencePosition(collateral.state, "borrower_primary").performingDebtAssets;
  const repaid = repayPoolReferenceAssets(collateral.state, {
    requestedAccountId: "borrower_primary",
    amountAssets: debt,
    now: staleAt
  });
  assert.equal(poolReferencePosition(repaid.state, "borrower_primary").performingDebtAssets, 0n);
});

test("supply, donation, liquidity and terminal redemption use solvency-favoring rounding", () => {
  let current = supplyPoolReferenceAssets(state(), {
    requestedAccountId: "lp_attacker",
    amountAssets: 1n,
    now: T0
  }).state;
  current = donatePoolReferenceCash(current, { amountAssets: USDC, now: T0 }).state;
  const beforeZeroMint = structuredClone(current);
  assert.throws(() => supplyPoolReferenceAssets(current, {
    requestedAccountId: "lp_victim",
    amountAssets: 1n,
    now: T0
  }), DomainError);
  assert.deepEqual(current, beforeZeroMint);
  assertPoolReferenceInvariants(current);

  const redeemed = redeemAllPoolReferenceShares(current, {
    requestedAccountId: "lp_attacker",
    now: T0
  });
  assert.equal(redeemed.amountAssets, USDC + 1n);
  assert.equal(redeemed.state.totalSupplyShares, 0n);
  assert.equal(redeemed.state.cashAssets, 0n);
});

test("cash exhaustion denies LP withdrawal without inventing an IOU", () => {
  let current = withLiquidity(state(), amount(20_000));
  current = acceptPoolReferenceOracle(current, oracle(price(2_000)), T0);
  current = addPoolReferenceCollateral(current, {
    requestedAccountId: "borrower",
    amountAssets: 20n * WETH,
    now: T0
  }).state;
  current = borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower",
    amountAssets: amount(20_000),
    now: T0
  }).state;
  const before = structuredClone(current);
  assert.throws(() => withdrawPoolReferenceAssets(current, {
    requestedAccountId: "lp_primary",
    amountAssets: 1n,
    now: T0
  }), DomainError);
  assert.deepEqual(current, before);
});

test("full repayment and full-share redemption have exact terminal paths", () => {
  let current = healthyBorrowFixture();
  const quoted = poolReferencePosition(current, "borrower_primary").performingDebtAssets;
  current = repayPoolReferenceAssets(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: quoted,
    now: T0
  }).state;
  current = releasePoolReferenceCollateral(current, {
    requestedAccountId: "borrower_primary",
    amountAssets: 10n * WETH,
    now: T0
  }).state;
  const redeemed = redeemAllPoolReferenceShares(current, {
    requestedAccountId: "lp_primary",
    now: T0
  });
  assert.equal(redeemed.state.totalSupplyShares, 0n);
  assert.equal(redeemed.state.totalDebtShares, 0n);
  assert.equal(redeemed.state.grossDebtAssets, 0n);
  assert.equal(redeemed.state.cashAssets, 0n);
});

test("collateral exhaustion recognizes one LP loss and recovery exactly once", () => {
  let current = withLiquidity(state(), amount(50_000));
  current = acceptPoolReferenceOracle(current, oracle(price(2_000)), T0);
  current = addPoolReferenceCollateral(current, {
    requestedAccountId: "borrower_loss",
    amountAssets: WETH,
    now: T0
  }).state;
  current = borrowPoolReferenceAssets(current, {
    requestedAccountId: "borrower_loss",
    amountAssets: amount(1_500),
    now: T0
  }).state;

  const shockPrices = [1_600n, 1_280n, 1_024n, 819_200_000_000_000_000_000n,
    655_360_000_000_000_000_000n];
  for (const [index, shockPrice] of shockPrices.entries()) {
    const priceUsdWad = shockPrice < 10_000n ? shockPrice * USD_WAD : shockPrice;
    current = acceptPoolReferenceOracle(
      current,
      oracle(priceUsdWad, T0 + BigInt(index + 1), `round_${index + 2}`),
      T0 + BigInt(index + 1)
    );
  }
  const now = T0 + BigInt(shockPrices.length);
  const health = poolReferenceHealth(current, { requestedAccountId: "borrower_loss", now });
  const collateralCoverage = (health.collateralValueAssets * M2_POOL_REFERENCE_POLICY.bps +
    M2_POOL_REFERENCE_POLICY.bps + M2_POOL_REFERENCE_POLICY.liquidationBonusBps - 1n) /
    (M2_POOL_REFERENCE_POLICY.bps + M2_POOL_REFERENCE_POLICY.liquidationBonusBps);
  const accruedBeforeLiquidation = accruePoolReferenceInterest(current, now).state;
  const claimBefore = poolReferenceAccounting(accruedBeforeLiquidation).lpClaimAssets;
  const liquidation = liquidatePoolReferencePosition(current, {
    requestedAccountId: "borrower_loss",
    repayAmountAssets: collateralCoverage,
    now
  });
  const loss = liquidation.badDebtRecognizedAssets;
  assert.ok(loss > 0n);
  assert.equal(liquidation.collateralSeizedAssets, WETH);
  assert.equal(poolReferencePosition(liquidation.state, "borrower_loss").badDebtAssets, loss);
  assert.equal(poolReferenceAccounting(liquidation.state).lpClaimAssets, claimBefore - loss);
  assert.throws(() => liquidatePoolReferencePosition(liquidation.state, {
    requestedAccountId: "borrower_loss",
    repayAmountAssets: 1n,
    now
  }), DomainError);

  const recovery = minBigInt(loss, amount(100));
  const recovered = repayPoolReferenceAssets(liquidation.state, {
    requestedAccountId: "borrower_loss",
    amountAssets: recovery,
    now
  });
  assert.equal(
    poolReferenceAccounting(recovered.state).lpClaimAssets,
    poolReferenceAccounting(liquidation.state).lpClaimAssets + recovery
  );
});

test("oracle, caps, time and closed-input boundaries fail before input mutation", () => {
  const original = healthyBorrowFixture();
  const attempts = [
    () => accruePoolReferenceInterest(original, T0 - 1n),
    () => acceptPoolReferenceOracle(original, {
      ...oracle(price(2_001), T0 + 1n, "round_bad"),
      chainId: "eip155:1"
    }, T0 + 1n),
    () => acceptPoolReferenceOracle(original,
      oracle(price(1_599), T0 + 1n, "round_deviation"), T0 + 1n),
    () => liquidatePoolReferencePosition(original, {
      requestedAccountId: "borrower_primary",
      repayAmountAssets: USDC,
      now: T0
    }),
    () => borrowPoolReferenceAssets(original, {
      requestedAccountId: "__proto__",
      amountAssets: USDC,
      now: T0
    })
  ];
  for (const attempt of attempts) {
    const before = structuredClone(original);
    assert.throws(attempt, DomainError);
    assert.deepEqual(original, before);
  }
});

function minBigInt(left, right) {
  return left < right ? left : right;
}

function xorshift64(seed) {
  let value = seed;
  return () => {
    value ^= value << 13n;
    value ^= value >> 7n;
    value ^= value << 17n;
    value &= (1n << 64n) - 1n;
    return value;
  };
}

function replaySeed(seed) {
  const random = xorshift64(seed);
  let now = T0;
  let round = 1;
  let current = withLiquidity(state(), amount(900_000));
  current = acceptPoolReferenceOracle(current, oracle(price(2_000), now, `seed_${seed}_0`), now);
  for (const id of ["borrower_a", "borrower_b", "borrower_c"]) {
    current = addPoolReferenceCollateral(current, {
      requestedAccountId: id,
      amountAssets: 100n * WETH,
      now
    }).state;
  }

  for (let index = 0; index < 400; index += 1) {
    now += random() % 11n;
    if (now - current.lastAcceptedOracle.observedAt > 3_000n) {
      round += 1;
      current = acceptPoolReferenceOracle(
        current,
        oracle(price(2_000), now, `seed_${seed}_${round}`),
        now
      );
    }
    const selected = Number(random() % 3n);
    const account = ["borrower_a", "borrower_b", "borrower_c"][selected];
    const lp = `lp_${selected}`;
    const choice = Number(random() % 7n);
    const value = (random() % 100n + 1n) * USDC;
    const before = structuredClone(current);
    try {
      if (choice === 0) current = supplyPoolReferenceAssets(current, {
        requestedAccountId: lp, amountAssets: value, now
      }).state;
      if (choice === 1) current = borrowPoolReferenceAssets(current, {
        requestedAccountId: account, amountAssets: value, now
      }).state;
      if (choice === 2) {
        const debt = poolReferencePosition(current, account).performingDebtAssets;
        if (debt > 0n) current = repayPoolReferenceAssets(current, {
          requestedAccountId: account, amountAssets: minBigInt(value, debt), now
        }).state;
      }
      if (choice === 3) current = addPoolReferenceCollateral(current, {
        requestedAccountId: account, amountAssets: random() % (WETH / 10n) + 1n, now
      }).state;
      if (choice === 4) current = releasePoolReferenceCollateral(current, {
        requestedAccountId: account, amountAssets: random() % (WETH / 100n) + 1n, now
      }).state;
      if (choice === 5) current = withdrawPoolReferenceAssets(current, {
        requestedAccountId: lp, amountAssets: value, now
      }).state;
      if (choice === 6) current = accruePoolReferenceInterest(current, now).state;
    } catch (error) {
      assert.ok(error instanceof DomainError);
      assert.deepEqual(current, before);
    }
    const invariant = assertPoolReferenceInvariants(current);
    assert.ok(invariant.aggregateSupplyClaims <= invariant.lpClaimAssets);
    assert.ok(poolReferenceAccounting(current).performingDebtAssets >= 0n);
  }
  return current;
}

test("checked-in randomized seed corpus is deterministic and preserves invariants", () => {
  const seeds = [0x49504f4f4e453031n, 0x4d32413030313032n, 0x5345435552453033n];
  for (const seed of seeds) {
    const first = replaySeed(seed);
    const second = replaySeed(seed);
    assert.deepEqual(first, second);
    assertPoolReferenceInvariants(first);
  }
});
