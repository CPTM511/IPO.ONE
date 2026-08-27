# PHASE3-000 — Phase 3 remaining alignment gate

Status: `COMPLETE — FOUNDER AMENDMENT RECORDED; PHASE3-POOL-001 AUTHORIZED`

Date: 2026-08-27

Baseline: `origin/main` at
`39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`

Requirements: `REQ-PILOT-001`, `REQ-PILOT-002`, `REQ-TRADE-005`,
`REQ-AGENT-POOL-001`, `REQ-EVID-001..004`, `REQ-RISK-001..002`,
`REQ-AUTO-001`

## Context and current baseline

The bounded M2 v0.2.1 no-funds milestone ends at `M2B-006`. The current M2
execution plan contains no `M2B-007`, and it grants no authority for external
Venue execution, mainnet, real value, M3 Task/API/Compute work, or a later
phase.

The current remote product is healthy at `https://ipo.one` and reports source
SHA `3bb525ce168ef274fea862cd3d5e55d35b2577fd`, profile label
`closed_non_funds_pilot`, authentication mode `single_v2`, and
`realFundsEnabled=false`. That label is not closed-pilot launch authority:

- `deploy/launch-policy.v1.json` keeps `closed_non_funds_pilot.releaseEnabled`
  set to `false`;
- `deploy/approvals/closed-non-funds-pilot.pending.json` remains a pending
  template; and
- `M2B-006` explicitly excludes launch-policy enablement, cohort activation,
  and inference of successor authority.

The Local-to-Closed-Pilot Guide still sequences `PILOT-008 ->
HL-TESTNET-001 -> RISK-003B`, but no current task file exists for any of those
three IDs. The current Constitution also makes `REQ-PILOT-001` and
`REQ-PILOT-002` prerequisites to `L2_CLOSED_NO_FUNDS`. The former is absent;
the latter is partial and lacks named privacy, retention, support, and incident
approval.

Founder review subsequently identified one product-integration defect inside
the bounded M2 evidence: the secured Pool is deployed and locally verified, but
the remote `ipo.one` product does not truthfully recover or normally expose its
read-only state. The Founder-approved Phase 3 amendment therefore inserts
`PHASE3-POOL-001` before `PILOT-008A`. This does not reopen M2, create
`M2B-007`, or authorize a signer or economic transaction.

## Scope

- Reconcile the current Constitution, Product Charter, Optimization Measure,
  Engineering Standard, Local-to-Closed-Pilot Guide, M2 plan, launch policy,
  task inventory, release Evidence, and live no-funds runtime.
- Record the exact M2 terminal state without inventing `M2B-007`.
- Normalize delivery-mode names so Constitution modes cannot be confused with
  the older Local-to-Closed-Pilot stage labels.
- Create one Phase 3 remaining execution plan.
- Prepare issue contracts for `PILOT-008`, `HL-TESTNET-001`, `RISK-003B`,
  Phase 3 closure, and the later M3 alignment gate.
- Record and activate the separately Founder-approved `PHASE3-POOL-001`
  remote read-only product repair as the first execution task.
- Record current blockers and required named approvals before any successor is
  activated.

## Non-goals

- No application, contract, schema, migration, policy, risk, UI, API, SDK,
  MCP, worker, testnet, model, or infrastructure implementation.
- No cohort invitation, participant credential, remote-access expansion,
  deployment, alias, DNS, cloud, database, signer, account, or secret mutation.
- No launch-policy revision or claim that `closed_non_funds_pilot` is active.
- No Hyperliquid request, signature, transaction, order, fill, cancel,
  reduce-only, flatten, transfer, or withdrawal.
- No active-policy, limit, pricing, underwriting, promotion, or model change.
- No M3 Constitution change or Task/API/Compute implementation.
- No mainnet, real value, Human cash lending, custody, or funds movement.

## Files

- `docs/codex/tasks/PHASE3_000_REMAINING_ALIGNMENT_GATE.md`
- `docs/codex/tasks/PHASE3_REMAINING_EXECUTION_PLAN_v0.1.md`
- `docs/traceability/IPO_ONE_PHASE3_REMAINING_TRACEABILITY_v0.1.md`
- `docs/codex/tasks/PILOT_008_INVITED_CLOSED_NO_FUNDS_COHORT.md`
- `docs/codex/tasks/HL_TESTNET_001_RESTRICTED_SIGNED_EXECUTION_PROOF.md`
- `docs/codex/tasks/RISK_003B_FINALIZED_TESTNET_SHADOW_LEARNING.md`
- `docs/codex/tasks/PHASE3_CLOSE_001_RELEASE_CLOSURE.md`
- `docs/codex/tasks/M3_000_TASK_API_COMPUTE_ALIGNMENT.md`

## Acceptance criteria

1. Given current `origin/main`, when M2 is traced, then the plan ends at
   `M2B-006` and no `M2B-007` or inherited later-phase authority is claimed.
2. Given the live remote release and checked-in launch policy, when status is
   reported, then remote no-funds deployment is kept distinct from closed-
   pilot activation.
3. Given Constitution v1.3, when `PILOT-008` is prepared, then
   `REQ-PILOT-001` and `REQ-PILOT-002` are explicit prerequisite closure gates.
4. Given the existing Base Sepolia secured-pool proof, when
   `HL-TESTNET-001` is described, then it is identified as the still-missing
   restricted Hyperliquid signed-execution proof, not the first testnet proof
   of any kind.
5. Given `RISK-003B`, when its inputs are defined, then only finalized and
   reconciled testnet outcomes may enter a versioned shadow loop and no result
   may change active credit authority.
6. Given the overloaded term `M3`, when the future gate is described, then the
   post-M2 Task/API/Compute milestone is distinguished from the historical
   MVP Build Spec row named `M3 Backend Alpha`.
7. Every prepared successor contains context, scope, non-goals, likely files,
   acceptance, tests, security, permission, migration/data impact, rollback,
   Evidence, dependencies, and status.
8. Documentation checks pass and no runtime or external state changes.

## Test commands

```sh
node scripts/check-launch-policy.mjs
pnpm run check:product-traceability
rg -n "PILOT-008|HL-TESTNET-001|RISK-003B|PHASE3-CLOSE-001|M3-000" \
  docs/codex/tasks docs/traceability
git diff --check
```

## Security checklist

- [x] No secret, credential, signer, account, participant PII, raw KYC, or
      private policy was added.
- [x] No deployment, launch, profile, remote-access, permission, risk, model,
      chain, Venue, or funds authority was inferred.
- [x] The live product label is not treated as launch-policy approval.
- [x] Human and Agent remain on one shared kernel.
- [x] Unknown, stale, unauthorized, and unreconciled state remains fail closed.
- [x] M3 remains documentation-only until a later Constitution decision.

## Permission boundary

This issue is documentation and read-only alignment only. Its completion
authorizes no successor. `PILOT-008`, `HL-TESTNET-001`, `RISK-003B`, launch-
policy revision, deployment, signer provisioning, risk/model work, and M3 each
require their own active issue and named approvals.

## Data and migration impact

None. No schema, migration, durable product state, launch policy, cloud
resource, or release profile is changed.

## Rollback

Remove only the new Phase 3 alignment, traceability, and prepared task
documents. Existing M2 Evidence, deployment state, launch policy, runtime, and
guidance remain unchanged.

## Required Evidence and execution result

- Current `origin/main`: `39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`.
- M2 terminal issue: `M2B-006`, `PASS — DEPLOYED AND USER-VERIFIED` at its
  exact no-funds boundary.
- Live observation on 2026-08-27: `/livez` and `/readyz` returned HTTP 200 at
  source SHA `3bb525ce168ef274fea862cd3d5e55d35b2577fd`; discovery reported
  `realFundsEnabled=false`, external Provider execution disabled, Venue writes
  disabled, and current-user chain writes disabled.
- Launch policy v1.3.3: `closed_non_funds_pilot.releaseEnabled=false`.
- Current prerequisite findings: `REQ-PILOT-001` absent;
  `REQ-PILOT-002` partial/unverified for L2 activation.
- Pool product finding: exact Base Sepolia deployment and local acceptance are
  complete; remote `ipo.one` discovery/recovery/read truth is incomplete.
- Prepared dependency chain and issue contracts in the files listed above.

Alignment verdict: `ALIGNMENT READY — NO RUNTIME CHANGE`. The later Founder
decision authorizes only `PHASE3-POOL-001`; its product verdict remains
`BLOCKED — NOT COMPLETE` until remote completion Evidence exists.
