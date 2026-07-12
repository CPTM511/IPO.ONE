# IPO.ONE MVP Foundation Mission Report

> Historical foundation snapshot. For current implementation truth and known
> architecture gaps, use `README.md` and
> `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md`.

## Phase Results

| Phase | Result | Evidence |
| --- | --- | --- |
| Phase 0: Context Absorption | Passed | `docs/codex/CONTEXT_SUMMARY.md` created with scope, non-goals, domain model, states, security constraints, and conflict notes. |
| Phase 1: Framework Freeze | Passed | `docs/codex/FRAMEWORK_FREEZE.md` created with repo structure, module boundaries, dependency rules, event ownership, and prohibited coupling. |
| Phase 2: Shared Domain Contracts | Passed | `packages/domain` implements enums, validators, deterministic IDs, state machines, and domain object builders. |
| Phase 3: Module Skeletons | Passed | All required modules have `README.md`, `src/index.js`, service interfaces, and tests. |
| Phase 4: Core Module Implementation | Passed for local foundation | Event audit, identity, lockbox, obligation, spend policy, risk, payment, settlement, and admin services are implemented without production fund movement. |
| Phase 5: MVP Integration Flow | Passed | `packages/mvp-flow` runs Agent identity -> wallet bind -> Lockbox -> credit line -> spend -> settlement -> revenue -> repayment -> admin audit. |
| Phase 6: Hardening | Passed for local foundation | `pnpm run check` passes boundary, schema, OpenAPI/route/SDK parity, migration, and 72 database-free tests; PostgreSQL, adversarial HTTP, and API suites pass separately. |

## Documents Read

- `AGENTS.md`
- `docs/guidance/IPO_one_Product_Description_and_PRD_v1.md`
- `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md`
- Mission attachment: `IPO.ONE - Codex Autonomous Sequential MVP Build Mission v2.1`

## Architecture Created

- pnpm/Turbo-ready monorepo scaffold.
- Shared domain package.
- Explicit module directories with public service interfaces.
- Shared asynchronous Rail event-repository port with EventStore and PostgreSQL implementations.
- Transactional command/event/Evidence/outbox runtime and inbox consumer boundary.
- Local API shell for demo endpoints.
- SQL migration baseline for core tables.
- Codex issue template and foundation task map.

## Modules Implemented

- `event-audit`: append-only events and timelines.
- `identity`: Principal, Subject, and CAIP-10 account binding.
- `lockbox`: Lockbox lifecycle and revenue capture.
- `obligation`: obligation lifecycle, repayment, overdue/default.
- `spend-policy`: Provider allowlist and spend approval/rejection.
- `risk`: deterministic v0 credit line rules and utilization.
- `payment`: no-fund-movement payment instructions and repayment routing.
- `rail`: event-sourced Transfer Intents, exact quotes, finality, reversal, and replay proof.
- `persistence`: PostgreSQL stream heads, idempotency, Evidence, outbox/inbox, leases, retries, and dead-letter state.
- `settlement`: compatibility projection over Rail settlement evidence.
- `admin`: exposure, timelines, and admin freeze action path.

## Tests Added

- Domain ID, CAIP, PII, and state machine tests.
- Module unit and failure-path tests.
- Vertical slice integration tests for happy path, rejected spend, and overdue/default representation.
- Boundary lint for required module files, circular dependencies, app imports, and generic User object prevention.
- Real PostgreSQL tests for migration up/down/up, atomic rollback, idempotency, concurrent writers, outbox recovery, inbox effects, and restart replay.
- Public API smoke automation for the complete Agent Lockbox workflow.
- OpenAPI 3.1.2 contract for all 21 current operations, RFC 9457-compatible
  errors, request correlation, and an alpha zero-dependency JavaScript SDK.

## Verified Commands

```sh
pnpm run check
pnpm run demo:vertical-slice
pnpm run test:postgres
pnpm run dev:api
pnpm run smoke:api
```

## Local API Result

The demo endpoint returned:

- settled spend request
- fully repaid obligation
- `outstandingMinor = 0`
- `creditLineUtilizedMinor = 0`
- `productionFundsMoved = false`
- balanced ledger and verified Rail replay proof

## Known Limitations

- The public demo and non-Rail services remain in memory; only the Rail event stream has an optional durable PostgreSQL composition.
- PostgreSQL is locally implemented and tested, but no production database, broker, backup, IAM, reconciliation worker, or disaster recovery operation is deployed.
- No Solidity contracts, Foundry tests, Slither, or deployed chain adapters yet.
- No Next.js Developer Portal or Admin Console yet.
- No real provider integration, real payment execution, or production settlement.
- Human support is schema/prototype only and cannot trigger lending or fund movement.

## Recommended Next Milestone

Proceed with human-reviewed MVP foundation issues:

1. Expand repositories and reconciliation projections to Mandate, Ledger, Lockbox, Obligation, Risk, and Admin state.
2. Build on the published OpenAPI/SDK foundation with AuthN, tenant isolation,
   RBAC, rate limits, durable command idempotency, and runtime validation.
3. Add signed Mandate proofs and durable nonce/key-rotation controls.
4. Add Foundry contract skeletons only after human review of fund-path scope.
