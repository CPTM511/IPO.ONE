# CREDIT-001B: Durable Credit Application Projections

Status: Complete locally on 2026-07-15. Depends on CREDIT-001A and remains
local, authenticated-boundary-ready, no-real-funds infrastructure only.

## Context

CREDIT-001A introduced shared Human/Agent `CreditIntent` and `CreditOffer`
contracts, but those objects are not durable or reconcilable. The current
PostgreSQL runtime already commits Events, Evidence, outbox records, normalized
projections, immutable snapshots, and registry hashes atomically. The next
increment must make application and Offer state restart-readable without yet
granting a new Tenant operation or public endpoint.

## Scope

- Add tenant-owned `credit_intents` and `credit_offers` projections.
- Enforce closed status values and forward-only state transitions in PostgreSQL.
- Make identity, terms, hashes, no-real-funds flags, and schedule fields
  immutable after insertion.
- Add composite Tenant foreign keys to Subject, Principal, Intent, Risk
  Decision, and Offer relationships.
- Enable and force RLS with the existing transaction-context write guard.
- Extend `PostgresCoreRepository` read, write, snapshot, registry, verification,
  replay, and repair support for both projection types.
- Extend PostgreSQL integration fixtures to prove rollback, restart, Tenant
  isolation, immutable terms, terminal transitions, and projection integrity.

## Non-Goals

- No Tenant Gateway operation, AuthZ policy, quota classification, API/SDK/MCP
  transport, UI flow, Offer acceptance command, Obligation, or fund movement.
- No Consent model, Human PII/KYC, production identity, real underwriting,
  pricing approval, legal disclosure, or deployment.
- No change to the anonymous public sandbox.

## Likely Files

- `db/migrations/0010_durable_credit_application_projections.up.sql`
- `db/migrations/0010_durable_credit_application_projections.down.sql`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `scripts/check-migrations.mjs`
- `docs/codex/tasks/CREDIT_001B_DURABLE_CREDIT_APPLICATION_PROJECTIONS.md`

## Acceptance Criteria

- [x] Human Consent and Agent Mandate Intents persist in the same table and
  projection contract.
- [x] Intent and Offer survive repository restart with their hashes, terms,
  status, schedule, reasons, and no-real-funds flags unchanged.
- [x] A projection crash rolls back rows, Events, Evidence, outbox, registry,
  and snapshots atomically.
- [x] RLS and transaction-context guards cover both tables; cross-Tenant reads
  return no object and cross-Tenant references fail.
- [x] Intent and Offer terms cannot be mutated after creation.
- [x] Status can move only through the documented forward transitions and
  cannot leave a terminal state.
- [x] Snapshot/registry/canonical hashes reconcile and command replay does not
  duplicate either projection.
- [x] Migration down/up and the complete existing test suite pass.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Tables force RLS and use the server-set Tenant transaction context.
- [x] Every cross-table reference includes `tenant_id`.
- [x] Authority references remain data only; no authorization is inferred.
- [x] Immutable terms and forward-only status transitions are database-enforced.
- [x] Raw PII/KYC, credentials, signatures, private keys, and secrets are absent.
- [x] `sandbox_only = TRUE`, production fund flags remain `FALSE`, and no
  endpoint, permission, deployment, or real-value capability is added.

## Verification Evidence

- `pnpm run check`: 169 unit and contract tests pass; all 26 schemas, 21
  OpenAPI operations, ten migration pairs, deployment/launch/approval/abuse
  policies, and the seven-operation Tenant protocol drift gates pass.
- `pnpm run test:postgres`: 48 PostgreSQL 17 integration tests pass from an
  empty dedicated database. The new coverage proves Human Consent and Agent
  Mandate parity, atomic rollback, restart/replay, canonical hash
  reconciliation, immutable terms, terminal-state enforcement, cross-Tenant
  read isolation, and composite-FK rejection of a cross-Tenant Subject.
- `git diff --check` and JavaScript syntax checks pass.
- The local shell used Node.js 26 and emitted the repository engine warning;
  remote review should rerun on the required Node.js 24.18.x runtime.
