# ADR-020: Durable Dual Control and Protective Break Glass

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

ADR-019 established deny-by-default authorization and required exact
dual-control authority for exposure increases, unfreeze, and projection repair.
A caller-supplied approval document or reusable approval token would create a
privilege-escalation and replay boundary. IPO.ONE instead needs durable,
versioned approval state whose authority can be reconstructed, revalidated,
executed once, and reconciled after restart.

Emergency controls have a different purpose. They must allow rapid protective
reduction during an incident without becoming a super-admin path, an approval
bypass, or a way to increase exposure, move funds, mutate history, or read PII.

## Decision

1. Every current high-impact command is classified exactly once as protective,
   dual-control, or prohibited. `check:approval-policy` and unit tests fail when
   an authorization policy is added, removed, or weakened without matching
   classification.
2. Only `AuthorizationService.prepareApproval` can mint a short-lived,
   process-branded preparation. It binds Tenant, command Actor/client,
   operation, action, resource and live-state versions, reason, policy,
   idempotency reference, and exact command hash.
3. A versioned ApprovalProposal persists the preparation facts. Approval
   artifacts expose only proposal ID and version; they are locators, not bearer
   authority.
4. Dual control requires exactly two distinct qualified Human Actors: one Risk
   Operator and one Operations Operator. The proposer and command Actor cannot
   approve. Decisions bind current Credential and Membership versions, recent
   phishing-resistant MFA, token-reference hash, proposal hash, command hash,
   role, reason, and timestamp.
5. Authorization reloads proposal and decision state and revalidates both
   approvers. Any expiry, status change, command/resource/policy mismatch,
   stale MFA, revoked Credential, changed Membership, duplicated Actor, wrong
   role, or self-approval fails closed.
6. Execution requires a fresh, server-created authorization decision that has
   passed TOCTOU revalidation. The business events/projections, execution
   record, and executed proposal transition commit through one serializable
   event/outbox/projection unit of work. Concurrent execution produces one
   winner. The idempotency identity binds the durable proposal and command, not
   the replaceable short-lived authorization decision ID, so two current
   authorization decisions for the same command recover one response.
7. Proposal, decision, execution, break-glass incident, custodian decision, and
   review records are tenant-owned projections with forced PostgreSQL RLS,
   transaction-local Tenant context, immutable or guarded transitions,
   snapshots, registry hashes, Events, Evidence, and outbox records.
8. Reconciliation verifies projection coverage and hashes plus proposal,
   approval-role, decision, execution, custodian, and review linkage.
9. Break glass is disabled by default. Enabling it requires a separate
   deployment approval reference, named requester set, exactly two distinct
   custodians, a disjoint review owner, notification target, and a maximum
   30-minute session. Both custodians must present recent phishing-resistant
   hardware-key authentication.
10. Break glass is exact-scope and protective-only. Its fixed action set is
    credential revoke, Provider pause, risk freeze, Tenant command pause, and
    worker delivery pause. It cannot unfreeze, increase limits, execute repair,
    issue credentials, move funds, mutate history, access PII, or create
    wildcard Tenant authority. It cannot be refreshed, expires automatically,
    emits notification-linked Evidence, and requires review within 24 hours.
    A protective authorization is available only to a configured requester,
    binds that requester's Actor/client/Credential/Policy and the live incident
    version, and must be revalidated against the current incident before use;
    close or expiry invalidates previously issued authority.
11. This decision does not activate production roles, a Human IdP, named
    custodians, cloud IAM, public tenant routes, private data, Providers,
    KYC/KYP, custody, or funds. Those remain independent human and deployment
    gates.

## Consequences

- Human and Agent commands share one exact-command approval boundary without a
  second privilege model in the UI or SDK.
- Approval state survives process restart and is inspectable by operators and
  reconciliation, while short-lived authorization decisions remain private
  process capabilities.
- The current Credential, Membership, resource, live-policy, and authorization
  audit adapters remain bounded in-memory implementations. DATA-003 must replace
  or compose reviewed durable adapters behind a separate authenticated Tenant
  command gateway before private pilot use. That gateway must define a secure
  completed-command lookup path for retries after an actual process restart;
  this local service does not treat an expired process-branded decision as
  durable authority.
- DATA-003 must also bind the requester and current break-glass incident
  status/version/scope inside the protective command transaction. The local
  pre-mutation revalidation closes process-level stale authority, but is not a
  substitute for that durable transaction boundary.
- The public `ipo.one` runtime remains the older anonymous no-real-funds
  sandbox. This ADR is not deployment authorization.

## Verification

- `pnpm run check:approval-policy`
- `pnpm run check`
- `pnpm run test:security`
- `pnpm run test:postgres`

The PostgreSQL suite proves migration up/down/up, pending and executed state
recovery, two-role approvals, concurrent single execution, stable idempotent
retry across distinct current authorization decisions, RLS isolation, append-only
records, the complete protective break-glass lifecycle, and clean
reconciliation.
