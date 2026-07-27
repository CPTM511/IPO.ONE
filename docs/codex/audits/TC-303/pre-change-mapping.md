# TC-303 pre-change mapping

Prepared: 2026-07-25

## Source and gate

- Branch: `codex/commercial-access-release`.
- Package baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`.
- The accepted stacked worktree is intentionally uncommitted and is preserved.
- TC-302 has been accepted by the Founder. This unlocks the TC-303 review gate
  for code, offline failure injection, durable restart tests, and protected
  simulation E2E only.
- The current instruction does not approve a live Hyperliquid key, API Wallet,
  Testnet Exchange write, external signer, deployment, mainnet, or funds
  movement. TC-303 must stop before TC-401.

## Existing truth

1. `modules/hyperliquid-execution` owns the closed five-action simulated writer,
   deterministic client order IDs, durable signer-scoped nonce reservation,
   idempotency, and terminal `UNKNOWN`. It has no network or live signer.
2. `modules/hyperliquid-risk-guardian` owns the offline monotonic
   `NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT` enforcement
   model. It cannot restore risk automatically or contact the venue.
3. `trading_facilities` and `trading_order_intents` remain the canonical
   no-funds Facility/order projections. They are linked to the one canonical
   Obligation and explicitly state `secondLedgerCreated=false`.
4. The canonical Event Repository already provides Tenant-scoped serializable
   commands, idempotency, immutable domain Events, Evidence envelopes, durable
   outbox, and exactly-once inbox processing. TC-303 should reuse these tables
   rather than create a second Event/Evidence/outbox/inbox runtime.
5. The shared Ledger is append-only and balanced. No accepted policy defines a
   Ledger posting for simulated Hyperliquid fills, venue PnL, fees, or
   settlement. TC-303 therefore verifies and binds the canonical Ledger
   snapshot but must not invent a posting, second ledger, synthetic profit, or
   accounting policy.
6. The current Hyperliquid execution record marks its transport result as an
   offline simulation. A later venue observation may reconcile an externally
   ambiguous outcome, but it must not rewrite the historical nonce state or
   resubmit an uncertain action.

## Change boundary

TC-303 will add one closed versioned reconciliation record and one internal
simulation-only reconciliation worker boundary. The worker will:

- require server-owned authorization, admission, Facility, order, Ledger, risk,
  execution, and nonce snapshot hashes;
- consume only closed normalized venue observations through a narrow
  network-disabled adapter;
- use cumulative fill cursors so duplicate delivery and cancel/fill races
  cannot double-apply order or economic state;
- keep the cumulative fill cursor explicitly non-Ledger and non-authorizing;
- process every observation through the existing durable inbox and commit the
  projection, Event, Evidence, and existing outbox atomically;
- preserve `UNKNOWN` until fresh, complete, binding venue Evidence proves a
  terminal outcome;
- bound poll attempts, open a circuit breaker on repeated adapter failures or
  contradictions, and provide an authorization/admission-gated manual safe
  stop; and
- rebuild from PostgreSQL without a resend, signer call, Facility mutation, or
  Ledger mutation.

No Tenant protocol operation, OpenAPI route, SDK/MCP/browser action, AuthZ
capability, admission quota, production composition, dependency, endpoint, or
credential surface will be added. The existing Trading Capital catalog remains
25 operations and the complete Tenant catalog remains 71 operations.

## Planned evidence

- Closed JSON Schema for the reconciliation record.
- Migration `0036_trading_testnet_reconciliation_recovery` with forced Tenant
  RLS, immutable identity/safety fields, legal projection transitions, and a
  rollback refusal while records exist.
- Chaos tests for duplicate delivery, partial fill/cancel race, timeouts,
  adapter outage, poll exhaustion, circuit breaking, safe stop, and corrupted
  snapshots.
- Restart/replay tests for `UNKNOWN` recovery and exact PostgreSQL rebuild.
- Protected simulation E2E covering normal, reduce-only, flatten, and recovery.
- Security checks proving no network, secret, live signer, API Wallet, Ledger
  posting, Facility mutation, mainnet, production, or funds authority.

