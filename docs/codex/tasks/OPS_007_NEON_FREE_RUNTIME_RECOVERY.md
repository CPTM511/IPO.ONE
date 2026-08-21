# OPS-007 — Neon Free Runtime Recovery

Status: IMPLEMENTED — PRODUCTION RESTORATION BLOCKED BY NEON QUOTA

## Context and current baseline

Production release `330dd41027c75aa8c725ab3777121460ae131115`
returns `503 Sandbox runtime unavailable` for the public product, health routes,
and discovery routes. Vercel runtime logs show both request initialization and
the five-minute Cron failing with PostgreSQL SQLSTATE `53000`. The exact
deployed Vercel artifact is `Ready`; the database provider is the Vercel
Marketplace Neon Free resource `ipo-one-m1-b-sandbox`.

The configured `*/5 * * * *` Cron cadence coincides with Neon Free's fixed
five-minute scale-to-zero delay. Each scheduled connection resets the idle
timer and can keep the compute active continuously. The active Neon Free plan
provides 100 CU-hours per project each month. Paid Neon activation is not
authorized by this issue.

## Scope

- Change the Primary Vercel bounded Cron cadence from every five minutes to
  every fifteen minutes so the Free compute has an idle interval in which it
  can scale to zero.
- Keep the existing bounded, authenticated, advisory-lock-protected Cron
  operation unchanged.
- Synchronize the root and deployable Vercel configurations, machine-readable
  deployment manifest, checks, tests, and deployment guidance.
- Build and verify a preview from the exact issue commit before any production
  promotion.
- After separately authorized production promotion, verify the public product,
  health routes, cron status, Human entry, and Agent discovery surface.

## Non-goals

- No paid Neon plan, new Neon project, database copy, migration, reset, branch,
  credential rotation, or data deletion.
- No protocol, Ledger, Obligation, Evidence, authorization, authentication,
  risk, capital, signer, chain, or funds behavior change.
- No change to worker batch size, leases, advisory locking, idempotency,
  reconciliation semantics, or the five-minute reconciliation key bucket.
- No claim that a cadence change restores an already exhausted monthly quota.

## Likely files

- `vercel.json`
- `deploy/vercel/vercel.m1-b-sandbox.json`
- `deploy/vercel/m1-b-sandbox.manifest.v2.json`
- `scripts/check-vercel-sandbox-deployment.mjs`
- `apps/private-pilot/test/vercel-sandbox-serverless.test.js`
- `docs/deployment/VERCEL_SANDBOX_RUNBOOK.md`
- `docs/deployment/VERCEL_SANDBOX_ARCHITECTURE.md`
- this issue document

## Acceptance criteria

### AC-1 — Scale-to-zero-compatible cadence

Given the Primary Vercel project uses Neon Free with a fixed five-minute idle
delay, when the deployable configuration is inspected, then exactly one
authenticated Cron remains configured and its cadence is `*/15 * * * *`.

### AC-2 — No automation authority expansion

Given the cadence changes, when serverless and deployment checks run, then the
Cron route, authentication, advisory lock, bounded batch, lease behavior,
idempotency, reconciliation key, and no-real-funds boundaries remain unchanged.

### AC-3 — Configuration drift is rejected

Given root config, deploy config, manifest, and tests, when any schedule differs
from `*/15 * * * *`, then the deployment check or serverless test fails.

### AC-4 — Runtime truth

Given a separately authorized production promotion and available Neon quota,
when public acceptance runs, then `/`, `/livez`, `/readyz`, and
`/.well-known/ipo-one.json` return successful truthful responses and the Cron
records a completed or concurrency-skipped bounded cycle rather than SQLSTATE
`53000`.

### AC-5 — Fail-closed external quota

Given Neon remains resource-exhausted after the cadence fix, when acceptance
runs, then the task reports `BLOCKED — NOT COMPLETE`; it does not create a new
database, discard durable data, change credentials, or purchase a paid plan.

## Test commands

```bash
pnpm run check:vercel-sandbox
node --test apps/private-pilot/test/vercel-sandbox-serverless.test.js
pnpm run lint
pnpm run typecheck
git diff --check
```

Production acceptance after an authorized promotion:

```bash
curl -fsS https://ipo.one/livez
curl -fsS https://ipo.one/readyz
curl -fsS https://ipo.one/.well-known/ipo-one.json
pnpm run smoke:vercel-sandbox
```

## Security checklist

- [ ] No secret or database URL is printed, committed, or moved to a public
      environment variable.
- [ ] `CRON_SECRET` authentication remains mandatory.
- [ ] Primary-only Cron and least-privilege database roles remain unchanged.
- [ ] Real funds, protocol fees, signer, withdrawal, venue write, mainnet, and
      production Human lending remain disabled.
- [ ] Cron remains advisory-lock protected, bounded, replay-safe, and
      queryable.
- [ ] Runtime failures remain fail-closed and privacy-safe.

## Permission boundary

The Founder request on 2026-08-21 authorizes investigation and the smallest
configuration/deployment repair required to restore the existing no-funds
runtime. This issue does not authorize a paid Neon plan, billing commitment,
new database, data movement, credential change, schema migration, or broader
production capability. Any such action requires a separate explicit Founder
decision.

## Data and migration impact

None. No schema, row, role, credential, database, or migration changes.

## Rollback plan

Revert the issue commit and promote the last known deployment only if current
database Evidence shows the earlier schedule is safe. Do not roll back durable
database state. If the Neon quota remains exhausted, keep the application
fail-closed rather than masking readiness.

## Required Evidence

- Exact branch and commit.
- Vercel/Neon plan and resource status without credentials.
- Before/after Vercel logs for request and Cron paths.
- Targeted checks and diff review.
- Preview URL and production URL browser acceptance.
- Exact production deployment ID and release ID if promoted.

## Dependencies and sequencing

1. Confirm provider/plan and root cause.
2. Change cadence and synchronized contracts.
3. Run targeted and aggregate checks.
4. Commit and push a focused branch.
5. Deploy and verify preview.
6. Promote only within the explicit runtime-recovery authority.
7. If Neon still returns `53000`, stop for a separate quota/billing decision.

## Completion Evidence

- Investigation on 2026-08-21 bound the failing production release to
  `330dd41027c75aa8c725ab3777121460ae131115`. Vercel request and Cron logs
  repeatedly reported PostgreSQL SQLSTATE `53000` while every real-value and
  signer capability remained disabled.
- Vercel deployment `dpl_BwApzWAp7qjUWzXWLdEX21BM5BVq` was `Ready`; the
  failing external resource was Neon Free `ipo-one-m1-b-sandbox`.
- The root and deployable Cron schedules, manifest, checks, tests, runbook, and
  architecture now consistently use `*/15 * * * *`.
- `pnpm run check:vercel-sandbox` — PASS.
- `node --test apps/private-pilot/test/vercel-sandbox-serverless.test.js` —
  PASS, 21 tests.
- `pnpm run lint` — PASS.
- `pnpm run typecheck` — PASS.
- `git diff --check` — PASS.
- Production promotion and runtime acceptance remain blocked because the
  existing Neon Free database still returns SQLSTATE `53000`. This issue does
  not authorize a paid plan or destructive database replacement.
