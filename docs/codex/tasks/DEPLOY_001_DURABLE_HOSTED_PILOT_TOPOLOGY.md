# DEPLOY-001 — Durable Hosted Pilot Topology

Status: Amended 2026-08-30; existing Vercel + Neon selected; activation pending

## Context

The repository now has a PostgreSQL-backed hosted runtime on the existing
Vercel project. Founder direction selects that runtime and the existing
Vercel-managed Neon PostgreSQL source of truth for PILOT-008B. The former OCI,
Cloud Run and Cloud SQL proposals are superseded for this pilot.

## Selected topology

```text
Human wallet/browser ---\
                         -> Vercel HTTPS edge and Node Function
Agent API/MCP ----------/                 |
                                           v
                           Neon PostgreSQL 17 canonical truth
                                           |
                                           v
                           bounded Vercel Cron automation
```

- one Vercel project: `ipo-one-internal`;
- one Neon project: `ipo-one-m1-b-sandbox`;
- one bounded Node Function request runtime;
- one bounded Cron function using PostgreSQL leases and idempotency;
- no continuous worker, external queue, cache or second control plane;
- no Cloud Run or Cloud SQL; and
- no process-local canonical private state.

## Mandatory properties

- distinct migration, Gateway and Authentication database roles;
- transaction-local Tenant/Actor/Policy context;
- RLS and FORCE RLS on tenant-scoped tables;
- TLS and bounded application pools;
- advisory locks and `SKIP LOCKED` lease semantics;
- backup/restore and restore drill;
- reconciliation, synthetics, alerting and runtime logs;
- exact deployment and rollback receipts; and
- fail-closed participant and launch activation.

## Authority

Technical-readiness deployment and approved additive migrations are enabled.
New provider provisioning, participant access, profile activation, public
signup, real funds, Human cash credit, testnet writes, external execution,
signer and mainnet authority remain false.

## Acceptance criteria

- the machine topology matches the selected one-project Vercel and one-project
  Neon stack;
- Neon PostgreSQL is canonical and process memory is not;
- no Cloud Run, Cloud SQL, Redis, Kubernetes, warehouse or multi-cloud
  failover is introduced;
- provider-neutral durability, Tenant isolation, recovery, reconciliation and
  observability requirements remain mandatory;
- activation gates remain complete and launch policy remains disabled; and
- negative tests reject authority, provider, state, signer and durability
  expansion.

## Test commands

```sh
pnpm run check:deploy-topology
node --test packages/deployment-topology/test/deployment-topology.test.js
pnpm run check:pilot-008b-gate0
git diff --check
```

## Rollback

Roll back to the prior exact Vercel release and, if necessary before cohort
activation, use the reviewed additive migration down script. Do not introduce
a different provider as a rollback shortcut.
