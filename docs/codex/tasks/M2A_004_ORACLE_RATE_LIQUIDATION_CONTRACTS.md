# M2A-004 — oracle, rate, liquidation and bad-debt contracts

Status: `LOCALLY VERIFIED — L0_LOCAL_NO_FUNDS`

Remote `main` baseline: `bc715c2a64b54d6e3d38e96087dd00f27466f2c5`

Baseline tree: `f41b22192e43a8204def7b20dd03cc8cbd5cae24`

Branch: `codex/m2a-004-oracle-rate-liquidation`

Requirements: `REQ-POOL-002`, `REQ-POOL-003`, `REQ-POOL-004`,
`REQ-POOL-005`, `REQ-COLL-001`, `REQ-LIQ-001`, `REQ-ORACLE-001`, and the
contract-side subset of `REQ-POOL-EVID-001`

## Context

Product Constitution v1.3, ADR-M2-001 through ADR-M2-005, M2A-001 and the
merged M2A-003 single-market pool establish the approved local, secured-only
accounting boundary. The pool still lacks a closed oracle adapter, time-based
interest, liquidation and explicit bad-debt treatment. M2A-004 adds that one
bounded contract slice without choosing a live feed, changing the product
permission level, or implying deployment readiness.

Named human review: after the assistant identified M2A-004 as the next issue
and restated that it would remain local, synthetic and no-funds, the IPO.ONE
Founder directed “同意，启动M2A 004” on 2026-08-22. This records approval to
implement and test only the exact L0 scope below. It is not approval of a live
oracle, commercial parameters, testnet activity, deployment or value movement.

## Scope

- Replace the open price tuple with a closed observation carrying asset,
  market-chain, source, round, price, timestamp and completeness bindings.
- Add one immutable, read-only oracle adapter for a closed feed interface. It
  normalizes admitted feed decimals to WAD and rejects zero/negative,
  incomplete, wrong-binding, stale, future or timestamp-regressing data.
- Add pool-side accepted-observation state, a 20% deviation halt and a distinct
  recovery-authority action. Price deviation fails closed; recovery is explicit
  and emits a queryable receipt.
- Add deterministic kink utilization rates, seven-day accrual chunks, ceiling
  borrower interest, floor reserves and a permissionless bounded catch-up
  operation. Economic mutations require accrual to be current.
- Add liquidation-threshold health, 50% close-factor liquidation, 5% bonus,
  caller slippage/deadline protection and exact token-delta enforcement.
- Recognize collateral-exhausted residual debt once as non-accruing bad debt;
  support later recovery that reduces gross debt and bad debt while adding cash.
- Preserve one pool, immutable assets/roles/caps, non-transferable internal
  shares, pause asymmetry, non-reentrancy and no-user-loop operation.
- Extend closed ABI evidence and Foundry unit, fuzz, stateful invariant,
  adversarial-token and reference-vector coverage.

The ADR reference runner may use a high off-chain chunk bound. The on-chain
pool uses a fixed maximum of 32 seven-day chunks per call to bound gas. If a
position is further behind, any caller can advance accrual over repeated calls;
risk-changing operations fail with an explicit catch-up requirement until the
pool reaches the current timestamp. This changes liveness mechanics, not the
approved economic formula.

## Non-goals

- Selecting a real feed vendor, address, heartbeat, asset admission, production
  source identifier, emergency price, governance process or commercial risk
  parameter.
- Live RPC reads, wallet, signer, transaction, Base Sepolia/testnet call,
  contract deployment, verification, hosting, public endpoint, mainnet or real
  assets/funds.
- Factory, proxy, upgrade hook, multiple markets/assets, transferable shares,
  ERC-4626, flash loan, callback, recursive leverage or unsecured credit.
- Reserve withdrawal/application, socialized-loss recapitalization, auction,
  keeper network, MEV protection beyond deterministic limits and caller
  slippage/deadline bounds, or automated governance.
- Database, migration, indexer, Ledger/Obligation projection, UI, OpenAPI, SDK,
  MCP or browser-product changes.
- Arbitrary administration, asset drain, cap increase, role rotation, oracle
  replacement or caller-supplied prices.

## Likely files

- `contracts/src/m2/IpoOneSecuredPoolV1.sol`
- `contracts/src/m2/IpoOnePriceOracleAdapterV1.sol`
- `contracts/src/m2/interfaces/IIpoOnePriceOracleV1.sol`
- `contracts/src/m2/interfaces/IIpoOnePriceFeedV1.sol`
- `contracts/src/m2/libraries/SecuredPoolMathV1.sol`
- `contracts/test/m2/IpoOneSecuredPoolV1.t.sol`
- `contracts/test/m2/IpoOneSecuredPoolInvariant.t.sol`
- `contracts/test/m2/IpoOnePriceOracleAdapterV1.t.sol`
- `contracts/test/m2/mocks/*`
- `contracts/test/m2/secured-pool-abi.test.js`
- `contracts/abi/m2/IpoOneSecuredPoolV1.v1.json`
- `contracts/README.md`
- `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`
- `docs/traceability/IPO_ONE_M2_REQUIREMENT_TRACEABILITY_v0.1.md`
- this issue record

## Acceptance criteria

1. Given an immutable admitted feed and expected bindings, when an observation
   is read, then decimals normalize deterministically and zero/negative,
   incomplete, wrong-asset, wrong-chain, stale, future or regressing data fails
   closed without a caller-supplied price path.
2. Given an accepted price, when the next observation moves no more than 20%,
   then it can be accepted; when it exceeds 20%, then risk-changing operations
   stop and only the named recovery authority can explicitly recover to a valid
   current observation.
3. Given performing debt and elapsed time, when accrual advances, then the kink
   curve, ceiling interest, floor reserve and seven-day chunks match ADR-M2-005
   vectors. Bad debt does not accrue and no unbounded loop exists.
4. Given a healthy or unhealthy position, when collateral value changes, then
   liquidation-threshold health is deterministic. Only an unhealthy position
   can be liquidated, subject atomically to the 50% close factor, collateral
   coverage, minimum collateral output and deadline.
5. Given collateral exhaustion with residual performing debt, when liquidation
   completes, then the residual is recognized exactly once as bad debt, removed
   from performing debt, excluded from accrual and recoverable only through a
   transfer that reduces both gross debt and bad debt.
6. Given pause, invalid oracle, competing liquidators, rounding boundaries,
   long time gaps, fee/reentrant tokens, insufficient liquidity or unauthorized
   control, when actions execute, then they fail atomically. Repay and add-
   collateral remain open while paused or without a usable price; liquidation
   remains a protective operation when price data is valid.
7. Given pinned `solc` and Foundry builds, when ABI and bytecode are compared,
   then the callable/event/error surface and hashes are reproducible and no
   unapproved dependency import appears.

## Exact test commands

```text
pnpm install --frozen-lockfile
pnpm run check:m2-contract-toolchain
forge fmt --check contracts/src/m2 contracts/test/m2
forge build --sizes
forge test --match-path 'contracts/test/m2/*'
node --test contracts/test/m2/secured-pool-abi.test.js
pnpm run lint
pnpm run typecheck
pnpm test
pnpm audit --prod
git diff --check
```

Focused Foundry and ABI suites must run twice. PostgreSQL, browser and external
system tests are omitted from the focused layer because this issue changes no
persistence, product interface or external service. Aggregate repository gates
remain required before merge.

## Security checklist

- [x] Closed oracle identity, decimal, round, time and deviation checks fail
      closed; no user or administrator can provide a transaction price.
- [x] Interest and liquidation math uses explicit floor/ceiling rules and
      regression vectors at kink, close-factor, collateral-cap and dust edges.
- [x] Accrual and every external token transfer remain bounded, atomic,
      checks-effects-interactions ordered and non-reentrant.
- [x] Bad debt is recognized once, cannot accrue, cannot underflow performing
      debt and can only shrink through a matching exact token transfer.
- [x] Competing liquidation state, deadline and minimum-output checks prevent
      stale quotes or excess seizure from succeeding.
- [x] Pause only narrows new risk/outflow; repay, add-collateral and valid
      protective liquidation retain their specified recovery paths.
- [x] No proxy, delegatecall, arbitrary call, role rotation, cap increase,
      oracle replacement, token approval, reserve withdrawal or asset drain.
- [x] No user loop, PII, KYC, credential, private key, signature, RPC or
      off-chain policy data is introduced.
- [x] Events report economic facts and oracle decisions but do not claim chain
      finality, reconciliation, canonical Evidence or production activation.

The core remains one atomic market state machine because accrual, repayment,
collateral seizure and bad-debt recognition must settle in one transaction.
Pure rate/valuation arithmetic and feed normalization are split into the
53-line `SecuredPoolMathV1` library and 57-line immutable adapter; the 14.3 KB
pool runtime remains 10.2 KB below the EVM runtime limit. A further source split
would introduce internal delegate/authority boundaries without reducing the
atomic risk surface.

## Permission boundary

Authorized mode: `L0_LOCAL_NO_FUNDS` source, compilation and deterministic local
execution only. Permission/funds/deployment impact: **none**. The Founder review
above grants no live source, provider, asset, account, signer, RPC, transaction,
testnet, deployment, public-access, mainnet, real-value, custody, commercial-
risk or production authority.

## Data, migration and rollback

There is no durable application data or database migration. These contracts
are undeployed. Rollback is a clean revert/removal of this isolated issue's
contract, test, ABI evidence and documentation changes. Existing deployed
contracts and the current product runtime remain unchanged.

## Required completion Evidence

- exact Foundry version and dependency/toolchain admission output;
- two identical focused unit/fuzz/invariant/adversarial runs;
- ADR reference-vector comparison for rate, accrual, health, liquidation and
  bad-debt recovery;
- Node ABI and pinned-compiler parity output with ABI/creation/runtime hashes;
- full repository lint, typecheck, unit and production-dependency audit output;
- exact changed-file, privilege-surface and permission-boundary review;
- one issue-sized PR with required remote checks passing before merge; and
- a still-working local IPO.ONE experience link, while truthfully stating this
  contract slice has no user-facing runtime surface.

Dependencies: merged M2A-003, ratified Constitution v1.3, accepted ADR-M2-001
through ADR-M2-005, completed M2A-001 reference model and admitted M2A-002
toolchain. M2A-005 and all deployment work remain blocked until this issue is
reviewed and merged.

## Completion Evidence

- Admitted toolchain check passes with Foundry `1.7.1`, Solidity
  `0.8.30+commit.73712a01`, forge-std `1.16.1` and OpenZeppelin Contracts
  `5.6.1`; the lockfile and dependency versions are unchanged.
- Focused Foundry result is 25/25 passed in each of two consecutive runs. This
  includes three 512-run fuzz properties and two stateful invariants at 128
  runs × depth 64, or 8,192 calls per invariant per run, with zero unexpected
  reverts or discards.
- Reference and negative coverage includes 50% utilization producing 7.00%
  borrow/3.15% supply APR, recomputed seven-day accrual chunks, bounded
  multi-call catch-up, 20% shock, exact 4.59375 WETH close-factor seizure,
  stale/future/zero/incomplete/wrong-binding/regressing/deviating oracle data,
  slippage/deadline denial, protective paused liquidation, bad-debt one-time
  recognition and later recovery, fee-token and reentrancy denial.
- Pinned solc and Foundry independently produce identical ABI, creation
  bytecode and runtime bytecode in repeated checks. Pool hashes are creation
  `0xe3398763f0187a0ca40f99b51ed5b2f9901e773235870f1634cbee4530690601`
  and runtime
  `0xc0a950df621826f7d7314e677fdd8d1ee93e8d19dbef4d96ed445ec30738f536`;
  adapter hashes are creation
  `0xc603db2c905b3641ea9454745e48d6d55c0933f74a0ec850de8e98df6736ac4b`
  and runtime
  `0xe11dd1fd1c92dddd5012df3ef930c63ff9fbe9263b205a8d7344950b1219166d`.
- Runtime sizes are 14,294 bytes for the pool and 1,494 bytes for the adapter,
  both below the 24,576-byte EVM limit. Source/privilege inspection finds no
  proxy, delegatecall, arbitrary call, role rotation, parameter increase,
  approval, reserve withdrawal or administrative asset-drain surface.
- Full repository result is 1,112/1,112 passed. Source/boundary lint, contract
  typecheck, dependency/toolchain admission, formatting, `git diff --check`
  and production dependency audit all pass; no known production vulnerability
  is reported.
- A real headed browser opened the unchanged local product at
  `http://127.0.0.1:8787/`, verified the title and visible no-funds safety
  boundary, then used the visible Agent Workspace control to reach
  `http://127.0.0.1:8788/#agent-console`. This contract issue intentionally adds
  no user-facing runtime surface.
- No database, migration, RPC, signer, transaction, feed selection, deployment,
  testnet or real-funds action occurred. A PR/merge records review of this local
  evidence only and grants no higher permission state.
