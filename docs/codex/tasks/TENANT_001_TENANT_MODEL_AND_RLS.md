# TENANT-001: Tenant Model and PostgreSQL RLS

Status: Sequenced after explicit SECURITY-001 SEC-D01 through SEC-D09
approval. Implementation is not yet authorized.

## Context

DATA-002 persists protocol aggregates without a production tenant boundary.
The public demo intentionally isolates anonymous sessions in memory. A closed
pilot needs one immutable Organization tenant root, authenticated membership,
tenant-aware referential integrity, and PostgreSQL Row-Level Security before
any private durable state can be exposed.

## Scope After Approval

- Add Organization Tenant, Actor, Membership, and purpose-bound expiring
  AccessGrant records with versioned domain events and Evidence.
- Add immutable non-null `tenant_id` ownership to every tenant-owned durable
  aggregate, projection, idempotency record, outbox message, and audit record.
- Add tenant-aware unique and foreign-key constraints; prevent identifier
  reassignment between tenants.
- Use an application role that is not owner, superuser, or `BYPASSRLS`; enable
  and force RLS with both `USING` and `WITH CHECK` policies.
- Set `app.tenant_id`, `app.actor_id`, and policy version only inside the active
  transaction after verified security-context validation.
- Use separate least-privilege migration, reconciliation, backup, and incident
  roles; none may reuse the application credential.
- Map integrity and RLS failures to stable non-enumerating API problems.
- Backfill only approved synthetic/local data. Anonymous sandbox sessions are
  never promoted into tenant records.

## Non-Goals

- No implementation before SECURITY-001 approval is recorded.
- No Human IdP, token verifier, route capability policy, real funds, KYC/KYP,
  Provider execution, production secret, cloud IAM, or deployment activation.
- No client-supplied tenant selector in a body, path, query, arbitrary header,
  wallet address, plugin, or Subject identifier.
- No wildcard cross-tenant role or global super-admin bypass.

## Likely Files

- `db/migrations/*`
- `modules/identity/*`
- `modules/authorization/*`
- `modules/persistence/*`
- `apps/api/src/*`
- `packages/api-contract/*`
- `docs/architecture/*`
- `docs/security/*`

## Acceptance Criteria

- Every durable customer object has one immutable tenant and tenant-aware
  referential integrity.
- A two-tenant matrix substitutes every tenant-owned identifier across reads,
  writes, idempotent replay, outbox, Evidence, audit, and reconciliation paths;
  every substitution returns no data and no existence oracle.
- `FORCE ROW LEVEL SECURITY` protects application queries even when an
  application authorization defect is injected in tests.
- Transaction-local context disappears after commit and rollback, including
  connection-pool reuse and error paths.
- Missing, malformed, stale, or conflicting tenant context fails before any
  business event, projection, Evidence, or outbox write.
- Maintenance roles are denied interactive application login and are covered
  by explicit positive/negative privilege tests.
- Migration up/down/up, synthetic backfill, restart, backup fixture, and
  reconciliation tests pass without weakening existing invariants.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Security Checklist

- [ ] SECURITY-001 approval record is immutable and linked from the change.
- [ ] Tenant derives only from verified server-side context.
- [ ] Application role is non-owner, non-superuser, and non-`BYPASSRLS`.
- [ ] Tenant tables use `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- [ ] `USING` and `WITH CHECK` cover reads and writes.
- [ ] Transaction-local context is tested across pooled connection reuse.
- [ ] Cross-tenant errors, timing, counts, and identifiers do not enumerate.
- [ ] No anonymous session, raw PII, token, proof, or secret is migrated.
- [ ] Production database activation remains a separate approval.
