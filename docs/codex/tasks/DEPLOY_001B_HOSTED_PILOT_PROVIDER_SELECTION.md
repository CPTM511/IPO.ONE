# DEPLOY-001B — Hosted Pilot Provider Selection

Status: Founder-approved existing stack; cohort activation pending

Decision date: 2026-08-30

## Decision

Use the existing stack:

```text
Vercel project ipo-one-internal
  -> Vercel Node Functions and bounded Cron
  -> Vercel-managed Neon Launch PostgreSQL 17
  -> project ipo-one-m1-b-sandbox, aws-us-east-1
```

The former `vercel_neon_cloud_run` recommendation is superseded. The Cloud SQL
and Cloud Run alternative is withdrawn for PILOT-008B. Do not provision a
second database provider or deployment control plane without a concrete unmet
requirement and a new approval.

## Evidence

- Vercel hosted readiness is active with PostgreSQL canonical state and no
  real funds.
- Neon organization is managed by Vercel on the Launch plan.
- `ipo-one-m1-b-sandbox` is active with one ready `main` branch in
  `aws-us-east-1`.
- PostgreSQL 17 is at migration `0069`; all 152 observed tenant tables have RLS
  and FORCE RLS.
- Vercel keeps both role-scoped PostgreSQL variables as non-exportable
  `sensitive` values.

No connection string, password, token or secret value is recorded.

## Scope and authority

Authorized:

- existing Vercel and Neon use;
- one technical-readiness deployment;
- approved additive migrations after merge; and
- non-secret Evidence collection.

Not authorized:

- new provider provisioning, plan upgrade, additional control plane or DNS
  mutation;
- participant access, profile activation, public signup or cohort invitation;
- real funds, external Provider/Venue execution, signer, chain or Pool economic
  writes.

## Remaining operational inputs

- monthly USD cost ceiling;
- billing owner;
- restore-drill owner; and
- incident owner.

Other PILOT-008B activation gates remain in the Gate 0 task and launch policy.

## Acceptance criteria

- machine selection is `existing_vercel_neon`;
- Vercel Functions/Cron and Neon are the only selected runtime/database stack;
- new provider provisioning remains false;
- runtime migrations and seeding remain false;
- transaction-local Tenant context, advisory locks, `SKIP LOCKED`, TLS, forced
  RLS, backup/restore and recovery remain mandatory; and
- activation remains blocked until the separate launch gates pass.

## Test commands

```sh
pnpm run check:provider-selection
node --test packages/deployment-topology/test/provider-selection.test.js
pnpm run check:pilot-008b-gate0
git diff --check
```

## Rollback

Before cohort activation, revert the technical deployment to the prior exact
Vercel release and use the reviewed `0070` down migration if it was applied.
Do not change database providers as a rollback shortcut.
