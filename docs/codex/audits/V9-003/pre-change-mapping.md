# V9-003 pre-change mapping

Recorded: 2026-07-24  
Source branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Prerequisite: V9-002 accepted by the IPO.ONE Founder at
`2026-07-24T08:13:35Z`

## Existing authoritative path

V9-003 starts from an implemented shared Human/Agent sandbox servicing
kernel. The browser is not the source of truth.

- `pilotReadWorkspaceResume` returns at most 32 opaque resources already
  bound to the authenticated Actor. It exposes no balances, financial state,
  identity data, search, or caller-supplied authority.
- `pilotReadOwnObligation` reauthorizes one exact Obligation and returns the
  current durable `obligation.v2`, trusted `asOf`, optional latest
  `sandbox_servicing_action.v1`, and explicit no-funds flags.
- `pilotPostSandboxRepayment` posts a bounded synthetic payment against one
  exact owned Obligation through the existing fee -> interest -> principal
  waterfall. It accrues interest to trusted command time before allocation.
- `workerAdvanceSandboxServicing` alone derives grace, DPD buckets, and
  default from trusted UTC and the oldest unpaid installment.
- Repayment can derive cure inside the same transaction. Human or Agent input
  cannot supply DPD, status, clock, allocation, account, Ledger result,
  Evidence, or production flags.
- Restructure, repurchase, and write-off remain separate Operator proposal
  plus independent Risk approval paths with recent MFA and exact version
  binding.
- The PostgreSQL Gateway transaction commits Obligation/installments,
  repayment, Ledger transaction/entries, Event, Evidence, outbox, snapshots,
  authorization/resource version, capacity, audit, and idempotent response
  atomically.
- Reconciliation compares the normalized Obligation, Ledger, events,
  snapshots, registry, servicing actions, and repayment projections; repair
  remains approval-gated and never automatic.

## Existing product composition

- Repay & Settle already renders one verified `servicing_case_presentation.v1`
  from the exact returned Obligation and latest servicing action.
- It shows component balances, immutable schedule, trusted-time DPD,
  classification, cure amount, latest action, and no-funds boundaries.
- The browser keeps only one opaque Obligation ID in session storage for
  reload navigation.
- Workspace recovery already returns multiple bound Obligation references and
  renders a position picker, but only the selected position has an
  authoritative financial summary. Other rows show reference-only copy until
  individually selected.
- The Human browser uses the existing repayment command. Agent mode points to
  the existing authenticated SDK/MCP workflow and never relabels Human session
  state as Agent state.

## Gap to close in V9-003

The current UI can switch between multiple opaque references, but it cannot
refresh and compare a bounded set of current positions in one deliberate
user action. There is no closed browser contract that proves every displayed
position summary came from a matching
`tenant_owned_obligation_view.v1`.

V9-003 will therefore:

1. add a closed, immutable `servicing_position_index.v1` browser contract;
2. accept only Actor-bound workspace Obligation references and separately
   reauthorized owned-Obligation views;
3. cap the reviewed position set at eight and reject duplicates, mismatched
   IDs, unsafe flags, malformed trusted time, invalid schedules, lifecycle/DPD
   drift, and unknown fields;
4. let the Human explicitly refresh those bounded positions using only
   `pilotReadOwnObligation`;
5. display financial values only for successfully reauthorized server views;
6. keep unrefreshed/unavailable rows non-financial and non-enumerating;
7. refresh the selected exact server view after repayment before presenting
   the updated multi-position state;
8. add browser multi-position, negative-contract, restart, and reconciliation
   evidence.

## Contract and permission disposition

- New Tenant operation: none.
- New success mutation: none.
- Catalog/AuthZ/admission capability change: none.
- Migration or database state change: none.
- Ledger/Event/Evidence policy change: none.
- Pricing, fee, clock, DPD, default, cure, or disposition policy change: none.
- Contract, chain, RPC, signer, credential, custody, external network,
  deployment, mainnet, lender, facility, or real-funds change: none.

The versioned browser contract is presentation-only. It cannot authorize a
payment, predict settlement, create an Obligation, change servicing state, or
perform an approved disposition.
