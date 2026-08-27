# IPO.ONE Phase 3 remaining traceability v0.1

Status: alignment Evidence; successor execution remains gated

Date: 2026-08-27

Baseline: `origin/main` at
`39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`

## State vocabulary

`APPROVED`, `IMPLEMENTED`, `LOCALLY VERIFIED`, `DEPLOYED`, `REACHABLE`,
`USER VERIFIED`, `TESTNET VERIFIED`, `PILOT ACTIVE`, `PILOT EXITED`, and
`REAL-VALUE ACTIVE` are independent states. A filename, profile label, fixture,
historical receipt, task completion, or healthy deployment does not imply a
higher state.

## Current gate matrix

| Capability / gate | Current Evidence | Current truth | Required successor |
| --- | --- | --- | --- |
| M2 bounded v0.2.1 no-funds milestone | `M2_EXECUTION_PLAN_v0.1.md`, `M2B-006`, AUTHN-008 cutover/retirement Evidence | `PASS — DEPLOYED AND USER-VERIFIED` only for the exact no-funds boundary; M2 ends at `M2B-006` | None inside M2; later work is separately gated |
| Remote no-funds runtime | Live `/livez`, `/readyz`, and discovery at source `3bb525c...` | Deployed, reachable, healthy, `single_v2`, no real funds; external Provider/Venue/chain writes disabled | Rebase as an input to a future exact pilot candidate; do not relabel it as an active cohort |
| `PHASE3-POOL-001` remote Pool product | M2A-007 local surfaces, M2A-008 exact Base Sepolia deployment/Evidence, live `ipo.one` visible-click diagnosis | CODE, testnet deployment and local verification complete; normal remote discovery, server-derived live reads and recovery incomplete | Complete one Founder-approved read-only vertical repair; final merged SHA must run and be user-verified on `ipo.one`; no signer or transaction |
| `closed_non_funds_pilot` launch authority | Launch policy v1.3.3 and pending approval template | `releaseEnabled=false`; pending gates are not approvals | `PILOT-008` readiness closure, named approvals, exact policy revision, deployment/activation review |
| `REQ-PILOT-001` dispute/appeal/correction case workflow | Constitution v1.3; current code/task search; M1 traceability | Required before closed pilot; no domain, persistence, operation, UI, or Agent equivalent found | Separate issue-sized shared-kernel Human UI plus authorized API/MCP case workflow before cohort activation |
| `REQ-PILOT-002` privacy-safe analytics, feedback, support, and incident ownership | Existing feedback, alert, synthetic, and operations foundations | Partial; retention, normal support channel, privacy approval, named incident/support ownership, and complete operational proof remain open | Separate issue-sized closure and named Legal/Privacy/Operations/Product approvals |
| Prior `PILOT-007` through `OPS-004` preparation | Task files, local contracts, runbooks, topology/operations JSON | Substantial local/preflight work exists, but several artifacts bind July release candidates and retain disabled/pending inputs | Rebase each retained control to the exact Phase 3 candidate; do not reuse stale release hashes as approval |
| Base Sepolia secured-pool testnet proof | M2A-008/M2A-009 Evidence and enabled exact `live_testnet_secured_pool` profile | Exact Base Sepolia test-assets pool proof passed; no real value | Preserve as M2 Evidence; it does not satisfy Hyperliquid signed execution |
| `REQ-TRADE-005` / Hyperliquid delegated execution | M2B-001..004 local composition and recovery Evidence | Architecture and local no-funds composition exist; no approved live account, signer, nonce, action, order, fill, or Venue reconciliation run | `HL-TESTNET-001` after `PILOT-008` exit and exact run approval |
| `RISK-003B` shadow learning | Existing deterministic active policy and local shadow foundations | No finalized Hyperliquid execution/repayment outcome set exists for this gate | Ingest only finalized/reconciled outcomes after `HL-TESTNET-001`; remain non-authorizing |
| Phase 3 closure | Optimization Measure and Local-to-Closed-Pilot exit criteria | Not started; no cohort exit or Hyperliquid proof | `PHASE3-CLOSE-001` after the three predecessor gates |
| Post-M2 M3 Task/API/Compute | M2 Pre-Development Alignment says only `deferred to M3` | Directional mention only; no Constitution requirement, governing decision, execution plan, or code authority | `M3-000` Constitution vNext proposal and execution-plan review after Phase 3 closure |
| Phase 4 / controlled real value | Constitution and launch policy | Disabled; real-value launch profile remains locked | Future complete decision package, policy revision, external review, and Founder go/no-go |

## Naming reconciliation

The Local-to-Closed-Pilot Guide predates Constitution v1.3 and uses an older
stage numbering scheme. All new work must use the Constitution mode as the
canonical authority and may include the older label only as a parenthetical
cross-reference.

| Canonical Constitution mode | Older delivery-guide label | Meaning |
| --- | --- | --- |
| `L0_LOCAL_NO_FUNDS` | L0 Local Integration | local durable synthetic work |
| `L1_PUBLIC_SANDBOX` | public sandbox is separate from the guide's authority stages | public synthetic demonstration; no private Tenant data |
| `L2_CLOSED_NO_FUNDS` | L1 Hosted Closed Pilot | invited durable private-Tenant no-funds pilot |
| `L3_LIVE_TESTNET` | L2 Live Testnet Execution | separately approved testnet execution/read proof |
| `L4_CONTROLLED_REAL_VALUE` | L3 Controlled Real Value | bounded Agent-only real-value candidate, currently disabled |
| `L5_PRODUCTION` | not defined as a guide stage | production real-value operation, not approved |

## Blocking conclusions

1. `PHASE3-POOL-001` is the next implementation action. It must close the
   deployed-Pool remote product defect before `PILOT-008A` begins.
2. The remote M2B-006 release is a valuable exact baseline, not launch-policy
   proof for an invited cohort.
3. Hyperliquid Testnet signing cannot inherit M2B local authority or the Base
   Sepolia pool approval.
4. Shadow learning cannot begin with synthetic or pending Venue outcomes and
   cannot change active credit authority.
5. M3 code cannot begin until a new Constitution decision and reviewed
   execution plan exist.

Permission/funds/deployment impact: **none**. This matrix records current truth
and successor gates only.
