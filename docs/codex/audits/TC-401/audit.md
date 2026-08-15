# TC-401 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T15:33:22Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The Founder accepted TC-303 and approved continuation into TC-401.
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, live Hyperliquid write,
  mainnet action, or funds movement was performed.
- The approval was applied to the TC-401 contract, code, offline fault
  injection, durable PostgreSQL/reorg/restart tests, and protected
  non-redeemable simulation only.
- No exact live Provider account, Subject/Trader Agent account, Facility
  destination, asset/cap package, API Wallet, signer, bridge/deposit path, or
  external transaction was provided. Those paths remain unavailable and
  `UNVERIFIED`.
- Pre-change mapping:
  `docs/codex/audits/TC-401/pre-change-mapping.md`.

## Outcome

TC-401 implements a closed Testnet-labeled, simulation-only funding-control
boundary. It derives exact non-redeemable Subject first-loss and Provider
principal contribution requirements from one existing canonical
`trading_facility.v1`, reconciles finalized receipt Evidence, and releases the
existing Facility activation only after all gates pass.

The implementation proves:

- one funding control per existing canonical Facility;
- exact asset, amount, contributor role, and segregated destination matching;
- commutative Provider/Subject contribution order;
- duplicate receipt delivery as an economic no-op;
- explicit reorg invalidation of the exact prior receipt;
- mandatory fresh replacement Evidence after reorg;
- wrong destination, asset, amount, finality, freshness, role, cap, or binding
  failure closed;
- hash-only separation of Facility destination, master account, withdrawal
  authority, and execution signer reference;
- fresh `NORMAL` risk plus current AuthZ/admission immediately before
  activation;
- atomic funding-control and canonical Facility activation in PostgreSQL; and
- exact replay after application and physical PostgreSQL restart without a
  second receipt read or activation.

The checked-in adapter is source-fixed, network-disabled, and unable to submit
value. It has no `fetch`, RPC, live transport, signer, API Wallet, arbitrary
action, withdrawal, transfer, or address input.

## Shared Facility, Obligation, and Ledger boundary

TC-401 does not create a second Facility. The funding control has a
Tenant-qualified foreign key and a unique `(tenant_id, facility_id)` binding
to the existing `trading_facilities` projection.

It does not create a second Obligation kernel or Ledger and does not invent an
external-balance posting policy. Every record binds:

- the existing Facility ID/hash/state/version and immutable bilateral terms;
- the existing executed, non-withdrawable canonical Obligation;
- the current canonical Ledger state hash and transaction count; and
- a fresh risk snapshot and server-owned account-separation hashes.

Ledger or kernel drift becomes an immutable incident and never activates the
Facility. The record fixes `ledgerMutationCreated=false`,
`secondFacilityCreated=false`, `secondLedgerCreated=false`,
`traderWalletPassThrough=false`, and
`traderWithdrawalAuthority=false`.

Only `ACTIVE` may set `canonicalFacilityMutationCreated=true`. PostgreSQL
activation calls the accepted domain `activateTradingFacility` transition
through `PostgresCoreRepository` and commits the funding control, Facility,
Events, Evidence, outbox, and command response in one Tenant-scoped
serializable transaction.

## Receipt, reorg, and recovery contract

The control accepts only:

- `FINALIZED_CONTRIBUTION`; and
- `REORG_INVALIDATION`.

Every normalized receipt is claimed through the existing durable inbox.
Projection update, Event, Evidence envelope, and outbox write commit
atomically. Replaying the same receipt cannot duplicate contribution balance,
processed count, Event, Evidence, outbox, or activation.

A reorg invalidation must name the exact previously accepted receipt hash for
the same role. It removes that contribution from the reconciled total and
returns the control to an awaiting state. Readiness is restored only by a new
finalized receipt with a different transaction identity. Unknown or mismatched
reorg Evidence fails closed as an incident.

The PostgreSQL scenario persisted:

- one funding control;
- six funding-control Events;
- six Evidence envelopes;
- six outbox messages; and
- four inbox claims.

Those counts cover prepare, Subject receipt, original Provider receipt,
Provider reorg invalidation, replacement Provider receipt, and activation.
Restart replay returned the exact `ACTIVE` record and Facility with zero
receipt-adapter calls.

## Contract, catalog, AuthZ, admission, and dependencies

- New closed contract:
  `schemas/v2/hyperliquid-testnet-facility-funding-record.schema.json`.
- Schema version:
  `hyperliquid_testnet_simulated_facility_funding.v1`.
- New internal module:
  `modules/hyperliquid-facility-funding`.
- New migration pair:
  `0037_trading_testnet_facility_funding`.
- Trading Capital Tenant operation count: unchanged at 25.
- Total Tenant operation count: unchanged at 71.
- OpenAPI paths/operations: unchanged at 21/21.
- AuthZ capability or external actor change: none.
- Tenant admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser/MCP change: none.
- Runtime dependency change: none.

The module is not composed into a Tenant route, SDK, MCP, browser, live signer,
API Wallet, venue transport, strategy, or production runtime.

## Durable state and database controls

Migration 0037 adds only
`trading_testnet_facility_funding_controls`. It includes:

- forced Tenant RLS and the existing Tenant-context write guard;
- Tenant-qualified foreign keys to Facility, Obligation, and Subject;
- one control per Facility and unique request/idempotency identities;
- exact amount reconciliation and maximum-cap checks;
- database-enforced separation of destination, master, withdrawal, and signer
  authority hashes;
- JSON/typed-column identity checks, including nullable receipt and activation
  evidence fields;
- a closed monotonic state-transition graph;
- immutable identity, kernel, safety, and authority bindings;
- terminal `ACTIVE` and `INCIDENT` states; and
- a down migration that refuses to drop the table while records exist.

Illegal mutation, deletion, cross-Tenant reads, authority collision, cap
overflow, and inconsistent JSON/column state fail closed.

## Test evidence

PASS:

1. TC-301/302/303/401 focused regression:

   `npx -y node@24.18.0 --test modules/hyperliquid-execution/test/hyperliquid-execution-gateway.test.js modules/hyperliquid-risk-guardian/test/hyperliquid-risk-guardian.test.js modules/hyperliquid-reconciliation/test/hyperliquid-reconciliation.test.js modules/hyperliquid-facility-funding/test/hyperliquid-facility-funding.test.js`

   - 37/37 passed.
   - TC-401 contributes 11 tests, including three nested wrong
     destination/asset/amount cases.
   - Exact activation, contribution ordering, replay, duplicate delivery,
     reorg replacement, restart, fresh risk, kernel/Ledger drift, cap,
     authority separation, closed adapter, and no-live-port assertions passed.

2. PostgreSQL:

   `DATABASE_URL='postgresql://cptmao@localhost:55438/ipo_one_test_tc401_clean?host=/private/tmp/ipo-one-tc401-pg.mlQ3bi/socket' npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres`

   - 75/75 passed.
   - Migration up/down/up passed for 37 ordered pairs.
   - Subject and Provider receipts reached `READY`; Provider reorg returned the
     control to `AWAITING_PROVIDER`; a fresh Repository and replacement receipt
     restored `READY`; activation atomically advanced both the control and
     canonical Facility.
   - Exact Event/Evidence/outbox/inbox counts, terminal replay, forbidden
     mutation/deletion, and cross-Tenant RLS isolation passed.
   - PostgreSQL 17.10 was physically stopped and restarted.
   - The same 75/75 suite passed again on fresh database
     `ipo_one_test_tc401_restart` after process restart.

3. Security gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`

   - 31/31 passed.
   - The TC-401 assertion covers exact non-redeemable contributions, forced
     RLS, guarded transitions, authority separation, one canonical Facility,
     no Ledger mutation, no live transport, no raw address/signature/secret,
     and no withdrawal/transfer/mainnet/production/funds authority.

4. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 71 schemas, 21 OpenAPI operations, 37 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web-bundle, and 525/525 repository tests passed.

5. `git diff --check`, JavaScript syntax, and JSON Schema parsing passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- Receipt-array normalization originally passed the JavaScript array index as
  record-validation options. The callback now passes only each receipt.
- A stale-risk fixture accidentally regenerated another Facility. It now
  mutates only the original Facility's risk snapshot.
- A no-address source assertion matched the safe field
  `reusableSignaturePersisted`. The assertion now targets raw address-shaped
  values instead of unrelated identifier text.
- The first fresh PostgreSQL verification returned 71/75 because the new
  Tenant-owned table was present in the expected RLS list at the wrong
  alphabetical position. That first assertion stopped cleanup and caused
  three downstream Tenant foreign-key failures. The list was reordered; two
  fresh-database runs, including the physical-restart run, then passed 75/75.
- Nullable receipt and activation hashes were added to the database
  JSON/typed-column identity constraint before final verification.

## UNVERIFIED and prohibited

- Founder-controlled qualified Hyperliquid Testnet Provider and
  Subject/Trader Agent accounts.
- Exact master/subaccount/Facility destination/withdrawal-authority binding.
- Exact live asset and per-Facility Provider/Subject/total contribution caps.
- A real source-chain transfer, bridge/deposit route, transaction, finality
  depth, reorg window, or source-fixed live read adapter.
- Live Provider and Subject contribution receipts or external Facility
  balance.
- A real per-Facility Hyperliquid API Wallet.
- API Wallet registration, rotation, revocation, emergency retirement, or
  pruning.
- Official signing bytes, real live signer, and selected
  HSM/KMS/non-exportable custody.
- Real Hyperliquid Testnet contribution submission or Facility activation.
- A reviewed canonical Ledger posting policy for real external balances,
  fees, PnL, or settlement.
- Live Tenant Gateway/AuthZ/admission composition and independent security
  review.
- Deployment, mainnet, production, real capital, or real funds.

No checked-in simulation, PostgreSQL test, clickable interface, or audit
statement is evidence for an item above.

## Rollback

- With no TC-401 rows, apply
  `0037_trading_testnet_facility_funding.down.sql`, remove the internal module
  and closed schema, and revert only the TC-401 test/check registrations.
- If TC-401 rows exist, the down migration refuses the drop. Export and retain
  the immutable Event/Evidence history, then use a separately reviewed data
  disposition plan.
- No external route, capability, deployment, signer, API Wallet, venue state,
  or funds state needs rollback because none was changed.
- Accepted stacked changes from earlier tasks must remain untouched.

## Temporary PostgreSQL cleanup

The temporary PostgreSQL 17.10 process was stopped. Its exact directory was
moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc401-pg.mlQ3bi`

It remains recoverable from the user's Trash. `pg_isready` reported no
response after shutdown.

## Artifact identities

- Pre-change mapping:
  `b505eb0bb95e4b4fe0a76984479236a1ffa5fb1bab5c77bb40f1390af14d2ae8`
- Closed schema:
  `31ad62fb848509f5cbfa7dff3219076e1ebbfc3fc3ea64e451ab391a1be667a6`
- Facility-funding module:
  `9f9aa8bc001a205ca782c6e1d52363a981eb3ca2daf6daabf5c7fc3a12ba8bf6`
- Module README:
  `61ea94ccff94e286182db41b18a958cc219af18fca0cc21e243f767e723ecd88`
- Task tests:
  `98be39c986add70fc9171d354badce6f5a77df9870264cb51cceb9416db6dcaa`
- Migration up:
  `dd9fbbef6fef5df03174cfec4fac45293facc69debc156b374e1d6b3ca5bb8a8`
- Migration down:
  `5f7e381e26e19dcd7461ad9845c13c80756b7214fdae446557d924885974b51d`

## Next gate

TC-401 stops here with status `IMPLEMENTED_UNVERIFIED`.

TC-402 was not started. It remains
`BLOCKED_PENDING_HUMAN_APPROVAL_AND_INDEPENDENT_REVIEW`. A continuation
instruction cannot authorize live Testnet contributions, Exchange writes, API
Wallets, signers, deployment, mainnet, or funds.
