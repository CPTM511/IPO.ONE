# M2B-003 — dual-risk monitoring and recovery

Status: `LOCAL L0 IMPLEMENTED — EXTERNAL PROTECTIVE EXECUTION BLOCKED`

Baseline: `944f344196f6a63a86ba817d750d466b09887142`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-RISK-001`, `REQ-RISK-002`, `REQ-TRADE-001`, `REQ-TRADE-004`,
`REQ-TRADE-005`, `REQ-POOL-EVID-001`, `REQ-AGENT-POOL-001`,
`REQ-AUTO-001`, `REQ-UX-002`, `REQ-UX-004`, `REQ-PRIV-001`

## Context

M2B-002 binds one exact M2B-001 authorization and stable HyperCore intent to a
single secured Facility composition, but stops at immutable `PREPARED` state.
The repository already has independent Pool discrepancy/risk controls,
Hyperliquid risk evaluation, protective action planning, `UNKNOWN` handling,
read-only venue reconciliation and canonical repayment/liquidation truth.
M2B-003 must compose those existing controls without creating a second risk,
Ledger, Obligation, Evidence or recovery engine.

The distinct `live_testnet_secured_pool_agent_execution` profile remains absent,
and `agentVenueExecutionEnabled` remains false. This issue may therefore
implement deterministic local monitoring, durable incidents, monotonic recovery
planning and truthful Human/Agent readiness only. It may not sign, submit,
cancel, flatten, repay or liquidate externally.

## Scope

- Derive one immutable dual-risk snapshot from the current M2B composition,
  Pool health/reconciliation truth and signer-free Venue margin/reconciliation
  truth.
- Classify Pool and Venue observations as `FRESH`, `STALE` or `UNKNOWN`, and
  compute the most restrictive shared risk state without caller thresholds.
- Open one idempotent, Tenant-isolated recovery incident when either domain is
  stale, unknown, discrepant, liquidatable, margin-stressed or already in a
  more restrictive state.
- Produce one ordered recovery plan:
  `FREEZE_NEW_RISK -> CANCEL -> REDUCE_OR_FLATTEN -> RECONCILE ->
  REPAY_OR_LIQUIDATE -> SETTLEMENT_REVIEW`.
- Make progression monotonic. Local completion may record only internal
  freeze/reconciliation observations; every external protective action remains
  `BLOCKED_EXTERNAL_APPROVAL` until an exact L3 run approval exists.
- Preserve `UNKNOWN` as non-retryable and prevent incident resolution or return
  to `NORMAL` without fresh reconciled Evidence and separately reviewed
  recovery authority.
- Expose the same read-only incident/readiness receipt to Principal/Risk Human
  surfaces and Agent API/SDK/MCP through the existing M2B authorization read.

## Non-goals

- No Hyperliquid `/exchange` request, signer, nonce, signature, cancellation,
  order, reduce-only or flatten submission.
- No Pool transaction, repayment, liquidation, collateral release, custody,
  transfer or withdrawal.
- No new numerical risk threshold, commercial parameter, repricing, limit
  increase, automatic unfreeze or return to `NORMAL`.
- No background service, production dependency, new queue, remote deployment,
  mainnet, real value, production credential or public endpoint.
- No parallel risk state, Facility, Ledger, Obligation, Event, Evidence or
  reconciliation truth.

## Likely files

- `modules/hypercore-venue-adapter/src/m2b-dual-risk-recovery.js`
- `modules/hypercore-venue-adapter/src/postgres-m2b-recovery-repository.js`
- `modules/hypercore-venue-adapter/src/index.js`
- `modules/hypercore-venue-adapter/test/m2b-dual-risk-recovery.test.js`
- `db/migrations/0068_m2b_dual_risk_recovery.*.sql`
- `schemas/v2/m2b-dual-risk-recovery.schema.json`
- M2B authorization result/conformance declarations and Human presentation
- `deploy/testnet/m2b-003-recovery-prewrite.mjs`
- `docs/codex/audits/M2B-003/`

## Acceptance criteria

1. Given exact current M2B-002, Pool and Venue inputs, when both domains are
   fresh and reconciled, then the receipt reports `MONITORING` and grants no
   execution or recovery authority.
2. Given either stale, unknown, discrepant, liquidatable or more restrictive
   domain state, when evaluated, then new risk is frozen and the combined state
   is at least `REDUCE_ONLY`; it never uses last-known-good permission.
3. Given one incident trigger and idempotency key, when replayed or raced, then
   exactly one immutable incident and first transition exist; conflicting reuse
   fails closed.
4. Given an ordered plan, when a later stage is requested before prerequisites,
   or an earlier/less restrictive state is requested, then progression denies
   without deleting Evidence.
5. Given `UNKNOWN`, crash or restart, when recovery resumes, then no external
   action is retried and the next action remains signer-free reconciliation.
6. Given no exact L3 recovery approval, when any external stage is inspected,
   then it remains `BLOCKED_EXTERNAL_APPROVAL` with zero nonce, signature,
   network request, Pool transaction or profile mutation.
7. Given Tenant A and Tenant B, when incidents are read or written, then forced
   RLS and object binding prevent cross-Tenant access; populated rollback is
   refused.
8. Given Principal/Risk Human and Agent interfaces, when the same authorization
   is read, then they expose the same current state, ordered recovery stage,
   reason codes and recovery condition without a mutation control.

## Test commands

```sh
node --test modules/hypercore-venue-adapter/test/m2b-dual-risk-recovery.test.js
node --test deploy/testnet/test/m2b-003-recovery-prewrite.test.js
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check:schemas
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm test
node deploy/testnet/m2b-003-recovery-prewrite.mjs
```

## Security checklist

- [ ] Closed exact inputs and immutable M2B/Pool/Venue hashes.
- [ ] Most-restrictive-state composition; stale/unknown never authorizes risk.
- [ ] Freeze and recovery ordering are monotonic and idempotent.
- [ ] `UNKNOWN` cannot retry or become optimistic success.
- [ ] External cancel/flatten/repay/liquidate stages require exact later approval.
- [ ] Protective authority cannot unfreeze, increase exposure, transfer or
      withdraw.
- [ ] Tenant/Actor/object authorization and forced RLS hold across restart.
- [ ] No raw account, signature, key, credential, KYC, PII or provider payload
      enters PostgreSQL, Event, Evidence, logs or artifacts.
- [ ] Human and Agent read the same canonical receipt and recovery condition.

## Permission boundary

The Founder instruction to continue M2 authorizes this issue only at
`L0_LOCAL_NO_FUNDS`: deterministic monitoring, internal freeze truth, durable
incident/recovery planning, read-only product parity, tests and pre-write STOP
Evidence. It does not authorize external signing, nonce allocation,
Hyperliquid or Pool writes, risk parameters, automatic unfreeze, launch-profile
enablement, deployment, mainnet, real value, custody, transfer or withdrawal.

Any external protective action requires a separate exact run approval naming
the incident, current M2B composition, Pool and Venue observations, target
account/order/position, action, caps, signer, nonce, expiry, recovery owner and
Evidence hashes.

## Data and migration impact

One additive forced-RLS incident table and append-only transition table are
permitted. They store only bounded identifiers, hashes, reason codes, states,
stages and timestamps. Existing Pool, Hyperliquid and canonical economic tables
remain authoritative. The down migration must refuse populated recovery truth.

## Rollback

Disable M2B-003 admission and product presentation, remain frozen, preserve all
incidents/transitions and existing Pool/Venue observations, reconcile read-only,
and use only a separately approved protective run for any external close or
repayment. Never delete, resend or relabel an ambiguous outcome.

## Required Evidence

Issue contract, pure state/ordering tests, PostgreSQL RLS/idempotency/race/
restart tests, denial matrix, protocol/SDK/MCP/Web parity, pre-write STOP report,
aggregate gates, exact SHA and a clickable local product URL.

## Dependency and sequencing

M2B-003 is stacked on M2B-002 exact commit
`944f344196f6a63a86ba817d750d466b09887142`. PR #55 remains Draft and is not
merged. M2B-004 stays locked until this local boundary is implemented, reviewed
and explicitly accepted; no issue may infer live M2B execution from this task.
