# APPROVAL-001: Dual Control and Break Glass

Status: Implemented and verified as a local non-funds domain and PostgreSQL
boundary under SECURITY-001. Not wired to the public runtime or approved for
production activation.

## Context

Protective reductions must remain fast, while privilege, exposure, provider,
key, unfreeze, and repair increases must never be unilateral. IPO.ONE needs a
durable proposal/approval/execution state machine and a narrowly bounded
break-glass path that cannot become a permanent super-admin mechanism.

## Implemented Scope

- Add immutable ApprovalProposal and ApprovalDecision records bound to tenant,
  action, resource, exact command hash, aggregate versions, reason, proposer,
  approver, policy version, and expiry.
- Permit one authorized Actor with reason to freeze, reduce, revoke, stop, or
  prepare a replay/repair dry run.
- Require two distinct qualified Actors, no self-approval, and a maximum
  30-minute window for unfreeze, cap/limit increase, production integration,
  privileged credential/key changes, sensitive AccessGrant, and production
  projection repair.
- Revalidate membership, capability, MFA age, resource versions, policy, risk,
  freeze/default/stop-loss state, and proposal hash at execution.
- Make proposal, approve/reject, expire, cancel, execute, and supersede events
  idempotent, auditable, restart-safe, and reconcilable.
- Add a separate two-custodian hardware-key break-glass state machine limited
  to one incident, tenant/scope, and 30 minutes with immediate notification,
  automatic expiry, no refresh, recording/export, and review within 24 hours.

## Non-Goals

- No implementation before SECURITY-001 and AuthN/AuthZ approval.
- No break glass for cap increase, unfreeze, funds movement, history mutation,
  raw PII, wildcard tenant access, credential sharing, or approval bypass.
- No real funds, Provider activation, production key, cloud IAM, KYC/KYP, or
  deployment permission is granted by this state machine.
- No self-approval, reusable approval token, or approval detached from exact
  command contents and current resource versions.

## Likely Files

- `modules/authorization/*`
- `modules/admin/*`
- `modules/event-audit/*`
- `modules/persistence/*`
- `apps/api/src/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `db/migrations/*`
- `security/test/*`
- `docs/operations/*`

## Acceptance Criteria

- Every high-impact action is classified as immediate protective, dual-control,
  or prohibited; CI rejects unclassified admin/risk commands.
- Same-Actor, wrong-role, wrong-tenant, expired, canceled, superseded,
  changed-command, changed-version, stale-MFA, revoked-membership, and replayed
  approvals fail without a business mutation.
- Two concurrent approvals or executions produce one deterministic economic
  outcome and one idempotent response.
- A restart preserves pending/expired/executed state and reconciliation proves
  proposal, decisions, audit, Evidence, and resulting command linkage.
- Break glass requires two independent custodians and cannot acquire a
  prohibited capability; expiry and notification cannot be suppressed.
- Production repair remains dry-run first and requires exact discrepancy,
  expected hash/version, actor, reason, approval IDs, and idempotency key.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Security Checklist

- [x] Operation classification and two-role approver separation are fixed for all current high-impact commands.
- [x] Approval binds exact Tenant, resource, command, versions, reason, and policy.
- [x] Self-approval and Actor/client aliasing do not create additional approvers.
- [x] Expiry, cancellation, replay, concurrency, restart recovery, and TOCTOU are tested.
- [x] Break-glass scope, duration, custody, notification reference, and review are fixed.
- [x] Break glass cannot unfreeze, increase exposure, move funds, mutate history, or read PII.
- [x] All persisted transitions emit bounded Event, Evidence, snapshot, and outbox records without secrets.
- [x] Production action and deployment remain separate approvals.

## Implementation Evidence (2026-07-14)

- ADR-020 records the exact-command proposal, two-role decision, atomic
  execution, and protective-only break-glass decisions.
- Migration `0006_approval_runtime` adds tenant-owned proposal, decision,
  execution, incident, custodian, and review records with forced RLS,
  append-only/transition guards, expiry bounds, and reversible migration.
- The authorization boundary creates a server-branded preparation and accepts
  only `{ proposalId, proposalVersion }` as the external artifact. Approval
  verification is repeated during authorization and immediate pre-mutation
  revalidation.
- The serializable PostgreSQL command commits business mutation, proposal
  execution, Events, Evidence, outbox, snapshots, and projection hashes as one
  unit. Reconciliation checks approval and break-glass linkage.
- Protective break-glass authority is requester-bound and records the exact
  Actor, client, Credential/Policy versions, incident version, action, and
  resource. A live revalidation rejects closed, expired, changed, cross-Tenant,
  or differently authenticated use before the command boundary.
- Real PostgreSQL tests prove restart recovery, concurrent single execution,
  stable idempotent retry across distinct current authorization decisions,
  cross-Tenant RLS, immutable decisions, and the complete declaration through
  review break-glass lifecycle.
- JSON Schema 2020-12 contracts cover all six durable records. CI runs an
  explicit policy-classification drift gate and approval security checks.

## Remaining Deployment Gates

- Human IdP vendor and production Credential/Membership stores.
- Named break-glass custodians, requester set, review owner, hardware-key
  enrollment, notification delivery, and protected-environment approval.
- DATA-003 authenticated Tenant command gateway and transaction composition.
  It must recover completed idempotent responses after process restart without
  treating an expired process-branded decision as durable authority, and must
  bind live break-glass incident status/version/scope into the same protective
  command transaction.
- Production cross-Tenant quota/edge provider and DATA-003 composition of the
  completed local ABUSE-001 admission boundary before resource resolution.
- Production database operations, backup/restore, monitoring, incident
  ownership, independent security review, private-data approval, Providers,
  KYC/KYP, custody, and any real-value path.
