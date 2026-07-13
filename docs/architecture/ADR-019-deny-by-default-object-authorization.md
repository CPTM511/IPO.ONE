# ADR-019: Deny-by-Default Capability and Object Authorization

Status: Accepted for local non-funds implementation by SECURITY-001 approval
Date: 2026-07-13

## Context

Authentication proves a request-scoped Actor and client identity but grants no
protocol authority. IPO.ONE needs one policy boundary for Human BFF requests,
Agent and Provider calls, and system workers without allowing UI code, wallet
ownership, external roles, plugins, or request parameters to define privilege.

The public sandbox remains anonymous and process-local. Its OpenAPI operations
must be classified, but its sandbox session identifier must never enter the
authenticated tenant authorization model.

## Decision

1. One versioned registry classifies every current public OpenAPI operation and
   every authenticated pilot or worker command. Public sandbox operations use
   the separate `public_sandbox` and `sandbox_partition` profile and cannot be
   authorized by the tenant `AuthorizationService`.
2. Authenticated authorization is deny-by-default and evaluates in this fixed
   order: route policy, active credential/version, active membership and exact
   client binding, Actor type and capability, object ownership or AccessGrant,
   live protocol/risk state, reason, idempotency, approval, and audit.
3. Roles are administration bundles and capability ceilings only. Runtime
   decisions require the same explicit capability in the Authentication
   Context, active Credential, active Membership, and operation policy.
4. A resource has one immutable Tenant and optional owning Actor. Actor-owned
   and Tenant-owned policies cannot substitute a resource from another Tenant.
   Missing, foreign, and unauthorized objects return the same outward denial.
5. Cross-tenant access requires one exact, actor-bound AccessGrant covering the
   owner Tenant, grantee Tenant, grantee Actor, resource type and ID, approved
   grant capability, purpose, policy version, validity window, and current
   version. Grants default to at most 30 days, are hard-capped at 90 days, and
   fail immediately after revocation or expiry.
6. Operations that depend on Mandate, SpendPolicy, risk, cap, freeze, provider,
   reconciliation, or worker state require a live adapter result. Missing,
   incomplete, denied, or changed live state fails closed. The current adapter
   is a bounded local reference implementation, not a production policy store.
7. Privileged Human operations require recent phishing-resistant MFA again at
   authorization time. Protective reductions require an approved reason and
   idempotency key. Exposure increases, unfreeze, and projection repair require
   an exact command-bound dual-control artifact. The verifier contract requires
   at least two distinct approver Actors and rejects self-approval by the
   command Actor. ADR-020 and APPROVAL-001 provide the durable local non-funds
   proposal/decision/execution boundary.
8. Only `AuthorizationService` can mint a trusted allow decision. The minting
   function and decision facts are module-private. Decisions are frozen,
   process-branded, command-hashed, token-reference-bound, and valid for no more
   than 60 seconds, with a 30-second default.
9. A command must revalidate the decision immediately before durable mutation.
   Revalidation checks credential, membership, resource, AccessGrant, live
   state, command hash, approval, and policy versions. The PostgreSQL security
   context bridge accepts only a current service-minted decision with at least
   one successful revalidation.
10. Every allow and deny evaluation writes a bounded append-only audit record.
    Both synchronous and asynchronous audit failure fail closed before an allow
    decision can escape. Audit records contain only HMAC references and bounded
    identifiers, never raw credentials, signatures, network addresses, KYC, or
    PII.
11. Outward authorization denial uses one non-enumerating `404` contract. Audit
    or policy infrastructure failure uses `503`; internal stage reasons remain
    audit-only.
12. Emergency rollback may remove operations or add restrictions, but cannot
    add actors or operations, remove live or MFA checks, weaken ownership,
    reason, idempotency, approval, transport, or audit requirements, or change
    action/resource/capability meaning.

## Consequences

- Human and machine presentation layers consume the same authorization
  decision and cannot create parallel privilege models.
- Credential rotation, Actor deactivation, membership suspension, resource
  version change, AccessGrant revocation/expiry, and live-state change invalidate
  pending authority.
- The current Membership, resource, AccessGrant, live-state, and audit adapters
  are bounded in-memory implementations. They prove policy semantics but are not
  restart-safe, horizontally consistent, or approved for customer state.
- DATA-003 must place revalidation and the durable command write set in one
  reviewed transaction boundary and must bind the decision's operation,
  resource, and command hash to the invoked handler. Authorization alone does
  not make the current public sandbox a tenant API.
- APPROVAL-001 now provides durable, expiring, two-Actor approval artifacts
  locally. ABUSE-001 must add Actor/Tenant command limits and enumeration
  controls; DATA-003 must compose the approved boundaries behind authenticated
  durable handlers.
- Human IdP selection, production credentials and roles, break-glass owners,
  private data, real funds, Provider execution, and deployment remain explicit
  approval gates.
