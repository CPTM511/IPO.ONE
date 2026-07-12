# DATA-002: Core Aggregate Persistence

Status: Complete for the local non-funds commercial-pilot repository foundation; production
deployment remains unapproved.

## Context

The Rail aggregate already proves durable event, Evidence, outbox, inbox,
idempotency, and replay behavior on PostgreSQL. Subject, Principal, Mandate,
SpendPolicy, Obligation, Lockbox, Ledger, RiskDecision, and Admin state still
resides in process-local maps. A process restart therefore loses the control
plane even though Rail events survive.

The commercialization roadmap requires these projections to commit with their
domain events. A command may affect several aggregates, so extending the
single-event repository with ad hoc writes would leave partial-commit and
replay gaps.

## Scope

- Add a batch command transaction to the PostgreSQL event repository while
  preserving the existing single-event API.
- Reserve one command idempotency key and persist its complete ordered event
  set, Evidence envelopes, compatibility credit events, and outbox messages.
- Lock all affected aggregate streams in deterministic order and enforce the
  expected version of every event.
- Persist the original command response so retries return the same result after
  a process restart.
- Add normalized, full-fidelity columns and constraints required by the core
  domain models.
- Add a typed core repository that writes Principal, Subject, account binding,
  Mandate, Provider, SpendPolicy, SpendRequest, Lockbox, Ledger, Obligation,
  Repayment, CreditLine, RiskDecision, and AdminAction projections in the same
  serializable transaction as their events.
- Register every projection write with a deterministic hash and source event so
  reconciliation can prove event-to-state coverage.
- Append a canonical immutable projection snapshot for approval-gated replay
  without treating an opaque process snapshot as live state.
- Add real PostgreSQL tests for multi-event atomicity, crash rollback,
  idempotent replay, stale-version races, ledger integrity, and restart reads.

## Non-Goals

- No production AuthN, tenant, RBAC, API-key, wallet-signature, or permission
  implementation before `SECURITY-001` and `AUTH-002` approval.
- No public API switch from isolated demo sessions to durable pilot tenants.
- No real funds, custody, remote payment provider, KYC/KYP processing, Human
  lending, smart-contract deployment, or production database.
- No asynchronous projection consumer in this issue; the primary control-plane
  projection is deliberately transactionally consistent.
- No claim that a database transaction provides exactly-once broker delivery.

## Likely Files

- `db/migrations/0003_core_aggregate_persistence.*.sql`
- `modules/persistence/src/postgres-event-repository.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/test-postgres/*`
- `scripts/run-postgres-tests.mjs`
- `scripts/check-migrations.mjs`
- `docs/architecture/ADR-015-core-projection-unit-of-work.md`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`

## Acceptance Criteria

- A command with several events commits all stream heads, events, Evidence,
  outbox rows, projection rows, projection registrations, and its response or
  commits none of them.
- Stream rows are locked in deterministic order and concurrent writers with the
  same expected version produce one winner.
- A repeated idempotency key and matching command hash returns the original
  ordered event set and response; different input fails closed.
- Projection writes use parameterized SQL and reject immutable identity/hash
  conflicts instead of silently overwriting them.
- Ledger transactions remain append-only, balanced, asset-consistent, and
  restart-readable with their ordered entries.
- Core model fields needed to reconstruct domain objects survive a database
  restart without a lossy JSON side channel.
- Migration up/down/up and all existing Rail persistence behavior continue to
  pass against real PostgreSQL.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run demo
pnpm run smoke:api
```

## Security Checklist

- [x] SQL identifiers are fixed by code and all values are parameterized.
- [x] Raw PII, KYC payloads, private keys, signatures, and secrets are excluded.
- [x] Every write set is bounded and validated before opening a transaction.
- [x] All stream locks use deterministic ordering.
- [x] Event, outbox, command-response, and projection payloads are hash-bound.
- [x] Immutable projection identity conflicts fail closed.
- [x] Database errors do not leak credentials or SQL details through the API.
- [x] Production activation remains behind named human approval.

## Verification Record

- Exact runtime: official Node.js 24.18.0 archive with matching published SHA-256.
- `pnpm run check`: passed, including 78 database-free tests.
- `pnpm run test:postgres`: passed 12 real PostgreSQL tests/subtests.
- Migration `up -> down -> up` passed, including a legacy Subject upgrade and
  enforcement of Principal binding on new rows.
- Injected failure after all normalized projections and immutable snapshots were
  written rolled back the command, events, Evidence, outbox, stream heads, and
  every projection row.
- Restart reads, multi-stream races, account-binding identity conflicts,
  idempotent response replay, and projection hash proofs passed.
