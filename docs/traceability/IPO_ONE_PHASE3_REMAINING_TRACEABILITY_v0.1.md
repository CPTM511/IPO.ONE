# IPO.ONE Phase 3 remaining traceability v0.1

Status: Public Beta L2 closure and HL-TESTNET-001A complete; HL-TESTNET-001B awaiting explicit approval

Date: 2026-08-31

Baseline: `origin/main` at
`c4cc81f09f1c7aeb78871373d29ed581e428daca`

## State vocabulary

`APPROVED`, `IMPLEMENTED`, `LOCALLY VERIFIED`, `DEPLOYED`, `REACHABLE`,
`USER VERIFIED`, `TESTNET VERIFIED`, `PUBLIC BETA ACTIVE`, and
`REAL-VALUE ACTIVE` are independent states. A filename, profile label, fixture,
historical receipt, task completion, or healthy deployment does not imply a
higher state.

## Current gate matrix

| Capability / gate | Current Evidence | Current truth | Required successor |
| --- | --- | --- | --- |
| M2 bounded v0.2.1 no-funds milestone | `M2_EXECUTION_PLAN_v0.1.md`, `M2B-006`, AUTHN-008 cutover/retirement Evidence | `PASS — DEPLOYED AND USER-VERIFIED` only for the exact no-funds boundary; M2 ends at `M2B-006` | None inside M2; later work is separately gated |
| Public authenticated no-funds runtime | Production health, capability discovery, Vercel deployment `dpl_XF9tYaYWe8qBuiXrQkWGrV4yChGt` and `PUBLIC-BETA-001C` acceptance | `PASS — DEPLOYED AND USER-VERIFIED` at `c4cc81f...`; profile `public_authenticated_no_funds_beta`; `single_v2`; no real funds; external Provider/Venue/chain writes disabled | Keep Public Beta live while later Phase 3 gates proceed |
| `PHASE3-POOL-001` remote Pool product | PRs `#60/#61`, deployment `dpl_5KLezhu9ZA3vcob8xgpMp5GSNPkq`, production visible-click and recovery Evidence | `PASS — DEPLOYED AND USER-VERIFIED` at merged/deployed SHA `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`; no signer or transaction | Preserve as the exact prerequisite baseline for `PILOT-008A`; no inherited activation authority |
| `L2_PUBLIC_AUTHENTICATED_NO_FUNDS` launch authority | Constitution v1.4, launch policy v1.4.0, Founder decision, final production deployment and `PUBLIC-BETA-001C` Evidence | `COMPLETE — PUBLIC BETA ACTIVE`; ordinary Human and Principal self-service is live; privileged roles remain separately controlled | Preserve current gates and no-funds boundary; no invited-cohort blocker remains |
| `REQ-PILOT-001` dispute/appeal/correction case workflow | `PILOT-008A` implementation plus deployed Public Beta shared-kernel and current Quality Gate Evidence | Required L2 operational capability; original truth immutable and corrections additive | Continue operating under Public Beta; no invitation dependency |
| `REQ-PILOT-002` privacy-safe analytics, feedback, support, and incident ownership | `PILOT-006`, Public Beta notice, existing support/incident/restore/rollback controls and `PUBLIC-BETA-001C` binding | Required L2 operational capability; does not imply invitation or participant approval | Keep operational ownership and Evidence current while Public Beta remains live |
| Historical `PILOT-008B/008C` | Gate 0 and Vercel + Neon preparation Evidence | Superseded by `DEC-PUBLIC-NO-FUNDS-BETA-001`; neither task is an active blocker | Retain only as historical preparation Evidence |
| Prior `PILOT-007` through `OPS-004` preparation | Task files, local contracts, runbooks, topology/operations JSON | Substantial local/preflight work exists, but several artifacts bind July release candidates and retain disabled/pending inputs | Rebase each retained control to the exact Phase 3 candidate; do not reuse stale release hashes as approval |
| Base Sepolia secured-pool testnet proof | M2A-008/M2A-009 Evidence and enabled exact `live_testnet_secured_pool` profile | Exact Base Sepolia test-assets pool proof passed; no real value | Preserve as M2 Evidence; it does not satisfy Hyperliquid signed execution |
| `REQ-TRADE-005` / Hyperliquid delegated execution | M2B-001..004 local composition plus completed `HL-TESTNET-001A` exact account binding, generic gate, market preflight and account-specific reads | `HL-TESTNET-001A: PASS — READ-ONLY PREFLIGHT COMPLETE`; exact historical 002D master binding matches; role `user`, `998.989328` Testnet USDC account/withdrawable value, zero positions, zero orders and no subaccounts; no new signer, nonce, action, order, fill or Venue mutation occurred | Founder must explicitly approve the compact package before `HL-TESTNET-001B`; no B authority is inferred |
| `RISK-003B` shadow learning | Existing deterministic active policy and local shadow foundations | No finalized Hyperliquid execution/repayment outcome set exists for this gate | Ingest only finalized/reconciled outcomes after `HL-TESTNET-001`; remain non-authorizing |
| Phase 3 closure | Optimization Measure, Public Beta production baseline and L3 criteria | Public Beta baseline complete; no new Hyperliquid proof or finalized shadow outcome | `PHASE3-CLOSE-001` after `HL-TESTNET-001B` and `RISK-003B` |
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
| `L2_PUBLIC_AUTHENTICATED_NO_FUNDS` | supersedes L1 Hosted Closed Pilot admission semantics | public authenticated durable private-Tenant no-funds Beta |
| `L3_LIVE_TESTNET` | L2 Live Testnet Execution | separately approved testnet execution/read proof |
| `L4_CONTROLLED_REAL_VALUE` | L3 Controlled Real Value | bounded Agent-only real-value candidate, currently disabled |
| `L5_PRODUCTION` | not defined as a guide stage | production real-value operation, not approved |

## Blocking conclusions

1. `PHASE3-POOL-001` and `PUBLIC-BETA-001C` are complete. Public Beta remains
   active; historical `PILOT-008B/008C` tasks are superseded and are not active
   blockers.
2. The exact production baseline is `c4cc81f...`; it grants no Hyperliquid
   signer or Venue-write authority.
3. Hyperliquid Testnet signing cannot inherit M2B local authority or the Base
   Sepolia pool approval.
4. `HL-TESTNET-001A` is complete using the exact Founder-controlled historical
   002D master account and fresh read-only proof. The retired historical signer
   remains non-reusable; B requires a fresh dedicated signer after approval.
5. Shadow learning cannot begin with synthetic or pending Venue outcomes and
   cannot change active credit authority.
6. M3 code cannot begin until a new Constitution decision and reviewed
   execution plan exist.

Permission/funds/deployment impact: **none**. This matrix records current truth
and successor gates only.
