# V9-005 pre-change mapping

Recorded: 2026-07-24T12:11:23.997Z  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Gate and scope

V9-004 was accepted by the IPO.ONE Founder at
`2026-07-24T12:11:23.997Z`, which unlocks V9-005 only. V9-005 is a
read-productization task. It does not authorize a new list/search authority,
mutation, mutable browser ledger, permission, privacy boundary, dependency,
external network, deployment, real-funds path, or V9-006.

## Existing runtime truth

| Product need | Existing authoritative runtime | Pre-change product gap |
| --- | --- | --- |
| Bounded owned references | `pilotReadWorkspaceResume` returns at most 32 active Actor-bound opaque resource references | Obligations did not compose these references into its own list/detail experience |
| Exact current Obligation | `pilotReadOwnObligation` returns one owner-authorized `obligation.v2`, schedule and latest servicing action as `tenant_owned_obligation_view.v1` | The Obligations page showed only the currently selected Offer/Obligation summary |
| Current portfolio amounts | `servicing_position_index.v1` reauthorizes at most 8 exact references and exposes aggregates only when every visible reference is current | The index was presented only inside Repay & Settle |
| Immutable history | `pilotReadOwnObligationEvidence` returns a bounded, opaque-cursor page of hash-only Evidence | Evidence was split between the Human workbench and Activity & Proofs, not composed with Obligation detail |
| Refresh/restart | workspace recovery plus exact reads reconstruct server state; browser storage retains only an opaque selected Obligation ID | Obligations did not expose recovery coverage or partial/unavailable states |
| Human/Agent entry | `authorityType` is `consent` or `mandate` on the same `obligation.v2`; owner/controller bindings are server-side | Obligations did not explain the entry difference while preserving one state machine |
| State versions and corrections | schedule sequence, latest servicing action and Evidence aggregate versions are immutable/versioned facts | The Obligations page did not show versions, finality, invalidation or explicit corrective/resolution events |
| Execution rail | pending/executed state and the exact signed sandbox execution receipt reference are part of `obligation.v2` | The Obligations page did not show the bounded sandbox rail state |

## Implementation decision

V9-005 will add one closed browser presentation contract before changing the
page. It will reuse the three existing read operations and
`servicing_position_index.v1`; it will not add a Tenant operation, catalog
entry, capability, AuthZ rule, admission class, migration, SDK authority, or
write path.

The product list is bounded by the already-authorized workspace references
and then reauthorized one exact resource at a time. Unrefreshed or denied
references reveal no amount or status. Aggregate amounts render only for
complete server-current coverage. The selected detail validates schedule
arithmetic through the existing servicing presentation and composes only the
matching hash-only Evidence page.

The rail label is limited to the existing signed, local, non-withdrawable
sandbox execution invariant and its opaque receipt reference. It does not
claim a production rail, Provider settlement, chain execution, or transferable
value.

## Expected change surface

- `apps/web/src/obligation-portfolio-presentation.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- focused browser-presentation and static UI tests
- authenticated browser fixture only where needed for V9-005 evidence
- V9 traceability and V9-005 audit documents

No database, protocol schema, catalog, AuthZ, admission, Ledger, Event,
Evidence, outbox, SDK or reconciliation code is expected to change.
