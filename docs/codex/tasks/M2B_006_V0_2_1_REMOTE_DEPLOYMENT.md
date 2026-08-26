# M2B-006 — v0.2.1 authorized remote deployment

Status: `BLOCKED — DEPLOYED; FINAL SECURITY AND AUTHENTICATED ACCEPTANCE REQUIRED`

Baseline: `34ac9d982b5a0061b645940f1532ed6f19e18290`

Candidate: `M2B-005-V0.2.1-RC-20260826-002`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-UX-001`, `REQ-UX-002`, `REQ-UX-005`

## Context

On 2026-08-26 the IPO.ONE Founder explicitly recorded:

1. Founder Candidate Decision: `APPROVED`;
2. Independent Review: `APPROVED`; and
3. Remote Deployment: `APPROVED — PROCEED`.

The approvals apply to the exact v0.2.1 no-funds candidate. They do not revise
the disabled `closed_non_funds_pilot` launch-policy profile and do not grant
mainnet, real-funds, signer, Pool/Venue write, custody, transfer, withdrawal,
Risk-project, stable-alias, DNS or custom-domain authority.

## Scope

- Record the exact Founder and Independent Review decisions.
- Authorize one Primary Vercel deployment in project `ipo-one-internal`.
- Build from one clean exact Git commit with the pinned Vercel CLI `58.5.1`.
- Use the production target only because the reviewed bounded Cron topology
  requires it, and deploy with `--skip-domain` so no stable alias changes.
- Reuse only the already configured production environment; do not add, print,
  export or persist secret values.
- Verify deployment identity, Node runtime, `/livez`, `/readyz`, discovery,
  no-funds capability truth, bounded Cron denial, browser-visible Human paths,
  Agent read parity and deployment logs.
- Preserve the currently promoted production deployment as the immediate
  rollback target.

## Non-goals

- No merge, stable alias, `ipo.one`, DNS or custom-domain mutation.
- No Risk-project deployment.
- No launch-policy profile enablement or closed-pilot promotion.
- No database owner/bootstrap credential in Vercel and no destructive migration.
- No signer creation/load/reuse, chain transaction, Pool/Venue request, mainnet,
  real funds, Human cash lending, custody, transfer or withdrawal.
- No production financial claim.

## Likely files

- `docs/codex/tasks/M2B_006_V0_2_1_REMOTE_DEPLOYMENT.md`
- `docs/releases/IPO_ONE_V0_2_1_DEPLOYMENT_DECISION.md`
- `deploy/vercel/m1-b-sandbox.manifest.v2.json`
- `deploy/vercel/README.md`
- `docs/deployment/VERCEL_SANDBOX_RUNBOOK.md`
- `scripts/check-vercel-sandbox-deployment.mjs`
- post-deployment Evidence under `artifacts/m2b-006/`

## Acceptance criteria

1. The exact authorization commit passes repository CI and all Vercel static,
   environment, schema, catalog, security, transport and candidate gates.
2. The deployment bundle is materialized from the exact clean authorization
   commit and reports the same source commit/tree in its artifact manifest.
3. Exactly one Primary production-target deployment reaches Vercel `READY`
   without receiving a stable alias.
4. `/livez`, `/readyz` and discovery return the exact deployed SHA, PostgreSQL
   migration head `0068`, and explicit no-real-funds/no-write capability truth.
5. Human visible-click and Agent authorized read acceptance run against the
   actual deployed SHA; refresh/recovery remains server-derived.
6. Logs show no deployment/runtime error during the bounded acceptance window.
7. Failure at any step leaves the current production aliases unchanged and
   removes or disables the unaliased candidate if it could continue Cron work.

## Test commands

```sh
pnpm check
pnpm check:vercel-sandbox
pnpm check:vercel-sandbox-env
pnpm check:product-traceability
pnpm check:m2b-005-candidate
pnpm test
git diff --check
```

## Security checklist

- [ ] Exact clean SHA and artifact manifest are identical.
- [ ] Production environment names/digests validate without printing values.
- [ ] One Primary project only; Risk remains absent.
- [ ] Deployment has no stable alias or custom domain.
- [ ] Real funds, signer, chain write, Venue write and withdrawal remain false.
- [ ] PostgreSQL is ready at migration `0068` with forced-RLS runtime roles.
- [ ] Browser and Agent acceptance bind the actual deployed SHA.
- [ ] Rollback deployment remains known and reachable.

## Permission boundary

This issue consumes the Founder's explicit remote-deployment authorization only
for one staged, unaliased Primary no-funds candidate. Promotion, alias mutation,
DNS, custom domain, merge, closed-pilot activation, production financial use,
mainnet, real funds and external execution remain separately gated.

## Data and migration impact

The candidate requires the existing additive migration sequence through
`0068_m2b_dual_risk_recovery`. Runtime migrations remain prohibited. If the
managed database is below `0068`, stop before deployment activation and obtain
an exact owner-migration authorization rather than exposing an owner credential
to Vercel.

## Rollback

Do not promote the candidate. On build, health, database, browser, Agent, Cron
or log failure, retain the current production alias, remove the unaliased
candidate when safe, preserve durable Events/Evidence and reconcile read-only.
Never downgrade destructively or retry an unknown external outcome.

## Required Evidence

Exact authorization commit/tree, CI URL, artifact manifest digest, deployment
ID/URL, runtime/Function identity, health/readiness/discovery responses, database
migration head, browser-visible clicks, Agent read receipt, bounded log scan,
rollback deployment identity, unchanged-alias proof and explicit excluded
authority.

## 2026-08-26 execution result

- Authorization commit `33d60105f9ba229c5827d831d2991aee3c78112c`
  and tree `37fbef1dcc249e6316b1c824d36c8d679a5f2bb8` passed the
  local 1,205-test suite and both required remote CI workflows.
- The clean 191-file deployment bundle had manifest digest
  `f61b39d1b123e5ab21c658d0c2f7b5043c8954a1ba64db70defa1b818c0b865e`.
- Unaliased Primary deployment `dpl_DZMtBKTtTZfH7Q3CwhEnP1MfVo1m`
  reached Vercel `READY` with two Node.js Functions and no aliases.
- `/livez`, `/readyz` and discovery failed closed with HTTP `503`, exact
  release SHA `33d60105f9ba229c5827d831d2991aee3c78112c` and runtime code
  `production_database_migration_mismatch`. Uncredentialed `/api/cron`
  returned HTTP `401`; logs recorded `realFundsEnabled=false`.
- The production environment exposes only encrypted runtime-role connection
  variables and no database owner/bootstrap credential. The current migration
  head therefore cannot be advanced or owner-read under this issue's authority.
- Per the rollback contract, the unaliased candidate was safely removed. Stable
  alias `ipo.one` remains on `dpl_qLgKAkpyTEdeZpsjMw8trL5gtNLj`, release
  `71786a3c72237320f7bacf77b64496dd1a0c526f`, and remains ready with
  `realFundsEnabled=false`.
- Browser-visible Human and Agent acceptance did not run because application
  readiness is a prerequisite. The required next authority is an exact,
  bounded owner inspection and, if the history is a valid prefix, migration
  through `0068_m2b_dual_risk_recovery`, followed by a fresh clean deployment
  of the same reviewed candidate and full acceptance.

Evidence: `artifacts/m2b-006/remote-deployment-attempt.json`.

## 2026-08-26 authorized owner migration continuation

- Founder authorization was received for owner-controlled read-only history
  inspection and additive migration only when the stored history was a valid
  prefix. Unknown migrations, checksum drift, a database-ahead state,
  downgrade and destructive migration remained prohibited.
- Neon project `falling-king-09359147`, main branch
  `br-nameless-hill-avcw7qpp`, PostgreSQL 17 and owner role `neondb_owner`
  matched the prior production Evidence. A manual pre-migration snapshot
  `snap-lively-flower-av7nl8qq` was created and existing six-hour PITR was
  confirmed.
- The owner read-only transaction proved exact migration head `0063`, 63/68
  contiguous entries, matching checksums and no unknown or ahead migration.
- Migrations `0064` through `0068` then applied in five independent
  transactions. Post-migration read-only verification proved 68/68 exact names
  and checksums at `0068_m2b_dual_risk_recovery`.
- Least-privilege verification found that the 18 tables introduced by those
  migrations do not yet have Gateway `SELECT`; authentication correctly has no
  access. Runtime privilege mutation was not included in the owner-migration
  authorization and was not inferred.
- The exact reviewed bundle was redeployed without aliases as
  `dpl_752hsJ9pDzK8WnRwxaKBzGNBgP94`. `/livez` and `/readyz` returned HTTP 200
  with exact SHA `33d60105f9ba229c5827d831d2991aee3c78112c` and
  `realFundsEnabled=false`; unauthenticated Cron returned HTTP 401 and the
  bounded log scan had no runtime errors.
- Candidate discovery/UI correctly returned HTTP 421 because the production
  runtime accepts only `IPO_ONE_PUBLIC_ORIGIN=https://ipo.one`. Stable alias
  promotion remains unauthorized, so browser-visible Human and authorized
  Agent acceptance cannot truthfully bind the candidate SHA yet.

Continuation Evidence:
`artifacts/m2b-006/production-owner-migration-and-redeploy.json`.

## 2026-08-26 runtime repair, promotion and acceptance continuation

- The Founder authorized the exact runtime privilege repair, stable-alias
  promotion and full remote acceptance. This did not override the existing
  prohibition on role-password mutation or create authority for a new
  production Agent credential, mainnet, real funds or external execution.
- Owner-controlled verification reconfirmed the exact 68/68 migration history
  at `0068_m2b_dual_risk_recovery`. In one transaction the Gateway received
  `SELECT` on the 18 new tables, sequence read/use, full DML only on secured
  Facility authorization and insert-only access on the four Agent composition
  and incident append tables. The 13 Pool tables retain zero Gateway mutation;
  Authentication retains zero unexpected read or mutation access. Neither
  runtime role owns the new relations or inherits the owner role.
- Exact candidate `dpl_752hsJ9pDzK8WnRwxaKBzGNBgP94` was promoted to
  `https://ipo.one`. Alias inspection, `/livez` and `/readyz` bind the public
  origin to exact SHA `33d60105f9ba229c5827d831d2991aee3c78112c` with
  `realFundsEnabled=false`.
- Discovery and Agent OpenAPI return HTTP 200. Uncredentialed Cron returns HTTP
  401 and uncredentialed Tenant catalog access fails closed. Scheduled Vercel
  Cron returned HTTP 200 on the exact release with reconciliation `passed` and
  real funds disabled. The 45-minute deployment log scan contains no error or
  HTTP 5xx entry.
- A real browser reached the promoted public origin and visibly clicked Sign
  in plus the Human Borrower and Principal Controller role choices. The
  isolated acceptance browser has no compatible wallet, so authenticated
  Human refresh/recovery is not verified. The previously reviewed Golden Flow
  Agent credential was revoked and its private key destroyed, so no approved
  active credential exists for a positive authorized Agent read.
- During an owner connection-string retrieval attempt, a command-format error
  printed the owner connection string into the private tool transcript. The
  secret is not repeated in repository Evidence. Because role-password
  mutation remained explicitly prohibited, it was not rotated.

The promoted candidate is healthy and rollback is not justified by a runtime
failure. M2B-006 nevertheless remains `BLOCKED — NOT COMPLETE` until the owner
password is explicitly authorized for rotation and revalidated, a compatible
wallet completes Human authenticated refresh/recovery, and a separately
approved ephemeral Agent credential completes a positive authorized read and
is then revoked/destroyed.

Final continuation Evidence:
`artifacts/m2b-006/production-promotion-and-acceptance.json`.
