# ADR-010: Ledger Source of Truth

- Status: Accepted for the local MVP; proposed for production architecture
- Date: 2026-07-10

## Context

Event logs explain business actions, but they are not a substitute for
double-entry accounting. Mutable Lockbox balance fields alone cannot prove
conservation of value, prevent duplicate posting, or support reconciliation.

## Decision

- Monetary state is posted to an append-only, asset-scoped double-entry ledger.
- Every transaction requires a unique idempotency key, at least two positive
  entries, and equal debit and credit totals.
- Lockbox balance is a projection of its ledger account, not an independent
  source of truth.
- Protocol events reference the resulting ledger transaction.
- The in-memory MVP applies these invariants synchronously. A production
  implementation must post ledger rows, the domain mutation, and an outbox
  record in one database transaction, then publish asynchronously.

## Consequences

- Duplicate payment webhooks and retries can be reconciled safely.
- Event history and accounting history remain related but distinct.
- The local runtime still lacks crash durability; it must not be described as a
  production ledger.
