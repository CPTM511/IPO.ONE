# RISK-003B — Finalized testnet outcome shadow-learning loop

Status: `PREPARED — BLOCKED ON HL-TESTNET-001 FINALIZED OUTCOMES`

Requirements: `REQ-CREDIT-002..003`, `REQ-EVID-001..004`,
`REQ-RISK-001..002`, `REQ-PRIV-001`, `REQ-AUTO-001`

## Context and current baseline

IPO.ONE already has deterministic active policy, versioned Decision Passport
provenance, non-authorizing Credit State, and local shadow-learning
foundations. `RISK-003B` is not a generic model project. Its only permitted new
input is the finalized and reconciled performance, risk, repayment, loss, and
intervention outcome set produced by `HL-TESTNET-001` and other explicitly
admitted Phase 3 testnet Evidence.

No such finalized Hyperliquid outcome set currently exists. Synthetic fixtures,
pending submissions, HTTP success, Venue balance, historical artifacts, or the
M2B local composition cannot be promoted to live outcome truth.

## Scope

- Admit only finalized, authenticated, reconciled, non-revoked testnet Event/
  Evidence references under an exact source manifest.
- Materialize point-in-time, versioned feature snapshots for trading
  performance, repayment, delinquency/loss, concentration, drawdown,
  intervention, staleness, unknown outcomes, and reconciliation quality.
- Attach immutable completed-Facility outcome labels without rewriting the
  original Decision, Offer, Obligation, payment, or Evidence.
- Run one versioned challenger in shadow mode against the same observation
  time and compare it with the deterministic active policy.
- Produce offline reports for repayment, loss, cure/recovery, utilization,
  concentration, calibration, false approval/rejection, stability, and drift.
- Preserve Human/Agent entry parity at the shared outcome and Evidence layers.

## Non-goals

- No active-policy, approval, rejection, limit, pricing, term, collateral,
  Offer, Facility, servicing, or external-action change.
- No online self-training, automatic promotion, automatic retraining,
  self-authored labels, or feedback loop that can increase credit authority.
- No universal score, black-box underwriting, or score-based cross-product
  authority.
- No raw KYC/PII, credentials, signatures, private keys, lender-private policy,
  participant identifiers, or sensitive free text.
- No mainnet, real value, production model, or production-risk claim.

## Likely files

- New active child issue if implementation must be split
- `modules/credit-learning/` and existing Credit Outcome/Credit State paths
- `packages/domain/` for closed feature/outcome/report contracts
- `modules/persistence/` and additive `db/migrations/` only if current
  versioned shadow projections are insufficient
- `packages/api-contract/`, Risk/Operations read views, and reports only for
  authorized non-identifying inspection
- `docs/codex/audits/RISK-003B/` and redacted `artifacts/risk-003b/`

## Acceptance criteria

1. Every admitted outcome binds exact source Event/Evidence identity, Subject/
   Facility/Obligation scope, observation time, finality, revocation, and clean
   reconciliation state.
2. Pending, safe-only, unknown, invalidated, revoked, wrong-scope, duplicate,
   stale, synthetic-unadmitted, or unreconciled input fails closed.
3. Replay and duplicate delivery produce one identical feature snapshot,
   outcome label, challenger decision, and report identity.
4. Features are point-in-time correct and cannot read facts observed after the
   evaluated Decision time except in the separately labeled outcome window.
5. The original active Decision, Offer, Facility, limit, price, terms,
   servicing, Ledger, and Evidence remain byte/semantic stable.
6. Challenger output is advisory, reason-coded, versioned, queryable, and
   incapable of calling a mutation or external action.
7. Offline evaluation reports sample size, missingness, uncertainty, data
   window, policy/model/feature versions, calibration limits, concentration,
   and drift without claiming production validity from the small testnet set.
8. Human/Agent or Tenant-identifying data is excluded from aggregate reports,
   and authorized drill-down remains least-privilege.
9. Disabling the challenger leaves the active product fully operable and does
   not alter credit authority.
10. No promotion state beyond `shadow` can be created by this issue.

## Test commands

```sh
pnpm check
pnpm test
pnpm run test:postgres
pnpm run test:security
pnpm run check:product-traceability
git diff --check
```

Targeted tests must include duplicate/replay, time leakage, late-arriving
finality, invalidation/revocation, reconciliation failure, privacy, active-
policy immutability, mutation denial, and challenger-disabled behavior.

## Security checklist

- [ ] `HL-TESTNET-001` provides finalized and reconciled source Evidence.
- [ ] No self-reported or unverified positive signal is admitted.
- [ ] No raw PII, credential, private policy, signer, or free text is processed.
- [ ] Point-in-time boundaries and outcome windows prevent look-ahead leakage.
- [ ] Shadow output cannot mutate policy, authority, limits, terms, or external
      state.
- [ ] Model/feature/report versions, owners, hashes, lineage, and rollback are
      durable and queryable.

## Permission boundary

This task grants no Risk policy, model promotion, underwriting, pricing,
limit, adverse-action, external execution, production, or real-value authority.
Any future model promotion requires a separate Constitution/policy decision,
independent validation, named owner, rollback, and human approval.

## Data and migration impact

Prefer existing Event/Evidence, Credit Outcome, Credit State, and shadow
evaluation structures. Any additive feature snapshot, outcome label, model
registry, or evaluation projection requires forced RLS, immutable source
lineage, idempotent replay, and no destructive downgrade after Evidence exists.

## Rollback

Disable challenger evaluation and report generation, preserve immutable input/
feature/outcome/evaluation Evidence, and leave the deterministic active policy
unchanged. Repair additive projections from admitted source Evidence only.

## Required Evidence and dependencies

Dependencies: `HL-TESTNET-001` exact finalized/reconciled outcome manifest,
current source definitions, named shadow owner, privacy review, and active issue
approval.

Current verdict: `BLOCKED — NOT COMPLETE`.
