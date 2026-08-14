# IPO.ONE Vercel Sandbox Runbook

## Status

Status: `DEPLOYMENT_PENDING_FINAL_FOUNDER_AUTHORIZATION`

This runbook describes a future, separately authorized deployment of one
invitation-only no-real-funds Sandbox through the Primary Vercel project and
one canonical database. A separate Risk project is conditional on a later,
separately approved phishing-resistant authentication topology. This is not
current deployment authority and does not authorize a merge, deployment,
promotion, alias, DNS or custom-domain change, tag, seal, RC, paid integration,
signer, mainnet operation, real-funds path, or production financial claim. The
current machine-readable topology is
`deploy/vercel/m1-b-sandbox.manifest.v2.json`; v1 is preserved historical
two-project context only.

## Fixed target

| Component | Target |
| --- | --- |
| Vercel team | `cptm-111-s-projects` |
| Primary Vercel project | `ipo-one-internal` |
| Primary project ID | `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y` |
| Risk Vercel project | `ipo-one-internal-risk`; historical baseline only during current closure |
| Runtime | Node.js 24.x, Fluid Compute |
| Database | One Neon PostgreSQL 17 project through Vercel Marketplace |
| Cron | Primary project only: `/api/cron`, `*/5 * * * *`, authenticated by `CRON_SECRET` |
| Public label | M1-B Deployable Sandbox; never a production financial claim |

## Exact source gate

The current release truth is
`docs/releases/M1_B_CURRENT_RELEASE_TRUTH.md`. The exact candidate SHA, tree, and
final test counts are bound only after the candidate commit exists, in PR #20
and private P0-5 Evidence. While deployment remains pending, the required
identity relationship is `source = tested = accepted` and `deployed = null`.
The following sequence may continue into deployment only after final Founder
authorization:

1. Stage only the approved M1-B implementation and deployment evidence paths.
2. Preserve the three protected Founder work-in-progress test files and all
   unrelated audit, marketing, prototype, and output paths.
3. Create one normal implementation commit on
   `codex/m1-b-deployable-sandbox`; do not create an RC branch or tag.
4. Record commit and tree SHA.
5. Run all static, unit, PostgreSQL, serverless, and local acceptance gates.
6. Build the primary deployment bundle only from the exact clean export of that
   commit. Build a Risk bundle only after separate authorization confirms that
   the required phishing-resistant authentication is composed; SIWE alone is
   insufficient.

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
node scripts/check-m1-b-release-closure-founder-overlay.mjs
pnpm run check:m1-b-release-checkpoint
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
4. Apply all 61 ordered migration pairs through
   `0061_execution_account_bindings` with exact checksums.
5. Create separate forced-RLS Gateway and authentication roles.
6. Seed only the reviewed synthetic Tenant, system Actor, invited Principal
   Controller, DPoP-bound Agent runtime, Provider, and other identities named by
   the separately authorized Primary acceptance profile. Seed or deploy a Risk
   operator only under the separately approved phishing-resistant
   authentication topology; SIWE-only Risk remains a fail-closed local
   security-boundary test, not a hosted M1-B surface. The Agent uses
   `agent_dpop`.
7. Record migration and seed results without values.
8. Remove the owner/bootstrap credential from the Vercel runtime environment.

Runtime Functions receive only the two least-privilege database URLs.

## Vercel environment and deploy

Do not execute this section during current M1-B closure. It begins only after
final Founder deployment authorization names the exact accepted candidate and
the freshly revalidated rollback baselines.

1. Enable Vercel system environment variables.
2. Add only the variables in
   `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md` for each authorized
   project's production target. Configure `CRON_SECRET` only on the primary
   project.
3. Verify immutable secret digests locally without printing values.
4. Build the exact `primary` deployment bundle and, only when separately
   authorized and strongly authenticated, the `risk` deployment bundle.
5. Deploy the primary bundle to `ipo-one-internal` using pinned Vercel CLI
   `58.5.1`. Do not deploy or promote `ipo-one-internal-risk` while
   phishing-resistant Risk authentication remains unavailable.
6. Record every applicable deployment ID, deployment URL, stable project URL,
   exact shared source commit/tree, artifact manifest hash, build output,
   Function runtime, and the primary-only Cron registration.
7. Do not attach a custom domain.

Vercel production target activation is required only for Cron. All documents,
UI labels, and evidence continue to identify the product as Sandbox.

## Health and smoke checks

Verify without authentication on the Primary origin and on the Risk origin only
when that surface is separately authorized and deployed:

```text
GET /livez  -> 200, exact release ID
GET /readyz -> 200, PostgreSQL and migration head ready
```

Verify Principal operations on the primary origin and Agent operations with
short-lived DPoP-bound JWTs on the primary origin. Verify Risk/Admin operations
only on a separately authorized Risk origin with the required phishing-resistant
authentication. SIWE-only Risk access must remain unavailable and fail closed.
The Agent authentication private key stays only in the external evidence runner
and is never uploaded to Vercel.

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

Current M1-B release closure is governed by the v2 contract in
`docs/verification/M1_B_P0_5_ACCEPTANCE.md`. If Primary deployment is separately
authorized, collect exactly its eight Principal/Agent hosted rows—desktop,
mobile, reload, fresh browser context, Back/Forward, sign-out/re-login, negative
authorization, and restart recovery—and bind every row to the exact deployed
candidate and PostgreSQL runtime. A hosted Risk row or surface is rejected.

The older 15-test matrix in
`docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md` and its Risk-host expectations are
supplemental historical evidence only. They do not define current v2 coverage,
authorize a Risk deployment, or substitute for the exact eight-row Primary
matrix.

Until deployment is authorized, hosted rows remain explicitly pending and do
not borrow Evidence from the older `d36ff20c2049b199ed3032e85752f36e36300312`
baseline.

## Stop rules

Stop without expanding architecture if final Founder deployment authorization
is absent, a paid Neon plan is required, canonical semantics must change, outbox
correctness fails, a continuous process is unavoidable, or any
real-funds/signer/withdrawal/venue-write credential appears. Do not merge,
promote, bind an alias, change DNS, tag, or seal as an implied runbook step.
