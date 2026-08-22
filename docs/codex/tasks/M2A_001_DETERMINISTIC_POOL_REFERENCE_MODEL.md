# M2A-001 — deterministic pool reference model

Status: `LOCALLY VERIFIED — L0_LOCAL_NO_FUNDS`

Current SHA: `4e28ea16cf1a48d8fa817c9842fa7a4a0e7a8128`

Requirements: `REQ-POOL-003`, `REQ-POOL-004`, `REQ-COLL-001..004`,
`REQ-ORACLE-001`, `REQ-RATE-001`, `REQ-RATE-002`

## Context

Product Constitution v1.3 and ADR-M2-001 through ADR-M2-005 approve one
secured-only, curated-market architecture at `L0_LOCAL_NO_FUNDS`. No executable
reference model currently defines the exact integer behavior required for the
later Solidity implementation. M2A-003 and M2A-004 must not invent or diverge
from economic arithmetic independently.

Recomputing the accepted ADR-M2-005 formulas exposed two formula-preserving
clarifications required before implementation:

1. Native test-USDC accounting uses six decimals, so 30-day simple interest on
   `500,000.00 USDC` at `7.00%` is `2,876.712329 USDC` after ceiling to one
   micro-USDC; the reserve portion is `287.671232 USDC` after flooring. The
   prior two-decimal narrative values were not native-base-unit results.
2. To recognize bad debt exactly once under `C + D - R - B`, `D` is gross
   outstanding debt including an explicitly recognized bad-debt receivable;
   performing interest-bearing debt is `D - B`. Recognition moves debt from
   performing to bad-debt status without deleting the borrower's adverse
   outcome or subtracting the loss twice.

Neither clarification changes the approved fixture percentages, creates a
commercial term, or grants runtime authority.

## Scope

- Add one dependency-free, pure BigInt reference module for pool cash, LP
  shares, gross/performing debt, debt shares, collateral, reserves and bad debt.
- Implement explicit floor/ceiling helpers, utilization/kink-rate calculation,
  bounded time-chunk accrual, supply, withdrawal, donation, collateral deposit
  and release, borrow, repayment, health, liquidation and bad-debt recovery.
- Validate a closed deterministic oracle observation for health-dependent
  actions, including stale/future/deviation/wrong-binding denial.
- Return new state from every transition; inputs are never mutated.
- Add accepted vectors, boundary cases, deterministic randomized action
  sequences and invariant checks with checked-in seed identifiers.
- Correct ADR-M2-005 narrative arithmetic and debt terminology without changing
  its approved formulas or fixture parameters.

## Non-goals

- Solidity, ABI, contract, token, database, migration, UI, API, SDK or MCP work.
- RPC, wallet, signer, transaction, testnet call, deployment or public access.
- Live oracle/feed selection or commercial rate, LTV, liquidation, cap, fee or
  loss-bearing decisions.
- Multiple markets/assets, a factory, proxy, flash loan, transferable shares,
  recursive leverage, unsecured fallback or reserve application to losses.

## Likely files

- `packages/domain/src/secured-pool-reference-model.js`
- `packages/domain/src/secured-pool-reference-math.js`
- `packages/domain/src/secured-pool-reference-state.js`
- `packages/domain/src/index.js`
- `packages/domain/test/secured-pool-reference-model.test.js`
- `docs/architecture/ADR-M2-005-ORACLE_RATE_LIQUIDATION.md`
- `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`
- this issue record

## Acceptance criteria

1. Given every ADR-M2-005 vector, when evaluated in native integer units, then
   utilization, rates, accrual, capacity, health, seizure and stale-price
   behavior match the documented direction exactly.
2. Given supply, withdrawal, borrow, repay, liquidation and bad-debt sequences,
   when each transition completes, then cash/debt/share/collateral totals and
   `C + D - R - B` remain internally consistent with all rounding dust named.
3. Given repeated seeded randomized actions, when replayed twice, then the
   final state and Evidence-free operation results are byte-for-byte
   deterministic and aggregate user claims never exceed LP claim assets.
4. Given timestamp regression, invalid/stale oracle state, zero-share mint or
   burn, insufficient cash/collateral/shares, healthy liquidation, duplicate
   bad-debt recognition or any unsupported/open input, when attempted, then the
   transition fails before mutating input state.
5. Given recognized bad debt, when it is recorded or later recovered, then the
   LP loss/recovery is applied exactly once and remaining debt is never called
   repaid.

## Test commands

```text
node --test packages/domain/test/secured-pool-reference-model.test.js
pnpm run lint
pnpm test
```

The focused suite must run twice with the same checked-in seeds. PostgreSQL,
browser, contract and external-system layers are omitted because this issue has
no persistence, interface, contract or external boundary.

## Security checklist

- [x] Inputs are closed plain objects with bounded unsigned integers and time.
- [x] All divisions name floor or ceiling direction; no Number arithmetic is
      used for economic values.
- [x] New risk and collateral release fail closed on invalid oracle state.
- [x] Repay and add-collateral remain available without an oracle.
- [x] Cash, shares, debt, reserves, bad debt and per-account sums are asserted
      after every successful transition.
- [x] No user iteration is required for global interest accrual.
- [x] No external I/O, PII, credentials, logging, randomness source or funds
      authority exists.
- [x] No unsecured fallback, hidden write-off or double loss recognition exists.

## Permission boundary

Authorized mode: `L0_LOCAL_NO_FUNDS` pure deterministic computation only.
Permission/funds/deployment impact: **none**. This issue grants no contract,
asset, oracle, signer, account, transaction, testnet, mainnet, real-value,
public-access or production authority.

## Data, migration and rollback

No durable data or migration impact. Rollback is removal of the isolated module,
tests, export and formula-clarification lines. Existing application and contract
runtime behavior is unchanged.

## Required completion Evidence

- focused test output with accepted vectors and deterministic seed corpus;
- two identical replay results and zero failed invariants;
- full repository unit regression and lint result;
- exact changed-file and permission-boundary review; and
- one issue-sized PR whose checks pass before merge.

Dependencies: ratified Constitution v1.3, accepted ADR-M2-005, completed M2A-002
toolchain admission. Successor contract work remains blocked on this issue.

## Local completion Evidence

- Focused suite: 12/12 passed twice; each run replays three checked-in seeds
  twice across 400 actions per replay (2,400 deterministic actions per run).
- Full repository unit suite: 1,110/1,110 passed after a frozen-lockfile install.
- Source and boundary lint: passed; new handwritten modules are 159, 459 and
  126 lines, each below the 500-line feature-module target.
- No package or lockfile change, database, browser mutation, external I/O,
  signer, transaction, contract or deployment occurred.
- Existing local no-funds product runtime remains reachable at
  `http://127.0.0.1:8787/`; this pure domain model adds no user-facing surface
  and makes no runtime completion claim.
