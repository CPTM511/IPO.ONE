# ADR-022: Durable Tenant Command Transaction Boundary

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

ADR-015 made event, Evidence, outbox, command response, and normalized
projections one PostgreSQL unit of work. ADR-017 through ADR-021 added forced
Tenant RLS, verified Authentication Context, deny-by-default authorization,
durable approval authority, and distributed abuse admission. Those boundaries
were intentionally not composed behind the anonymous public sandbox.

A durable Human/Agent command cannot safely run each boundary in its own
transaction. In particular, a committed business mutation must not be paired
with an expired admission that releases its persistent resource count; a
completed retry must not be rejected because mutable business state changed
after the original commit; and authorization audit must not claim an allow for
a payload different from the payload that was executed.

## Decision

1. The authenticated Tenant Command Gateway is a separate module and state
   boundary. It is not mounted in the anonymous process-local public sandbox.
2. Tenant, Actor, Actor type, client, Credential, and policy version derive
   only from a server-created Authentication Context. Protocol payloads cannot
   provide command authority fields.
3. A closed handler registry maps reviewed operation IDs to command or query
   handlers. Human BFF and Agent clients inject their verified contexts into
   the same protocol envelope and have no database access.
4. ABUSE-001 admission completes before authorization resource lookup. Its
   command charge binds Tenant, Actor, client, operation, and idempotency.
5. A valid, unexpired admission is locked before any object read. The Gateway
   owns one serializable transaction containing authorization audit,
   revalidation, domain events, Evidence, outbox, normalized projections,
   immutable snapshots, durable response, command authority record,
   authorization-resource bindings, and admission completion.
6. Admission expiry is a deadline to acquire the transaction lock. Once the
   row is locked, successful business mutation and retained persistent resource
   accounting commit together. Cleanup cannot expire that admission while the
   business transaction holds its row lock.
7. After current Credential authentication, a completed command response is
   recovered before mutable object and live-policy checks. A stable request
   identity hash binds Tenant, Actor, Actor type, client, operation, exact
   payload hash, and client idempotency hash. Conflicting reuse fails closed.
8. New commands pass full authorization and same-transaction revalidation.
   `commandPayloadHash` is part of authorization and approval command hashes,
   preventing amount, terms, or target payload substitution under an old
   decision or approval.
9. Durable Membership, AccessGrant, authorization resource, multi-Actor
   resource binding, append-only authorization audit, and append-only command
   execution records use forced RLS and Tenant write guards. Audit persists
   client references as keyed HMAC values rather than raw or publicly
   enumerable client identifiers.
10. PostgreSQL row locks detect authorization-fact changes against the
    serializable snapshot, while transaction advisory locks impose one
    cross-table lock order for Membership, Actor, resource, binding, and
    AccessGrant transitions. PostgreSQL requires an update privilege for
    locking reads, so the Gateway role receives only `UPDATE(id)` on otherwise
    read-only authorization facts; immutable-field/version triggers prevent
    that narrow privilege from changing authority.
11. An Agent Membership has an immutable, same-Tenant `controller_actor_id`.
    Agent Subject creation locks and verifies both Memberships before binding
    the Agent, so `agent.create` cannot claim another Human's Agent Actor.
    Legacy non-system Memberships migrate with an empty client allowlist and
    therefore remain unauthorized until explicitly provisioned.
12. One Human-controlled Developer Principal is identified by a non-reversible
    Tenant-plus-Actor authority reference and reused for subsequent Agent
    Subjects. Agent resources can bind both the Human controller and Agent
    subject without collapsing them into one owner field.
13. Migration `0008_durable_tenant_command_gateway` is reversible and adds no
    route, production IdP, Human lending, provider integration, custody, real
    funds, raw KYC/PII, cloud resource, DNS change, or deployment approval.

## Consequences

- A successful command has one database commit point and one durable replay
  response. A denial can commit bounded audit and failed admission accounting
  while committing no business projection.
- Concurrent duplicate commands execute once; a second caller either receives
  an in-progress denial or the exact completed replay.
- RLS remains defense in depth rather than the sole ownership check. Durable
  resource bindings and authorization policy must both allow an object.
- The implemented slice covers Human Agent-Subject creation, Human-controlled
  non-executable draft Mandate creation, and bounded Agent self-read. Remaining
  signed activation, Agent Lockbox credit, spend, revenue, repayment, worker,
  approval, and administrative handlers must use this same transaction
  protocol before DATA-003 is complete.
- Human IdP vendor selection, durable Credential provisioning, production role
  grants, edge policy, alerting, retention operations, independent security
  review, and public deployment remain named gates.

## Verification

- Exact payload/approval binding unit test.
- Two-Tenant object denial with no business projection and durable bounded
  denial audit.
- Same-Tenant controller-confusion denial and concurrent Agent Membership
  revocation rollback.
- Human command plus Agent self-query over one protocol.
- Process restart replay and conflicting idempotency rejection.
- Concurrent duplicate single execution with replay.
- Append-only audit and command authority tamper rejection.
- Full reconciliation after each Tenant flow.
- Complete PostgreSQL regression passes on Node.js `v24.18.0`.

Required commands remain:

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```
