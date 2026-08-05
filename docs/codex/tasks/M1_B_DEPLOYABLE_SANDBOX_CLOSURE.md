# M1-B Deployable Sandbox Closure

## Context

Founder authorization defines M1-B as a deployable, invitation-only,
no-real-funds Sandbox vertical slice. The immutable engineering base is commit
`59dc448576553537b9bb4b702b308e461734dee3`. This task may close only
`REQ-CREDIT-009`, `REQ-UX-004`, and `REQ-UX-005` to `VERIFIED_SANDBOX` through
reproducible evidence. It is not an RC, release, controlled pilot, paid pilot,
mainnet, or production-financial authorization.

## Scope

- Derive CreditLine capacity and utilization from the current Offer, policy,
  Acceptance, Facility, Mandate, Obligation, and canonical exposure.
- Revalidate current authority and Provider scope before every Agent sandbox
  execution and fail closed on stale or inconsistent CreditLine projection.
- Persist authenticated Agent continuation receipts with exact Actor, Subject,
  Offer, version, status, and expiry bindings.
- Recover continuation from server truth after a fresh browser session and
  process restart; browser storage remains an optional cache.
- Execute one authenticated Agent Golden Flow through the existing shared
  Obligation kernel, including partial and full repayment, idempotency,
  projection replay, Risk visibility, protective freeze, and rejected
  subsequent spend.
- Prepare and verify the Founder-authorized Vercel Pro / Neon Free deployment:
  two role-isolated Vercel projects, one canonical PostgreSQL database, and a
  bounded primary-project Cron cycle.
- Produce exact code, test, browser, database, runtime, deployment, rollback,
  and limitation evidence.

## Non-goals

- No RC branch, annotated tag, release version, or production-ready claim.
- No fee runtime, protocol fee posting, pricing policy, or commercial lending.
- No Human production lending, Human dispute portal, or appeal state machine.
- No Capital Partner browser expansion.
- No signer, transfer, withdrawal, custody, venue-write, or mainnet authority.
- No new chain, credit model, broad refactor, visual redesign, or marketing.
- No destructive reset of the retained local PostgreSQL state.

## Likely files

- `packages/domain/src/credit-line-projection.js`
- `packages/domain/src/agent-lockbox.js`
- `modules/tenant-command-gateway/src/credit-execution-handlers.js`
- `modules/tenant-command-gateway/src/workspace-continuation-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/sandbox-rail/src/signed-sandbox-rail-adapter.js`
- `db/migrations/0050_canonical_credit_line_projection.*.sql`
- `db/migrations/0051_durable_workspace_continuation_receipts.*.sql`
- `db/migrations/0052_provider_bound_sandbox_execution_receipts.*.sql`
- `db/migrations/0053_workspace_continuation_tenant_guard.*.sql`
- tenant protocol schemas, fixtures, SDK, local reference Agent, Web UI, tests,
  deployment manifests, verification reports, and M1-B artifacts.

## Acceptance criteria

1. CreditLine cannot independently authorize exposure, and every Agent
   execution validates the exact current Offer, policy, Acceptance, Facility,
   Mandate, status, Provider target, and exposure.
2. Event replay and PostgreSQL `credit_line.v2` projection are byte-equivalent;
   stale, missing, or inconsistent projection fails closed before execution.
3. Signed no-funds execution receipts bind the allowlisted Provider, Provider
   category, and server-derived purpose.
4. Continuation receipts are durable, Tenant-isolated, Actor-bound, expiring,
   revocable, version-bound, replay-safe, and recoverable without browser
   storage.
5. A fresh PostgreSQL 17 database completes every migration up/down/up and the
   complete PostgreSQL integration suite.
6. The rebuilt local runtime completes health, worker, migration, restart,
   reconciliation, and outbox acceptance.
7. One real authenticated browser journey completes every authorized Golden
   Flow stage and records a Playwright trace, screenshots, request IDs, Event
   IDs, database rows, restart evidence, and the freeze denial.
8. One minimal remote staging deployment is bound to an exact normal Git commit
   and exposes verified invitation-only health and product URLs.
9. All deferred requirements retain their Founder-approved boundaries, and no
   implementation level is upgraded without reproducible evidence.

## Test commands

```bash
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run check:m1-requirements
node scripts/check-m1-b-gate-profile.mjs
pnpm run check:web-bundle
pnpm test
DATABASE_URL='<fresh-postgresql-17-test-url>' pnpm run test:postgres
pnpm local:up
pnpm local:acceptance
```

Browser verification must use the real local product at ports `8787`-`8790`.
The isolated Playwright CLI has no wallet extension and cannot by itself prove
the authenticated gate.

## Security checklist

- [x] No real funds, production authority, custody, transfer, or withdrawal.
- [x] Provider target is validated against current Mandate and derived Facility
  before the signed sandbox rail executes.
- [x] Provider ID, category, and server-derived purpose are signed and persisted.
- [x] CreditLine v2 projection is derived, replayable, and fail-closed on drift.
- [x] Continuation receipt table uses forced RLS and the mandatory Tenant write
  guard.
- [x] Existing migration checksums remain immutable; later hardening uses a
  forward migration.
- [x] Fee runtime remains absent and the UI states that fees are disabled.
- [ ] Real wallet browser authentication and negative post-freeze spend evidence
  are complete.
- [ ] Remote secrets, ingress, backup, and rollback evidence are complete.

## Permission boundary

The Founder authorized a Vercel Pro no-funds deployable sandbox and its
evidence, with Neon restricted to its Free/lowest tier. Any additional paid
integration, custom domain, third Vercel project, or expanded remote authority
still requires separate approval. No action
may silently convert this task into an RC, release, paid pilot, or production
financial system.

## Migration impact

- `0050` adds the canonical `credit_line.v2` projection shape without upgrading
  historical `credit_line.v1` rows by assertion.
- `0051` adds durable workspace continuation receipts.
- `0052` adds Provider target fields to sandbox execution receipts.
- `0053` adds the mandatory Tenant write guard without changing the already
  applied `0051` checksum.

Historical v1 CreditLine rows remain preserved and fail closed. They are not
deleted, rewritten, or treated as current authority.

## Rollback plan

- Before remote deployment, stop the new runtime and retain the database and
  complete Event history.
- Code rollback uses the last known-good immutable normal commit; it does not
  rewrite Events or silently downgrade retained projection rows.
- Database rollback is forward-only once any M1-B row exists. The down scripts
  are verified only on disposable test databases.
- Revoke invitation credentials and remote secrets, disable ingress, and stop
  worker admission before any infrastructure deletion.
- No financial or onchain rollback exists because this task moves no real funds
  and sends no transaction.

## Completion evidence

Current verified evidence and unresolved blockers are recorded in the M1-B
verification and deployment reports. This task remains open until the real
authenticated browser flow and one explicitly authorized remote staging
deployment are reproducibly complete.
