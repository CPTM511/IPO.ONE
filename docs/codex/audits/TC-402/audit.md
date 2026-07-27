# TC-402 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T16:32:28Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The Founder accepted TC-401 and explicitly authorized continuation into
  TC-402.
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, live Hyperliquid write,
  mainnet action, payout, withdrawal, transfer, or funds movement was
  performed.
- Approval was applied only to the TC-402 contract, deterministic arithmetic,
  canonical local Ledger posting, offline fault injection, durable PostgreSQL
  tests, and protected simulation.
- No production pricing, real accounting/tax policy, live Testnet close,
  source account, signer, API Wallet, credential, payout authority, mainnet,
  deployment, or real-funds authority was supplied. Those paths remain
  unavailable and `UNVERIFIED`.
- Pre-change mapping:
  `docs/codex/audits/TC-402/pre-change-mapping.md`.

## Outcome

TC-402 implements a closed Testnet-labeled, simulation-only final settlement
control for one already flattened canonical Trading Facility. It binds the
accepted terms, TC-401 funding control, close request, canonical Obligation,
final reconciliation, and pre-settlement Ledger snapshot before accepting
economics.

Settlement cannot become ready unless source-fixed normalized Evidence proves:

- finality is `FINAL` and reconciliation is `RECONCILED`;
- positions are complete and final;
- open orders, exposure, unknown executions, and unrealized PnL are zero;
- final equity, realized PnL, venue costs, and closing costs are authoritative;
- the Facility, funding, close, Obligation, terms, reconciliation, and Ledger
  bindings have not drifted; and
- `capital + realized PnL - venue costs - closing costs = final equity`.

`UNKNOWN`, stale, incomplete, open-risk, or unreconciled input cannot release
settlement. Kernel or Evidence identity drift becomes an immutable incident.
The checked-in resolver and adapters are source-fixed, network-disabled, and
cannot close positions, submit Exchange actions, sign, pay, withdraw, or
transfer.

## Deterministic waterfall and fee result

The implemented waterfall:

1. returns Provider principal first, without creating a guarantee;
2. then returns Subject contribution, which makes Subject capital the
   first-loss layer;
3. exposes any Provider principal shortfall without creating a receivable;
4. applies fixed return with Actual/365 integer floor arithmetic;
5. applies performance participation only to positive realized income
   remaining after capital recovery;
6. applies the IPO.ONE percentage only to Provider realized gross income;
7. never applies a fee to principal or unrealized PnL; and
8. assigns minor-unit rounding residual to Subject profit.

Profit, Subject-first-loss, partial Provider recovery, zero-income, credit,
performance-participation, and hybrid vectors conserve every minor unit. The
non-zero test fee is a versioned source-fixed simulation input with
`productionPricingApproved=false`; it is not approved product pricing.

## Canonical Facility, Obligation, and Ledger

TC-402 does not relax or repurpose the accepted TC-104
`trading_settlement.v1` no-funds contract. Its 25-operation UI/SDK/MCP surface
and zero-PnL local semantics remain unchanged. TC-402 is a separate internal
Testnet control over the same Facility, Obligation, and Ledger.

One balanced canonical Ledger transaction records:

- Provider and Subject contributed capital;
- realized gain or realized loss;
- venue and closing costs;
- Provider principal and Subject contribution return;
- Provider fixed and performance income;
- Subject profit; and
- IPO.ONE fee income.

The PostgreSQL settlement command atomically commits the settlement control,
12 deterministic Ledger accounts, one balanced Ledger transaction and
entries, the existing Facility's `SETTLEMENT` transition, two domain Events
where applicable, Evidence envelopes, outbox messages, projection snapshots,
and the idempotent response. It creates no second Facility, Obligation, or
Ledger and performs no payout.

The TC-104/TC-402 PostgreSQL integration now exercises the TC-104 close request
and TC-402 durable final-settlement path together. The unchanged TC-104 domain,
handler, SDK, MCP, catalog, and presentation suites continue to cover the
accepted local no-funds contract.

## Revocable and supersedable Performance Evidence

Performance Evidence is privacy-minimized and append-only:

- initial issue creates version 1;
- revocation creates a new version that points to the exact prior Evidence
  hash;
- reissue/supersession creates another active version that points to the
  revoked hash;
- prior Events and Evidence envelopes are never updated or deleted;
- exact replay returns the stored revision without another Event; and
- application and physical PostgreSQL restart preserve the full revision
  chain.

Claims include the final reconciliation, zero exposure, balanced waterfall,
canonical Facility/Obligation/Ledger bindings, final equity, recovery,
shortfall, realized allocation, and fee. They explicitly deny a principal
guarantee, principal fee, unrealized-PnL fee, payout, official-report status,
universal-score status, strategy data, raw history, PII, secrets, production
authority, and funds authority.

## Contract, catalog, AuthZ, admission, and dependencies

- New closed contract:
  `schemas/v2/hyperliquid-testnet-settlement-record.schema.json`
- Settlement schema version:
  `hyperliquid_testnet_simulated_settlement.v1`
- Performance Evidence schema version:
  `hyperliquid_testnet_simulated_performance_evidence.v1`
- Fee-policy schema version:
  `hyperliquid_testnet_simulated_fee_policy.v1`
- New internal module:
  `modules/hyperliquid-settlement`
- New migration pair:
  `0038_trading_testnet_settlement`
- Trading Capital Tenant operation count: unchanged at 25.
- Total Tenant operation count: unchanged at 71.
- OpenAPI paths/operations: unchanged at 21/21.
- AuthZ capability or external actor change: none.
- Tenant admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser/MCP change: none.
- Runtime dependency change: none.

The module is not composed into a Tenant route, SDK, MCP, browser, signer,
API Wallet, live venue transport, payout service, or production runtime.

## Durable state and database controls

Migration 0038 adds only `trading_testnet_settlement_runs`. It includes:

- forced Tenant RLS and the existing Tenant-context write guard;
- Tenant-qualified foreign keys to Facility, TC-401 funding, close request,
  Obligation, Subject, and the final Ledger transaction;
- one settlement control per Facility and unique request/idempotency identity;
- a deferred Ledger foreign key so the settlement row and Ledger transaction
  can commit in the same transaction;
- database conservation of capital, realized PnL, costs, and final equity;
- database-enforced template, lifecycle, Evidence, and safety invariants;
- JSON/typed-column identity checks;
- immutable economic terms, source bindings, fee policy, and safety flags;
- version `+1`, monotonic observation/Evidence counters, and a closed state
  transition graph;
- terminal incident state and append-only Evidence revisions; and
- a down migration that refuses to drop the table while records exist.

Illegal economic mutation, identity mutation, version jump, transition,
deletion, inconsistent JSON/column state, and cross-Tenant read fail closed.

## Diff summary

Added:

- `modules/hyperliquid-settlement/src/index.js`
- `modules/hyperliquid-settlement/test/hyperliquid-settlement.test.js`
- `modules/hyperliquid-settlement/README.md`
- `schemas/v2/hyperliquid-testnet-settlement-record.schema.json`
- `db/migrations/0038_trading_testnet_settlement.up.sql`
- `db/migrations/0038_trading_testnet_settlement.down.sql`
- `docs/codex/audits/TC-402/pre-change-mapping.md`
- `docs/codex/audits/TC-402/audit.md`

Updated:

- schema and migration registries;
- production-bootstrap latest-migration expectation;
- PostgreSQL migration/RLS/restart/integration coverage; and
- the security source/contract/migration boundary suite.

No accepted production file was replaced, no operation/capability was added,
and no deployment or external state was changed.

## Test evidence

PASS:

1. TC-402 unit and simulated close:

   `npx -y node@24.18.0 --test modules/hyperliquid-settlement/test/hyperliquid-settlement.test.js`

   - 8/8 passed.
   - Covered profit, loss, partial recovery, zero income, all three templates,
     exact rounding, conservation, canonical balanced Ledger posting, unknown
     finality, stale/open/incomplete risk, binding incidents, Evidence
     issue/revoke/supersede/replay, and closed adapters.

2. PostgreSQL:

   `DATABASE_URL='postgresql://127.0.0.1:55439/ipo_one_tc402_test' npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres`

   - 75/75 passed.
   - Migration up/down/up passed for 38 ordered pairs.
   - TC-402 persisted one run, six settlement Events, six Evidence envelopes,
     six outbox messages, one inbox claim, and exactly one additional balanced
     Ledger transaction.
   - Forbidden mutation/deletion, RLS isolation, exact replay, application
     restart, Facility and Ledger projection verification passed.
   - PostgreSQL 17.10 was physically stopped and restarted.
   - The same 75/75 suite passed again on fresh database
     `ipo_one_tc402_restart_test` after process restart.

3. Security gate:

   `npx -y node@24.18.0 --test security/test/server-security.test.mjs security/test/approval-security.test.mjs security/test/abuse-security.test.mjs security/test/gateway-security.test.mjs`

   - 32/32 passed.
   - The TC-402 assertion covers finality, reconciliation, principal-safe fee
     basis, no guarantee/receivable/second kernel, forced RLS, immutable
     transitions, atomic core writes, no network/signer/secret path, and no
     payout/withdrawal/transfer/mainnet/production/funds authority.

4. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 72 schemas, 21 OpenAPI operations, 38 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web-bundle, and 533/533 repository tests passed.

5. `git diff --check`, JavaScript syntax checks, JSON Schema parsing, and
   migration static checks passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- The first settlement attempt incorrectly compared the prepare command's
  authorization/admission hashes with the separately authorized settlement
  command. The stages now retain independent command decisions; a privileged
  settle decision remains mandatory.
- The first Evidence replay derived a different internal reason from the
  already-updated state. Active Evidence command identity now excludes that
  state-derived label while an explicit revocation reason remains
  command-bound.
- The first security README assertion crossed a Markdown line break. The
  required non-readiness statement is now a single exact sentence.
- Initial fixture activation omitted the accepted Match Proposal and
  Obligation arguments; the fixture was corrected before durable work.
- Final self-review aligned TC-402 with the accepted TC-401 pattern by
  requiring a closed server-owned, Tenant-resolved, simulation-only guard
  profile and validating every returned decision before repository mutation.

## UNVERIFIED and prohibited

- Founder-controlled qualified Hyperliquid Testnet master/subaccount Facility
  and non-empty authoritative history.
- A real venue close/cancel/flatten transaction or finality observation.
- A source-fixed reviewed live Info/Exchange read adapter for final positions,
  equity, realized PnL, funding/venue fees, and closing costs.
- Real Exchange action bytes, a per-Facility API Wallet, signer, nonce,
  custody/HSM/KMS, rotation, revocation, emergency retirement, or pruning.
- Production fee, price, tax, loss-allocation, payout, servicing, accounting,
  or legal policy.
- Real Provider payment, Subject return, IPO.ONE fee collection, withdrawal,
  transfer, external settlement, or capital release.
- Live Tenant Gateway/AuthZ/admission composition and independent security
  review.
- Deployment, mainnet, production, real capital, or real funds.

No checked-in simulation, PostgreSQL test, clickable interface, or self-authored
audit statement is Evidence for an item above.

## Rollback

- With no TC-402 rows, apply
  `0038_trading_testnet_settlement.down.sql`, remove the internal module and
  closed schema, and revert only the TC-402 check/test registrations.
- If TC-402 rows exist, the down migration refuses the drop. Export and retain
  the immutable Event/Evidence/Ledger history, then use a separately reviewed
  data-disposition and compensating-accounting plan.
- Posted Ledger transactions are immutable and must never be deleted or
  rewritten; corrections require a separately approved compensating entry.
- No route, capability, deployment, signer, API Wallet, venue state, payout,
  or funds state needs rollback because none was changed.
- Accepted stacked changes from earlier tasks must remain untouched.

## Temporary PostgreSQL cleanup

The temporary PostgreSQL 17.10 process was stopped. Its exact directory was
moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc402-pg.5iNsxG`

It remains recoverable from the user's Trash. `pg_isready` reported no
response after shutdown.

## Artifact identities

- Pre-change mapping:
  `8d7f3014bf7ee83275d1de328e8de984e9ce81a252980edde538efeec215f261`
- Closed schema:
  `3fcf9ef9561f43d2b28042998f23cca43a7fd791a97aff08fd3cd2d2c86ccc03`
- Settlement module:
  `276f2fa60412aa778b5379f0d1a29bc6eb31bf782461d8556cf90030aed4170c`
- Module README:
  `26c7444824cb0418bcfc0ffbedc875d6f3fb8511020297156fae7d8bbc484e0a`
- Task tests:
  `2525c3d1dda685c99dd437a34b103e278b7a41761013b2b905341b47e3bc7f3b`
- Migration up:
  `8e111b58414ce1e39b32cadd44036b99b0cf6515b6ed73fd1ed03f4170b852cd`
- Migration down:
  `ca89662a9a4cddf004e89ee5743cafc434504f8ee5c8160ed872a680ab222e89`

## Next gate

TC-402 stops here with status `IMPLEMENTED_UNVERIFIED`.

TC-403 was not started. It remains
`BLOCKED_PENDING_HUMAN_APPROVAL_AND_INDEPENDENT_REVIEW`. Continuing would
still not authorize live Testnet Exchange writes, API Wallets, signers,
deployment, mainnet, payout, or funds.
