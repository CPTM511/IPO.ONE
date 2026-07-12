# ADR-013: PostgreSQL Event Runtime and Transactional Messaging

- Status: Accepted for local implementation; production operations require review
- Date: 2026-07-11

## Context

An in-memory event stream can demonstrate domain replay but cannot survive a
process crash or atomically coordinate an event with message delivery. Writing
state and publishing directly to a broker would create a dual-write window.
IPO.ONE needs a storage boundary that proves command idempotency, optimistic
concurrency, portable Evidence, and retry-safe integration before any real value
path exists.

## Decision

PostgreSQL is the first durable source of truth for the single-Rail vertical
slice. One serializable database transaction will:

1. reserve or replay the command idempotency key;
2. lock and validate the aggregate stream version;
3. append the immutable domain event;
4. append its Evidence envelope and compatibility credit event;
5. append one outbox message; and
6. advance the aggregate stream head and complete the command record.

The runtime uses ordered SQL-first migrations with immutable checksums. Stream
heads use row locks for per-aggregate serialization, while serialization and
deadlock failures receive a small bounded retry. Migration history must be a
contiguous prefix of the current build, and each checksum covers both the up
and down files. SQL values are parameterized.

Event and Evidence hashes use canonical JSON transport semantics: undefined
object members are omitted and undefined array members normalize to null. All
JSONB values are encoded explicitly at the database boundary so JavaScript
arrays cannot be mistaken for PostgreSQL arrays.

Outbox workers claim rows with `FOR UPDATE SKIP LOCKED` and a bounded lease.
Publishing acknowledgement, retry availability, attempt count, and dead-letter
state remain explicit. An expired lease after the final attempt is moved to
dead-letter state instead of remaining permanently locked. A broker publish is at-least-once; downstream consumers
must use the inbox key.

Inbox handlers receive the active PostgreSQL client. Their database effects and
the completed inbox row commit in the same transaction, providing exactly-once
database effects for one `(consumer, event)` key. A repeated event with a
different payload hash is an integrity failure.

Rail depends on an asynchronous event-repository port. The public local demo
uses an EventStore adapter; durable tests and explicit `DATABASE_URL`
compositions use PostgreSQL. Domain transitions and replay reducers are shared,
so persistence does not fork protocol logic.

## Consequences

- A crash cannot leave a committed event without Evidence/outbox, or advance a
  stream without its event.
- Retries are deterministic and conflicting idempotency reuse fails closed.
- The repository can be tested with process restart and concurrent writers.
- The default demo remains easy to run, but asynchronous service boundaries are
  now honest about future I/O.
- This does not supply production backup, high availability, encryption/KMS,
  IAM, tenant isolation, broker operations, or disaster recovery. Those remain
  deployment review gates.
