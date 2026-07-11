# IPO.ONE MVP Foundation Task Map

This file records the scoped foundation work completed by the autonomous sequential mission. It follows the issue-based structure required by `AGENTS.md`.

## MVP-001: Create Monorepo Scaffold

Context: MVP Build Spec recommends pnpm + Turborepo and a repo layout separating apps, packages, modules, contracts, and docs.

Scope:

- Add root package scripts.
- Add pnpm workspace and Turbo config.
- Add README and local run/test commands.

Non-Goals:

- No production deployment.
- No dependency installation from the network.

Likely Files:

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `README.md`

Acceptance Criteria:

- `npm run check` exists and passes.
- Repository has clear app/package/module structure.

Security Checklist:

- No secrets or `.env` files committed.

## MVP-002: Add Codex Instructions and Issue Template

Context: Codex work must be scoped, reviewable, and security-aware.

Scope:

- Preserve root `AGENTS.md`.
- Add a reusable Codex task issue template.
- Add mission/gate docs under `docs/codex`.

Non-Goals:

- No strategic document overwrite.

Likely Files:

- `.github/ISSUE_TEMPLATE/codex_task.md`
- `docs/codex/*`

Acceptance Criteria:

- Issue template includes context, scope, non-goals, test command, and security checklist.

Security Checklist:

- Funds movement, human lending, secrets, PII, and protocol invariant changes are explicitly called out.

## MVP-003: Create Shared Enums and Validators

Context: Shared domain contracts must avoid duplicate concepts and generic User collapse.

Scope:

- Define Subject, Principal, WalletAccount, Lockbox, CreditLine, Obligation, Provider, SpendRequest, SpendPolicy, Settlement, Repayment, RiskDecision, CreditEvent, AuditEvent, and AdminAction builders.
- Define mandatory states and transitions.
- Add CAIP-2/CAIP-10 and PII validators.

Non-Goals:

- No black-box scoring.
- No production KYC processing.

Likely Files:

- `packages/domain/src/*`
- `packages/domain/test/*`

Acceptance Criteria:

- Invalid state transitions are rejected.
- CAIP and PII validators are tested.
- Deterministic IDs are bytes32-like.

Security Checklist:

- No raw PII or secrets in fixtures.
- No generic User object.

## MVP-004: Create Database Migration Baseline

Context: The MVP needs event-sourced, auditable tables from day 1.

Scope:

- Add baseline SQL up/down migration for core tables.

Non-Goals:

- No live database deployment.
- No production schema migration.

Likely Files:

- `db/migrations/0001_mvp_foundation.up.sql`
- `db/migrations/0001_mvp_foundation.down.sql`

Acceptance Criteria:

- Core domain tables and event/audit records are represented.
- Down migration exists.

Security Checklist:

- Store hashes/references rather than raw PII.

## MVP-005: Create Local Dev Environment

Context: The first foundation needs one command for tests and one command for local service behavior.

Scope:

- Add Node test runner script.
- Add boundary lint.
- Add local API shell and demo endpoint.

Non-Goals:

- No Docker Compose services yet.
- No production API gateway.

Likely Files:

- `scripts/run-tests.mjs`
- `scripts/lint-boundaries.mjs`
- `apps/api/src/server.js`

Acceptance Criteria:

- `npm run check` passes.
- `npm run dev:api` serves health and demo endpoints locally.

Security Checklist:

- API demo reports `productionFundsMoved = false`.
