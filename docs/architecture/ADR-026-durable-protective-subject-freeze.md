# ADR-026: Durable Protective Agent Subject Freeze

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

An Agent pilot needs an immediate, durable stop control before any signed
Mandate activation or economic Gateway composition. The approved SEC-D05
matrix allows Risk and Operations Operators to freeze a Subject. SEC-D07
requires a reason and strong operator authentication but deliberately does not
require dual approval for a protective reduction. Requiring an approval or a
positive risk decision before freezing would let a failing dependency block
the safety action.

Subject state, authorization-resource state, and dependent Mandate state serve
different purposes. Closing the authorization resource would also block the
Agent's bounded status read. Cascading status rewrites into every dependent
aggregate would destroy independent history and create partial-failure risk.

## Decision

1. Compose `pilotFreezeSubject` through the existing Tenant Command Gateway for
   `risk_operator` and `operations_operator` Actors with `risk.freeze` only.
2. Require a current phishing-resistant authentication age, exact Tenant-owned
   Subject resource, one SEC-D07 protective reason, command idempotency, and the
   ABUSE-001 privileged quota class.
3. The PostgreSQL live-state adapter locks the current Agent Subject and treats
   `risk` as confirmation that the target is an Agent exposure and `freeze` as
   confirmation that `pending|active -> suspended` remains a restriction. No
   upstream risk service may veto the protective action.
4. The command handler repeats the transition invariant under the same
   serializable transaction and derives every authority field from the
   authenticated decision and durable projection.
5. Commit the status Event, Evidence, outbox, immutable snapshot, response,
   command execution authority, authorization audit, and admission completion
   atomically.
6. Preserve the active authorization resource and Actor bindings. A suspended
   Agent may read its own bounded state; dependent mutation policies must use
   Subject freeze as a fail-closed live input.
7. Do not cascade mutation into Mandates, Obligations, Lockboxes, Ledger, or
   Evidence. Their history remains independently reconstructable. Draft
   Mandate revocation remains available as a separate protective reduction.
8. Completed exact replay is recovered before mutable live-state authorization.
   A new command against the suspended Subject fails closed, and concurrency
   can commit only one state transition.
9. Do not publish `pilotUnfreezeSubject`. Unfreeze remains a separately
   implemented and reviewed dual-control command with stop-loss and
   reconciliation checks.
10. No public route, Mandate activation, credit, spend, payment, custody,
    contract, chain transaction, production identity, KYC/KYP, Human lending,
    or real funds are authorized by this decision.

## Consequences

- The local pilot control plane gains its first composed emergency exposure
  stop without granting any new economic authority.
- Agent and Human operator interfaces observe one durable status instead of an
  out-of-band operational flag.
- Future credit, spend, capture, repay, and provider handlers must fail closed
  on Subject suspension and prove that behavior in two-Tenant tests.
- Restoring authority is intentionally harder than reducing it and remains
  outside this slice.

## Verification

- Closed protocol fixtures prove only reviewed reasons and a suspended result.
- Unit tests prove one-way planning and Operator-client authority separation.
- PostgreSQL tests cover Risk/Operations success, Developer/Agent/cross-Tenant
  denial, exact replay, fresh-command rejection, concurrent freeze, Agent
  visibility, Mandate creation denial, immutable audit, and reconciliation.
- Security tests prove no unfreeze, exposure increase, public route, secret, or
  funds authority is introduced.
