# M2A-008 — Exact Base Sepolia secured-pool deployment

Status: `PREFLIGHT_IMPLEMENTED — BLOCKED_NOT_COMPLETE`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY` after every named gate passes

Founder instruction: `好的，继续吧，同意授权并执行` on 2026-08-23

Base tree: `6fca7c43de5d73347ca306961bd7e1e8c622217d`

## Context

M2A-003 through M2A-007 provide the immutable Pool V1 contracts, deterministic
local accounting/oracle behavior, finalized-effect indexing and reconciliation,
canonical Obligation/Evidence integration, and Human/Agent/Risk product
surfaces. They do not prove a deployed, reachable or user-verified live pool.

This issue owns one exact Base Sepolia deployment. The Founder instruction is
the Release/Founder intent to continue this issue; it does not replace the
independent Security review, exact Risk/role decision, enabled launch-policy
revision, fresh signer lifecycle, or immutable gate Evidence required by the
checked-in policy.

The currently admitted read-only dependency candidates are:

- chain: Base Sepolia (`eip155:84532`);
- collateral: Base Sepolia WETH9
  `0x4200000000000000000000000000000000000006`;
- debt asset: Circle Base Sepolia test USDC
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`;
- feed candidate: Chainlink Base Sepolia ETH/USD proxy
  `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`.

Addresses discovered from official provider documentation remain candidates
until the exact launch profile, approval Evidence and two-RPC preflight bind
them. Test assets have no real-world value.

## Scope

- Define one closed, schema-validated exact-deployment decision binding the
  release SHA, chain, assets, feed, one-use deployment signer, starting nonce,
  deterministic adapter/pool addresses, pause/recovery roles, debt caps, LTV,
  oracle source, gas/faucet caps, launch Evidence hash and approval window.
- Run deterministic Foundry/Node and fork checks against that exact input.
- Verify WETH, test USDC and feed code/metadata/observation through two
  independent read-only RPCs before signing.
- Deploy exactly one native immutable `IpoOnePriceOracleAdapterV1` followed by
  exactly one native immutable `IpoOneSecuredPoolV1`, with zero native value.
- Re-read runtime bytecode, constructor-bound configuration and roles, verify
  sources, wait for approved finality, bootstrap the existing indexer and
  record zero-discrepancy reconciliation.
- Destroy the fresh deployer credential after the exact run and preserve a
  no-reuse tombstone. The logically destroyed CHAIN-001D signer is never
  reused or funded.
- Run visible-click Human/LP/Risk acceptance against the exact deployed SHA
  and keep transaction maturity and test-asset status truthful.

## Non-goals

- No mainnet, real funds, Human cash lending, production/Vercel change, KYC or
  private data.
- No second pool, market factory, proxy, upgrade path, second collateral/debt
  asset or dynamic market creation.
- No Agent venue write, Hyperliquid action, arbitrary transfer/withdrawal,
  custody, token/DAO or commercial risk parameter.
- No invented approval, self-review, reused signer, environment private key,
  frontend mock, hardcoded success or historical transaction presented as a
  current-user record.

## Likely files

- `schemas/v2/m2a-008-exact-deployment-decision.schema.json`
- `deploy/testnet/m2a-008-secured-pool-preflight.mjs`
- focused preflight, fork and deployment tests under `deploy/testnet/test/`
- a private ignored `deploy/approvals/*.local.json` launch Evidence record
- `deploy/launch-policy.v1.json` only through a separately reviewed exact
  profile/enabling change
- exact deployment, finality, source-verification and reconciliation Evidence
  under `artifacts/testnet/` after a successful run
- this task, M2 execution plan and requirement traceability status

## Acceptance criteria

1. The exact decision is a bounded mode-0600 strict JSON file below
   `/private/tmp/ipo-one-m2a-008/`; it rejects extra keys, stale approval,
   wrong SHA/chain/asset/feed, role overlap, nonce/address drift, enlarged caps,
   signer reuse, mainnet or real-funds authority.
2. The checked-in `live_testnet_secured_pool` profile is enabled by a reviewed
   policy change, has one complete exact profile, and its 13 named gates are
   approved by current immutable Evidence. Evidence cannot self-enable it.
3. The exact release passes dependency provenance, Foundry unit/fuzz/invariant,
   independent contract review, fork dry run, repository quality and secret/
   PII scans.
4. Two distinct RPCs agree on chain ID, admitted code hashes, token decimals,
   oracle round/value/time and the deployer nonce. The feed is positive,
   complete and no older than 3,600 seconds at signing time.
5. A newly created M2A-008-only signer has exactly the approved faucet balance,
   starting nonce and gas budget. The old CHAIN-001D signer and every unrelated
   credential are rejected.
6. Exactly two zero-value deployment transactions occur in order: oracle
   adapter, then pool. Their sender, nonce, input, receipt, predicted address
   and safe/finalized observation match the decision.
7. Runtime reads prove one market, immutable WETH/test-USDC/oracle, exact caps,
   LTV and distinct pause/recovery roles; runtime bytecode/configuration hashes
   match the enabled exact profile.
8. The source explorer is verified, the existing indexer reaches approved
   finality, two-read reconciliation reports zero discrepancy, and refresh/
   restart/replay preserves the same state.
9. Visible browser clicks on the exact deployed SHA prove the LP, Human and
   Risk/Ops journeys without hidden IDs or fake completion. Agent read/review
   parity remains versioned; Agent submission remains out of scope.
10. The fresh signer is destroyed and tombstoned after success or terminal
    failure. Pause/disable/reconcile is the rollback posture.

## Test commands

```text
pnpm run check:m2-contract-toolchain
pnpm run test:contracts:foundry
pnpm run test:m2a008:preflight
pnpm run testnet:m2a008:inspect
pnpm run testnet:m2a008:fork:dry-run
pnpm run test:indexer:reorg
pnpm run test:postgres
pnpm run test:browser:click-path
pnpm run check
git diff --check
```

The inspect command is read-only discovery. Passing it is necessary but does
not approve the RPCs, risk values, roles, signer or deployment.

## Security and permission checklist

- [x] Preflight contains no signing, wallet-client, transaction-broadcast or
  mainnet primitive.
- [x] Exact decision schema binds two zero-native-value deployments and denies
  mainnet/real funds.
- [x] Expected adapter and pool addresses derive from the approved deployer and
  consecutive starting nonces.
- [x] Pause/recovery identities must be distinct from each other, the deployer,
  contracts, assets and feed.
- [x] Faucet and total-gas hard ceilings fail closed before signing.
- [x] Read-only dependency inspection requires two distinct RPCs and compares
  code hashes, metadata and oracle round truth.
- [x] Decision files must be strict, bounded, regular, non-symlink mode-0600
  files in the isolated M2A-008 directory.
- [ ] Constitution/ADR, independent contract review, exact asset/oracle, Risk
  caps/roles, signer lifecycle, recovery, browser and release gates have current
  immutable owner Evidence.
- [ ] The exact launch-policy profile is complete and enabled.
- [ ] A fresh approved deployer and durable pause/recovery accounts exist.

## Current preflight result — 2026-08-23

Read-only observations from `sepolia.base.org` and
`base-sepolia-rpc.publicnode.com` agreed on chain `84532`, WETH 18 decimals,
Circle test USDC 6 decimals, Chainlink feed 8 decimals, positive round data and
the exact code hashes. This is dependency discovery only.

Live execution remains `BLOCKED — NOT COMPLETE` because the checked-in launch
profile is disabled with `exactProfile: null`; no exact Risk/cap/role decision,
independent contract-review Evidence, 13-gate private launch Evidence, durable
pause/recovery accounts or fresh one-use signer is present. No transaction was
signed or broadcast and no funds moved.

The deterministic fork dry run passes 1/1 against Base Sepolia. The focused
preflight suite passes 6/6; Foundry local tests pass 25 with the explicit fork
case skipped outside its fork command; indexer/reconciliation passes 15/15;
security passes 34/34; transport passes 84/84; a clean isolated PostgreSQL run
passes 90/90; and the aggregate unit/contract suite passes 1145/1145. Schema,
launch-policy, toolchain/provenance, lint, type, migration, Web-bundle and
production dependency checks pass. These results prove deployability and
fail-closed preparation, not deployment authorization or product completion.

## Migration and rollback

No migration is added by preflight. A successful run may use only the already
approved M2A-005/M2A-006 additive database set. Rollback pauses new risk,
disables the exact profile, stops ingestion, reconciles both RPCs, preserves all
chain/Evidence history and rebuilds projections. A failed or uncertain
transaction is never blindly retried; it enters read-only reconciliation.

## Completion Evidence

Completion requires the contract addresses, creation/runtime/configuration
hashes, two deployment transaction hashes, receipts, finality observations,
source-verification URLs, exact gate approvals, signer tombstone, indexer and
zero-discrepancy receipts, exact deployed SHA and visible-click browser
captures. Until every item exists, the only truthful verdict is
`BLOCKED — NOT COMPLETE`.
