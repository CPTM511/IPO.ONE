# M1-B Deployable Sandbox Runbook

## Current status

Status: `SUPERSEDED_BY_FOUNDER_VERCEL_AMENDMENT`

The previous provider-neutral OCI/API/continuous-worker sequence is no longer
the active M1-B deployment architecture. The Founder withdrew Railway and
authorized a Vercel-first low-cost Sandbox using:

- two role-isolated Vercel Projects only because one fixed SIWE client binding
  cannot safely represent both Principal Controller and Risk Operator;
- Node.js Vercel Functions;
- one Neon PostgreSQL 17 database through Vercel Marketplace;
- PostgreSQL durable inbox/outbox, leases, retries, idempotency, and
  reconciliation;
- authenticated Vercel Pro Cron every five minutes on the primary project only;
- no continuous worker or indexer.

The active runbook is:

`docs/deployment/VERCEL_SANDBOX_RUNBOOK.md`

The active architecture, environment, recovery, and evidence documents are:

- `docs/deployment/VERCEL_SANDBOX_ARCHITECTURE.md`
- `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`
- `docs/deployment/VERCEL_ROLLBACK_AND_RECOVERY.md`
- `docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md`
- `docs/verification/m1-b-vercel-golden-flow-evidence.v1.json`

This supersession does not authorize an RC, release tag, paid pilot, mainnet,
real funds, fee runtime, signer, transfer, withdrawal, custody, venue write,
new chain, new credit model, or production financial claim.
