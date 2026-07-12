# IPO.ONE Framework Freeze

## Repository Structure

```text
apps/api                  Local API shell and demo endpoint
packages/domain           Shared protocol enums, validators, IDs, state machines
packages/mvp-flow         Composition layer for end-to-end local flow tests
modules/event-audit       Append-only credit and audit event store
modules/identity          Subject, principal, and CAIP-10 account binding
modules/lockbox           Agent Lockbox lifecycle and revenue capture
modules/obligation        Obligation lifecycle, repayment, overdue/default state
modules/spend-policy      Provider allowlist and spend request controls
modules/risk              Deterministic credit line rules and risk actions
modules/credit-learning   Transparent reputation scoring and next-cycle recommendations
modules/payment           Provider payment instruction and repayment routing
modules/settlement        Settlement records for provider spend
modules/admin             Audit timeline, exposure views, admin actions
db/migrations             Schema baseline
docs/codex                Codex context, gates, and operating notes
```

## Dependency Rules

- `packages/domain` owns shared protocol objects and may not import modules or apps.
- Each `modules/*` service may import `packages/domain` only.
- Module services must receive other module behavior through constructor-injected interfaces.
- `packages/mvp-flow` is the only composition layer that imports multiple modules.
- `apps/*` may import package composition code, but modules may not import apps.
- No UI or API handler may be a hidden dependency of a module.
- Cross-module communication uses explicit service methods and emitted events.

## Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `event-audit` | Append-only `CreditEvent` and `AuditEvent` storage, filtering, and timelines. |
| `identity` | Principal creation, Subject lifecycle, and CAIP-10 account binding. |
| `lockbox` | Lockbox lifecycle, freeze/close controls, and revenue capture records. |
| `obligation` | Obligation creation, state transitions, repayment accounting, overdue/default representation. |
| `spend-policy` | Provider allowlist, policy caps, spend request approval/rejection, settlement state. |
| `risk` | Explainable v0 credit line decisions, utilization reservation/release, freeze/adjust/close. |
| `credit-learning` | Deterministic score updates, risk tiering, reputation signals, limit recommendations, and demo interest-rate recommendations. |
| `payment` | Non-custodial payment instructions and repayment routing interfaces; no real fund movement. |
| `settlement` | Settlement state records and settlement/failure events. |
| `admin` | Audit timeline, exposure aggregation, and admin actions through service interfaces. |

## Event Ownership

- Domain event shape lives in `packages/domain`.
- Event append and timeline ownership lives in `modules/event-audit`.
- Producing modules create events for their own state changes.
- Consumers reconstruct state from service stores plus event timelines in the local simulator.

## Test Strategy

- `npm run lint:boundaries` checks module skeletons and import boundaries.
- `npm test` runs all Node test-runner suites.
- `npm run check` is the quality gate for this foundation.
- Future contract, API, DB, and UI packages should add their native tests under the same gate.

## Prohibited Coupling

- No generic `User` object replacing Subject, Principal, or Account.
- No module imports another module's internal source.
- No direct financial state mutation without a credit/audit event.
- No hardcoded single-chain architecture. CAIP-2 and CAIP-10 validators are mandatory.
- No unrestricted withdrawal path.
- No real human lending path.
- No raw PII/KYC/secret fixture.

## Current Gate Status

This framework is frozen for the first local foundation. Any change to protocol IDs, core state machines, or production fund boundaries should be tracked through a human-reviewed ADR or issue.
