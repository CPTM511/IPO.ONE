# V9-002 pre-change mapping

Recorded: 2026-07-24  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Prerequisite: V9-001 accepted by IPO.ONE Founder at
`2026-07-24T04:32:54Z`  
Status: `PRE_CHANGE`

The package source identity matches the current branch and `HEAD`. The
worktree contains the accepted, uncommitted AUDIT-001 through V9-001 work.
Those changes are preserved and are not source drift.

## Existing shared protocol

Human and Agent already use the same authenticated, local, no-real-funds
application and economic operations:

| Stage | Operation | Current receipt/result |
| --- | --- | --- |
| Intent | `pilotRequestCredit` | `tenant_credit_intent_created.v1` |
| Application read | `pilotReadCreditApplication` | `tenant_credit_application_view.v1` |
| Decision and Offer | `pilotEvaluateCreditApplication` | `tenant_credit_application_evaluated.v2` |
| Acceptance | `pilotAcceptCreditOffer` | `tenant_credit_offer_accepted.v1` |
| No-funds execution | `pilotExecuteSandboxObligation` | `tenant_sandbox_obligation_executed.v1` |

The Human entry composes those operations through authenticated HTTPS and
`human_credit_offer_workflow_receipt.v1`. The Agent entry composes the same
kernel through the credential-free handoff, authenticated Agent client, and
`agent_credit_offer_workflow_receipt.v1` /
`agent_sandbox_obligation_workflow_receipt.v1`.

The current conformance layer already compares Human and Agent principal,
purpose, term, schedule, policy, approved amount, APR, origination fee,
disclosure, schedule offsets, and no-funds flags. Identity, Consent/Mandate,
transport, identifiers, hashes, reason codes, and absolute times intentionally
remain entry-specific.

## Existing enforcement

- The Tenant Gateway derives Tenant, Actor, role, Subject ownership, and exact
  object authorization from trusted Authentication Context.
- Human application authority is an active scoped Consent plus current
  synthetic identity-reference Evidence.
- Agent application authority is a scoped Mandate; Offer acceptance and
  execution require the active Principal-approved runtime Mandate.
- Acceptance locks and revalidates Offer, Intent, Decision, Subject,
  Principal, Consent/Mandate, Human identity Evidence, adverse Obligation
  state, frozen CreditLine state, capacity, and duplicate acceptance state in
  one serializable transaction.
- Acceptance submits exact Offer and terms hashes. Execution remains a signed,
  non-redeemable sandbox rail receipt with balanced Ledger posting.
- Commands are admitted, idempotent, evented, evidenced, outboxed, versioned,
  and reconciled. Unknown request/result fields fail closed.

## Product gaps to close in V9-002

1. Request Credit always opens with Human presentation, even if the user has
   explicitly selected Agent mode. The Agent journey exists in Agent Console
   and Architecture, but Request Credit does not present its bounded
   machine-facing equivalent.
2. The Human form remains editable after evaluation. Server hashes still make
   acceptance safe, but changed Subject, Consent, amount, term, purpose, or
   schedule can make the screen ambiguous. The browser should block
   acknowledgement until a fresh Offer matches the visible request.
3. The Offer card omits the server-returned origination fee, repayment
   frequency, installment count, validity, disclosure reference, and exact
   binding hashes.
4. The empty Offer principal is displayed as `$0.00`, which can be mistaken
   for a server Decision. It should be unavailable until an Offer exists.
5. The browser exposes one composite Offer receipt, but does not visibly
   distinguish the server receipts for Intent, Decision, Acceptance, and
   execution.
6. Existing acceptance tests cover stale Offer hash but do not explicitly
   exercise both Human Consent drift and Agent Mandate drift at the acceptance
   handler boundary.

## Planned change boundary

V9-002 will:

- add an in-memory, versioned review binding derived from the already-validated
  server workflow receipt;
- fail the Human acknowledgement UI closed when visible authority or economic
  inputs drift from that review binding;
- render the complete server-returned Offer terms and per-stage receipt
  metadata;
- add an Agent-mode Request Credit journey that routes to the existing
  Principal setup and authenticated Agent API rather than running Agent
  credentials in the browser;
- add focused Human/Agent drift, replay, receipt, and presentation tests.

V9-002 will not add or change an operation, schema, migration, policy,
capability, pricing rule, fee, lender, facility, capital source, signer,
credential, external dependency, chain call, deployment, or funds path.
