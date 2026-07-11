# MVP-051: Audit-Driven Demo Integrity Hardening

## Context

The architecture and implementation audit found that the public MVP happy path
worked, but several adversarial paths could corrupt demo state or manufacture
credit-learning outcomes. This task hardens the local, no-funds simulator before
any persistence, contract, or production work begins.

Relevant guidance:

- Product Charter sections 11-20.
- MVP Build Spec sections 4.1, 13, 14, and 18.2.
- `docs/codex/FRAMEWORK_FREEZE.md`.

## Scope

- [x] Preflight repayment routing before mutating obligation, Lockbox, or credit
  utilization state.
- [x] Reject negative utilization and over-release instead of silently changing
  accounting state.
- [x] Reuse one credit line per Subject and asset in the demo service.
- [x] Permit full repayment of an overdue obligation.
- [x] Make account binding fail closed unless a verifier or explicit demo mode is
  configured.
- [x] Stop empty credit-learning evaluations from granting positive signals.
- [x] Prevent repeated evaluation of the same demo evidence from granting the
  same score changes again.
- [x] Mark scripted healthy/risky/recovery cycles as synthetic demo scenarios.
- [x] Enforce Spend Policy purpose/category matching and emit `SpendRequested`.
- [x] Emit evidence for Lockbox balance debits and credit-line adjustments.
- [x] Replace unsafe browser `innerHTML` rendering of API-controlled values.
- [x] Remove mobile horizontal overflow from the interactive dashboard.
- [x] Give demo hashes a separate non-production domain.

## Non-Goals

- No real funds, lending, underwriting, or Human production credit.
- No production signature verifier, KYC provider, on/off-ramp, or chain adapter.
- No smart contracts, deployment, token, DAO, public LP, or arbitrary withdrawal.
- No claim that in-memory preflight provides database-grade atomicity.
- No replacement of the canonical protocol schemas without a reviewed ADR.

## Files Likely To Modify

- `packages/domain/src/*`
- `modules/identity/src/*`
- `modules/lockbox/src/*`
- `modules/obligation/src/*`
- `modules/spend-policy/src/*`
- `modules/risk/src/*`
- `modules/payment/src/*`
- `modules/credit-learning/src/*`
- `packages/mvp-flow/src/*`
- `apps/api/src/server.js`
- `apps/web/src/*`
- related tests and public documentation

## Acceptance Criteria

- Given a Lockbox balance below the requested repayment, when repayment routing
  is attempted, then no obligation state is changed.
- Given a negative utilization amount, when it is reserved, then the request is
  rejected.
- Given two credit requests for the same Subject and asset, then only one demo
  credit line exists.
- Given an overdue obligation, when it is fully repaid, then it becomes
  `fully_repaid`.
- Given no configured wallet verifier outside explicit demo mode, then account
  binding is rejected.
- Given no new behavioral evidence, when credit learning is evaluated, then the
  score does not change.
- Given evidence that was already evaluated, when evaluation runs again, then
  the score does not change again.
- Given API-controlled text, then the browser renders it through text-safe DOM
  operations.
- At a 390px viewport, the document width does not exceed the viewport width.

## Test Command

```sh
npm run check
```

Browser verification:

```sh
npm run dev
# Run the complete flow at desktop and 390x844 viewports with Playwright CLI.
```

## Security Checklist

- [x] No production fund movement added.
- [x] No arbitrary withdrawal path added.
- [x] No Human production lending path added.
- [x] Financial demo state changes have append-only evidence.
- [x] Unverified account binding is explicit demo behavior, not a safe default.
- [x] User-controlled values are not inserted with `innerHTML`.
- [x] Scripted score cycles are identified as synthetic.
- [x] Production Keccak-compatible identifiers remain a future reviewed task.
