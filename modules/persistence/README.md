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

Durable repository construction also requires a server-created Tenant Security
Context. Each read or write runs in a transaction that sets `app.tenant_id`,
`app.actor_id`, and `app.policy_version` with transaction-local parameterized
settings. The application role must pass `assertTenantDatabaseRole`: it cannot
own an RLS table or hold superuser, `BYPASSRLS`, database/role creation, or
replication privileges. Migration 0005 forces RLS on every tenant-owned table
and scopes stream, command, inbox, Evidence, and projection identities by
tenant. The public demo still does not compose this durable path.

Migration 0006 adds the local non-funds approval runtime: versioned
ApprovalProposal state, immutable ApprovalDecision and ApprovalExecution
records, and separately gated break-glass incident, custodian, and review
records. These projections use the same serializable command/Event/Evidence/
outbox/snapshot transaction as business state. Reconciliation verifies their
projection hashes and proposal/decision/execution or
incident/custodian/review linkage. Forced RLS and transaction-local Tenant
context apply to every new table.

The durable records do not activate production identity or permissions. The
current Credential, Membership, resource, live-policy, and authorization-audit
adapters remain local reference implementations until DATA-003 composes
reviewed stores behind a separate authenticated Tenant command gateway.

Run the real integration suite only against an isolated test database:

```sh
export DATABASE_URL=postgresql://127.0.0.1:5432/ipo_one_test
pnpm run test:postgres
```
