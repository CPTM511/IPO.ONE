# TC-301 audit

Status: `IMPLEMENTED_UNVERIFIED`

Completed at: `2026-07-25T12:58:55.193Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, Exchange write, mainnet action,
  or funds movement was performed.
- The Founder accepted TC-203 as `IMPLEMENTED_UNVERIFIED`, deferred the real
  master/subaccount, non-empty history, and Exchange E2E, and approved TC-301
  code, offline tests, and simulated integration only.
- Real Hyperliquid Testnet Exchange writes, API Wallets, live signers,
  mainnet, and real funds remain prohibited until a new human approval.
- Pre-change mapping:
  `docs/codex/audits/TC-301/pre-change-mapping.md`.

## Outcome

TC-301 adds a protected **simulation-only** model of the Hyperliquid Testnet
execution writer:

- one fixed profile for
  `POST https://api.hyperliquid-testnet.xyz/exchange`;
- no `fetch`, environment-secret, URL, origin, path, proxy, private-key,
  API-Wallet, or raw-action input surface;
- positive typed construction of `order`, `reduceOnlyOrder`, `cancel`,
  `cancelByCloid`, and `modify`;
- deterministic 128-bit client order IDs;
- a server binding resolver, fail-closed policy decision, reduce-only proof,
  and kill switch;
- an isolated signer port with no key import/export/reveal/registration or
  address-selection method;
- an offline signer with no key material and a network-disabled simulated
  transport;
- monotonic per-signer nonce reservation, bounded retry, idempotent replay,
  and terminal `UNKNOWN` handling;
- in-memory restart modeling and a Tenant-scoped PostgreSQL repository;
- immutable hash-only execution records and ordered transition history.

Every successful simulation says:

- `simulationOnly=true`;
- `externalSystemQueried=false`;
- `externalOrderSubmitted=false`;
- `reconciled=true`;
- no withdrawal, transfer, account administration, mainnet, production, or
  funds authority; and
- no raw action, raw response, reusable signature, PII, or secret persisted.

The fixed two-day past/one-day future nonce window, unique signer nonce, and
no-reuse behavior follow the official
[Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
constraints. The action shapes and `expiresAfter` field are constrained around
the official
[Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint).
Actual signing bytes remain unimplemented because official
[signing](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing)
conformance and a real custody technology require a later approval.

## Contract, catalog, AuthZ, admission, and dependencies

- New closed contract:
  `schemas/v2/hyperliquid-testnet-execution-record.schema.json`.
- Schema version:
  `hyperliquid_testnet_simulated_execution_record.v1`.
- New internal module:
  `modules/hyperliquid-execution`.
- New migration pair:
  `0034_trading_testnet_execution`.
- Trading Capital Tenant operation count: unchanged at 25.
- Total Tenant operation count: unchanged at 71.
- OpenAPI paths/operations: unchanged at 21/21.
- AuthZ capability or actor change: none.
- Admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser change: none.
- Runtime dependency change: none.
- Real-account address, raw Tenant authority, live signer, network transport,
  and capital-limit configuration: none.

The internal writer is not connected to a Tenant, SDK, MCP, browser, or
strategy success path. This is deliberate under the current no-live-write
gate. A live success path must not be added merely by swapping the simulated
ports; it needs a separately reviewed Tenant/AuthZ/admission/Event/Evidence/
outbox/reconciliation design and approval.

## Durable state and recovery

Migration 0034 adds:

1. `trading_execution_nonce_heads`
   - one hash-only simulated signer reference per Facility;
   - monotonic nonce and version;
   - no live signer, approved API Wallet, or exportable key.
2. `trading_testnet_execution_records`
   - unique Tenant idempotency identity;
   - unique `(Tenant, signer reference, nonce)`;
   - immutable request, Facility, Order Intent, policy, action, and authority
     bindings;
   - only legal `RESERVED -> SUBMITTED -> terminal` transitions, plus local
     `RESERVED -> REJECTED`;
   - `UNKNOWN` terminal and not retryable.
3. `trading_testnet_execution_transitions`
   - append-only ordered sequence 1 through 3;
   - unique execution/state and execution/sequence;
   - hash-only result linkage.

All three tables use forced RLS, the existing Tenant context write guard, and
Tenant-qualified foreign keys. Deletion, nonce rollback/reuse, immutable-field
mutation, terminal-state mutation, cross-Tenant reads, and transition
rewrites fail closed.

## Test evidence

PASS:

1. Task-specific action, signer, nonce, replay, recovery, and secret tests:

   `npx -y node@24.18.0 --test modules/hyperliquid-execution/test/hyperliquid-execution-gateway.test.js`

   - 10/10 passed.
   - All five allowed action shapes completed as simulations.
   - 22 named forbidden/unknown action types and open/raw mutations were
     rejected before nonce reservation.
   - 100 concurrent in-memory requests received unique monotonic nonces.
   - Exact replay produced one submission; conflicting idempotency reuse was
     rejected.
   - `UNKNOWN` survived repository restart and was not retried.
   - Signer failure consumed the nonce and persisted a local rejection.
   - Durable snapshots contained no signature, private key, seed, mnemonic,
     raw response, or raw account address.

2. Security gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security`

   - 28/28 passed.
   - Includes fixed Testnet profile, exact action allowlist, unchanged
     25-operation Trading Capital catalog, closed authority flags, RLS,
     nonce/idempotency uniqueness, append-only transitions, and no network or
     environment-secret access.

3. PostgreSQL:

   `DATABASE_URL='postgresql://cptmao@localhost:55445/ipo_one_tc301_test?host=%2Fprivate%2Ftmp%2Fipo-one-tc301-pg.WAAZwi%2Fsocket' npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres`

   - 75/75 passed.
   - Migration up/down/up passed for 34 ordered pairs.
   - One durable test wrote 21 simulated execution records and 63 immutable
     ordered transitions behind one nonce head.
   - Twenty concurrent PostgreSQL requests received unique monotonic nonces.
   - Repository restart returned the exact idempotent result without a second
     submission.
   - Mutation, deletion, and cross-Tenant visibility tests failed closed.
   - PostgreSQL 17.10 was physically stopped and restarted on a Unix socket;
     `pg_isready` reported accepting connections and 75/75 passed again.

4. Contract and migration checks:

   - `pnpm run check:schemas`: 68/68 contracts passed.
   - `pnpm run check:migrations`: 34 ordered up/down pairs passed.

5. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 68 schemas, 21 OpenAPI operations, 34 migration pairs,
     deploy, launch, approval, abuse, operations, 71-operation Tenant
     protocol, product traceability, web-bundle, and 498/498 repository tests
     passed.

6. `git diff --check`, JavaScript syntax, and JSON parsing passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- The first strict AJV compile required explicit object types on conditional
  property branches; the schema was corrected before the task test passed.
- The migration checker required a contiguous down-migration function-drop
  token; the down migration was corrected.
- The first PostgreSQL run exposed one stale expected latest migration and
  serializable `40001` exhaustion under 20-way nonce contention. The test
  baseline now expects 0034, and the execution repository adds a bounded
  retry around the existing serializable Tenant transaction. PostgreSQL then
  passed 75/75 twice, including after physical restart.
- TC-104 failed only as a cascade after the initial TC-103 concurrency
  interruption; it passed once the TC-301 nonce contention issue was fixed.

## UNVERIFIED and prohibited

- Founder-controlled qualified master/subaccount, non-empty history, and the
  deferred TC-203 real-account E2E.
- A real per-Facility Hyperliquid API Wallet.
- API Wallet registration, rotation, revocation, emergency retirement, or
  pruning behavior.
- A selected HSM/KMS/non-exportable custody product and its independent proof
  that key export is impossible.
- Official Hyperliquid signing bytes, SDK conformance, and reusable-signature
  lifecycle.
- Real Hyperliquid Testnet order/cancel/modify/reduce-only execution and
  external-result reconciliation.
- Approved global, Facility, market, action, exposure, leverage, price, size,
  loss, and rate caps.
- Live Tenant Gateway/AuthZ/admission/Event/Evidence/outbox integration.
- Independent security review and acceptance of TC-301.
- Deployment, mainnet, production, real capital, or real funds.

No checked-in simulation, unit test, PostgreSQL test, or clickable interface is
evidence for any item above.

## Temporary PostgreSQL cleanup

The loopback-disabled, Unix-socket-only PostgreSQL 17.10 process was stopped.
Its exact temporary directory was moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc301-pg.WAAZwi`

It remains recoverable from the user's Trash. `pg_isready` reports no response
after shutdown.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `docs/codex/audits/TC-301/pre-change-mapping.md` | `3a6f5295711dbe6b152dcca3ea519d659d94537623e88a8468f673144090eb0d` |
| `schemas/v2/hyperliquid-testnet-execution-record.schema.json` | `74d96791a0fbafcb84e911cb67db70317805cba007b3805097f3f94695a902ad` |
| `modules/hyperliquid-execution/src/index.js` | `fae0c8b6b5ae149db1cd66e4bd1afd6a758cc94fb9d7d7a7553e816c89ec402b` |
| `modules/hyperliquid-execution/README.md` | `998bbbfd2f55eff7e2f32c18ae28cfdd912c613a3db4ea0f7ebbf0aaf70d4496` |
| `modules/hyperliquid-execution/test/hyperliquid-execution-gateway.test.js` | `03cdcc3d5470839dab12347e8b0fecf4a457e5af852a162302d19f2a1fbf88fb` |
| `db/migrations/0034_trading_testnet_execution.up.sql` | `a6a642cfaabb68754dcd0529471b2d76caec1779d77f9220b392d32607637604` |
| `db/migrations/0034_trading_testnet_execution.down.sql` | `e111edd399406353d5a679479ae27b81ee8e0dc9807786edcde08070bde5ce23` |

Hashes above include the final ordered-transition hardening.

## Rollback

No shared database or external system was changed.

For an environment with no TC-301 rows, roll back only migration 0034, remove
the new execution module/contract/tests/audit, and revert the specific schema,
migration, security, and PostgreSQL-test registration hunks.

If execution rows exist in any isolated test database, the down migration
refuses deletion. Preserve the rows, review them, and use a separately
approved forward migration or explicitly destroy only the disposable test
database.

Because this worktree contains accepted stacked tasks, never use a broad reset
or checkout as rollback.

## Next task gate

TC-301 stops here at `IMPLEMENTED_UNVERIFIED`.

No successor is started. Any live Testnet Exchange write, API Wallet, signer,
deployment, mainnet, or real-funds step remains
`BLOCKED_PENDING_NEW_HUMAN_APPROVAL_AND_INDEPENDENT_REVIEW`.
