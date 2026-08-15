# TC-303 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T14:35:34Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The Founder accepted TC-302 and explicitly authorized TC-303.
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, live Exchange write, mainnet
  action, or funds movement was performed.
- This authorization was applied to code, offline fault injection, durable
  restart tests, and protected simulation E2E only.
- Pre-change mapping:
  `docs/codex/audits/TC-303/pre-change-mapping.md`.

## Outcome

TC-303 implements a closed, simulation-only reconciliation and recovery
boundary over the accepted TC-301 execution gateway and TC-302 Risk Guardian.
It proves consistency across:

- normal terminal reconciliation;
- duplicate observation delivery;
- cumulative partial fills;
- partial-fill/cancel races;
- an execution whose historical nonce state is `UNKNOWN`;
- adapter timeout, outage, bounded poll exhaustion, and circuit opening;
- application and PostgreSQL restart;
- contradictory, stale, incomplete, regressing, or overfilled observations;
- Ledger, Facility, order, execution, nonce, authorization, admission, signer,
  account, obligation, subject, and risk binding drift; and
- authorization/admission-gated manual safe stop.

The implementation adds:

- a closed reconciliation record with
  `PENDING`, `PARTIAL`, `UNKNOWN`, `RECONCILED`, `REJECTED`, `INCIDENT`, and
  `SAFE_STOPPED` states;
- a source-fixed, network-disabled scripted venue-observation adapter;
- deterministic observation identities derived from Evidence hashes;
- cumulative fill-size and fill-notional cursors;
- bounded polling and circuit-breaker configuration;
- one reconciliation projection per execution;
- a PostgreSQL repository using the existing serializable command, Event,
  Evidence, outbox, and inbox runtime; and
- immutable incident Evidence for every contradiction or binding drift.

`UNKNOWN` is never presented as success and never triggers an automatic
resend. A later fresh, complete, binding venue observation may reconcile the
economic outcome, but cannot rewrite the historical execution nonce state.
Terminal restart replay performs no adapter call, signer call, external write,
Facility mutation, Ledger mutation, or risk recovery.

## Accounting and shared-kernel boundary

TC-303 does not invent a posting policy for simulated fills, venue PnL, fees,
or settlement. The cumulative fill cursor is explicitly:

- non-Ledger;
- non-authorizing;
- simulation-only; and
- usable only to prevent duplicate economic/order application.

Every record binds the current canonical Ledger and Facility hashes. A binding
change becomes an incident and retains the last accepted cursor. No second
Ledger, second Obligation kernel, Facility mutation, synthetic profit, or
automatic risk recovery was introduced.

## Contract, catalog, AuthZ, admission, and dependencies

- New closed contract:
  `schemas/v2/hyperliquid-testnet-reconciliation-record.schema.json`.
- Schema version:
  `hyperliquid_testnet_simulated_reconciliation_record.v1`.
- New internal module:
  `modules/hyperliquid-reconciliation`.
- New migration pair:
  `0036_trading_testnet_reconciliation_recovery`.
- Trading Capital Tenant operation count: unchanged at 25.
- Total Tenant operation count: unchanged at 71.
- OpenAPI paths/operations: unchanged at 21/21.
- AuthZ capability or external actor change: none.
- Tenant admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser/MCP change: none.
- Runtime dependency change: none.

The module accepts only server-owned simulated authorization and admission
bindings. It is not connected to a Tenant route, SDK, MCP, browser, live
signer, API Wallet, venue transport, strategy, or production composition.

## Durable state and recovery

Migration 0036 adds only
`trading_testnet_reconciliation_runs`. The table has:

- forced Tenant RLS and the existing Tenant-context write guard;
- Tenant-qualified foreign keys to execution, Facility, and order;
- one reconciliation run per execution;
- unique Tenant idempotency;
- immutable identity, kernel, and safety bindings;
- a guarded closed state-transition graph;
- durable cursor, polling, circuit, incident, and terminal-result fields; and
- a down migration that refuses to drop the table while records exist.

The generic command/Event/Evidence/outbox/inbox tables remain the only durable
transition and delivery log. TC-303 does not create a second event store,
Evidence store, outbox, or inbox.

Each accepted observation is claimed through the existing durable inbox. Its
projection update, Event, Evidence envelope, and outbox row commit atomically
inside the existing Tenant-scoped serializable transaction. Duplicate Evidence
therefore cannot duplicate the cursor, Event, Evidence, outbox, order state, or
economic state.

PostgreSQL restart verification covered:

1. terminal reconciliation followed by a fresh repository/service instance;
2. durable `UNKNOWN` after adapter outage and poll exhaustion;
3. a physical PostgreSQL stop and restart;
4. a fresh binding observation after restart; and
5. exact rebuild with the historical execution nonce state still `UNKNOWN`.

The terminal case used two Events, two Evidence envelopes, two outbox rows,
and one inbox claim. The recovered `UNKNOWN` case used four Events, four
Evidence envelopes, four outbox rows, and three inbox claims. Across the two
runs the database contained six Events/Evidence/outbox rows and four inbox
claims, with no duplicates and no terminal-replay adapter call.

## Test evidence

PASS:

1. Task-specific TC-303 tests:

   `npx -y node@24.18.0 --test modules/hyperliquid-reconciliation/test/hyperliquid-reconciliation.test.js`

   - 8/8 passed.
   - Normal reconciliation, duplicate partial/cancel delivery, durable
     `UNKNOWN` recovery, bounded outage and circuit opening, manual safe stop,
     kernel/risk drift incidents, cursor contradiction, and the protected
     normal/reduce-only/flatten/recovery simulation E2E passed.
   - Live-capable configuration, network transport, unbounded polling, and
     open record shapes failed closed.

2. TC-301/302/303 focused regression:

   `npx -y node@24.18.0 --test modules/hyperliquid-execution/test/hyperliquid-execution-gateway.test.js modules/hyperliquid-risk-guardian/test/hyperliquid-risk-guardian.test.js modules/hyperliquid-reconciliation/test/hyperliquid-reconciliation.test.js`

   - 26/26 passed.

3. Security gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`

   - 30/30 passed.
   - Includes unchanged catalog counts, simulation-only schema flags, no
     network/secret/signer/API-Wallet authority, no Ledger posting or Facility
     mutation, forced RLS, immutable bindings, legal transitions, and
     no-withdrawal/transfer/mainnet/production/funds assertions.

4. PostgreSQL:

   `DATABASE_URL='postgresql://postgres@localhost:55437/ipo_one_tc303_test?host=/private/tmp/ipo-one-tc303-pg.IQwxuv/socket' npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres`

   - 75/75 passed.
   - Migration up/down/up passed for 36 ordered pairs.
   - Terminal replay performed zero adapter calls.
   - Durable `UNKNOWN` survived service and physical database restart and
     reconciled only from fresh binding Evidence, without resend or nonce
     rewrite.
   - Immutable-field mutation, illegal transition, deletion, and cross-Tenant
     reads failed closed.
   - PostgreSQL 17.10 was physically stopped and restarted; 75/75 passed again
     on a fresh database after restart.

5. Contract and migration checks:

   - `pnpm run check:schemas`: 70/70 contracts passed.
   - `pnpm run check:migrations`: 36 ordered up/down pairs passed.

6. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 70 schemas, 21 OpenAPI operations, 36 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web-bundle, and 514/514 repository tests passed.

7. `git diff --check`, JavaScript syntax, and JSON Schema parsing passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- The first PostgreSQL run passed 72/75. A terminal service restart returned
  the original idempotent command response in `PENDING` rather than loading
  the current durable projection. That caused one unnecessary adapter read,
  although it did not duplicate an Event, fill, or economic state.
- The PostgreSQL repository now resolves a replayed start command to the exact
  current projection. Fresh-database, physical-restart, and durable-`UNKNOWN`
  reruns all passed 75/75.
- The first new security assertion split a required phrase across lines. The
  assertion wording was corrected without weakening the check.

## UNVERIFIED and prohibited

- Founder-controlled qualified Hyperliquid Testnet master/subaccount,
  non-empty history, and the deferred TC-203 real-account E2E.
- A real per-Facility Hyperliquid API Wallet.
- API Wallet registration, rotation, revocation, emergency retirement, or
  pruning behavior.
- A selected HSM/KMS/non-exportable custody product and independent
  non-exportability evidence.
- Official signing bytes and a real live signer.
- Real Hyperliquid Testnet order submission, timeout, partial fill,
  cancellation race, reduce-only action, flattening, and post-action Info
  reconciliation.
- Production polling, timeout, circuit-breaker, risk, price, size, leverage,
  liquidation, loss, exposure, fee, or accounting policy values.
- A reviewed Ledger posting policy for a real venue fill, fee, PnL, or
  settlement.
- Live Tenant Gateway/AuthZ/admission/Event/Evidence/outbox composition.
- Independent security review and human acceptance of TC-303.
- Deployment, mainnet, production, real capital, or real funds.

No checked-in simulation, unit test, PostgreSQL test, clickable interface, or
audit statement is evidence for an item above.

## Rollback

- With no TC-303 rows, apply
  `0036_trading_testnet_reconciliation_recovery.down.sql`, remove the internal
  module and closed schema, and revert only the TC-303 test/check
  registrations.
- If TC-303 rows exist, the down migration refuses the drop. Export and retain
  the immutable Event/Evidence history, then use a separately reviewed data
  disposition plan.
- No external route, capability, deployment, signer, API Wallet, or venue
  state needs rollback because none was changed.
- Accepted stacked changes from earlier tasks must remain untouched.

## Temporary PostgreSQL cleanup

The temporary PostgreSQL 17.10 process was stopped. Its exact directory was
moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc303-pg.IQwxuv`

It remains recoverable from the user's Trash. `pg_isready` reported no
response after shutdown.

## Artifact identities

- Pre-change mapping:
  `8ef535bbea6307a0bf54f962c006e325b70c4919d60de6022c2a34e5a5ee9743`
- Closed schema:
  `a7dc9a136d74107244dbbac5008cffe49bac07a00d6d991b54101326ca2fbc20`
- Reconciliation module:
  `61035a27c0d45657e9eeb44c04cf84f9331b7fd41ca39c3ff892f83344fc7bed`
- Module README:
  `b78747bb743327f07077b67aa1c1d1abbca3c3911aa4a555a7eb6deca216a3a1`
- Task tests:
  `52d8db7b6170d7fa1eb835759ae9b34a305011333e4ebbaa30635d6fda49dfa3`
- Migration up:
  `fc3f6fb36747339722de3b1765fe9295f41f171a413a41d9d15badfa7e616b34`
- Migration down:
  `e21f65afd6f887c1e2b7da8fa8a1ea04704be09725787791f8acc915ce8841ea`

## Next gate

TC-303 stops here with status `IMPLEMENTED_UNVERIFIED`.

TC-401 was not started. It remains
`BLOCKED_PENDING_HUMAN_APPROVAL_AND_INDEPENDENT_REVIEW`. A continuation
instruction cannot authorize live Testnet Exchange writes, API Wallets,
signers, deployment, mainnet, or funds.
