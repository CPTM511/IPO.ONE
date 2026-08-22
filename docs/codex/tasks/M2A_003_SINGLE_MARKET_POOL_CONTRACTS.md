# M2A-003 — single-market secured pool contracts

Status: `LOCALLY VERIFIED — L0_LOCAL_NO_FUNDS`

Remote `main` baseline: `138fc16cf43eaa5a6db5a9307a87fbe569cb8f29`

Baseline tree: `83704ee27aadd53adcf566f1ce6dc8215a78598d`

Branch: `codex/m2a-003-single-market-pool`

Requirements: `REQ-POOL-001`, `REQ-POOL-003`, `REQ-POOL-004`,
`REQ-POOL-005`, `REQ-COLL-001`, and the contract-side subset of
`REQ-POOL-EVID-001`

## Context

Product Constitution v1.3, ADR-M2-001 through ADR-M2-005, M2A-001 and
M2A-002 now provide the bounded product authority, deterministic accounting
reference and admitted Solidity toolchain for one secured-only market.
Executable pool custody and accounting do not yet exist. M2A-003 must add the
smallest contract slice without selecting a live oracle, adding interest or
liquidation, creating a factory, or implying deployment authority.

The primary checkout contains pre-existing untracked material and remains
untouched. Ordinary Git HTTPS fetch timed out; the GitHub API confirmed the
remote `main` SHA above, and its tree exactly equals this isolated worktree's
starting tree. Any remote branch commit must use the current remote `main` as
its parent.

Named human review: after the assistant explicitly identified M2A-003 as the
next contract issue and restated the local-first/no-deployment boundary, the
IPO.ONE Founder directed “很好，继续” on 2026-08-22. This issue records that
direction as approval to implement and test only the exact L0 contract scope
below. It does not approve activation or any chain action.

## Scope

- Add one native, non-proxy `IpoOneSecuredPoolV1` with immutable chain, market,
  debt-token, collateral-token, oracle-interface, caps and role identities.
- Hold standard test tokens and maintain internal cash, LP shares, gross debt,
  debt shares, collateral and reserve-dust accounting using M2A-001 rounding.
- Implement supply, liquidity-valid withdrawal, full-share redemption,
  collateral deposit/release, capacity-valid borrow and exact/partial repay.
- Keep LP and debt shares internal and non-transferable; expose closed read
  quotes for accounting, positions, claims, debt and health.
- Admit only an immutable, read-only price interface. Enforce positive, valid,
  non-stale and non-future observations for borrow/release without selecting or
  implementing a live source.
- Add immutable pause-guardian and separate recovery-authority controls. Pause
  may only block cash outflow/new risk; supply, repay and add-collateral remain
  available.
- Use exact balance-delta checks, checks-effects-interactions and non-reentrancy
  for every token movement; reject native value.
- Emit a complete closed event set for later adapter normalization.
- Add Foundry unit, fuzz, stateful invariant, adversarial-token and privilege
  tests plus Node ABI/compiler parity checks and reproducible hashes.

## Non-goals

- A live or Base Sepolia oracle source, rate curve, time accrual, liquidation,
  bad-debt recognition/recovery, reserve application or commercial parameters.
- Factory, proxy, upgrade hook, multiple markets/assets, transferable LP/debt
  tokens, ERC-4626 surface, flash loan, callback, recursive leverage or
  unsecured fallback.
- Database, migration, indexer, adapter, Ledger/Obligation projection, UI,
  OpenAPI, SDK, MCP or browser behavior.
- RPC, wallet, signer, transaction, testnet call, contract deployment, source
  verification, public endpoint, mainnet, real assets or funds movement.
- Arbitrary administration, asset recovery/drain, cap increase, role rotation,
  oracle replacement or caller-supplied price.

## Likely files

- `contracts/src/m2/IpoOneSecuredPoolV1.sol`
- `contracts/src/m2/interfaces/IIpoOnePriceOracleV1.sol`
- `contracts/test/m2/IpoOneSecuredPoolV1.t.sol`
- `contracts/test/m2/IpoOneSecuredPoolInvariant.t.sol`
- `contracts/test/m2/mocks/*`
- `contracts/test/m2/secured-pool-abi.test.js`
- `contracts/abi/m2/IpoOneSecuredPoolV1.v1.json`
- `contracts/toolchain-manifest.v1.json` (direct `IERC20` import allowlist only;
  no dependency or version change)
- `contracts/README.md`
- `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`
- `docs/traceability/IPO_ONE_M2_REQUIREMENT_TRACEABILITY_v0.1.md`
- this issue record

## Acceptance criteria

1. Given a valid immutable one-market configuration, when the pool is
   constructed, then market/asset/oracle/cap/role identities cannot change and
   no factory, proxy, upgrade, arbitrary-call or asset-drain surface exists.
2. Given standard test tokens, when LPs supply, withdraw or fully redeem, then
   exact token deltas, cash, user shares, total shares and LP claim accounting
   follow M2A-001 floor/ceiling rules; insufficient cash/shares and zero-share
   mints revert atomically.
3. Given collateral and a valid current oracle quote, when a borrower borrows,
   repays or releases collateral, then debt shares, caps, cash and capacity
   remain conserved and no action can create unsecured exposure.
4. Given paused, stale/invalid/future-oracle, cap-exceeded, liquidity-exhausted,
   unauthorized, fee-token, reentrant or invalid-input conditions, when an
   affected action is attempted, then it reverts without partial accounting or
   token movement. Repay and add-collateral remain available while paused or
   without a usable price.
5. Given deterministic action sequences and checked-in fuzz/invariant seeds,
   when run repeatedly, then aggregate LP/debt shares reconcile, token balances
   cover internal custody, user claims do not exceed `C + D - R`, and no user
   iteration is required.
6. Given both pinned `solc` and Foundry compilation, when ABI and bytecode are
   compared, then the closed callable/event/error surface and build hashes are
   reproducible and no unapproved dependency import appears.

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

The focused Foundry and ABI suites must run twice. PostgreSQL, browser and
external-system tests are omitted only from the focused layer because this
issue changes no persistence, product interface or external system. Aggregate
repository gates remain required before merge.

## Security checklist

- [x] Constructor rejects zero, duplicate or wrong-chain market identities,
      invalid caps/LTV and overlapping privilege roles.
- [x] No proxy, delegatecall, arbitrary call, role rotation, cap increase,
      oracle replacement, token approval or administrative drain exists.
- [x] External token calls use `SafeERC20`, exact pre/post balance deltas,
      checks-effects-interactions and `ReentrancyGuard`.
- [x] Economic multiplication/division uses `Math.mulDiv` with named rounding;
      full repayment and redemption have exact terminal paths.
- [x] Borrow checks cash, market cap, borrower cap and current collateral
      capacity in the same atomic transaction.
- [x] Pause can only narrow outflow/new risk; repay and add-collateral stay open.
- [x] Unsupported native value, fee-on-transfer behavior, stale/invalid prices,
      zero-value actions and unauthorized control calls fail closed.
- [x] No user loop, PII, KYC, credential, private key, signature or off-chain
      policy data is introduced.
- [x] Contract events contain economic facts and opaque addresses only; they do
      not claim finality, reconciliation or canonical IPO.ONE Evidence.

## Permission boundary

Authorized mode: `L0_LOCAL_NO_FUNDS` contract source, local compilation and
local deterministic execution only. Permission/funds/deployment impact:
**none**. The Founder review recorded above grants no asset admission, account,
signer, RPC, transaction, testnet, deployment, public-access, mainnet,
real-value, custody, commercial-risk or production authority.

## Data, migration and rollback

There is no durable application data or database migration. The contract is
un-deployed. Rollback is a clean revert/removal of this isolated contract,
tests, ABI evidence and documentation updates. Existing deployed contracts and
the current product runtime remain unchanged.

## Required completion Evidence

- exact Foundry version/toolchain admission output;
- focused unit/fuzz/invariant/adversarial output from two identical runs;
- Node ABI and pinned-compiler parity output with ABI/creation/runtime hashes;
- full repository lint, typecheck, unit and production-dependency audit output;
- exact changed-file, privilege-surface and permission-boundary review;
- one issue-sized PR with required remote checks passing before merge; and
- a still-working local IPO.ONE product experience link, while truthfully
  stating this contract slice has no user-facing runtime surface.

Dependencies: ratified Constitution v1.3, accepted ADR-M2-001..005, completed
M2A-001 reference model and completed M2A-002 toolchain admission. M2A-004 and
all deployment work remain blocked until this issue is reviewed and merged.

## Completion Evidence

- Admitted toolchain: `forge 1.7.1` commit
  `4072e48705af9d93e3c0f6e29e93b5e9a40caed8`; Solidity
  `0.8.30+commit.73712a01`; dependency-integrity checker passed.
- Foundry focused result: 16/16 passed. The pool suite contains 12 unit/fuzz
  tests with 512 runs for each fuzz property. Two stateful invariants each ran
  128 runs at depth 64 (8,192 calls per invariant, 16,384 total) with zero
  unexpected reverts or discarded calls.
- Negative/recovery coverage includes invalid/wrong-chain/wrong-decimal
  construction, insufficient liquidity/capacity/caps, stale/zero/future price,
  pause/resume separation, fee-on-transfer input and output, reentrant callback,
  unauthorized control and native-value denial. Protective supply, repay and
  add-collateral behavior remains open as specified.
- Pinned solc and Foundry produced identical ABI, creation bytecode and runtime
  bytecode in repeated checks. Evidence hashes are creation
  `0xbd542afca168d7248de235cbb86a35d43fb12c51dabae2349e56f4bf16b92db0`
  and runtime
  `0x8aff64a2ccc86ffbe5786f6a1ca389bf3a58437e71e543f07abeaa76e08e3f1a`.
- Contract runtime size is 8,413 bytes and initcode size is 10,335 bytes, below
  the EVM limits with substantial margin. The handwritten pool source is 423
  lines and contains no factory, proxy, delegatecall, arbitrary-call, role-
  rotation, parameter-increase, token-approval or administrative-drain surface.
- Full repository unit result: 1,111/1,111 passed. Source/boundary lint,
  contract typecheck, product traceability, `git diff --check`, and production-
  dependency audit all passed; no known production vulnerability was reported.
- `pnpm-lock.yaml` and dependency versions are unchanged. The manifest change
  only admits the direct `IERC20` interface already transitively required by
  reviewed `SafeERC20`; the exact dependency checker passes.
- No database, migration, application runtime, RPC, signer, transaction,
  deployment, testnet or real-funds action occurred. The existing local
  no-funds product remains reachable at `http://127.0.0.1:8787/`; this contract
  issue adds no user-facing runtime surface and makes no deployment claim.
