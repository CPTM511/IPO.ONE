# DATA-001 / EVENT-001: PostgreSQL Event Runtime

Status: Complete for the approved local Rail foundation; production deployment remains unapproved.

## Context

The architecture review requires a persistent single-Rail vertical slice where
command idempotency, aggregate state, append-only events, Evidence, and an
outbox commit atomically. The current Rail aggregate is event-sourced but its
default EventStore is process-local, so restart and worker-crash guarantees
cannot yet be proven.

The user explicitly approved this PostgreSQL repository, transactional
outbox/inbox, and crash/retry/replay work on 2026-07-11, including the required
`pg` production dependency and an isolated local PostgreSQL test runtime.

## Scope

- Add a reviewed `pg` dependency and PostgreSQL connection factory.
- Add ordered SQL migrations and a migration runner with checksums and
  transaction-scoped advisory locking.
- Add aggregate stream heads, command idempotency, append-only domain events,
  transactional outbox, consumer inbox, and dead-letter metadata.
- Atomically persist one command, domain event, Evidence envelope, compatibility
  credit event, outbox message, and aggregate version.
- Enforce optimistic stream versions and serializable transaction retry.
- Add outbox claim leases with `SKIP LOCKED`, publish/failure acknowledgement,
  retry scheduling, and terminal dead-letter state.
- Add inbox processing that commits consumer effects and dedupe state in one
  database transaction.
- Refactor the Rail Service onto one asynchronous event-repository port with an
  EventStore adapter for the default demo and a PostgreSQL implementation for
  durable mode.
- Add real PostgreSQL integration tests for migration up/down, injected crash
  rollback, idempotency conflict, concurrent writers, outbox recovery, inbox
  exactly-once effects, and restart replay.
- Preserve the no-database local demo and public UI as the default composition.

## Non-Goals

- No production database, cloud account, deployment, secret, or long-lived
  local database service.
- No real funds, custody, chain transaction, provider webhook, or remote Rail.
- No persistence rewrite for every existing MVP module in this issue.
- No AuthN/AuthZ/RBAC, tenant model, Human credit, or canonical Obligation state
  change.
- No claim that PostgreSQL alone provides external-message exactly-once
  delivery; the outbox provides atomic intent and consumers remain idempotent.
- No automatic production dependency upgrades beyond the explicitly approved
  PostgreSQL client.

## Likely Files

- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `db/migrations/*`
- `scripts/migrate.mjs`
- `scripts/check-migrations.mjs`
- `modules/persistence/*`
- `modules/rail/*`
- `modules/payment/*`
- `modules/settlement/*`
- `packages/mvp-flow/*`
- `apps/api/*`
- `docs/architecture/*`
- `README.md`

## Acceptance Criteria

- Given an injected failure after event insertion but before commit, when the
  transaction aborts, then command, event, Evidence, outbox, and stream version
  all remain unchanged.
- Given an identical idempotency key and command hash, when retried after a
  commit or process restart, then the original event/state is returned without
  a duplicate; conflicting reuse fails closed.
- Given two writers with the same expected aggregate version, when they race,
  then exactly one commits and the other receives a stale-version error.
- Given every committed event, then exactly one unpublished outbox row exists in
  the same transaction.
- Given a worker dies after claiming an outbox row, when its lease expires, then
  another worker can reclaim it without creating a second message.
- Given the same inbox event twice, then the consumer effect commits once and
  the second call returns the stored result; payload-hash conflict is rejected.
- Given a fresh Rail Service over the same database, when the aggregate is read,
  then its state and replay proof match the pre-restart result.
- Migration up/down/up succeeds against real PostgreSQL and checksums are
  recorded.
- The default `npm run dev` and in-memory browser flow still run with no
  PostgreSQL dependency at runtime.
- Full unit checks, PostgreSQL integration checks, API smoke, and desktop/mobile
  browser regression pass.

## Test Commands

```sh
pnpm run check
pnpm run db:migrate
pnpm run test:postgres
pnpm run demo
```

## Security Checklist

- [x] Database credentials remain environment-only and are never logged.
- [x] SQL values use parameterized queries; identifiers are not user-provided.
- [x] Command/event/Evidence/outbox writes share one database transaction.
- [x] Aggregate versions are locked and checked before append.
- [x] Event, Evidence, outbox, and inbox payloads carry deterministic hashes.
- [x] Idempotency conflicts and inbox payload conflicts fail closed.
- [x] Worker leases, retry limits, and dead-letter state are bounded.
- [x] Raw PII, account details, signatures, and secrets are absent from fixtures
      and persisted payloads.
- [x] PostgreSQL mode does not enable real funds or production Rail execution.
- [x] Production hosting, backup, encryption, IAM, network policy, and operations
      remain human-review gates.

## Verification Record

- `pnpm run check`: passed, including 62 database-free tests.
- `pnpm run test:postgres`: passed 8 real PostgreSQL tests/subtests against an
  isolated PostgreSQL 17 database.
- `pnpm run smoke:api`: passed the complete public Agent Lockbox HTTP flow.
- Browser regression: passed the complete interactive desktop flow at
  1280x720 with no horizontal overflow or clipped control text.
- Migration verification: real `up -> down -> up` passed with migration-pair
  checksums and contiguous-history enforcement.
