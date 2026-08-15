# TC-301 pre-change mapping

Recorded before TC-301 implementation on
`codex/commercial-access-release` at source identity
`de5e72d5a912d2d55c2ce86570408f37c07d4a4f`.

## Human gate in force

The Founder accepted TC-203 as `IMPLEMENTED_UNVERIFIED`, deferred the real
master/subaccount, non-empty history, and Hyperliquid Testnet Exchange E2E
until a qualified test account is available, and unlocked TC-301 code,
offline tests, and simulated integration.

This gate does **not** authorize:

- a real Hyperliquid Testnet Exchange write;
- creating, importing, registering, rotating, or using an API Wallet;
- a live signer, reusable signature, private key, seed, or credential;
- mainnet, production, deployment, or real-funds activity.

The implementation must therefore fail closed outside an explicitly injected
simulation boundary. A later human approval is required before adding live
signer custody or live Exchange transport.

## Runtime truth

- The closed Tenant catalog exposes exactly 25 Trading Capital operations.
  `tradingSubmitOrderIntent` and `tradingCancelOrderIntent` are already
  authorized, admitted, idempotent, transaction-bound operations.
- The current `trading_order_intent.v1` is intentionally synthetic. It contains
  direction and synthetic notional but no venue, market, price, size, time in
  force, client order ID, nonce, signature, or Exchange result.
- The current Facility, Obligation, Ledger, Event, Evidence, outbox, and
  reconciliation paths do not contain a Hyperliquid write plane.
- TC-201/202 provide a fixed, signer-free
  `POST https://api.hyperliquid-testnet.xyz/info` read plane. That adapter
  deliberately has no `/exchange`, signer, credential, or funds authority and
  must remain unchanged.
- No approved per-Facility API Wallet, signer reference, live signing
  technology, numeric execution cap, or live transport is present.

## Contract and module decision

- Preserve the exact 25-operation Tenant catalog and current AuthZ/admission
  mappings. Do not reinterpret the synthetic Order Intent as proof that an
  external order was submitted.
- Add one versioned, closed execution-record contract. It binds an execution
  request to existing Facility and Order Intent hashes and permits only typed
  `order`, `cancel`, `cancelByCloid`, `modify`, and server-proven
  reduce-only order shapes.
- Reject unknown fields, raw action JSON, caller-selected URL/origin/path,
  caller-selected signer/account/Tenant, and all transfer, withdrawal,
  approval, administration, leverage, margin, staking, vault, TWAP, deployer,
  validator, reward, abstraction, or unknown action types.
- Add an isolated writer module with:
  - a source-fixed Hyperliquid Testnet Exchange profile;
  - positive typed action construction;
  - an explicit kill switch and fail-closed policy decision;
  - deterministic 128-bit client order IDs;
  - an injected signer port that can return a signature but can never export a
    key;
  - an injected transport port that cannot accept a URL or arbitrary body;
  - a durable nonce repository contract and a simulation-only in-memory
    implementation for offline/concurrency/restart-model tests;
  - terminal `CONFIRMED`, `REJECTED`, or `UNKNOWN` outcomes, with `UNKNOWN`
    never automatically retried.
- The default runtime composition will have neither a signer nor an Exchange
  transport. Only a test-owned simulation capability can enable the offline
  pipeline. Simulation results must say that no external system was queried,
  no external order was submitted, no signature is reusable, and no funds or
  production authority exists.
- Add a PostgreSQL migration for append-only/hash-only execution and nonce
  state. It is code only in this task: no shared database is migrated. The
  schema must enforce Tenant isolation, unique nonce per signer reference,
  unique idempotency/action identity, legal state transitions, no deletion,
  and no raw action, raw response, raw address, raw signature, or secret
  persistence.

## Expected files

- `schemas/v2/hyperliquid-testnet-execution-record.schema.json`
- `modules/hyperliquid-execution/**`
- `db/migrations/0034_trading_testnet_execution.{up,down}.sql`
- affected schema, migration, security, module, and PostgreSQL tests
- `docs/codex/audits/TC-301/audit.md`

## Verification classification

Offline allowlist/denylist, nonce concurrency/replay, unknown-outcome,
kill-switch, simulated order/cancel/modify/reduce-only, restart-model, schema,
migration, security, and secret/log review can be `PASS`.

The non-exportable real signer, per-Facility real API Wallet lifecycle, real
Hyperliquid signing bytes, live Testnet order/cancel E2E, external
reconciliation, deployment, independent security review, mainnet, production,
and real funds remain `UNVERIFIED` or prohibited.
