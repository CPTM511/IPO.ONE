# IPO.ONE Vercel Sandbox Rollback and Recovery

## Safety boundary

Rollback restores an earlier Vercel application deployment. PostgreSQL is
canonical and is not automatically rolled back with code. Never delete Events,
Evidence, inbox/outbox, continuation receipts, repayment history, freeze
history, or reconciliation records to make a rollback appear successful.

## Recorded rollback point

The last recorded read-only observation, dated 2026-08-13 in
`docs/codex/audits/UX-006/README.md`, reported the `ipo.one` origin on older
hosted release `d36ff20c2049b199ed3032e85752f36e36300312`. This is not a
timeless current-state claim. The corresponding recorded Vercel baselines are:

| Role | Recorded deployment baseline |
| --- | --- |
| Primary | `dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue` |
| Risk | `dpl_62VpuVX2GRd2uMxpfYXZ7EYxKY7p` — historical only; not a current M1-B target or rollback surface |

These IDs are historical observations, not current deployment authority. The
Primary baseline must be freshly revalidated for identity, readiness,
configuration, database compatibility, and rollback suitability immediately
before any separately authorized M1-B deployment. The Risk baseline is retained
only as history and becomes relevant again only under a separately approved
M1-C/L2 Risk topology. Until then, the exact M1-B candidate has `deployed =
null`, and no rollback or promotion action is required.

Before an authorized M1-B deployment, record for the Primary Vercel project:

- prior Vercel deployment ID and exact URL;
- prior source commit when available;
- active Cron configuration;
- Neon project, branch, database, and migration head;
- exact secret-reference digests, not values;
- invitation set and policy version;
- current reconciliation result and outbox/dead-letter counts.

The older hosted baseline must not be represented as the exact M1-B candidate or
used as current-candidate acceptance Evidence. A successful health response
alone does not prove that it is schema-compatible with the post-commit
candidate.

## Application rollback

This is an incident plan, not authority to promote or mutate a deployment. Use
it only after the applicable human authorization identifies the affected exact
release and rollback target.

1. Freeze new invitations and preserve current Primary logs.
2. Record the current Primary deployment, release ID, health, migration head, Cron status,
   reconciliation ID, and pending outbox rows.
3. Disable Cron if the target rollback code cannot process the current schema.
4. Use Vercel Instant Rollback or promote the exact recorded prior Primary
   deployment;
5. verify `/livez`, `/readyz`, Principal/Agent authentication, and expected
   release ID on the Primary origin;
6. run reconciliation before resuming invited access;
7. record the operator, reason, timestamps, deployment IDs, and outcome.

Vercel documents that Instant Rollback does not update active Cron jobs.
Therefore Cron must be checked and explicitly updated or disabled after every
rollback.

A future Risk rollback is outside this M1-B plan. If a separately authorized
M1-C/L2 Risk project is later deployed, it requires a versioned topology and
rollback amendment before its historical baseline may be acted upon.

## Database recovery

Application failure alone is not authority to restore PostgreSQL. Prefer:

1. stop new mutations;
2. preserve logs and exact failed request/idempotency identifiers;
3. allow leases to expire;
4. replay the bounded Cron recovery cycle;
5. run reconciliation;
6. apply only additive corrections through reviewed domain mechanisms.

Use Neon point-in-time restore or a branch only when evidence proves canonical
database corruption and Founder authorizes the data recovery decision. Restore
to an isolated branch first, verify all 61 migration checksums through
`0061_execution_account_bindings`, Event/projection parity, repayment totals,
Lockbox balances, continuation receipts, freeze history, and outbox/inbox state,
then decide whether traffic can move.

## Interrupted Function recovery

- PostgreSQL transactions roll back uncommitted changes.
- Outbox work remains leased for at most 30 seconds, then becomes claimable.
- Maximum attempts and dead-letter state are durable.
- Reusing the exact idempotency key returns the recorded response.
- Unknown command outcomes must not use a new idempotency key.
- The five-minute reconciliation bucket is safe under duplicate Cron delivery.

## Recovery verification

Recovery passes only when:

- the exact deployment and migration head are known;
- no duplicate ledger, repayment, callback, or exposure effect exists;
- reconciliation reports no unexplained critical discrepancy;
- CreditLine replay equals the PostgreSQL projection;
- Lockbox authority and balances remain current;
- frozen Subjects or Agents remain frozen;
- subsequent disallowed spend remains rejected;
- protocol fees, real funds, signer, withdrawal, and venue writes remain off.
