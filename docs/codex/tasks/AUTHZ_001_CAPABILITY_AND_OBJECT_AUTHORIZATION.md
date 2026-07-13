# AUTHZ-001: Capability and Object Authorization

Status: Local non-funds policy foundation implemented on 2026-07-13 under the
approved SECURITY-001 SEC-D01 through SEC-D09 decision pack. Durable command
composition, durable adapters, APPROVAL-001, ABUSE-001, and deployment remain
gates.

## Context

Authentication proves an Actor/client context but grants no protocol action.
IPO.ONE needs one deny-by-default policy registry that enforces actor type,
explicit capability, object tenant ownership, AccessGrant purpose, live
Mandate/SpendPolicy/risk state, reason, idempotency, and approval requirements
in a fixed order for both Human BFF and Agent API calls.

## Approved Local Scope

- Add a versioned route/method/action/resource capability registry covering
  every OpenAPI operation and background command.
- Map administrative roles into explicit capabilities; runtime enforcement
  checks capabilities rather than free-form role names.
- Enforce active membership/client binding and object ownership or one
  purpose-bound, expiring AccessGrant before resource reads or mutations.
- Recheck current resource state, Mandate, SpendPolicy, cap, risk, freeze,
  reason, idempotency, and dual-control requirements after authorization and
  inside the durable command transaction where required.
- Record bounded immutable allow/deny audit decisions with policy version,
  request/correlation IDs, Actor/Tenant, action/resource, reason code, hashed
  token reference, and approval IDs.
- Use the same policy decisions for Human and Agent surfaces; presentation does
  not create a second authorization model.
- Add a policy compatibility and emergency rollback procedure that cannot
  silently broaden capabilities.

## Non-Goals

- No implementation before SECURITY-001 approval and prerequisite contracts.
- No wildcard capability, implicit owner bypass, client-supplied tenant,
  wallet-as-session, authorization in UI code, or plugin-defined privilege.
- No role may bypass Ledger, Mandate, SpendPolicy, caps, Evidence,
  reconciliation, freeze, or state-machine invariants.
- No real funds, KYC/KYP, Provider execution, production credential, or deploy.

## Likely Files

- `modules/authorization/*`
- `modules/identity/*`
- `modules/persistence/*`
- `apps/api/src/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `schemas/*`
- `db/migrations/*`
- `security/test/*`
- `docs/security/*`

## Acceptance Criteria

- Every route and worker command has one named action, resource type, allowed
  actor set, capability, ownership rule, and audit requirement; CI rejects
  unregistered operations.
- Horizontal and vertical privilege matrices cover every object ID and actor
  type across two tenants, including revoked/expired AccessGrants.
- Denied requests reveal no cross-tenant existence, count, state, timing,
  identifier, policy detail, or upstream error beyond the stable contract.
- Authorization denial commits no business projection/outbox mutation; its
  bounded security audit remains append-only and tenant-protected.
- Policy downgrade, stale policy version, cache invalidation, concurrent
  membership revocation, and time-of-check/time-of-use cases fail closed.
- Admin/risk mutations require approved reason codes; high-impact actions bind
  to an APPROVAL-001 authorization artifact and exact command hash/version.
- OpenAPI, SDK, BFF, Agent, and worker paths use the same registry and tests.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Local Foundation Evidence

- One immutable policy registry classifies all 21 current public OpenAPI
  operations and the named authenticated Human, Agent, Provider, risk,
  operations, auditor, and worker commands. CI rejects drift between OpenAPI
  and the isolated public-sandbox classification.
- Runtime authorization intersects the operation capability with the branded
  Authentication Context, active Credential, and active Membership. Role
  bundles are closed capability ceilings, not runtime bypasses.
- Actor/Tenant ownership and exact AccessGrant checks are negative-tested across
  tenants, actors, purposes, resources, expiry, and revocation with one outward
  denial contract.
- Credential rotation, membership suspension, resource version change,
  AccessGrant revocation, live-state change, stale MFA, command-hash mismatch,
  and expired decision paths fail closed.
- The allow-decision mint is private to `AuthorizationService`. Decisions are
  frozen, process-branded, HMAC-reference-bound, short-lived, and must be
  revalidated before the PostgreSQL command security context accepts them.
- Protective actions require reason and idempotency. Dual-control verification
  requires two distinct approver Actors, no command-Actor self-approval, and an
  exact command hash. Durable approval issuance remains APPROVAL-001 work.
- Allow and deny audit is bounded, credential-free, and awaited. Synchronous or
  asynchronous audit failure returns service unavailable before authority can
  escape.
- ADR-019 records the accepted local boundary and its remaining integration
  gates. No authenticated tenant route is exposed by `apps/api` or `ipo.one`.

The acceptance criterion requiring BFF, Agent SDK, worker, and PostgreSQL
command paths to execute the same policy inside a durable transaction remains
DATA-003 work. The current implementation proves the policy and adapter
contracts without claiming that integration is complete.

## Security Checklist

- [x] SECURITY-001 decision and prerequisite versions are linked.
- [x] Policy is closed, versioned, deny-by-default, and route-complete.
- [x] Tenant ownership is checked in application code and RLS foundations.
- [x] AccessGrant purpose, resource, capability, tenant, Actor, and expiry are exact.
- [x] TOCTOU and concurrent revocation paths are tested.
- [x] Allow and deny audits are bounded and contain no raw credentials or PII.
- [x] Named capabilities require explicit live protocol and risk invariants.
- [ ] Durable command transaction and authenticated API composition are complete.
- [ ] Durable approval, abuse-control, directory, and audit adapters are complete.
- [x] Production policy activation remains a separate approval.
