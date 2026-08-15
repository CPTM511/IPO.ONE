# EVIDENCE-001B: Dual-Native Self-Service Evidence

Status: Approved by the project owner and completed locally on 2026-07-16.
Depends on completed `EVIDENCE-001A`. This approval is limited to the three
permissions below and grants no production, public, export, mutation, PII, or
funds authority.

## Context

`EVIDENCE-001A` makes the immutable Obligation timeline operable for a
recent-MFA Auditor and records the same owner relationship on the Obligation
and Evidence authorization resources. Product Charter v1.1 ultimately requires
Human and Agent users to inspect the same Evidence truth through interfaces
appropriate to each caller. The current authorization policy deliberately
allows only Auditors, so self-service cannot be added as an implementation
assumption.

## Proposed Three-Part Permission Change

### 1. Owner-or-controller protocol permission

- Add a distinct `evidence.read.owned` capability and
  `pilotReadOwnObligationEvidence` query for Human and Agent actors.
- Require `resourceType=evidence`, `OwnershipRule.ACTOR`, the exact active owner
  binding created with the Obligation, or the durable Human controller binding
  for an Agent-owned Obligation, plus current Membership/Credential checks.
- Reuse the EVIDENCE-001A response, cursor, RLS transaction, redaction, quota,
  and no-idempotency rules. Do not broaden the Auditor operation.

### 2. Human read-only timeline composition

- Add the owned/controller query to the authenticated loopback Human pilot Host and
  render it in the existing Obligation detail UI.
- Show event label, finality, aggregate version, occurred/recorded time, and
  copyable Evidence/payload hashes with accessible loading, empty, pagination,
  and denial states.
- No raw payload, KYC reference, actor data, export, mutation, approval,
  servicing action, public route, or remote deployment.

### 3. Agent SDK and local MCP composition

- Add a typed SDK call and one local stdio MCP tool,
  `ipo_one_read_obligation_evidence`, pinned to the authenticated Agent's owned
  Evidence resource.
- Tool input contains only owned Obligation ID, bounded limit, optional opaque
  cursor, and request correlation; Authentication Context remains transport
  injected.
- No subscription, webhook, bulk export, remote MCP/A2A endpoint, credential,
  cross-Tenant grant administration, or funds authority.

## Acceptance Criteria

- [x] Human and Agent owners receive byte-equivalent Evidence summary semantics
  and pagination from one handler and one schema.
- [x] Non-owners, Humans without the exact durable controller binding, wrong-Tenant callers,
  stale/revoked identities, and callers using the Auditor operation fail with
  the same non-enumerating denial.
- [x] Human UI and Agent SDK/MCP expose no additional Evidence fields or
  authority and remain local/private.
- [x] Auditor access and scoped AccessGrant behavior remain unchanged.
- [x] Full unit, PostgreSQL, security, transport, and dual-chain gates pass.

## Non-Goals

- No public Evidence endpoint, bulk export, event subscription, notification,
  scheduler, external Evidence store, production deployment, cross-Tenant
  sharing UI, raw PII/KYC, or real-funds authority.

## Approval Gate

- [x] Approve the distinct owner-or-controller `evidence.read.owned` protocol permission.
- [x] Approve the authenticated Human read-only Obligation timeline UI.
- [x] Approve the typed Agent SDK plus local stdio MCP Evidence read tool.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
pnpm run test:chain:conformance
git diff --check
```

## Security Checklist

- [x] Ownership is resolved from the authorization resource, never a payload.
- [x] Human/Agent and Auditor capabilities/operations remain separate.
- [x] Cursor, response, UI, SDK, and MCP fields remain closed and bounded.
- [x] No payload, identity, credential, PII, cross-Tenant, production, or funds
  authority is introduced.

## Completion Evidence

- The 29-operation Tenant protocol includes
  `pilotReadOwnObligationEvidence`; exact owner/controller authorization is
  bound when the Obligation is accepted.
- The Human Obligation panel and typed Agent Evidence client use one bounded,
  cursor-paginated, hash-only result. The local MCP registry exposes
  `ipo_one_read_obligation_evidence` without accepting authority context.
- Node 24.18.0 full repository gate: 268/268; transport 35/35; security 21/21;
  fresh PostgreSQL 17: 54/54; chain conformance 6/6; reorg 5/5; live-chain
  unit 9/9; schemas 38; migration pairs 20.
