# TC-104 Pre-change Mapping

Captured at: `2026-07-25T07:57:58.241Z`

Repository: `/Users/cptmao/Documents/IPO.ONE`  
Branch: `codex/commercial-access-release`  
Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Task boundary: TC-104 only

## Authority

The IPO.ONE Founder accepted TC-103 and authorized TC-104 through
`接受，开始TC-104`. TC-105 and every later task remain blocked. The decision
does not authorize a venue, credentials, signing, network writes, deployment,
redeemable value, custody, withdrawals, mainnet, or real funds.

## Runtime truth before TC-104

- Tenant protocol operations: 66.
- Trading Capital operations present: 20/25.
- TC-104 settlement/evidence operations present: 0/5.
- Ordered migration pairs: 31.
- TC-103 provides one canonical synthetic Facility linked to one shared
  Obligation and the existing Ledger boundary.
- A flattened Facility has zero open Order Intents, zero synthetic exposure,
  synthetic equity equal to synthetic capital, and risk state `FLATTEN`.
- Risk state `SETTLEMENT` exists but cannot yet be entered.
- Human, Agent, and Provider role clients can read the same bound Facility.
- The web app has no top-level Trading Capital destination. TC-101 through
  TC-103 provide fail-closed presentation adapters, not an integrated
  eight-view product surface.
- The existing local Agent MCP catalog has 11 V9 Agent-credit tools. It does
  not expose a role-scoped Trading Capital catalog.

Runtime-source search found no occurrence of:

1. `tradingRequestClose`
2. `tradingRunSettlement`
3. `tradingReadSettlement`
4. `tradingIssuePerformanceProof`
5. `tradingReadFacilityEvidence`

## Reuse map

| Concern | Existing authority to reuse | TC-104 change |
| --- | --- | --- |
| Economic identity | Canonical Obligation, shared asset ID, Facility link | Preserve unchanged; no second Obligation or Ledger |
| Close admission | Flattened Facility state and exact state hash/version | Add an immutable Actor-requested close record |
| Settlement | Facility capital, contribution records, zero exposure | Add deterministic, zero-profit, zero-fee conservation result |
| Ledger | Existing canonical Ledger and reconciliation | Record that TC-104 creates no Ledger mutation; reconcile instead of duplicating value |
| Evidence | Event/Evidence envelope, outbox, projection registry | Add close, settlement, and proof events and a bounded Facility Evidence view |
| Proof | Hash-bound artifact patterns | Add a privacy-minimized, revocable-by-design Performance Proof; no official-report claim |
| AuthZ | deny-by-default Tenant policy and Actor bindings | Subject close; worker settlement; Human/Agent/Provider bound reads and proof access |
| Persistence | serializable command boundary, forced RLS, immutable projections | Add migration 0032 with close, settlement, and proof tables |
| SDK | role-specific Tenant command clients and TypeScript unions | Add all five operations to the appropriate role clients and declarations |
| MCP | local stdio adapter pattern | Add a separate role-scoped local Trading Capital adapter; no remote MCP |
| UI | V9 shell and TC-101..103 presentations | Add one top-level module with eight contract-backed views |

## Conservative settlement rule

TC-104 has no approved real pricing, profit participation, loss estimate, fee,
venue cost, or redeemable settlement authority. Therefore the only admissible
local no-funds waterfall is:

1. require a protectively flattened Facility;
2. require zero open orders and zero exposure;
3. use server-recorded synthetic equity only;
4. set venue cost, closing cost, realized profit/loss, fixed return,
   performance participation, and IPO.ONE fee to zero;
5. return the recorded non-redeemable Provider contribution and Subject
   contribution exactly;
6. require total allocation to equal final synthetic equity; and
7. create no Ledger transaction, transfer, withdrawal, venue call, or
   production authority.

This is an accounting proof for a synthetic lifecycle, not a claim that money
was returned or that a Provider earned income.

## Planned acceptance evidence

- domain conservation and state-machine tests;
- authorization, approval, abuse, schema, handler-registry, and protocol
  contract tests;
- PostgreSQL RLS, replay, race, restart, projection, and reconciliation tests;
- SDK and local role-scoped MCP parity tests;
- eight-view keyboard, responsive, accessibility, and fail-closed browser
  tests;
- full repository, security, transport, schema, migration, catalog,
  traceability, and bundle checks; and
- a final TC-104 implementation audit with exact hashes and rollback.

No successor task is part of this mapping.
