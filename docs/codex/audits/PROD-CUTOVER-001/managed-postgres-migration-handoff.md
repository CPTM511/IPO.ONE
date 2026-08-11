# PROD-CUTOVER-001 managed PostgreSQL migration handoff

Date: 2026-08-11

Verdict: `BLOCKED — OWNER MIGRATION SESSION AND BACKUP EVIDENCE REQUIRED`

## Exact candidate and required migration range

- source commit: `3320b7c62d59853a0adfed570cd6bbd8762950e3`
- source tree: `983f46b1529aa4da325888f61cf6f847ddd2beac`
- clean candidate worktree:
  `/private/tmp/ipo-one-prod-cutover-001-worktree-3320b7c`
- required ordered migration range: `0054` through `0061`
- expected candidate migration head: `0061`

The range includes AccountBinding proof persistence and owner-run database
changes. Migration `0061` creates challenge and proof-attempt relations,
updates durable AccountBinding state and applies owner-controlled row-security
and trigger work. The least-privilege Gateway/Auth runtime URLs are not a
substitute for a database-owner migration session.

## Runtime finding and containment

The exact Primary candidate built successfully, but its production Cron
repeatedly returned HTTP 503. Vercel runtime logs recorded PostgreSQL error
`42P01` (`undefined_table`) while the release identified itself as
`3320b7c62d59853a0adfed570cd6bbd8762950e3` with `realFundsEnabled:false`.
This proves that the candidate and current managed database schema are not
compatible; it does not by itself establish the database's precise current
migration head.

The Primary stable and team aliases were restored to the prior serving
deployment. The failing non-current Primary candidate
`dpl_DQFnHLVvz51j8auKGihizRGjJeuu` was safely deleted so its Cron could not
continue. Its exact source and built bundle remain recoverable locally. The
Risk candidate `dpl_uF2MjKp87zwKeN6tzkWY1SFVDgFB` is retained without a stable
or team alias and has no Cron.

No production funds, persistent environment variable, DNS record or custom
domain was changed.

## Preconditions for an owner-run migration

All of the following must be true before execution:

- an owner-controlled, time-bounded database connection is injected into the
  local process as `DATABASE_URL`; do not use the Gateway/Auth runtime URLs;
- backup or point-in-time recovery is verified, with a named recovery owner;
- a maintenance window and affected service owners are named;
- the actual database migration status and stored checksums are read first;
- no password, connection URL or other raw secret is written to the repository,
  terminal transcript, Evidence or chat; and
- unexpected migration history, checksum drift, missing backup evidence or an
  unknown target database stops the run.

## Owner-run command sequence

Run from the clean exact-candidate worktree after securely injecting the
ephemeral owner connection into the process environment:

```sh
cd /private/tmp/ipo-one-prod-cutover-001-worktree-3320b7c
test -n "${DATABASE_URL:-}"
pnpm run db:status
pnpm run db:migrate
pnpm run db:status
```

The expected terminal state is migration head `0061` with no checksum drift.
Do not paste the value of `DATABASE_URL` into a command, commit, issue or chat.

## Post-migration release sequence

1. Prove the unaliased Risk candidate `/livez` and `/readyz` against the
   migrated database, including release SHA and migration head `0061`.
2. Redeploy the exact Primary artifact from the preserved bundle.
3. Prove Primary `/livez` and `/readyz`, the Human, Agent and Risk journeys,
   Cron HTTP 200 behavior, and absence of `42P01`.
4. Confirm the same release identity, environment digest and database head on
   both product surfaces.
5. Promote aliases only after the health and rollback acceptance checks pass.

## Rollback boundary

- Before migration, retain the current stable deployments and verified backup.
- A failed transactional migration must stop without traffic promotion.
- After a successful migration, prefer forward repair or verified
  backup/point-in-time recovery under the named recovery owner.
- Do not blindly run down migrations. The ordered downs contain durable-data
  guards, and `0061` can refuse rollback when v3 AccountBinding, challenge or
  proof Evidence exists.
- If the new application fails post-migration, restore the prior application
  aliases only when its compatibility with the migrated schema is proven;
  otherwise keep traffic paused and recover the database from the approved
  backup plan.

No migration has been executed by this handoff. The current blocker is the
absence of an owner migration session and verified backup/PITR evidence in the
authorized scope.
