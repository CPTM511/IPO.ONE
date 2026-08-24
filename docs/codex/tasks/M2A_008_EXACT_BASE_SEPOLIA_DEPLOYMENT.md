# M2A-008 — Exact Base Sepolia secured-pool deployment

Status: `ADAPTER AND POOL DEPLOYED — FINALITY / GATE E IN PROGRESS`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY` after every named gate passes

Founder instruction: `好的，继续吧，同意授权并执行` on 2026-08-23

Base tree: `6fca7c43de5d73347ca306961bd7e1e8c622217d`

## Context

M2A-003 through M2A-007 provide the immutable Pool V1 contracts, deterministic
local accounting/oracle behavior, finalized-effect indexing and reconciliation,
canonical Obligation/Evidence integration, and Human/Agent/Risk product
surfaces. They do not prove a deployed, reachable or user-verified live pool.

This issue owns one exact Base Sepolia deployment. The Founder instruction is
the Release/Founder authority for this test-assets-only run. Policy v1.2.0 uses
five staged technical gates and does not require Independent Security Evidence
for this first engineering deployment. Independent review remains mandatory for
mainnet/real value. The exact roles, enabled profile, fresh signer lifecycle and
current pre-deployment Evidence remain required.

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
   exact-profile change and has five effective gates: A-C pre-deployment, D
   runtime-enforced and E post-deployment. Evidence cannot self-enable it.
3. The exact release passes dependency provenance, Foundry unit/fuzz/invariant,
   fork dry run, repository quality, security and secret/PII scans. Independent
   review is optional additional testnet assurance.
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
- [x] The testnet role custody contract permits one Founder controller while
  requiring distinct addresses and distinct private keys; no key material is
  included or requested.
- [x] Mainnet/real-value profiles retain an Independent Security hard gate.
- [ ] Gates A-C have current exact release, configuration and signer Evidence.
- [ ] Gate D deployment and Gate E reconciliation/browser Evidence exist.
- [ ] The exact launch-policy profile is complete and enabled.
- [ ] A fresh approved deployer and the two public pause/recovery addresses exist.

## Current preflight result — 2026-08-23

Read-only observations from `sepolia.base.org` and
`base-sepolia-rpc.publicnode.com` agreed on chain `84532`, WETH 18 decimals,
Circle test USDC 6 decimals, Chainlink feed 8 decimals, positive round data and
the exact code hashes. This is dependency discovery only.

Live execution remains `BLOCKED — NOT COMPLETE` because the checked-in launch
profile is disabled with `exactProfile: null`; the two Founder-controlled public
role addresses have not been supplied, so the exact decision, Gates A-C Evidence
and fresh one-use signer do not yet exist. Independent contract review is not a
testnet blocker. No transaction was signed or broadcast and no funds moved.

The deterministic fork dry run passes 1/1 against Base Sepolia. The focused
preflight/runner suite passes 13/13; Foundry local tests pass 25 with the explicit fork
case skipped outside its fork command; indexer/reconciliation passes 15/15;
security passes 34/34; transport passes 84/84; a clean isolated PostgreSQL run
passes 90/90; browser visible-click acceptance passes 6/6; and the aggregate
unit/contract suite passes 1155/1155. Schema,
launch-policy, toolchain/provenance, lint, type, migration, Web-bundle and
production dependency checks pass. These results prove deployability and
fail-closed preparation, not deployment authorization or product completion.

## Continued execution — 2026-08-23

The Founder explicitly authorized Codex to continue and finish the M2A-008
scope. `docs/codex/audits/M2A-008/founder-release-risk-decision.md` records the
approved test-only boundary and conservative limits without pretending that a
Founder decision is Independent Security Evidence.

The closed live runner now:

- requires the exact SHA, decision file and byte-for-byte private Launch
  Evidence hash;
- requires the enabled exact launch profile and Gates A-C before signing;
- enforces Gate D during the two-transaction run and leaves Gate E explicitly
  pending until final reconciliation and product acceptance;
- rechecks two RPCs, exact signer address, exact balance, nonce, empty predicted
  addresses, gas ceiling and admitted dependencies before signing;
- encodes exactly one adapter and one pool deployment with zero native value;
- journals each returned transaction hash before waiting and never blindly
  retries an uncertain transaction;
- verifies transaction input, sender, nonce, receipt, deterministic address,
  two-RPC finality, runtime bytecode and every immutable pool parameter;
- destroys the one-use signer after success or any terminal post-attempt
  failure; and
- provides a separate read-only reconciliation command with no wallet,
  signing, broadcast or key-read primitive.

The decision schema now binds the exact observed starting signer balance in
addition to the faucet ceiling, fixing a gap between the written acceptance
criterion and executable preflight.

Independent review remains genuinely absent and is not claimed. Its optional
assurance packet remains at
`docs/security/M2A_008_INDEPENDENT_CONTRACT_REVIEW_HANDOFF.md`; the same class of
review remains mandatory before mainnet or real value. No signer was
provisioned, no exact profile was enabled, no transaction was signed or
broadcast and no funds moved.

After Founder review confirmation, M2A-008 also has a closed independent-review
attestation schema, fail-closed pending template and one verifier that binds the
named reviewer, independent capacity, exact release SHA, current contract source
hashes, compiler profile, findings, validity window, immutable report URL and
the report's bytes. This produces deterministic optional assurance without
treating Founder or Codex review as Independent Security Evidence.

The Founder-directed testnet governance correction is recorded in
`docs/codex/audits/M2A-008/testnet-gate-governance-correction.md`. With that
correction applied, the only unavoidable Founder-supplied inputs are the two
public role addresses; every other preparation item is derived or generated by
Codex from the final exact release.

## First exact-run incident — 2026-08-24

The first exact runner attempt broadcast only the nonce-0 Adapter deployment.
Transaction
`0xc85f96568d602084ec6efd4678422e3923d8d84285f1b0263f4e506189d2169d`
succeeded at the predicted Adapter address
`0x1B6e2D641d783792aB03e11C8E56Fc381e6000aF`; both RPCs observed the admitted
runtime hash
`0x1e6df0c6c6e5f479e2b0bb8fa4f7856b99dbbec171fe3159b3a2539b9ac17d80`.
No Pool transaction was created or broadcast.

The runner concurrently requested the transaction and waited for its receipt.
The transaction request returned the still-pending representation before the
receipt completed, so the receipt binding compared a null transaction block to
the mined receipt and failed closed. The runner then destroyed the one-use
signer as designed. The successful Adapter is therefore an isolated testnet
artifact, not the active Pool oracle and not M2A-008 completion. Evidence is
recorded in
`artifacts/testnet/eip155-84532-m2a-008-partial-adapter-20260824-001.json`.

The retry fix waits for a mined receipt before re-reading and binding the
transaction. A fresh one-use signer produces new deterministic Adapter/Pool
addresses, a new configuration hash and a new exact policy approval reference.
The retry must pass PR and post-merge CI, receive fresh private Gate A-C
Evidence and exact funding before any further transaction.

## Second exact-run incident — 2026-08-24

The retry Adapter transaction
`0xc5fa651f93e0b186eb9e01a7d3ef44feae73b1dad40770ad132414c00e2f3013`
succeeded at
`0xA67DDDEA7DF4b084cE70B0c87C16621664C4fb98`; both RPCs later agreed on
the exact sender, nonce, zero value, calldata, block, receipt and admitted
runtime hash. No Pool transaction was sent and the second one-use signer was
destroyed.

The first fix removed the original concurrent receipt/transaction read, but a
single transaction re-read could still return pending block metadata briefly
after the same RPC returned the mined receipt. The corrected runner now polls
only the read-only transaction observation for bounded mined block metadata
before applying the exact binding. It does not sign or broadcast during that
poll. Evidence is recorded in
`artifacts/testnet/eip155-84532-m2a-008-partial-adapter-20260824-002.json`.

A third fresh signer and deterministic profile are separately CI-gated. Both
prior signers remain destroyed and neither partial Adapter is reused.

## Migration and rollback

No migration is added by preflight. A successful run may use only the already
approved M2A-005/M2A-006 additive database set. Rollback pauses new risk,
disables the exact profile, stops ingestion, reconciles both RPCs, preserves all
chain/Evidence history and rebuilds projections. A failed or uncertain
transaction is never blindly retried; it enters read-only reconciliation.

## Pool recovery execution — 2026-08-24

Policy v1.3.3 retained the finalized immutable Adapter from the third partial
run and admitted one fresh nonce-zero signer for exactly one missing Pool
creation. Both RPCs observed the exact `0.0005 ETH` starting gas balance,
empty predicted Pool address, decision-bound calldata and zero native value.

Pool transaction
`0x90d67e7732f752bcf13dd4278ea6ca3263f715d75766f2b497d997b07fd3d9e3`
succeeded in block `45908863` at
`0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`. Both RPCs agreed on the
sender, nonce, calldata, receipt, block hash and Pool runtime bytecode hash
`0xd65ee592be35018f33af1e2a538ead22f15e1bb577e84583645cb76bf768a198`.
The fresh Pool signer was logically destroyed.

The primary RPC continued to expose a transient transaction representation
outside the original 30-second binding window, so the live runner failed
closed after the already-successful transaction. No retry or second Pool
transaction occurred. Recovery is read-only: the bounded observation window
is extended to five minutes and a key-free two-RPC reconciliation command
waits for finality, verifies both historical Adapter and Pool transactions,
re-reads finalized runtime/configuration, and writes the recovery Evidence.
Gate E remains open until finality, indexer/restart/replay, explorer and visible
product acceptance are complete.

## Completion Evidence

Completion requires the contract addresses, creation/runtime/configuration
hashes, two deployment transaction hashes, receipts, finality observations,
source-verification URLs, exact gate approvals, signer tombstone, indexer and
zero-discrepancy receipts, exact deployed SHA and visible-click browser
captures. Until every item exists, the only truthful verdict is
`BLOCKED — NOT COMPLETE`.
