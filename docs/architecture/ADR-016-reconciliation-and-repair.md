# ADR-016: Reconciliation Evidence and Approval-Gated Repair

- Status: Accepted for local non-funds implementation; production operations require review
- Date: 2026-07-12

## Context

Atomic writes reduce inconsistency but cannot prove that stored state remains
correct forever. IPO.ONE credit decisions and repayment state must be
independently checkable after crashes, migrations, operator actions, and
software upgrades.

## Decision

Reconciliation is a first-class, append-only protocol operation. A run executes
a bounded set of deterministic database checks, then commits its summary,
reason-coded discrepancies, domain events, Evidence envelopes, and outbox
messages in one serializable transaction.

Core normalized projections are paired with immutable projection snapshots.
The snapshot contains the canonical, non-sensitive domain object that was
written, its deterministic hash, source event, aggregate version, and root
command stream. Reconciliation compares the registry hash, latest snapshot
hash, and a freshly reconstructed normalized-table object.

The initial checks cover:

- aggregate stream heads versus immutable event maxima;
- command/event/response integrity;
- one Evidence, compatibility credit event, and outbox row per domain event;
- registered entities, immutable snapshots, and normalized projections;
- balanced and asset-consistent ledger transactions;
- non-negative Lockbox balances;
- Mandate utilization versus unreleased reservations;
- Obligation principal, outstanding, repayment, and status arithmetic; and
- CreditLine utilization versus Agent obligation exposure.

Reconciliation never mutates business state. Repair planning is dry-run by
default. A repair requires a named actor, bounded reason, idempotency key, and
latest immutable snapshot. It appends a new `projection_repaired` event and a
new snapshot through the normal core unit of work. History is never rewritten.

## Consequences

- Operational health is backed by reproducible evidence rather than logs.
- Projection drift and event-runtime gaps become queryable, severity-ranked
  incidents.
- Recovery material is explicit and hash-bound.
- Automatic repair remains disabled, so an operator must review cause and
  blast radius before changing current state.
- Backup restore, regional recovery, alert delivery, and production operator
  identity remain later launch gates.

