# V9-001 pre-change mapping

Recorded: 2026-07-24  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `PRE_CHANGE`

The package source identity matches the current branch and `HEAD`. The
worktree contains the accepted, uncommitted AUDIT-001 through WALLET-003 work;
those changes are preserved and are not source drift.

## Current shell

The authenticated web shell currently exposes eight navigation destinations:

| Current key | Current label | Existing truth source |
| --- | --- | --- |
| `overview` | Portfolio | workspace resume plus selected owned Obligation |
| `human` | My Credit | authenticated Human lifecycle operations |
| `agent` | Agent Workspace | Principal/Agent identity and Mandate state |
| `credit` | Borrow & Credit | current Decision, Offer, and selected Obligation |
| `transfers` | Payments | selected owned Obligation and sandbox repayment |
| `evidence` | Evidence | owned/auditor Evidence reads |
| `risk` | Risk Operations | permissioned Tenant risk and servicing reads |
| `developer` | Agent API | local authenticated catalog and handoff surfaces |

The V9 traceability contract requires 13 destinations. Five destinations have
no dedicated production-shell route: Credit Passport, Capital Network, Wallet
& Permissions, Credit Track Record, and Reports & Exports. Existing page
subsections cover parts of those capabilities, but they are not independently
reachable or maturity-labelled.

## Server truth and gaps

- `pilotReadWorkspaceResume` returns only Actor-bound opaque resource
  references and workspace kind.
- `pilotReadOwnObligation` returns the selected owner-authorized Obligation,
  schedule, outstanding principal, servicing state, and latest action.
- The current Overview formats selected Obligation values from this response,
  but displays `$0.00` when no Obligation is loaded. That can be mistaken for a
  reconciled portfolio total.
- There is no current operation for aggregate portfolio totals or available
  credit. PRODUCT-002 classifies both as `ABSENT`; V9-001 must show them as
  unavailable, not calculate them in the browser.
- The authenticated Tenant catalog is the current server authority for which
  operations are available to the session. V9 maturity labels can be derived
  from that catalog without adding a financial operation.
- Mobile/QR, shareable proof, official report generation, production funds,
  remote MCP/A2A, and generic emergency mutations remain disabled or absent.

## Planned route mapping

| V9 destination | Existing surface or V9-001 shell state |
| --- | --- |
| Overview | existing authenticated Portfolio, corrected to selected-position truth |
| Request Credit | existing Human credit lifecycle |
| Repay & Settle | existing Payments/servicing workspace |
| Credit Passport | dedicated shell view linking to the server-derived Decision Passport |
| Obligations | existing selected Obligation summary |
| Agent Console | existing Agent identity/Mandate workspace |
| Capital Network | dedicated maturity view; provider sandbox loop only |
| Wallet & Permissions | dedicated maturity view; reviewed wallet/session boundaries only |
| Activity & Proofs | existing Evidence workspace |
| Credit Track Record | dedicated maturity view; no wallet-history success claim |
| Reports & Exports | dedicated maturity view; official artifact unavailable |
| Risk & Operations | existing permissioned Risk workspace |
| Architecture | existing Agent API/protocol architecture workspace |

## Change boundary

V9-001 will change the shell, navigation, presentation state, and browser tests
only. It will not add a Tenant operation, migration, financial calculation,
funds path, signer, credential, chain call, dependency, launch-policy change,
or deployment. Existing server operations, authorization, admission,
PostgreSQL unit of work, Ledger, Event, Evidence, outbox, and reconciliation
boundaries remain unchanged.
