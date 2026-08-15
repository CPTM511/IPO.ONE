# OPS-004 — Hosted operations and recovery baseline

Status: Implemented locally; activation blocked

## Context

The sealed local release candidate proves the no-funds Human/Agent lifecycle,
PostgreSQL durability, restart recovery, and Base Sepolia Evidence anchoring.
Before an invited hosted pilot may open, IPO.ONE needs one fail-closed contract
for backup/restore, scheduled workers, reconciliation, synthetics, alert
delivery, named ownership, secret rotation, and rollback.

`DEPLOY-001` and `DEPLOY-001B` define a provider-neutral topology and a pending
provider recommendation. OPS-004 does not approve those providers or create
their resources.

## Scope

- Bind the operations baseline to sealed RC commit
  `3a466c4a3267923de96f4c31c1f1d2b1531e73c6`.
- Require managed PostgreSQL 17 backups, PITR, and a restore into an isolated
  target before launch.
- Require lease-safe, idempotent, non-overlapping workers for outbox,
  reconciliation, synthetics, Evidence finalization, credit Outcomes, and
  alert delivery.
- Require Human/Agent no-funds synthetics and reconciliation failures to block
  launch.
- Require PII-free alert delivery, named incident/restore owners, escalation,
  and acknowledgement/resolution permissions before activation.
- Require secret-manager selection, runtime-only injection, rotation and
  revocation drills, and no browser or Vercel-to-database secret.
- Require immutable-release rollback that preserves canonical Events,
  Evidence, and idempotency state.
- Add an exact machine-readable contract, negative tests, runbook, and quality
  gate.

## Non-goals

- No Vercel, Neon, Cloud Run, scheduler, database, alert, secret, IAM, DNS, or
  billing mutation.
- No remote participant access, public signup, Provider execution, venue
  signer, mainnet, Human cash credit, or real funds.
- No invented RPO/RTO, region, budget, recipient, owner, provider, or schedule.
- No automatic reconciliation repair, database downgrade, destructive restore
  into the canonical database, or automatic unpause.
- No reuse of the older GCP public-sandbox deployment as the private pilot.

## Files

- `deploy/closed-pilot/operations.v1.json`
- `packages/deployment-topology/src/index.js`
- `packages/deployment-topology/test/closed-pilot-operations.test.js`
- `scripts/check-closed-pilot-operations.mjs`
- `docs/security/IPO_ONE_CLOSED_PILOT_OPERATIONS_RUNBOOK_v0.1.md`
- `package.json`

## Acceptance criteria

1. The contract binds the exact sealed RC manifest and Git commit.
2. Launch, cloud mutation, schedules, notifications, secret writes, remote
   access, Provider execution, signers, and real funds remain disabled.
3. Backup and PITR are mandatory; restore targets are isolated and
   non-destructive.
4. Workers require leases, idempotency, bounded retries, and no overlap or
   automatic repair.
5. Human/Agent synthetics and reconciliation are no-funds and launch-blocking.
6. Alert recipients, incident owner, restore owner, RPO/RTO, secret manager,
   rotation owner, rollback owner, region, and budget remain explicit approval
   inputs.
7. Rollback preserves canonical Events, Evidence, and idempotency and never
   automatically rolls the database backward.
8. Negative tests reject any premature authority, schedule, delivery, secret,
   repair, restore, rollback, or gate activation.
9. The repository quality gate executes the OPS-004 checker.

## Test commands

```sh
pnpm run check:closed-pilot-operations
node --test packages/deployment-topology/test/closed-pilot-operations.test.js
pnpm run check
git diff --check
```

## Security checklist

- [x] No credential, endpoint, account identifier, recipient, private data, or
      PII is added.
- [x] The exact sealed RC is content-hash and commit bound.
- [x] Restore cannot target the canonical database.
- [x] Worker overlap and automatic repair are forbidden.
- [x] Browser secrets, long-lived cloud keys, and direct Vercel database
      secrets are forbidden.
- [x] Alert delivery and acknowledgement authority remain disabled.
- [x] Database rollback is forward-only through a separately reviewed
      migration.
- [x] Launch and every external mutation remain blocked.

## Rollback

Remove the OPS-004 contract, validator, test, checker, runbook, and package
script. No external resource or runtime state was created by this issue.
