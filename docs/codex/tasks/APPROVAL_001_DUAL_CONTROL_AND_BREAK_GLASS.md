# APPROVAL-001: Dual Control and Break Glass

Status: Sequenced after SECURITY-001 approval and authenticated tenant
authorization. Implementation is not yet authorized.

## Context

Protective reductions must remain fast, while privilege, exposure, provider,
key, unfreeze, and repair increases must never be unilateral. IPO.ONE needs a
durable proposal/approval/execution state machine and a narrowly bounded
break-glass path that cannot become a permanent super-admin mechanism.

## Scope After Approval

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

- [ ] Operation classification and approver separation are approved.
- [ ] Approval binds exact tenant, resource, command, versions, and policy.
- [ ] Self-approval and Actor/client aliasing are impossible.
- [ ] Expiry, cancellation, replay, concurrency, and TOCTOU are tested.
- [ ] Break-glass scope, duration, custody, notification, and review are fixed.
- [ ] Break glass cannot unfreeze, increase exposure, move funds, or read PII.
- [ ] All transitions emit bounded audit/Evidence without secrets.
- [ ] Production action and deployment remain separate approvals.
