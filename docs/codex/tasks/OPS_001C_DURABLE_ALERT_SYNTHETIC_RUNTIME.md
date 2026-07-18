# OPS-001C: Durable Alert and Dual-Native Synthetic Runtime

Status: Implemented locally for the closed no-real-funds pilot. The runner and
store are callable product internals; hosted scheduling, notification delivery,
named ownership, acknowledgement/resolution operations, production deployment,
and real-value authority remain unconfigured or unapproved.

Date: 2026-07-17

## Context

`OPS-001B` established seven reviewed event-presence rules and privacy-safe
alert candidates. A commercial private pilot also needs restart-safe occurrence
history and an honest lifecycle check: a boolean health probe or the historical
DEMO cannot prove that both Human and Agent entries reach the same economic
Obligation, repayment, Evidence, and reconciliation outcome.

Commercial requirements supersede conflicting DEMO behavior. This issue adds
durable internal truth without creating a public operations API or silently
granting the permissions still reserved for named human review.

## Scope

- Define `dual_native_lifecycle_synthetic_result.v1` over an exact commit SHA.
- Execute and validate Human Offer, Agent Offer, Offer parity, Human
  Obligation/repayment, Agent Obligation/repayment, exact receipt linkage,
  Obligation parity, and full zero-difference reconciliation.
- Return only stable failure stage/code and content hashes; discard executor
  error text, receipts, credentials, and raw identities from the result.
- Persist Tenant-scoped alert state, immutable source occurrences, and
  immutable synthetic runs in PostgreSQL migration `0022`.
- Commit each accepted change through Event, Evidence, Outbox, aggregate
  version, idempotency record, and projection in one transaction.
- Deduplicate both exact command replay and source replay without losing the
  exact total occurrence count; retain at most 32 evidence hashes.
- Enforce forced RLS, Tenant-scoped foreign keys, monotonic alert versions, and
  append-only occurrence/synthetic records.
- Add database tests using a real non-superuser, non-owner, `NOBYPASSRLS`
  application role.

## Non-Goals

- No cron, scheduler, hosted monitor, production probe, or protected deployment.
- No email, pager, webhook, ticketing, SMS, or incident-provider delivery.
- No named on-call recipient, incident owner, response-time SLO, cap, loss, or
  stop-loss threshold.
- No API/MCP operation or permission for alert acknowledgement, resolution,
  notification, freeze, pause, repair, limit change, release, or fund movement.
- No production identity, KYC/PII ingestion, real collection rail, custody,
  mainnet, or real funds.
- No claim that one successful local run is continuous operational readiness.

## Likely Files

- `modules/operations-control/src/dual-native-synthetic.js`
- `modules/operations-control/src/postgres-operational-alert-store.js`
- `db/migrations/0022_durable_operational_alerts.*.sql`
- `schemas/v2/dual-native-lifecycle-synthetic-result.schema.json`
- `schemas/v2/operational-alert-state.schema.json`
- `modules/operations-control/test-postgres/operational-alert-store.test.mjs`
- `docs/operations/PRIVATE_PILOT_ALERT_AND_INCIDENT_RUNBOOK.md`
- commercialization, traceability, and launch-readiness guidance

## Acceptance Criteria

- [x] Passing requires all eight reviewed stages and an exact release SHA.
- [x] Human and Agent receipts share exact Intent/Offer/terms/Obligation linkage
  and pass the existing dual-native economic parity contracts.
- [x] Reconciliation must be full, untruncated, passed, and have zero
  discrepancies and zero critical findings.
- [x] Failure returns only a reviewed stage, stable safe code, and prior-stage
  Evidence hashes; executor messages never escape.
- [x] Synthetic results bind to the active Tenant through a domain-separated
  Tenant hash and reject cross-Tenant storage.
- [x] Alert, occurrence, and synthetic tables use forced RLS and Tenant-scoped
  foreign keys.
- [x] One command replay or one source replay cannot inflate occurrence count.
- [x] Two Tenants may reuse the same source and idempotency identities without
  visibility, replay coupling, or uniqueness conflict.
- [x] Event, Evidence, Outbox, projection, and aggregate version commit atomically.
- [x] Direct identity/policy mutation, occurrence mutation, synthetic mutation,
  and alert deletion fail at the database boundary.
- [x] The runtime retains no raw Tenant/Actor/Subject/Obligation/check identifier,
  receipt, credential, KYC/PII, or executor error detail in operational output.
- [x] Delivery remains `unconfigured`; automatic action, production release,
  public endpoint, credentials, and funds flags remain false.

## Test Commands

```sh
node --test modules/operations-control/test/*.test.js
pnpm run check:schemas
pnpm run check:migrations
pnpm run lint:boundaries
pnpm run test:postgres
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:provider
git diff --check
```

## Verification Snapshot

- Node `24.18.0` module tests: 13/13.
- Fresh PostgreSQL 17 integration matrix: 61/61.
- Migration drift gate: 22 ordered up/down pairs.
- The PostgreSQL proof uses a temporary `NOSUPERUSER`, `NOBYPASSRLS`,
  non-owner application role; a superuser result is not accepted as RLS proof.

## Security Checklist

- [x] Source, scope, Tenant, Actor, check, receipt, and reconciliation references
  are domain-separated hashes.
- [x] Idempotency keys use a closed machine-identifier alphabet and cannot carry
  email addresses or free-text incident detail.
- [x] Input shapes, stages, release identity, and safety flags are closed.
- [x] Executor error messages and raw receipts are not persisted as synthetic evidence.
- [x] Source identity cannot be rebound to another alert.
- [x] Exact command replay is verified before projection planning.
- [x] PostgreSQL serializable transactions and aggregate versions protect races.
- [x] Alert Evidence remains bounded while occurrence count remains exact.
- [x] Lifecycle/policy identity cannot be rewritten or deleted directly.
- [x] No notification, automatic action, release, or funds capability is added.
- [ ] Named owners/recipients, acknowledgement/resolution permissions, and
  escalation policy separately reviewed and approved.
- [ ] Protected scheduler/deployment, secret lifecycle, SLOs, exercises, and
  external delivery separately reviewed and approved.
