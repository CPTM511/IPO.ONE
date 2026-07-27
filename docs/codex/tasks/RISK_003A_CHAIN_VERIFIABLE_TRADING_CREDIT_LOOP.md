# RISK-003A — Chain-verifiable Trading Credit learning loop

## Context

TC-203 already produces a finalized, point-in-time, read-only Hyperliquid
Testnet Evidence profile and a non-authorizing 16-feature Shadow Risk profile.
That profile intentionally remains partial: the venue read does not prove an
equity time series, leverage history, liquidation discipline, transfer
lineage, wallet clustering, self-transfer detection, or wash-trading checks.

IPO.ONE needs a minimal learning loop that can:

1. bind a deterministic credit assessment to finalized Evidence;
2. expose bytes32-compatible proof hashes for the existing Testnet Credit
   Authorization Registry;
3. bind the decision-time feature snapshot to a terminal Obligation outcome;
4. produce a conservative, read-only challenger calibration report.

The loop must not create a new source of credit, funds, policy, deployment, or
production authority.

## Scope

- Add a closed supplemental Evidence contract for finalized, reconciled equity,
  leverage, liquidation, mandate, and anomaly observations.
- Add a checked-in, explainable Shadow Policy builder with explicit hard gates,
  factor weights, and capacity constraints.
- Produce one of `eligible_shadow`, `ineligible_shadow`, or
  `insufficient_evidence`.
- Produce immutable Evidence, feature, policy, assessment, and credit-state
  hashes using the repository's declared demo hash domain and algorithm.
- Produce a non-publishable registry proof-binding preview compatible with the
  existing Testnet registry record shape after an accepted Offer exists.
- Bind a decision-time feature snapshot to a finalized sandbox repayment or
  write-off outcome without using future outcome data in the decision.
- Produce a Beta-prior challenger calibration report. The report may recommend
  hold or tighten review, but cannot loosen policy, promote itself, or mutate
  the active Shadow Policy.

## Non-goals

- No real funds, production lending, custody, transfer, withdrawal, or capital
  commitment.
- No contract deployment, registry write, transaction calldata, signing key, or
  wallet permission.
- No change to Offer, Obligation, ledger, servicing, launch policy, or current
  Tenant protocol operations.
- No universal score, black-box model, online self-modification, automatic
  policy promotion, or automatic limit increase.
- No claim that the existing TC-203 source alone provides complete Evidence.
- No raw strategy, raw transaction, address, KYC, PII, or secret persistence.

## Likely files

- `packages/domain/src/trading-credit-learning.js`
- `packages/domain/src/index.js`
- `packages/domain/test/trading-credit-learning.test.js`
- `schemas/v2/trading-credit-*.schema.json`
- `scripts/check-schemas.mjs`

## Acceptance criteria

1. A current TC-203 finalized Profile without supplemental Evidence returns
   `insufficient_evidence` and a zero recommended limit.
2. Supplemental Evidence is closed-shape, point-in-time, finalized,
   reconciled, account-bound, hash-addressed, and contains no raw inputs.
3. The same normalized inputs produce the same policy, feature, Evidence,
   assessment, and outcome hashes.
4. Stale or incomplete Evidence fails closed; adverse risk or conduct facts
   return `ineligible_shadow`.
5. The composite score is explanatory only. Eligibility is determined by
   visible hard gates and capacity is the minimum of visible constraints.
6. A registry binding preview requires an eligible assessment and accepted
   Offer hash, contains the exact proof fields accepted by the existing chain
   adapter, explicitly leaves `authorization_id` and raw `account_id` for
   server-side resolution, contains no calldata, and remains non-authorizing
   and blocked from publication pending existing approval gates.
7. Only terminal `fully_repaid` or `written_off` sandbox Obligations can create
   finalized outcome labels.
8. Outcome features are copied from the immutable decision-time snapshot and
   cannot be replaced with post-decision features.
9. Challenger evaluation uses only finalized outcomes, never auto-promotes,
   never auto-loosens, and is deterministic.
10. New schemas are draft 2020-12 closed top-level contracts and the complete
    repository regression suite remains green under the pinned runtime.

## Test commands

```bash
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test -- packages/domain/test/trading-credit-learning.test.js
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

## Security checklist

- [x] All existing TC-203 safety flags are re-validated.
- [x] Profile, account binding, history, snapshot, supplement, and policy hashes
      are included in the assessment proof.
- [x] Unknown, stale, mismatched, or non-finalized Evidence fails closed.
- [x] Money arithmetic uses integer minor units; ratios use integer basis
      points.
- [x] No floating-point value authorizes a decision.
- [x] No raw transaction, raw address, PII, credential, signature, or secret is
      accepted or persisted.
- [x] Assessment, registry preview, and challenger all declare
      `authorizing: false`, `fundsAuthority: false`, and
      `economicStateMutation: false`.
- [x] Registry preview includes no calldata and cannot publish automatically.
- [x] Challenger promotion and production use require named human review.
