# ADR-015: Core Projection Unit of Work

- Status: Accepted for local non-funds implementation; production use requires review
- Date: 2026-07-12

## Context

IPO.ONE commands frequently cross aggregate boundaries. An approved provider
spend can reserve a Mandate, update a SpendPolicy and CreditLine, create an
Obligation, and emit several audit facts. Persisting those changes through
independent repository calls would create partial states that cannot be
reconciled reliably after a crash.

The existing PostgreSQL event runtime atomically persists one Rail event but
does not yet represent a complete multi-event command or normalized core
projection writes.

## Decision

The durable control plane uses one serializable PostgreSQL unit of work per
command. A command has one idempotency identity, one deterministic command
hash, one root aggregate reference, an ordered event set, an explicit expected
version for every event, a bounded normalized projection write set, and a
stored response.

The unit of work will:

1. reserve or replay the command idempotency record;
2. create and lock all affected stream heads in lexical order;
3. validate every expected stream version in event order;
4. append every immutable domain event, Evidence envelope, compatibility event,
   command-event link, and outbox message;
5. apply the typed normalized projection write set;
6. append a full-fidelity immutable projection snapshot for every write;
7. hash-register every projected entity against its source event;
8. advance all stream heads; and
9. store the command response before committing.

The existing `appendCommand` method remains a compatibility wrapper around the
batch unit of work. Projection SQL is owned by a typed repository with a fixed
entity whitelist. Callers cannot provide SQL identifiers or arbitrary SQL.

Mutable projections may update status and counters, but immutable IDs, hashes,
ownership references, assets, and original terms must match the existing row.
A mismatch is an integrity error. Ledger transactions and entries remain
append-only and database balance constraints remain authoritative.

Normalized tables are the read/restart source for the core control plane. The
append-only projection snapshot is recovery evidence, not a second mutable
state store. `projection_registry` records the canonical hash, source event,
and root command stream for each write so reconciliation can compare the
normalized row, latest immutable snapshot, and registry without trusting any
single representation.

## Consequences

- Cross-aggregate commands can fail atomically and replay with their original
  response after a process restart.
- The database can reconstruct core domain objects without depending on an
  in-memory service snapshot.
- Stream concurrency and relational constraints both participate in integrity.
- Callers must assemble all domain events and projection changes before commit;
  hidden writes from process-local services are not considered durable.
- AuthN, tenant isolation, wallet proof, provider integration, database
  operations, backup, and production deployment remain separate approval gates.
