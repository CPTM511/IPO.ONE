# TC-203 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T11:40:18.161Z`

## Source identity and scope

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The worktree contains the accepted stacked task implementation and remains
  intentionally uncommitted. No commit, push, deployment, credential
  provisioning, signer, Exchange action, mainnet action, or funds movement was
  performed.
- The Founder accepted TC-202 at `IMPLEMENTED_UNVERIFIED`, deferred the
  Founder-controlled non-empty Hyperliquid Testnet account E2E into TC-203
  integration evidence, and unlocked TC-203 only.
- Pre-change mapping:
  `docs/codex/audits/TC-203/pre-change-mapping.md`.

## Outcome

TC-203 adds a deterministic, versioned, point-in-time
`trading_real_factor_scorecard.v2` branch to the existing finalized real
Evidence lifecycle. It preserves the exact 25 Trading Capital operations and
uses the existing `tradingFinalizeEvidenceSnapshot` command; no new success
action or permission was added.

The nested `trading_real_shadow_risk_profile.v1` publishes:

- observed, hash-linked descriptive metrics for net realized PnL, net return on
  traded notional, positive realized fill rate, fees/traded notional, market
  count, traded notional, withdrawable/account value, current positions, and
  current open orders;
- explicit `insufficient`, `unknown`, or `stale` states for risk-adjusted
  return, maximum drawdown, tail loss, current leverage, liquidation
  discipline, strategy capacity, regime stability, sample-out, tail stress,
  and drift monitoring when the approved Info Evidence cannot prove them;
- immutable observation-window, Evidence-snapshot, history, policy and feature
  definition linkage;
- `authorizing=false`, `economicStateMutation=false`,
  `newRiskAuthority=false`, `fundsAuthority=false`, `modelOutput=false`, and
  `recommendationOnly=true`.

No weights, cutoffs, grades, approved max-age, drift thresholds, limit,
leverage, pricing, credit decision, recovery rule, or production score was
invented. The existing v1 scorecard remains readable; newly finalized real
Evidence receives v2.

## Contract, catalog, AuthZ and admission

- Updated closed contract:
  `schemas/v2/trading-real-credit-profile.schema.json`.
- Updated typed declarations:
  `packages/api-contract/index.d.ts`.
- Catalog change: none.
- Trading Capital operation count: unchanged at 25/25.
- Total Tenant operation count: unchanged at 71.
- AuthZ capability or actor change: none.
- Admission/quota change: none.
- Approval-policy change: none.
- Funds authority: unchanged at false.
- Migration: none. The existing JSON projection and migration 0033 accept the
  backward-readable nested scorecard branch.

The product traceability manifest now separates:

1. the local authorized Tenant mutation that persists the hash-only Evidence
   profile; and
2. the signer-free `REAL_TESTNET_READ` adapter action with no Tenant mutation.

This removed the stale claim that the v2 runtime used only a synthetic fixture.
The manifest explicitly records that Founder-controlled non-empty account E2E
is still unverified.

## Atomicity and economic non-mutation

Finalization still plans exactly:

- one `trading_credit_profile` aggregate Event;
- one `TRADING_CREDIT_PROFILE` projection write;
- the existing Evidence envelope and outbox through the serializable command
  boundary; and
- the existing authorization-resource version transition.

It does not write a Facility, Ledger, Obligation, Order Intent, Settlement,
capital request, price, limit, or transfer. Read-time safety checks reject an
authorizing or incorrectly relinked Shadow Risk profile.

## Test evidence

PASS:

1. Golden, stress, sample-out, time-travel, fixture-comparison and tamper tests:

   `npx -y node@24.18.0 --test packages/domain/test/trading-capital-real-evidence.test.js modules/tenant-command-gateway/test/trading-capital-evidence-handlers.test.js packages/api-contract/test/trading-credit-profile-contract.test.js`

   - 13/13 passed.
   - Golden vector included `24.25` net realized PnL,
     `0.00484951504849515` net return/traded-notional proxy,
     `0.00024997500249975` fee ratio, and
     `0.749875062468765617` current withdrawable ratio.
   - Fixture comparison applied no threshold and performed no decision.
   - Generation before imported/observed Evidence failed closed.
   - Regeneration at a later time preserved the exact Evidence-linked feature
     vector and hash.

2. Closed schema:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check:schemas`

   - 67/67 contracts passed.

3. Security:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security`

   - 27/27 passed.
   - Includes an exact TC-203 check for point-in-time, non-economic,
     threshold-free output and an unchanged 25-operation Trading Capital
     catalog.

4. PostgreSQL:

   `DATABASE_URL='postgresql://cptmao@localhost:55443/ipo_one_tc203_test?host=%2Fprivate%2Ftmp%2Fipo-one-tc203-pg.YyX7Aw%2Fsocket' npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres`

   - 75/75 passed against PostgreSQL 17.
   - The durable TC-202/203 test proves the v2 scorecard and its 16-feature
     Shadow Risk profile survive persistence/repository restart, remain
     non-authorizing, replay exactly, and are invalidated by rebinding.
   - PostgreSQL was then physically stopped and restarted. `pg_isready`
     reported accepting connections, and the same 75/75 gate passed again.

5. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 67 schemas, 21 OpenAPI paths, 33 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web bundle, and 488/488 repository tests passed.
   - Product traceability now reports 66 actions, including one
     `REAL_TESTNET_READ` adapter action.

6. `git diff --check` and JSON parsing of both changed JSON documents passed.

FAIL:

- None remaining.

Resolved intermediate failure:

- The first traceability edit classified the four Tenant operations directly
  as `REAL_TESTNET_READ`. The checker correctly rejected that because this
  classification cannot claim a Tenant mutation and must name a
  `testnet_read_adapter`. The manifest was split into one local authorized
  persistence action and one no-mutation Testnet adapter action; the gate then
  passed.

## UNVERIFIED

- A Founder-controlled Hyperliquid Testnet master ownership signature.
- A verified Founder-controlled master/subaccount pair with non-empty account
  history.
- A complete real-account import/finalize/read E2E and comparison of its output
  against the checked-in synthetic golden vector.
- Independent review and acceptance of TC-203.
- Drawdown, tail, leverage, liquidation, transfer, funding, counterparty,
  wallet-cluster, self-transfer, wash-trading, capacity, regime and drift
  claims that the approved Info Evidence cannot prove. Runtime output labels
  each such state explicitly instead of estimating it.
- API-wallet signing, Exchange actions, Testnet orders, reduce-only/flatten,
  Facility execution, mainnet, production, custody, capital, and real funds.

The earlier zero-address live reachability result proves only that the fixed
Testnet Info endpoint was reachable. It is not ownership, relationship,
non-empty account-history, or Shadow Risk E2E Evidence.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `schemas/v2/trading-real-credit-profile.schema.json` | `97e651a4d82c2c53f9ddc20f2624f3df15c4ea7eea45f675c107b5c7942ae5f7` |
| `packages/domain/src/trading-capital-real-evidence.js` | `d23dd49c88efd34e7b69d276d6768db36ce774e1cefb98e98aaecfcaf22025b4` |
| `packages/api-contract/index.d.ts` | `28810ff310c889bac444afa9320a1cb6ac7cecbe138284008e7aa8e2deb55d99` |
| `packages/domain/test/trading-capital-real-evidence.test.js` | `016e3e6c877c36f43d699c489e437bf581bebf0133d4cc1a8aafc674c9b9ce14` |
| `modules/tenant-command-gateway/test/trading-capital-evidence-handlers.test.js` | `ca9e321125dff18732b4ce786324beb4346497e9606877d4fd5193839303f3f7` |
| `modules/persistence/test-postgres/postgres-event-runtime.test.mjs` | `f4c22416867e7165a3478e1644f784aa0817805d449667bcbd4f7fc6578446ec` |
| `security/test/gateway-security.test.mjs` | `8d6c8fe5e6d53cb33a5d4762baddcc6e3fb80822a9115487757dd12d0da10ba6` |
| `product/traceability/ipo-one.v9-product-traceability.v1.json` | `5702203a5e576cca4fc1ecc15ac34275942c204eb63be053124450722652b01c` |
| `docs/codex/audits/TC-203/pre-change-mapping.md` | `555291084f600e6c483fdcb8e332f63c68de3d1eaab8fb4349b3c541ec841bf2` |

## Temporary PostgreSQL cleanup

The loopback-only PostgreSQL process was stopped. Its exact temporary directory
was moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc203-pg.YyX7Aw`

It remains recoverable from the user's Trash.

## Rollback

No production deployment, shared database, migration, credential, external
write, or funds state changed.

For an environment with no v2 scorecard rows, remove only the TC-203 nested
contract, calculation, declarations, tests, security assertion and traceability
hunks, then rerun the complete gates.

If any environment already contains `trading_real_factor_scorecard.v2`, do not
delete or rewrite the immutable Evidence. Keep the v2 reader branch, disable
new finalization at ingress if necessary, review the incident, and prepare a
separately approved forward-compatible change.

Because this worktree contains accepted stacked tasks, never use a broad reset
or checkout as rollback.

## Next task gate

TC-203 stops here at `IMPLEMENTED_UNVERIFIED`.

TC-301 is
`BLOCKED_PENDING_TC_203_REVIEW_AND_FOUNDER_LIVE_ACCOUNT_E2E`.

Before TC-301 can be considered, a human-controlled session must supply the
approved one-use ownership signature and exact Founder-controlled Testnet
master/subaccount pair, then produce independently reviewed non-empty
import/finalize/read Evidence. That gate still does not itself approve an API
wallet, signer, Exchange action, order, deployment, mainnet, production, or
funds.
