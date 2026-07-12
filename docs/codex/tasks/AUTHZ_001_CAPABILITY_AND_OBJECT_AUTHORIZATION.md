# AUTHZ-001: Capability and Object Authorization

Status: Sequenced after SECURITY-001 approval plus TENANT-001 and AUTHN-001
security-context contracts. Implementation is not yet authorized.

## Context

Authentication proves an Actor/client context but grants no protocol action.
IPO.ONE needs one deny-by-default policy registry that enforces actor type,
explicit capability, object tenant ownership, AccessGrant purpose, live
Mandate/SpendPolicy/risk state, reason, idempotency, and approval requirements
in a fixed order for both Human BFF and Agent API calls.

## Scope After Approval

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

## Security Checklist

- [ ] SECURITY-001 decision and prerequisite versions are linked.
- [ ] Policy is closed, versioned, deny-by-default, and route-complete.
- [ ] Tenant ownership is checked in application code and RLS.
- [ ] AccessGrant purpose, resource, capability, tenant, and expiry are exact.
- [ ] TOCTOU and concurrent revocation paths are tested.
- [ ] Allow and deny audits are bounded and contain no raw credentials or PII.
- [ ] No capability bypasses protocol or risk invariants.
- [ ] Production policy activation remains a separate approval.
