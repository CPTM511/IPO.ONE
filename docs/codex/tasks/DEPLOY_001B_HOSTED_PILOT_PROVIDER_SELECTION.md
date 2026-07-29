# DEPLOY-001B — Hosted Pilot Provider Selection

Status: Recommended; founder approval pending

## Context

`DEPLOY-001` fixed the provider-neutral L1 shape: Vercel Web, one OCI private
runtime, managed PostgreSQL 17, and a separate same-release worker. It did not
authorize vendor installation, procurement, provisioning, remote access, or
launch.

This issue compares current official provider capabilities and prices against
the existing code. It records one reversible recommendation without changing
the provider-neutral topology or creating infrastructure.

## Scope

- compare three low-complexity provider combinations;
- verify PostgreSQL 17, PITR, TLS, Docker/OCI, background work, scale behavior,
  region fit, and cost posture;
- bind the recommendation to Tenant RLS transaction context, advisory locks,
  `SKIP LOCKED` outbox leases, and Node 26.5.0;
- record a rough low-usage monthly cost range rather than a procurement quote;
- create a canonical, machine-validated pending recommendation; and
- preserve all cloud, billing, secret, access, worker, and launch authority as
  false.

## Non-goals

- no Vercel project link or Marketplace integration;
- no provider account, database, service, job, scheduler, secret, DNS, alert,
  or billing mutation;
- no final region, budget, billing owner, incident owner, or recovery owner;
- no remote Human/Agent access, public signup, signer, external Provider
  execution, testnet write, Human credit, or real funds; and
- no claim that a dated public price is a binding quote.

## Recommendation

Use the following only after named founder approval:

```text
Vercel Web/BFF
      |
Google Cloud Run private API, min 0 / max 1
      |
Neon Launch PostgreSQL 17, direct TLS endpoint + application pg.Pool
      |
Cloud Run Jobs + Scheduler, same immutable release
```

Neon Free is rejected for L1 because its restore window is too short for the
required operational drill. Neon Launch is the minimum recommended tier.
Neon's PgBouncer transaction endpoint is not the default IPO.ONE connection:
the application requires transaction-local Tenant context and database locking
semantics. Vercel must not connect directly to the private database.

Cloud Run Jobs are the initial worker implementation because L1 can tolerate
bounded scheduled delivery and reconciliation. A continuously running worker
remains a later evidence-driven choice.

## Likely files

- `deploy/closed-pilot/provider-selection.pending.json`
- `docs/codex/audits/DEPLOY_001B_PROVIDER_SELECTION/README.md`
- `packages/deployment-topology/src/index.js`
- `packages/deployment-topology/test/provider-selection.test.js`
- `scripts/check-provider-selection.mjs`
- `package.json`

## Acceptance criteria

- the recommendation is `vercel_neon_cloud_run`;
- Neon Launch, PostgreSQL 17, direct TLS, application pooling, Cloud Run
  min-zero/max-one, and disabled scheduled jobs are explicit;
- the contract rejects provider transaction pooling, direct Vercel database
  access, Node/PostgreSQL drift, worker activation, and unknown fields;
- all provider linking, installation, procurement, provisioning, secret, DNS,
  remote-access, and launch permissions remain false;
- the existing `DEPLOY-001` topology still says all provider decisions require
  human review;
- official-source pricing is dated 2026-07-27 and is not represented as a
  quote; and
- the repository-wide quality gate validates the recommendation.

## Required founder inputs before provisioning

1. pilot region;
2. monthly USD cost ceiling;
3. billing owner and provider-account owner;
4. acceptance or rejection of public-TLS database reachability for synthetic
   L1;
5. restore-drill owner; and
6. incident owner.

If public-TLS database reachability is rejected, choose the
Cloud SQL + Cloud Run control-first alternative instead.

## Test commands

```sh
pnpm run check:provider-selection
node --test packages/deployment-topology/test/provider-selection.test.js
pnpm run check
git diff --check
```

## Security checklist

- [x] No endpoint, account identifier, credential, secret, token, PII, or
  production data is stored.
- [x] No provider was installed or provisioned.
- [x] Billing, database, runtime, worker, secret, DNS, and remote-access
  mutations are explicitly false.
- [x] The database is reachable only by the private API/worker application
  roles; Vercel direct database access is forbidden.
- [x] Transaction-local RLS context, advisory locks, outbox leases, TLS,
  backups, PITR, and restore evidence remain mandatory.
- [x] Worker and launch activation remain disabled.
- [x] Real funds, Human credit, testnet writes, external execution, and signers
  remain outside authority.

## Rollback

Before approval, rollback is deletion of the pending recommendation and its
validator; no external state exists. After a later approval, any provider
rollback must be designed under the provisioning issue with export, restore,
credential rotation, DNS, and evidence-retention steps.
