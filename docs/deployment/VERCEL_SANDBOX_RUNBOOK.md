# IPO.ONE Vercel Sandbox Runbook

## Status

Status: `PREPARED_PENDING_EXACT_DEPLOYMENT_EVIDENCE`

This runbook deploys one role-isolated invitation-only no-real-funds Sandbox
through two Vercel projects and one canonical database. It does not
create an RC, release tag, custom domain, paid integration, signer, mainnet
operation, real-funds path, or production financial claim.

## Fixed target

| Component | Target |
| --- | --- |
| Vercel team | `cptm-111-s-projects` |
| Primary Vercel project | `ipo-one-internal` |
| Primary project ID | `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y` |
| Risk Vercel project | `ipo-one-internal-risk` (create only after exact commit) |
| Runtime | Node.js 24.x, Fluid Compute |
| Database | One Neon PostgreSQL 17 project through Vercel Marketplace |
| Cron | Primary project only: `/api/cron`, `*/5 * * * *`, authenticated by `CRON_SECRET` |
| Public label | M1-B Deployable Sandbox; never a production financial claim |

## Exact source gate

1. Stage only the approved M1-B implementation and deployment evidence paths.
2. Preserve the three protected Founder work-in-progress test files and all
   unrelated audit, marketing, prototype, and output paths.
3. Create one normal implementation commit on
   `codex/m1-b-deployable-sandbox`; do not create an RC branch or tag.
4. Record commit and tree SHA.
5. Run all static, unit, PostgreSQL, serverless, and local acceptance gates.
6. Build the primary and Risk deployment bundles only from the same exact clean
   export of that commit.

Required commands:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run check:m1-requirements
node scripts/check-m1-b-gate-profile.mjs
pnpm run check:web-bundle
pnpm run check:vercel-sandbox
pnpm test
DATABASE_URL='<fresh-postgresql-17-test-url>' pnpm run test:postgres
```

Never deploy a dirty compatibility bundle. The build script rejects a dirty
worktree unless the explicit local-only `--allow-dirty-test` flag is used; such
an artifact is never deployable evidence.

## Neon provisioning and bootstrap

1. Install Neon from the Vercel Marketplace only on its Free plan. Stop if the
   operation requires a paid plan or new billing commitment.
2. Record Neon project, branch, database, region, PostgreSQL major version, and
   integration IDs without credentials.
3. Use the Neon owner credential only from an owner-controlled temporary
   environment for one-shot bootstrap.
4. Apply all 53 ordered migration pairs with exact checksums.
5. Create separate forced-RLS Gateway and authentication roles.
6. Seed only the reviewed synthetic Tenant, system Actor, invited Founder
   Principal Controller, DPoP-bound Agent runtime, Provider, and Founder Risk
   Operator identities required by the Golden Flow. The two Human credentials
   use distinct Vercel issuers/client IDs; the Agent uses `agent_dpop`.
7. Record migration and seed results without values.
8. Remove the owner/bootstrap credential from the Vercel runtime environment.

Runtime Functions receive only the two least-privilege database URLs.

## Vercel environment and deploy

1. Enable Vercel system environment variables.
2. Add only the variables in
   `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md` for each project's
   production target. Configure `CRON_SECRET` only on the primary project.
3. Verify immutable secret digests locally without printing values.
4. Build exact `primary` and `risk` deployment bundles.
5. Deploy the primary bundle to `ipo-one-internal` and the Risk bundle to
   `ipo-one-internal-risk` using pinned Vercel CLI `58.5.1`.
6. Record both deployment IDs, deployment URLs, stable project URLs, exact
   shared source commit/tree, both artifact manifest hashes, build output,
   Function runtime, and the primary-only Cron registration.
7. Do not attach a custom domain.

Vercel production target activation is required only for Cron. All documents,
UI labels, and evidence continue to identify the product as Sandbox.

## Health and smoke checks

Verify without authentication on both project origins:

```text
GET /livez  -> 200, exact release ID
GET /readyz -> 200, PostgreSQL and migration head ready
```

Verify Principal operations on the primary origin, Agent operations with
short-lived DPoP-bound JWTs on the primary origin, and Risk/Admin operations on
the Risk origin. The Agent authentication private key stays only in the
external evidence runner and is never uploaded to Vercel.

Verify through invitation-only authentication:

```text
GET  /auth/v1/options
POST /auth/v1/wallet/challenge
POST /auth/v1/wallet/verify
GET  /tenant/v1/catalog
POST /tenant/v1/operations
```

Verify Cron boundaries:

```text
GET /api/cron without credential -> 401
POST /api/cron with exact credential -> bounded result
Vercel scheduled invocation -> 200 and structured log
```

## Golden Flow and serverless evidence

Execute the 15-test matrix in
`docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md`. Preserve Playwright trace,
screenshots, deployment logs, Event IDs, database row counts and hashes,
reconciliation IDs, duplicate-delivery results, restart results, and rollback
result. Evidence must bind to one deployed commit.

## Stop rules

Stop without expanding architecture if a paid Neon plan is required, canonical
semantics must change, outbox correctness fails, a continuous process is
unavoidable, or any real-funds/signer/withdrawal/venue-write credential appears.
