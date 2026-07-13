# ADR-017: Tenant Isolation and PostgreSQL RLS

Status: Accepted for local non-funds implementation by SECURITY-001 approval
Date: 2026-07-13

## Context

IPO.ONE's public demo uses process-local anonymous partitions and correctly
treats their IDs as isolation hints, not credentials. Durable customer state
cannot share that boundary. SECURITY-001 establishes Organization as the tenant
root, one immutable tenant owner for every durable customer object, and
PostgreSQL Row-Level Security as defense in depth behind application
authorization.

## Decision

1. `Tenant` is an Organization root. One Principal belongs to exactly one
   Tenant in the closed pilot.
2. Actor identity remains separate from Tenant membership so one Human Actor
   may have several memberships, while every request selects one active Tenant.
3. A server-created Tenant Security Context contains exactly `tenant_id`,
   `actor_id`, and `policy_version`. Request bodies, paths, queries, arbitrary
   headers, wallet addresses, plugins, and Subject IDs cannot create it.
4. PostgreSQL context is set with parameterized transaction-local `set_config`
   calls after `BEGIN`. It disappears on commit, rollback, and pooled-connection
   reuse.
5. Tenant-owned tables carry immutable non-null `tenant_id`, tenant-aware
   referential constraints, `ENABLE ROW LEVEL SECURITY`, and
   `FORCE ROW LEVEL SECURITY` with both `USING` and `WITH CHECK`.
6. Application roles must be non-owner, non-superuser, non-`BYPASSRLS`, and
   unable to create roles, databases, or replication sessions. Runtime startup
   must verify that posture before durable tenant commands are enabled.
7. Migration, reconciliation, backup, and incident roles remain separate. They
   do not share application credentials and operate one explicit tenant scope
   per transaction unless a later approved AccessGrant permits more.
8. Existing repository fixtures are synthetic. Migration assigns them to one
   explicit local non-funds Tenant; anonymous browser sessions are never
   promoted into customer records.
9. Integrity errors are mapped to stable non-enumerating problems at the API
   boundary because referential checks can observe rows outside RLS.
10. Aggregate streams, command idempotency, command-event sequence, inbox
    consumption, Evidence aggregate sequence/source idempotency, and projection
    registry identities are tenant-scoped. A hidden row in one tenant must not
    block another tenant from using the same caller-visible key.

## Consequences

- Durable repository construction requires a validated Tenant Security Context.
- Reads without Tenant context return no tenant rows; writes without context
  fail closed before business state commits.
- Cross-tenant object substitution is denied independently by application
  ownership checks and database RLS/tenant-aware foreign keys.
- Public sandbox state remains process-local until DATA-003 composes a separate
  authenticated tenant command gateway.
- Production role creation, IdP configuration, private data, and deployment
  remain separately approved operations.
