# PILOT-008B Gate 0 — Vercel + Neon technical readiness

Status: `GATE 0 REBASED — TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED`

Date: 2026-08-30

Prerequisite candidate: `PILOT-008A` local commit
`bb72a66f8627f9751c493f464a814bb53da9f403`

Requirements: `REQ-PILOT-001`, `REQ-PILOT-002`, `REQ-CORE-001`,
`REQ-UX-001..005`, `REQ-EVID-001..004`, `REQ-RISK-001..002`,
`REQ-PRIV-001`, `REQ-AUTO-001`

Founder direction: use the existing Vercel project and existing Vercel-managed
Neon Launch PostgreSQL project. Do not provision Cloud SQL, Cloud Run, a second
database provider or another deployment control plane without a concrete unmet
requirement. This decision authorizes technical readiness work and approved
additive migrations, but not cohort activation.

## Context

Read-only verification found the hosted Vercel runtime ready on the current
`main`, the Neon project `ipo-one-m1-b-sandbox` active in `aws-us-east-1`, and
the database at PostgreSQL 17 migration `0069`. All 152 tenant-scoped tables
have RLS and FORCE RLS. Candidate migration `0070_pilot_cases` is additive and
must be applied only after the exact candidate is merged.

The previous GCP blockers described an architecture that is no longer selected.
They become not applicable; the corresponding runtime, secret, edge,
durability, isolation and observability requirements remain mandatory on
Vercel and Neon.

## Scope

- Bind one machine-readable pre-merge Gate 0 observation to the exact
  `PILOT-008A` commit.
- Select one Vercel project, bounded Vercel Functions/Cron and the existing
  Neon PostgreSQL source of truth.
- Record only sanitized provider, project, plan, region, migration, schema,
  RLS and durability facts.
- Replace implementation-specific GCP blockers with provider-neutral Vercel
  and Neon Evidence gates.
- Preserve pending activation gates and reject any invented approval.
- After merge, bind the exact SHA and CI, apply only approved additive
  migration `0070`, prepare a non-cohort deployment candidate, and run restore,
  reconciliation, auth and remote acceptance.

## Non-goals

- No Cloud SQL, Cloud Run, GCP Secret Manager, new Neon project, new database
  provider or second control plane.
- No launch-policy enablement, participant identity or credential issuance,
  invitation, remote cohort access, traffic activation or public signup.
- No real funds, Human cash loan, Pool economic write, mainnet, Provider/Venue
  execution, signer, custody, withdrawal, unrestricted transfer,
  `PILOT-008C`, `HL-TESTNET-001`, `RISK-003B` or M3 work.

## Likely files

- `deploy/closed-pilot/pilot-008b-gate0.v1.json`
- `deploy/closed-pilot/topology.v1.json`
- `deploy/closed-pilot/provider-selection.pending.json`
- `packages/deployment-topology/`
- `scripts/check-pilot-008b-gate0.mjs`
- `docs/codex/audits/PILOT-008B/gate-0-readiness.md`

## Acceptance criteria

1. Existing Vercel + Neon is the only selected technical stack and all new
   provider provisioning remains blocked.
2. Database evidence contains no connection string, password, token or secret.
3. PostgreSQL 17, migration head, core tables and complete forced Tenant RLS
   are recorded and validated.
4. Cloud SQL/Cloud Run/GCP-specific requirements are `not_applicable` while
   provider-neutral launch gates remain pending.
5. The checked-in record cannot claim a merged candidate, green CI, deployment,
   migration receipt, rollback target or activation before those exist.
6. Technical preparation authority is distinct from participant, profile,
   traffic, external execution, signer, chain and funds authority.
7. Vercel static configuration proves one Node Function runtime, one bounded
   Cron, Neon canonical state, no continuous worker and no second control plane.
8. Targeted tests, aggregate CI and `git diff --check` pass.
9. Final technical readiness can pass only after post-merge migration, RLS,
   restore, reconciliation, auth and remote acceptance Evidence.

## Test commands

```sh
pnpm run check:pilot-008b-gate0
node --test packages/deployment-topology/test/pilot-008b-gate0.test.js
pnpm run check:deploy-topology
pnpm run check:provider-selection
pnpm run check:closed-pilot-operations
pnpm run check:vercel-sandbox
pnpm run check:launch-policy
pnpm run lint
pnpm run typecheck
git diff --check
```

## Security checklist

- [x] No secret value is stored or printed.
- [x] Existing Neon is selected and new provider provisioning is false.
- [x] Tenant RLS and FORCE RLS are complete for all observed tenant tables.
- [x] Real funds, external execution, signer, chain and Pool writes are false.
- [x] Participant access, profile activation and traffic cutover are false.
- [x] Independent Security remains independent and pending.
- [x] Launch policy remains disabled.

## Completion Evidence

- Machine record: `deploy/closed-pilot/pilot-008b-gate0.v1.json`.
- Sanitized audit: `docs/codex/audits/PILOT-008B/gate-0-readiness.md`.
- Vercel readiness and static deployment contract.
- Neon organization, project, branch and PostgreSQL read-only Evidence.
- Local targeted and aggregate CI Evidence.

## Permission boundary

Technical deployment preparation and approved additive migrations are allowed.
PILOT-008C invitation and activation remain separately gated. This task grants
no real-value, chain, external execution, credential issuance or M3 authority.

## Data and migration impact

This Gate 0 revision is documentation and validation only. Migration
`0070_pilot_cases` remains pending until the merged SHA is known. It is an
approved additive migration; runtime migrations and runtime seeding remain
disabled.

## Rollback

Before deployment, revert this repository change. After a technical deployment,
use the exact prior Vercel release as rollback target. If migration `0070` must
be rolled back before cohort activation, run its reviewed down migration and
record the receipt. Do not change providers.

Current verdict: `GATE 0 REBASED — TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED`.
