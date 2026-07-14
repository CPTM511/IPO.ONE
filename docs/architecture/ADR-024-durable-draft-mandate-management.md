# ADR-024: Durable Draft Mandate Management

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

ADR-023 introduced a durable unsigned Mandate draft and deliberately withheld
activation. A safe Developer Control Plane still needs two management
properties before AUTH-002: an owner-authorized integrity-checked read, and an
immediate way to terminate an obsolete or compromised draft.

Mandate projection state and the authorization-resource directory are separate
durable views. Updating only one would leave either stale authority metadata or
an unreadable history. Retrying a completed revocation after resource closure
must also remain possible without reopening authorization.

## Decision

1. Add `pilotReadMandate` for Human Actors with the existing
   `integration.read.owned` capability and exact Actor ownership of a Mandate
   authorization resource.
2. Add `pilotRevokeDraftMandate` for Human Actors with a dedicated
   `mandate.draft.revoke` capability. The capability is included only in the
   approved Developer role bundle.
3. Revocation accepts an empty command payload and one reviewed protective
   reason code in the authorization envelope. Tenant, Actor, Mandate, Subject,
   Principal, and resource version are never payload authority.
4. The authorization live-state adapter locks and integrity-checks the Mandate
   projection and permits revocation only while its persisted status is
   `draft`. The handler repeats that invariant under the same transaction.
5. The command appends `mandate_status_changed`, writes a new immutable
   projection snapshot with terminal `revoked` status, and records the exact
   response, Evidence, outbox, audit, and command authority atomically.
6. In that same transaction, the authorization resource transitions from
   `active` to `closed` with an exact expected version. Bindings remain active
   so the authorized controller can read historical state; closed state cannot
   satisfy a new revocation live check.
7. The Gateway recovers a completed idempotent response before current
   resource authorization. Therefore the exact command replays after closure,
   while a fresh command fails closed.
8. Revocation does not require the Subject or Principal to remain active. Those
   checks protect authority creation and future activation, but cannot prevent
   a protective reduction.
9. Mandate persistent-resource accounting remains append-retained. Revocation
   does not delete history or release the Tenant Mandate ceiling.
10. No activation, signature, account proof, provider execution, credit,
    payment, custody, chain transaction, public route, production permission,
    KYC/KYP, Human lending, or real funds are added by this decision.

## Consequences

- Developers can inspect and safely terminate durable drafts without relying
  on process-local state.
- Agent reads and Human reads converge on the same terminal projection.
- Domain and authorization-directory state cannot diverge on a committed
  revocation.
- AUTH-002 remains the sole owner of any transition that grants executable
  Mandate authority.

## Verification

- Unit tests cover the closed payload, explicit capability, projection
  transition, event, response, client envelope, and resource-closure plan.
- PostgreSQL tests cover owner read/revoke, two-Tenant and same-Tenant denial,
  Agent denial, exact replay after closure, fresh-command rejection,
  concurrent revocation, Subject/Principal independence, RLS, durable state,
  and clean reconciliation.
- Schema, policy, security, PostgreSQL, SDK/API smoke, demo, dependency audit,
  and repository checks remain green under Node 24.18.0.
