# Persistence Module

The Persistence module owns the PostgreSQL event runtime used by durable
IPO.ONE compositions. It atomically commits command idempotency, aggregate
version, domain event, Evidence, compatibility credit event, and outbox message.
It also provides leased outbox delivery state and transaction-coupled inbox
consumer deduplication.

Outbox delivery is at-least-once. Claims use worker leases and bounded attempts;
an expired final-attempt lease is moved to dead-letter state so it cannot remain
permanently locked. Inbox handlers must limit side effects to statements issued
through the supplied transaction client. External calls cannot be made
exactly-once by a PostgreSQL transaction.

The public interactive demo does not require PostgreSQL. Durable mode is
enabled only by explicit composition with a PostgreSQL pool and `DATABASE_URL`.
Credentials are environment-only and never included in events or logs.

Run the real integration suite only against an isolated test database:

```sh
export DATABASE_URL=postgresql://127.0.0.1:5432/ipo_one_test
pnpm run test:postgres
```
