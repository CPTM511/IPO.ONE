# ADR-M2-005: Oracle, rate, accounting and liquidation model

Status: Accepted architecture; all numerical values below remain test fixtures

## Units and rounding

- Token amounts use native integer base units: WETH 18 decimals, test-USDC 6.
- Prices use 18-decimal USD fixed point; rates use basis points; internal
  indexes may use `RAY = 10^27`.
- Use `Math.mulDiv` with an explicitly selected direction.
- Debt creation/accrual and shares burned for a requested withdrawal round in
  favor of solvency; assets/shares credited to a user and collateral value round
  down. Full repayment/full-share redemption has an exact terminal path.
- No operation may create more than one base unit of unexplained rounding; all
  dust is attributed to protocol reserves and emitted.

## Pool accounting

Let `C` be cash, `D` gross outstanding debt including accrued interest and any
recognized-but-unrecovered bad-debt receivable, `R` protocol reserves, and `B`
recognized bad debt, all in debt-asset base units. Performing interest-bearing
debt is `P = D - B`. Keeping `B` as an explicit contra-asset while the adverse
borrower outcome remains outstanding applies the LP loss exactly once.

```text
grossAssets = C + D
lpClaimAssets = max(0, C + D - R - B)
performingDebt = P = D - B
utilization U = P / (C + P), or 0 when denominator is 0
exchangeRate = lpClaimAssets / totalSupplyShares
```

Supply share minting for deposit `a`:

```text
shares = totalShares == 0 ? a : floor(a * totalShares / lpClaimAssetsBefore)
```

Withdrawal of exact assets `a` burns
`ceil(a * totalShares / lpClaimAssets)` and requires `a <= C` after all checks.
The initial depositor cannot mint zero shares; donations must not produce a
share-inflation advantage.

Performing debt uses shares. New debt `a` mints
`ceil(a * totalDebtShares / P)` (or `a` when empty). Partial repayment burns no
more than `floor(a * totalDebtShares / P)`; exact full repayment burns the
borrower's remaining debt shares and quotes the required amount before transfer.
Any explicitly calculated repayment dust is assigned to `R`. Recognized bad
debt has no performing shares and does not accrue interest; later recovery
reduces both `D` and `B` while increasing `C`, restoring LP claim value once.

## Interest fixture

Use a deterministic linear per-second kink model for the first test profile:

```text
kink = 80%
baseBorrow = 2.00% APR
slope1 = 8.00% APR
slope2 = 60.00% APR
reserveFactor = 10%

if U <= kink:
  borrowAPR = baseBorrow + slope1 * U / kink
else:
  borrowAPR = baseBorrow + slope1 + slope2 * (U-kink)/(1-kink)

supplyAPR = borrowAPR * U * (1-reserveFactor)
interest = ceil(P * borrowAPR_bps * dt / (365 days * 10,000))
reserveAccrual = floor(interest * reserveFactor)
```

Accrual is monotonic and occurs before every economic mutation. A single call
may cover at most seven days; longer inactivity is processed in bounded chunks
without iterating users. Timestamp regression reverts.

## Oracle fixture

The accepted adapter returns `(price, observedAt, roundId, sourceId)` and must
reject zero/negative price, incomplete round, timestamp regression, more than
60 seconds future skew, age over 3,600 seconds, wrong asset/source/chain, or an
absolute move over 20% from the last accepted price. A deviation halt requires
reviewed recovery; it cannot be caller-overridden.

Stale/invalid oracle blocks borrow and collateral release. Repay and add
collateral remain open. Liquidation requires a valid current price; invalid
price pauses rather than permitting seizure. The exact live Base Sepolia feed
and address are not admitted until `M2A-004` reproducibly verifies source,
decimals, update semantics and failure behavior. A deterministic oracle is used
only for local/fuzz tests and cannot be the L3 deployment profile.

## Capacity, health and liquidation fixture

```text
collateralValue = floor(collateralAmount * validPrice)
borrowCapacity = floor(collateralValue * 75%)
liquidationThresholdValue = floor(collateralValue * 80%)
healthFactor = liquidationThresholdValue / debt
liquidatable iff debt > 0 and healthFactor < 1
closeFactor = 50%
liquidationBonus = 5%
repayAmount <= min(debt * closeFactor, ceil(amount covering available collateral))
seizeValue = repayAmount * 1.05
seizeCollateral = min(collateral, ceil(seizeValue / validPrice))
```

The collateral-coverage repayment ceiling may exceed the exact floor by at
most one debt-asset base unit. Collateral seizure remains capped at the
borrower's available collateral; this prevents zero-value collateral dust from
blocking explicit bad-debt recognition.

The liquidator transfers test-USDC before collateral is released. Checks,
accounting and transfers are one non-reentrant transaction. Surplus collateral
remains owned by the borrower. If collateral is exhausted and debt remains,
the remainder becomes explicit `B`; it is never silently erased or described
as repaid. Reserve application, if later approved, is an explicit event and
cannot hide LP loss.

## Required test vectors

1. **Kink rate:** `C=500,000 USDC`, `D=500,000 USDC` gives `U=50%`, borrow APR
   `7.00%`, supply APR `3.15%`.
2. **Thirty-day simple-rate accrual:** debt `500,000.00 USDC` at a fixed
   `7.00%` for 2,592,000 seconds accrues `2,876.712329 USDC` after ceiling to
   one micro-USDC; reserve accrual is `287.671232 USDC` after reserve rounding
   down. Pool catch-up recomputes utilization at each bounded seven-day chunk.
3. **Healthy borrow:** 10 WETH at `$2,000` has `$15,000` capacity and `$16,000`
   liquidation-threshold value; `$14,000` debt is permitted with health
   `1.142857...`.
4. **Price shock:** at `$1,600`, threshold value becomes `$12,800`; `$14,000`
   debt is liquidatable. A 50% liquidation repays `$7,000` and seizes exactly
   `4.59375 WETH` at a 5% bonus before base-unit rounding.
5. **Stale price:** age 3,601 seconds denies borrow, release and liquidation but
   allows repay/add-collateral.
6. **Rounding:** repeated minimum deposits/borrows/repayments/redemptions cannot
   increase aggregate user claims above `C + D - R - B`; drift is at most the
   explicitly attributed reserve dust.
7. **Bad debt:** after all collateral is seized, remaining debt increments `B`,
   reduces LP claim value once and emits one idempotent loss event.

## Novelty, risk and mitigation

- Novel elements: utilization accrual, oracle health and permissionless
  liquidation.
- Risks: manipulation/staleness, rounding extraction, insolvency and griefing.
- Mitigations: conservative rounding, bounded oracle, caps, close factor,
  invariant/reference-model comparison, pause and explicit bad debt.
- Simpler safe alternative: fixed zero interest plus governed liquidation in a
  private test harness. It is suitable for early local modeling but does not
  satisfy the public-pool M2A acceptance path.

## Alternatives rejected

- Caller-supplied price: trivially manipulable.
- Unbounded admin price override: privileged seizure risk.
- Compound interest per user loop: gas/DoS and replay complexity.
- Socializing bad debt without a named account: hides insolvency.
- Auction liquidation in M2: larger state and liveness surface than one-market
  close-factor liquidation.

Permission/funds/deployment impact: **none**. Fixture values are not commercial
or production parameters. Acceptance does not select a live oracle, deploy a
contract, set real limits or authorize any transaction.
