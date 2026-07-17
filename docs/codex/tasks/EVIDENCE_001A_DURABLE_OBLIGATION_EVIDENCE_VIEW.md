# EVIDENCE-001A: Durable Obligation Evidence View

Status: Completed locally and verified on 2026-07-16. This task implements only the already
defined Auditor `evidence.read` capability and `pilotReadEvidence` authorization
policy. It does not authorize Human or Agent callers, create an export, expose a
public endpoint, or add production/funds authority.

## Context

Product Charter v1.1 requires one immutable Evidence truth for the Human and
Agent entry modes. The event runtime already commits Event, Evidence, projection,
and outbox state atomically, and authorization already defines an
Auditor-scoped `pilotReadEvidence` operation. The operation is not yet present in
the Tenant protocol, has no handler, and accepted Obligations do not register an
`evidence` authorization resource. As a result, the durable Evidence exists but
cannot be read through the authenticated product protocol.

## Scope

1. Register an `evidence` authorization resource whose resource ID equals the
   chain-agnostic Obligation ID in the same transaction that accepts the Offer
   and creates the Obligation. Preserve the same owner binding on both the
   existing `obligation` resource and the Evidence timeline resource without
   granting the owner a new capability.
2. Add the authenticated, non-idempotent `pilotReadEvidence` Tenant query for
   Auditors using the existing recent-MFA, tenant-or-scoped-grant policy.
3. Return a bounded, cursor-paginated Obligation Evidence timeline derived only
   from immutable `evidence_envelopes`. Include identity/hash/type/version/
   finality/time fields; never return payload, payload reference, actorRef,
   idempotency key, correlation/causation identifiers, raw KYC/PII, or secrets.

## Non-Goals

- No Human or Agent `evidence.read.self` permission. That requires a separate
  named human approval because the current policy allows only Auditors.
- No Agent MCP tool, public route, bulk audit export, event subscription,
  scheduler, notification, external Evidence store, or cross-tenant grant
  administration UI.
- No mutation of Evidence, backfill of historical authorization resources,
  production deployment, real funds, or chain commitment.

## Likely Files

- `modules/tenant-command-gateway/src/evidence-query-handlers.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-gateway.js`
- `modules/tenant-command-gateway/src/credit-acceptance-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `schemas/v2/tenant-protocol-result.schema.json`
- `api/tenant-protocol/*`
- related unit and PostgreSQL runtime tests

## Acceptance Criteria

- [x] Offer acceptance atomically registers both the Obligation authorization
  resource and its Evidence timeline resource.
- [x] An authenticated recent-MFA Auditor with `evidence.read` can read a
  bounded timeline for an authorized Obligation Evidence resource.
- [x] Tenant isolation and an optional scoped cross-tenant AccessGrant are
  enforced by the existing authorization service before the query executes.
- [x] Cursor order is stable across equal timestamps and concurrent immutable
  appends; limits are closed to `1..50`.
- [x] Response contains no Evidence payload, reference, actor, idempotency,
  correlation/causation, PII, credential, or funds authority.
- [x] Human and Agent callers remain denied.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Query authorization completes before any Evidence row is returned.
- [x] Resource ID is the exact chain-agnostic Obligation ID and is bounded.
- [x] Cursor parsing is closed, bounded, and rejects malformed values.
- [x] Database query executes inside the authenticated Tenant RLS transaction.
- [x] No response field can carry raw payload or external credential material.

## Follow-up Approval Gate

`EVIDENCE-001B` must separately request three bounded permissions before Human
or Agent self-service is implemented: (1) owner/controller-only
`evidence.read.owned`, (2) Human UI timeline composition, and (3) Agent SDK/MCP
read composition. Those permissions are intentionally not included here.

## Local Verification Evidence

- Runtime contract: Node `v24.18.0`, pnpm `11.1.3`.
- `pnpm run check`: passed with 28 Tenant protocol operations, 48 closed
  abuse-control classifications, and 242 unit tests.
- `pnpm run test:postgres`: 53/53 passed against a clean PostgreSQL 17 test
  database, including dual-resource atomic registration, Auditor pagination,
  Human/Agent denial, forced RLS, restart/replay, and full reconciliation.
- `pnpm run test:security`: 21/21 passed.
- `pnpm run test:transport`: 22/22 passed.
- `pnpm run test:chain:conformance`: 4/4 passed.
- `git diff --check`: passed.
