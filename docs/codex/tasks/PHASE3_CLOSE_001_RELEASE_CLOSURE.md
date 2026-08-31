# PHASE3-CLOSE-001 — Phase 3 release closure

Status: `PREPARED — BLOCKED ON HL-TESTNET-001B AND RISK-003B`

## Context

Phase 3 closure is not a merge, a deployment, a screenshot, a healthy endpoint,
or a single testnet transaction. It is the exact reconciliation of the live
Public Authenticated No-Funds Beta baseline, restricted Hyperliquid Testnet
proof, shadow-learning loop, operations/recovery drills, current defects, and
all CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED states required by the Product
Constitution and Optimization Measure.

## Scope

- Bind one exact release SHA, tree, migrations, image(s), configuration,
  launch-policy version, deployment(s), database, workers, identities, testnet
  account/signer lifecycle, and Evidence manifests.
- Reconcile `PUBLIC-BETA-001C`, `HL-TESTNET-001`, and `RISK-003B` acceptance
  and all unresolved findings.
- Verify Human, Agent, Capital Partner, Risk/Operations, and support
  journeys through visible Human controls and equivalent authorized Agent
  operations.
- Verify restart, redeploy, restore, duplicate/replay, revocation, pause,
  incident, rollback, unknown outcomes, signer retirement, and complete
  contract/Venue/Ledger/Obligation/Evidence reconciliation.
- Produce the exact scoped release verdict and a separate M3 go/no-go
  recommendation.

## Non-goals

- No new feature, defect repair only in prose, hidden waiver, evidence-state
  elevation, M3 code, Phase 4 activation, mainnet, real funds, or production
  financial claim.
- No reuse of stale, fixture, historical, local-only, or different-SHA Evidence
  as current deployed acceptance.
- No automatic launch-policy or model promotion.

## Likely files

- `docs/releases/IPO_ONE_PHASE3_CLOSURE_v0.1.md`
- `docs/codex/audits/PHASE3-CLOSE-001/`
- exact release/launch Evidence under `deploy/approvals/`
- redacted manifests under `artifacts/phase3-close-001/`
- task/traceability status updates only after their exact Evidence passes

## Acceptance criteria

1. The exact Phase 3 candidate and every deployed/runtime component are
   immutable and identity-matched.
2. Public Beta users complete the complete shared lifecycle without database
   intervention; all role-allowed views and actions are discoverable.
3. `REQ-PILOT-001` and `REQ-PILOT-002` pass deployed Human and Agent
   acceptance with named operational owners.
4. Restore, redeploy, restart, revocation, pause, incident, support, rollback,
   duplicate, retry, unknown, and signer-retirement drills pass.
5. Contract/Venue, Ledger, Obligation, payment/repayment, servicing, Event,
   Evidence, Credit Outcome, and shadow-learning inputs have zero unexplained
   divergence.
6. No open P0/P1 security issue exists; every discovered defect is fixed,
   regression protected, deployed, and retested before closure.
7. Mainnet, real funds, arbitrary withdrawal/transfer, production Human credit,
   external authority expansion, and automatic model promotion remain off.
8. The final report separately states CODE, RUNTIME, DEPLOYED, REACHABLE,
   VERIFIED, TESTNET VERIFIED, PUBLIC BETA ACTIVE, and REAL-VALUE ACTIVE truth.
9. Missing required verification yields `BLOCKED — NOT COMPLETE`; it is never
   substituted by code, CI, screenshots, or historical Evidence.
10. M3 remains blocked unless the closure report separately recommends and the
    Founder separately approves `M3-000` alignment.

## Test commands

The active issue must list the exact repository, migration, security,
PostgreSQL/RLS, transport, deployment, browser/accessibility, Venue, signer,
reconciliation, restore, and release commands used by the selected candidate.
At minimum:

```sh
pnpm check
pnpm test
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check:product-traceability
git diff --check
```

## Security checklist

- [ ] Exact candidate, deployment, migrations, policies, accounts, signers,
      configs, and Evidence are identity bound.
- [ ] No P0/P1, secret/PII leakage, cross-Tenant access, unknown outcome, or
      unexplained reconciliation discrepancy remains.
- [ ] Signers and acceptance credentials are retired/revoked as required.
- [ ] Every protective control reduces/holds risk and cannot expand authority.
- [ ] No M3, Phase 4, mainnet, or real-value authority is inferred.

## Permission boundary

This prepared issue grants no new deployment, profile, signer, risk, model,
M3, Phase 4, or funds authority. Closure may report only Evidence already
produced under approved predecessor issues.

## Data and migration impact

None expected. If closure finds a defect requiring code/schema change, stop and
open the smallest corrective issue with additive/forward-only migration and
full regression/redeployment evidence before resuming closure.

## Rollback

Closure documentation can be withdrawn if its Evidence is invalid. Runtime
rollback follows the exact predecessor runbooks and preserves canonical Event,
Evidence, Ledger, idempotency, outcome, and incident history.

Current verdict: `BLOCKED — NOT COMPLETE`.
