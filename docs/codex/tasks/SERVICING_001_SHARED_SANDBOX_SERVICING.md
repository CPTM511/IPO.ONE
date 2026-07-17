# SERVICING-001: Shared Sandbox DPD, Cure, and Resolution

Status: Completed locally and verified on 2026-07-16 after project-owner
approval. Depends on CREDIT-001F. This approval grants only the three bounded
sandbox servicing changes below and no real collections, reporting, accounting,
production, deployment, or funds authority.

## Context

The current shared Obligation states stop at `overdue`, `defaulted`, and
`closed`; default cannot cure. A separate `HumanObligationStatus` enum contains
DPD, restructure, repurchase, and write-off labels but is not integrated with
the canonical Obligation. Using it would violate Product Charter v1.1's rule
that Human and Agent entries share one obligation and risk truth.

The first no-funds product needs deterministic servicing Evidence without
allowing borrowers to choose favorable performance states or operators to
perform unreviewed irreversible transitions.

## Proposed Three-Part Permission Change

### 1. Deterministic system servicing worker

- Add `servicing.advance.sandbox` only to the authenticated System Worker.
- Add idempotent `workerAdvanceSandboxServicing` over due installments using a
  trusted UTC clock; no Human or Agent caller supplies DPD or status.
- The worker derives `daysPastDue` from oldest unpaid due amount and moves
  through `current`, `grace_period`, `dpd_1_30`, `dpd_31_60`, `dpd_61_89`, and
  `defaulted` using the policy below.
- A repayment invokes the same derivation in the atomic repayment transaction.
  Paying all past-due amounts records `cured` Evidence and returns to `current`
  or `partially_repaid`; full payoff remains `fully_repaid`.

### 2. Closed sandbox servicing policy v1

| Rule | Proposed value |
| --- | --- |
| Grace period | 3 complete UTC days after installment due time |
| DPD 1-30 bucket | DPD 4-30 after grace presentation |
| DPD 31-60 bucket | DPD 31-60 |
| DPD 61-89 bucket | DPD 61-89 |
| Default threshold | DPD >= 90 |
| Cure | All past-due fee, interest, and principal paid |
| Late fee / penalty rate | None |
| Time source | Trusted server/worker UTC only |

DPD bucket is a canonical derived servicing classification with effective time
and source installment. It is not a second Human-only state machine. Base
Obligation lifecycle and servicing classification are validated together by
one transition function and one projection hash.

### 3. Dual-controlled resolution commands

Add Operator proposal plus independent Risk approval for these sandbox-only,
reason-coded commands:

- `servicing.restructure.sandbox`;
- `servicing.repurchase.sandbox`;
- `servicing.writeoff.sandbox`.

The existing approval-proposal mechanism must bind exact Obligation version,
before/after balances, schedule, reason, policy version, proposer, approver,
and expiry. Proposer and approver must be distinct authenticated actors with
recent MFA. Human Borrower and Agent Runtime can read the resulting status and
Evidence but cannot invoke these commands.

Restructure creates a new immutable schedule version and preserves the old
schedule. Repurchase changes servicing ownership metadata but does not fabricate
a payment. Write-off records accounting resolution and remaining balance; it
does not mark the Obligation repaid. All remain synthetic and non-production.

## Canonical State Direction

Remove the runtime use of separate `HumanObligationStatus`. Evolve the shared
contract to represent:

- lifecycle: `created`, `active`, `partially_repaid`, `fully_repaid`,
  `delinquent`, `defaulted`, `restructured`, `repurchased`, `written_off`,
  `closed`;
- servicing classification: `current`, `grace_period`, DPD buckets,
  `defaulted`, `cured`, `restructured`, `repurchased`, `written_off`;
- exact derived DPD, oldest unpaid installment, effective time, reason code,
  schedule version, and resolution Evidence.

The state pair is legal only when admitted by one closed validator. No UI or
adapter may store an independent status.

## Atomicity and Evidence

Every automatic or approved transition commits schedule/balance changes,
Obligation and risk portfolio projections, Event, Evidence, outbox, registry,
snapshots, approval consumption where applicable, command replay, resource
version, and audit in one serializable transaction.

## Non-Goals

- No collections workflow, borrower messaging, adverse-action notice, credit
  bureau reporting, legal default notice, real repurchase, real write-off,
  loss allocation, servicing vendor, production accounting, or fund movement.
- No borrower-controlled time travel, DPD, cure, default, restructure,
  repurchase, write-off, reason code, or Evidence.

## Likely Files

- `packages/domain/src/enums.js`
- `packages/domain/src/state-machines.js`
- `packages/domain/src/models.js`
- `modules/obligation/src/obligation-service.js`
- `modules/tenant-command-gateway/src/servicing-handlers.js`
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/authorization/src/*`
- `db/migrations/0018_shared_servicing_v1.*.sql`
- `packages/api-contract/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`

## Acceptance Criteria After Approval

- [x] Human and Agent Obligations use the same DPD, default, cure, resolution,
  Event, Evidence, risk, and reconciliation rules.
- [x] DPD derives only from trusted time and unpaid installments; batching,
  replay, restart, and time-zone variation produce the same state.
- [x] Borrower repayment can cure delinquency but cannot erase immutable late
  Evidence or write-off/default history.
- [x] Restructure, repurchase, and write-off require distinct proposer/approver,
  recent MFA, exact version binding, bounded reason, and unexpired approval.
- [x] Old schedule and status history remain reconstructible and reconciled.
- [x] No real servicing, accounting, reporting, collection, or funds authority
  is introduced.

## Approval Gate

- [x] Approve System Worker-only `servicing.advance.sandbox` and deterministic
  automatic cure from the shared repayment transaction.
- [x] Approve exact grace, DPD bucket, default threshold, cure, zero-penalty,
  and trusted-time rules in `sandbox-servicing-policy.v1`.
- [x] Approve dual-controlled sandbox restructure, repurchase, and write-off
  permissions and their canonical shared state transitions.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Borrower-facing actors cannot mutate time or servicing classification.
- [x] Automatic and manual transitions bind exact state, schedule, balances,
  policy version, reason, and trusted time.
- [x] Irreversible simulations require distinct MFA-authenticated actors and
  consume one exact unexpired approval.
- [x] No raw PII/KYC, unbounded text, secret, destination, production flag, or
  real-value authority enters servicing state.

## Local Verification Evidence

- Node runtime: `v24.18.0` from `.nvmrc` and `.node-version`; pnpm `11.1.3`.
- `pnpm run check`: passed, including 19 migration pairs, 48 closed abuse
  classifications, 27 Tenant protocol operations, and 241 unit tests.
- `pnpm run test:postgres`: 53/53 passed against a clean local PostgreSQL 17
  database, including migration up/down/up, RLS, replay, atomicity, and full
  reconciliation.
- `pnpm run test:security`: 21/21 passed.
- `pnpm run test:transport`: 22/22 passed.
- `pnpm run test:chain:conformance`: 4/4 passed.
- `git diff --check`: passed.
- UI QA: Human servicing fields and Risk servicing policy verified at 390x844
  with no horizontal overflow and no browser warning/error logs.
