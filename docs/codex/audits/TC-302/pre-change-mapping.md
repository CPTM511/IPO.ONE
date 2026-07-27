# TC-302 Pre-change Mapping

## Human gate and scope

- TC-301 was accepted by the Founder in the current Codex task on 2026-07-25.
- TC-302 is limited to offline code, synthetic fixtures, PostgreSQL integration tests,
  and simulated Hyperliquid Testnet protective execution.
- The current approval does not authorize a live Hyperliquid signer, API Wallet
  provisioning, real Testnet Exchange writes, mainnet access, deployment, withdrawals,
  transfers, or real funds.
- TC-302 must stop after its own implementation and evidence handoff. TC-303 remains
  locked until a later explicit acceptance.

## Existing components to preserve

- `packages/domain/src/trading-capital-facility.js` already owns the shared synthetic
  Facility state order `NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`
  and only permits monotonic protective movement.
- The existing Tenant protocol exposes exactly 25 Trading Capital operations.
  TC-302 does not add or rename an operation.
- `modules/hyperliquid-execution` is the accepted TC-301 offline `/exchange`
  simulator. It has five typed actions, persistent nonce/idempotency handling, no
  network transport, no live signer, no API Wallet, and no withdrawal or transfer
  authority.
- TC-301 is intentionally not connected to the browser, SDK, MCP, Tenant command
  catalog, or production composition.

## TC-302 contract map

| Concern | TC-302 implementation |
| --- | --- |
| Trusted risk input | Closed, server-timed, hash-bound snapshot with explicit `FRESH`, `STALE`, or `UNKNOWN` freshness and a versioned simulation-fixture policy |
| State enforcement | A policy evaluator denies risk-increasing `order` and non-reducing `modify` actions in `REDUCE_ONLY`, `FLATTEN`, `SETTLEMENT`, stale, unknown, kill-switch, or uncertain-write conditions |
| WARNING | An immutable warning-notification evidence action is planned; it does not contact an external notification service |
| REDUCE_ONLY | Risk-increasing open orders are canceled and only server-proven reducing execution remains admissible |
| FLATTEN | Open orders are canceled before bounded reduce-only position-close actions are planned |
| Stale/unknown | Fails closed to at least `REDUCE_ONLY`; it never authorizes new risk or automatic recovery |
| Risk Guardian boundary | A narrow protective executor accepts only warning evidence, cancel, and reduce-only-close actions; it has no arbitrary order, strategy, withdrawal, transfer, or account-administration method |
| Evidence | Each snapshot, control record, action result, state transition, and post-action verification is hash-bound and tenant-scoped |
| Durability | PostgreSQL reservation and transition writes are serializable/retry-safe, idempotent, RLS-protected, and append an immutable transition record in the same transaction |
| Verification | A control becomes `VERIFIED` only after a server-shaped simulated post-action venue snapshot proves the target invariant; incomplete or unknown outcomes cannot loosen risk state |

## Policy and threshold boundary

- No production staleness duration, liquidation buffer, leverage, exposure, polling,
  hysteresis, or recovery threshold is approved by TC-302.
- Numeric test values are explicitly marked `simulation_fixture_only`; they are
  test vectors, not production policy or pricing.
- Less-restrictive transitions, automatic recovery, interest/rate changes, and
  strategy approval remain unavailable.

## Evidence classification

- Unit and PostgreSQL results may become `VERIFIED` for the offline TC-302 boundary.
- Real Hyperliquid Testnet cancellation/flatten behavior, live signer custody,
  real account state, and external post-action reconciliation remain
  `IMPLEMENTED_UNVERIFIED` until separately approved and executed with a qualified
  Founder-controlled Testnet master/subaccount.
