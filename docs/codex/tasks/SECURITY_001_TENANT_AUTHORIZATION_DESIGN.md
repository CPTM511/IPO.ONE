# SECURITY-001: Tenant and Authorization Design Gate

Status: Ready for Founder/CTO/Security review. Implementation is not authorized
by this document.

## Context

API-001 makes the current sandbox API explicit and testable, but it intentionally
adds no production identity, tenant isolation, permission, or rate-limit claim.
The canonical MVP requires AuthN/AuthZ, tenant scoping, RBAC, audit reasons, and
break-glass controls before an operator or external developer can safely share
one environment.

This issue is a design and threat-model gate. It must be approved before an
authentication dependency, credential store, security scheme, or production
permission is introduced.

## Scope

- Define the tenant root, resource ownership rules, and every legitimate
  cross-tenant access path.
- Define actors for Developer, Agent workload, Provider, Risk Operator, Admin,
  Auditor, and system worker identities.
- Produce an action/resource RBAC matrix with explicit object-level checks and
  deny-by-default behavior.
- Choose human and workload authentication mechanisms, credential lifecycle,
  rotation, revocation, expiry, and compromise response.
- Separate API authentication from wallet/account-binding proof. A wallet
  signature must not silently become a broad application session.
- Define dual-control and break-glass policy for freeze, pause, cap, provider,
  key, and future value-path changes.
- Define bounded request/rate policies by actor and operation, including
  anti-enumeration and abuse controls.
- Define immutable security audit fields: actor, tenant, action, resource,
  authorization decision, reason, request ID, policy version, and timestamp.
- Add threat cases for broken object/function authorization, confused deputy,
  replay, credential leakage, tenant inference, privilege escalation, unsafe
  upstream APIs, and administrator compromise.
- Propose OpenAPI security schemes and enforcement middleware boundaries only
  after the preceding decisions are approved.

## Non-Goals

- No authentication provider, API key, OAuth client, production secret, or
  security dependency is added in this issue.
- No real provider, wallet custody, on/off-ramp, KYC/KYP, deployment, contract,
  credit approval, or fund movement.
- No role may bypass Mandate, SpendPolicy, cap, ledger, Evidence, or
  reconciliation invariants.
- No global super-admin path without a time-bound, reasoned, independently
  audited break-glass design.

## Required Human Decisions

1. Human identity provider and required organization SSO posture.
2. Agent/provider workload authentication: OAuth client credentials,
   short-lived workload identity, bounded API keys, or an approved combination.
3. Tenant hierarchy and whether one Principal can belong to multiple tenants.
4. Which operations require dual approval and who may approve them.
5. Break-glass custody, maximum duration, notification, and review owner.
6. Credential and audit-log retention requirements by pilot jurisdiction.

## Likely Files After Approval

- `docs/architecture/adr/*`
- `api/openapi/ipo-one.v1.json`
- `packages/api-contract/*`
- `modules/authorization/*`
- `modules/persistence/*`
- `apps/api/src/*`
- `schemas/*`
- `db/migrations/*`

## Acceptance Criteria

- Every API operation has named allowed actors and an object-ownership rule.
- Cross-tenant reads and writes are impossible unless one documented system
  capability explicitly authorizes them.
- Admin and risk mutations require reason codes; selected high-impact actions
  require dual control.
- Authentication, authorization, Mandate verification, and account binding are
  distinct controls with no implicit privilege transfer.
- Credential issuance, storage, rotation, revocation, expiry, and incident
  response are documented and testable.
- Rate/resource limits cover identity, operation, tenant, and global scopes.
- Threat model maps mitigations and negative tests to the current API surface.
- Founder/CTO/Security approval is recorded before implementation begins.

## Planned Test Commands After Approval

```sh
pnpm run check
pnpm run test:postgres
pnpm run smoke:api
```

Negative suites must cover horizontal and vertical privilege escalation,
cross-tenant ID substitution, revoked/expired credentials, replay, missing
reason codes, dual-control bypass, rate-limit bypass, and audit-log omission.

## Security Checklist

- [ ] Threat model reviewed by Security/CTO.
- [ ] Tenant model and cross-tenant exceptions approved.
- [ ] Actor/action/resource matrix approved.
- [ ] Human and workload authentication choices approved.
- [ ] Dual-control and break-glass policy approved.
- [ ] No raw secret, private key, token, signature, or PII fixture committed.
- [ ] No production permission or deployment change bundled into design review.
