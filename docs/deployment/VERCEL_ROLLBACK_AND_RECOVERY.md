# IPO.ONE Vercel Sandbox Rollback and Recovery

## Safety boundary

Rollback restores an earlier Vercel application deployment. PostgreSQL is
canonical and is not automatically rolled back with code. Never delete Events,
Evidence, inbox/outbox, continuation receipts, repayment history, freeze
history, or reconciliation records to make a rollback appear successful.

## Recorded rollback point

Before M1-B deployment, record for both Vercel projects:

- prior Vercel deployment ID and exact URL;
- prior source commit when available;
- active Cron configuration;
- Neon project, branch, database, and migration head;
- exact secret-reference digests, not values;
- invitation set and policy version;
- current reconciliation result and outbox/dead-letter counts.

The historical pre-M1-B Vercel deployment is process-local public-sandbox code
and is not compatible with the new durable database schema. It is a visual
fallback only and must not be represented as an M1-B durable Sandbox.

## Application rollback

1. Freeze new invitations and preserve current logs from both projects.
2. Record both current deployments, release ID, health, migration head, primary Cron status,
   reconciliation ID, and pending outbox rows.
3. Disable Cron if the target rollback code cannot process the current schema.
4. use Vercel Instant Rollback or promote the exact recorded prior deployment
   for each affected project;
5. verify `/livez`, `/readyz`, role-specific authentication, and expected
   release ID on both origins;
6. run reconciliation before resuming invited access;
7. record the operator, reason, timestamps, deployment IDs, and outcome.

Vercel documents that Instant Rollback does not update active Cron jobs.
Therefore Cron must be checked and explicitly updated or disabled after every
rollback.

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
to an isolated branch first, verify all 53 migration checksums, Event/projection
parity, repayment totals, Lockbox balances, continuation receipts, freeze
history, and outbox/inbox state, then decide whether traffic can move.

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
