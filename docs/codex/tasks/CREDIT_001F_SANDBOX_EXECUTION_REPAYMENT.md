# CREDIT-001F: Shared Sandbox Execution, Accounting, and Repayment

Status: Implemented and verified for the local no-real-funds profile on
2026-07-16 after approval by the project owner. Depends on approved and
completed CREDIT-001D, MANDATE-001A, and CREDIT-001E. This implementation
grants only the sandbox execution, accounting, and repayment changes below; it
grants no real-value, production, or deployment authority.

## Context

The repository has useful Agent demo primitives for Provider spend, Lockbox
revenue, principal-only repayment routing, and a balanced Ledger. They are
in-process and Agent-specific. The durable Gateway has no shared Human/Agent
Obligation execution, no sandbox rail receipt, and no accounting path that
separates principal, interest, and fees.

The current `repayment.v1` stores only amount and remaining principal. The
current Ledger has only Lockbox asset, external revenue, and repayment-clearing
account types. Reusing either as-is would misstate Human repayment and would
not satisfy Product Charter v1.1.

## Proposed Three-Part Permission Change

### 1. Shared sandbox execution capability

- Add `credit.execute.sandbox.self` to Human Borrower and Agent Runtime only.
- Add private idempotent `pilotExecuteSandboxObligation` against an exact owned
  accepted `obligation.v2` in `created` / execution `pending` state.
- Human requires current acceptance/servicing Consent. Agent requires the same
  current active Mandate with `execute_sandbox_credit`.
- Execution uses only a signed, out-of-process synthetic sandbox rail adapter.
  It returns a non-redeemable receipt; it creates no user-withdrawable balance
  and cannot call a production Provider or chain.

The operation sets the Obligation active only after a verified idempotent
sandbox receipt and balanced accounting commit. The result always states
`sandboxOnly = true`, `productionFundsMoved = false`, and
`withdrawable = false`.

### 2. Deterministic accounting and allocation policy

Add canonical accounts for sandbox funding source, principal receivable,
interest receivable, fee receivable, synthetic interest income, synthetic fee
income, repayment clearing, and write-off loss reserved for SERVICING-001. All
account IDs are server-derived per Tenant/Obligation/asset and cannot be
supplied by the caller.

Sandbox execution posts:

- debit principal receivable for exact accepted principal;
- credit sandbox funding source for the same amount.

Interest uses simple Actual/365 accrual on opening outstanding principal. For
each UTC day, the engine carries the integer remainder so repeated accrual is
identical to one combined accrual:

`numerator += outstandingPrincipalMinor * annualRateBps * elapsedDays`

`accruedMinor = floor(numerator / 3,650,000)`

`numeratorRemainder = numerator mod 3,650,000`

Every interest accrual debits interest receivable and credits synthetic
interest income. Any later approved fee assessment must debit fee receivable
and credit synthetic fee income. Both sides remain explicitly sandbox-only.

The accepted v1 sandbox policy has a zero origination fee, but separate fee
fields and waterfall branches remain canonical and tested. No fee may be added
without a later named pricing/policy approval.

Repayment allocation order is:

1. accrued outstanding fees;
2. accrued outstanding interest;
3. outstanding principal;
4. unapplied surplus returned in the result without posting.

Each repayment stores requested, applied, fee, interest, principal, surplus,
and all remaining components. Ledger debits repayment clearing and credits the
respective receivable accounts. Principal release and risk utilization use
only the principal component.

### 3. Shared sandbox repayment capability

- Add `repayment.post.sandbox.self` to Human Borrower and Agent Runtime.
- Add private idempotent `pilotPostSandboxRepayment` against an exact owned
  active, partially repaid, or delinquent Obligation.
- The request contains only positive `amountMinor` and a closed synthetic
  source code. Asset, waterfall, account IDs, balances, schedule allocation,
  time, Evidence, and flags are server-derived.
- Agent automated Lockbox repayment remains a distinct later adapter path. It
  may call the same allocation kernel only after its existing lockbox scope and
  funds boundary are separately reviewed.

Execution and repayment each commit receipt, accounting transaction and
entries, Obligation/installment balances, Event, Evidence, outbox, registry,
snapshots, command replay, capacity, resource version, and audit in one
serializable transaction.

## Proposed Operations

| Operation | Resource | Actor | Capability | Real value |
| --- | --- | --- | --- | --- |
| `pilotExecuteSandboxObligation` | Exact owned Obligation | Human / Agent | `credit.execute.sandbox.self` | Never |
| `pilotPostSandboxRepayment` | Exact owned Obligation | Human / Agent | `repayment.post.sandbox.self` | Never |

## Required Denial Rules

Both operations lock and revalidate owner, Subject, Principal, authority,
Obligation version/state, schedule, freeze/pause, Tenant and per-asset caps,
duplicate receipt, capacity, and sandbox rail policy. Repayment additionally
accrues interest to trusted command time before allocation.

Stable denial codes include `obligation_not_executable`,
`obligation_not_repayable`, `authority_not_current`, `execution_already_exists`,
`sandbox_rail_unavailable`, `credit_state_frozen`, `repayment_amount_invalid`,
and `sandbox_capacity_exhausted`.

## Non-Goals

- No real funds, withdrawable proceeds, cash loan, custody, bank/fiat rail,
  production Provider, mainnet/testnet value transaction, token, public LP,
  caller-supplied account, arbitrary withdrawal, collection, or deployment.
- No non-zero fee, compounding, floating rate, penalty rate, late fee, early
  payoff discount, FX, tax, or production accounting claim.
- No DPD/default/restructure/repurchase/write-off mutation; those are gated by
  SERVICING-001.

## Likely Files

- `packages/domain/src/enums.js`
- `packages/domain/src/models.js`
- `packages/domain/src/state-machines.js`
- `modules/ledger/src/ledger-service.js`
- `modules/obligation/src/obligation-service.js`
- `modules/payment/src/repayment-router.js`
- `modules/tenant-command-gateway/src/credit-execution-handlers.js`
- `modules/tenant-command-gateway/src/repayment-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `db/migrations/0018_sandbox_execution_accounting.*.sql`
- `packages/api-contract/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`

## Acceptance Criteria After Approval

- [x] Human and Agent execute and repay through the same Obligation,
  accounting, allocation, Event, and Evidence kernel.
- [x] Execution creates exactly one verified synthetic receipt and balanced
  principal-receivable transaction before the Obligation becomes active.
- [x] Daily accrual is deterministic across batching/replay/time zones;
  repayment waterfall and minor-unit remainder behavior are fully tested.
- [x] Every amount visible in the UI/API reconciles to Obligation components,
  installment rows, Ledger accounts, Events, receipts, and Evidence.
- [x] Replay, concurrency, restart, RLS, rollback, adapter failure, duplicate
  receipt, registry/snapshot hashes, and reconciliation pass.
- [x] No operation produces a withdrawable balance or real fund movement.

## Approval Gate

- [x] Approve `credit.execute.sandbox.self` plus private
  `pilotExecuteSandboxObligation` and the signed non-redeemable sandbox rail.
- [x] Approve the exact Actual/365 integer-remainder accrual, zero-fee v1,
  balanced account model, and fee -> interest -> principal waterfall.
- [x] Approve `repayment.post.sandbox.self` plus private
  `pilotPostSandboxRepayment` for Human Borrower and Agent Runtime.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run test:transport
pnpm run smoke:api
git diff --check
```

## Implementation and Verification Evidence

- One shared deterministic domain kernel now creates sandbox execution plans,
  eight server-derived accounts, balanced principal and repayment postings,
  Actual/365 integer-remainder accrual, fee/interest/principal allocation, and
  installment projections for both Human and Agent callers.
- The signed Ed25519 sandbox rail adapter verifies exact request/receipt
  binding and returns a non-redeemable receipt. The approved local pilot runs
  this adapter in process behind the rail boundary; a separately deployed
  out-of-process rail remains a production hardening step and is not enabled.
- Human Consent and Agent Mandate authority are revalidated at execution and
  repayment. Agent execution also utilizes the approved CreditLine and
  principal repayment releases only the principal component. Agent repayment
  requires the explicit `route_repayment` Mandate capability.
- Migration `0018_sandbox_execution_accounting` adds immutable receipt,
  account, Ledger, execution, accrual, repayment v2, and controlled installment
  persistence with Tenant RLS. Restart recovery and reconciliation include the
  new projections.
- Node `24.18.0`: `pnpm run check` passed with 34 schemas, 21 public OpenAPI
  operations, 18 migration pairs, 23 private protocol operations, 35 request
  fixtures, 29 result fixtures, and 236 unit tests.
- Node `24.18.0`: PostgreSQL integration passed 53 tests; security passed 21;
  transport passed 22; public API smoke and `git diff --check` passed.
- Desktop 1440x900 and mobile 390x844 visual QA passed with no horizontal
  overflow or browser warnings/errors. The Aave-inspired Human console now
  gives the accepted Obligation, execution receipt, component balances,
  installment schedule, repayment source, action, and allocation adequate
  width; the workbench collapses to one column at 1180px.

## Security Checklist

- [x] Every mutation is exact-resource, owner-only, bounded, versioned,
  idempotent, serializable, and fail-closed.
- [x] Caller cannot supply rail result, receipt, time, account, allocation,
  interest, fee, schedule, authority, policy, Evidence, or production flag.
- [x] Adapter messages are signed, replay-protected, bounded, and contain no
  secret or raw PII.
- [x] Ledger, Obligation, schedule, Event, Evidence, outbox, replay, resource,
  capacity, and audit state commit atomically.
