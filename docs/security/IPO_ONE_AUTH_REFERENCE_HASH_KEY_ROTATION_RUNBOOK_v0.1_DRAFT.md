# IPO.ONE authentication reference-hash key rotation runbook v0.1

Status: `EXECUTED THROUGH CUTOVER — RETIRE NOT AUTHORIZED`

Issue: `AUTHN-008`

## Purpose

Rotate the non-exportable production authentication reference-hash key without
recovering it, bypassing authentication, weakening Tenant isolation or
rewriting immutable history. This runbook applies only to the no-real-funds
closed-pilot runtime.

## Hard stop conditions

Stop without mutation if any of the following is true:

- the deployed release, database, migration history or environment differs from
  the separately approved execution package;
- the existing runtime is not healthy in `single_v1` mode;
- either secret reference does not bind the exact encrypted Vercel value;
- the two secret digests are equal, a key version is unknown, or more than one
  legacy key is configured;
- active credential/Session/transaction inventory cannot be enumerated exactly;
- a Subject or sender binding is duplicated, ambiguous or cross-tenant;
- an active identity has authorization drift or cannot re-prove control;
- the database is ahead, contains an unknown migration or has checksum drift;
- real-funds, chain-write, Pool/Venue-write or signer truth is enabled; or
- rollback identity, snapshot or Evidence sink is unavailable.

## Separate approvals

Execution is divided so one approval cannot silently authorize the next:

1. `IMPLEMENT`: code, additive migration and local synthetic/no-funds tests.
2. `PREPARE`: create the `v2` sensitive secret, bind its digest reference,
   inspect production read-only and create a snapshot.
3. `OVERLAP`: apply the reviewed migration and deploy
   `overlap_v2_write_v1_lookup`.
4. `REBIND`: accept fresh Human/workload proofs and atomically create `v2`
   credentials.
5. `CUTOVER`: prove zero active `v1` dependencies and deploy `single_v2`.
6. `RETIRE`: after the bounded rollback window, remove the `v1` environment
   secret and dual-key release.

No approval for one stage authorizes any later stage.

## Prepare

1. Freeze the exact Git SHA/tree, migration checksum and expected Vercel/Neon
   identities.
2. Prove `https://ipo.one/livez` and `/readyz` are healthy, exact-SHA-bound and
   `realFundsEnabled=false`.
3. Owner-read the exact migration ledger and active authentication inventory.
   Record only tenant-scoped IDs, key-version labels, statuses and counts.
4. Create a manual database snapshot and record PITR/rollback deployment IDs.
5. Generate one 32-64 byte random `v2` key in an owner-controlled ephemeral
   process. Store it only as a Vercel sensitive secret. Record only its SHA-256
   digest-bound reference and destroy any plaintext temporary file/process
   state.
6. Confirm the current raw `v1` key was neither exported nor requested.

## Enter overlap

1. Apply the exact additive migration only when the production migration ledger
   is a valid continuous prefix with matching checksums.
2. In one tenant-scoped operation, terminally revoke every active `v1` Session
   with reason `reference_hash_key_rotation`; expire or consume pending login
   transactions using guarded cleanup. Do not delete immutable Sessions.
3. Deploy the exact reviewed dual-key release with `v2` as the only write key
   and `v1` limited to post-proof credential lookup.
4. Dual-reserve applicable `v1` and `v2` network/account abuse dimensions until
   the maximum legacy bucket lifetime elapses. Keep durable replay entries
   versioned and effective until their normal expiry; rotation must not reset
   rate or replay protection.
5. Require readiness to report the non-secret mode and key-version labels.
6. Verify old cookies, CSRF tokens, challenges and anonymous catalog access fail
   closed before accepting any rebind.

## Rebind Human identity

1. The Founder selects the exact reviewed role and signs a fresh SIWE challenge
   generated under `v2`.
2. After signature verification, compute both Subject hashes inside the runtime.
   Query `v2` first; allow one `v1` fallback only for this transaction.
3. Lock the matched credential, Actor, membership and role enrollments. Require
   exact tenant, wallet, issuer, client, policy, status and authorization
   continuity.
4. Atomically insert the new `v2` credential and exact cloned active role
   enrollments, revoke the `v1` credential and old enrollments, revoke every old
   Session and append the rebind Event.
5. Issue the new `v2` browser Session only after the authority transaction
   commits. A Session failure grants no authority; retry must reuse the active
   `v2` binding without creating another credential or broadening authorization.
6. Refresh the browser and prove the workspace is recovered from authenticated
   server truth. Log out and sign in once more to prove normal recovery.

The post-commit Session issuance in step 5 is the reviewed local implementation
exception to a transaction-coupled cookie return. Production execution must
accept this fail-closed invariant or require a separate implementation review.

## Rebind or reprovision workload identity

1. Require a fresh token and DPoP proof from the existing private key plus a new
   sender key, or use a newly approved invitation and credential.
2. Atomically rotate/reprovision under `v2`; never infer the raw external
   Subject or sender key from stored hashes.
3. Perform only the bounded authorized Tenant catalog read.
4. Revoke the ephemeral acceptance credential and destroy its private key.
5. Prove the revoked credential and replayed proof fail closed.

The revoked Golden Flow Agent from M2B-006 is not a migration source and must
remain revoked.

## Cut over

Run the reviewed owner-read inventory twice around a quiet window. Cutover only
when both reads show:

- zero active `v1` credentials and role enrollments;
- zero active `v1` Sessions;
- zero pending `v1` OIDC/SIWE transactions;
- no unexpired `v1` replay entry lacking an already-revoked credential boundary;
- the maximum legacy abuse bucket lifetime has elapsed under dual reservation;
- no ambiguous Subject or sender bindings; and
- all reviewed active identities represented by exactly one `v2` credential.

Deploy `single_v2`, then verify readiness, Human refresh/recovery, the bounded
Agent read/revocation sequence, old-reference negative checks, Cron, durable
reconciliation, tenant isolation and a bounded no-error/no-5xx log window.

## Rollback

Before `RETIRE`, rollback is forward-only:

- stop new rebind requests;
- retain both secrets and all immutable Events;
- restore the last known dual-key release;
- preserve `v2` rows and reconcile any incomplete transaction;
- do not reactivate a revoked credential without a new exact authorization; and
- do not downgrade the schema or restore the database unless separately
  authorized as an exceptional destructive action.

After `RETIRE`, reintroducing `v1` is prohibited. A defect must be repaired with
a new forward migration and reviewed release.

## Completion Evidence

The final package must contain no secret values and must bind:

- approvals for all six stages;
- exact source/deployment/migration identities;
- pre/post version inventories and stop-condition results;
- secret reference digests only;
- Human visible-click sign-in, refresh, logout and recovery;
- Agent authorized-read, revoke, destroy and negative-replay results;
- old Session/challenge negative tests;
- tenant/RLS, readiness, Cron, reconciliation and log results;
- rollback window and retirement decision; and
- explicit `realFundsEnabled=false`, no chain write and no external financial
  execution.

Until every required production stage is separately authorized and verified,
the verdict remains `BLOCKED — NOT COMPLETE`.

## 2026-08-27 execution checkpoint

Stages `IMPLEMENT`, `PREPARE`, `OVERLAP`, `REBIND` and `CUTOVER` were separately
authorized and completed. The deployed SHA is
`3bb525ce168ef274fea862cd3d5e55d35b2577fd`; production reports `single_v2`,
the database is exactly at `0069_auth_reference_hash_key_rotation`, Founder
Human SIWE and bounded Agent read/revocation acceptance passed, and the final
v1 active-dependency inventory is zero. The final non-secret record is
`artifacts/m2b-006/authn-008-cutover-and-owner-credential-closure.json`.

`RETIRE` remains explicitly unauthorized and unexecuted. No duration was
defined for the bounded rollback observation window in the original approved
package. The Founder authorized the next observation step on 2026-08-27. The
window is now fixed at 24 hours from the cutover Event:
`2026-08-27T04:27:16.783Z` through no earlier than
`2026-08-28T04:27:16.783Z`. This duration covers the database's 24-hour maximum
Session lifetime and therefore also covers shorter challenge, replay,
rate-bucket and Cron intervals.

The start baseline is recorded in
`artifacts/m2b-006/authn-008-retire-observation-baseline.json`. `RETIRE` remains
unauthorized and unexecuted. At the end of the window, every retained Vercel
Production deployment must be classified because environment changes do not
alter previous deployments. Only a later exact approval may delete named
deployments or remaining v1 control-plane material.
