# RECON-001: Projection Reconciliation and Recovery Foundation

Status: Complete for the local non-funds commercial-pilot foundation; automated
production repair remains unapproved.

## Context

Transactional projection writes prevent ordinary dual-write failures, but they
do not replace continuous integrity checks, operator evidence, or a recovery
path. Storage corruption, manual database access, migration defects, and
software regressions must become explicit discrepancies rather than silently
altering credit state.

## Scope

- Persist bounded reconciliation runs and discrepancy records.
- Reconcile stream heads, command-event links, command response hashes, domain
  events, compatibility events, Evidence, and outbox rows.
- Reconcile every registered core projection against its latest immutable
  projection snapshot and normalized table representation.
- Detect unregistered or missing core entities.
- Reconcile ledger totals/assets, Lockbox non-negative balances, Mandate net
  reservations, Obligation arithmetic/repayments, and CreditLine utilization.
- Emit one append-only Evidence event for the run and one for every discrepancy
  in the same transaction as the run record.
- Add dry-run replay planning and an approval-required projection repair path
  based on immutable snapshots.
- Add operator-facing runbook and real PostgreSQL fault fixtures.

## Non-Goals

- No silent or scheduled production data repair.
- No repair without an explicit actor, reason, idempotency key, and new domain
  event.
- No reconstruction from incomplete legacy events; immutable projection
  snapshots are the recovery material for core projections.
- No production alerting vendor, pager integration, backup service, or disaster
  recovery declaration in this issue.

## Likely Files

- `db/migrations/0004_reconciliation_runtime.*.sql`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/test-postgres/*`
- `docs/operations/RECONCILIATION_RUNBOOK.md`
- `docs/architecture/ADR-016-reconciliation-and-repair.md`

## Acceptance Criteria

- A clean durable control-plane fixture produces a passed run with zero
  discrepancies.
- A tampered projection, missing event companion, stale stream head, or broken
  ledger/state relationship produces a failed run with reason-coded evidence.
- Every discrepancy stores only bounded, non-sensitive details and references
  its immutable domain/Evidence event.
- Repeated reconciliation is safe and does not modify business projections.
- Projection repair is dry-run by default and cannot execute without a named
  actor and reason.
- An approved repair appends a new event/snapshot instead of changing history.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
```

## Security Checklist

- [x] Reconciliation SQL is read-only until the final evidence transaction.
- [x] Result sizes and stored detail sizes are bounded.
- [x] No raw PII, credentials, account secrets, or SQL text enters evidence.
- [x] Automatic repair is disabled.
- [x] Repair requires explicit actor, reason, and idempotency.
- [x] Repair creates a new event and immutable snapshot.
- [x] Critical discrepancies fail readiness for durable pilot mode.

## Verification Record

- A clean core fixture passed all ten reconciliation check families.
- Deliberate Obligation drift produced projection, repayment, and credit-exposure
  discrepancies with one Evidence event per discrepancy.
- Dry-run planning identified the immutable recovery snapshot without mutation.
- Approval-gated repair restored the normalized row through a new event and
  snapshot; retrying the repair key returned the original result.
- A post-repair full run returned `passed` with zero discrepancies.
- Human Operator and Agent Runtime browser flows passed at desktop and 390x844
  with no horizontal overflow or browser console warning/error.
