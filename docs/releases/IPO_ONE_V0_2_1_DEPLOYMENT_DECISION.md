# IPO.ONE v0.2.1 deployment decision

Decision date: `2026-08-26`

Decision owner: `IPO.ONE Founder`

Candidate: `M2B-005-V0.2.1-RC-20260826-002`

Candidate implementation SHA: `e2e8bf460fcd17ba64974b6100bc0731c4c4a733`

Candidate evidence head: `34ac9d982b5a0061b645940f1532ed6f19e18290`

## Decisions

- Founder Candidate Decision: `APPROVED`.
- Independent Review: `APPROVED`.
- Remote Deployment: `APPROVED — PROCEED`.

## Exact operational interpretation

The deployment approval authorizes one staged Primary deployment of the exact
v0.2.1 no-funds candidate to the existing `ipo-one-internal` Vercel project.
The deployment uses the production target only for the reviewed bounded Cron
topology and must use `--skip-domain`. It authorizes Evidence collection and
verification against the unique deployment URL.

It does not authorize promotion, stable alias mutation, `ipo.one`, DNS, custom
domain, Risk-project deployment, launch-policy profile activation, mainnet,
real funds, Human cash lending, custody, signer use, chain/Venue writes,
transfer, withdrawal, automatic unfreeze or a production financial claim.

The current promoted production deployment remains the rollback baseline until
the staged candidate passes all deployed health, readiness, browser, Agent,
database, Cron and log gates and a later explicit promotion decision is
recorded.

## Execution checkpoint

The authorized staged deployment reached Vercel `READY` without an alias, but
the runtime failed closed with `production_database_migration_mismatch`. The
candidate was removed under the approved rollback contract and `ipo.one`
remains unchanged. M2B-006 is `BLOCKED — NOT COMPLETE` pending exact owner
inspection and, only if the existing history is a valid prefix, an additive
migration through `0068_m2b_dual_risk_recovery`. No owner credential, stable
alias, DNS, real-funds, signer, chain-write or Venue-write authority was used.

The exact owner inspection and additive migration were subsequently
authorized. Stored migration history was an exact valid prefix through `0063`;
`0064` through `0068` applied successfully after a manual Neon snapshot, and
68/68 post-migration names and checksums match. Replacement unaliased candidate
`dpl_752hsJ9pDzK8WnRwxaKBzGNBgP94` is Vercel `READY`; liveness and readiness
are HTTP 200 at the exact reviewed SHA with real funds disabled. Release
completion remains blocked on separately reviewed least-privilege grants for
the 18 new tables and stable-alias promotion needed for actual-origin Human and
Agent acceptance.

The Founder subsequently authorized those exact grants, promotion and remote
acceptance. Gateway least privilege now covers the new read surfaces and only
the approved append or secured-authorization mutation paths; Authentication
retains no unexpected access. Exact candidate deployment
`dpl_752hsJ9pDzK8WnRwxaKBzGNBgP94` is now the `ipo.one` production alias and is
healthy at the reviewed SHA with migration head `0068`, no real funds, passing
scheduled Cron reconciliation and no observed error or 5xx in the bounded log
window.

The release verdict remains `BLOCKED — NOT COMPLETE`, not because of a runtime
failure, but because authenticated Human refresh/recovery and positive
authorized Agent read are still unavailable in the acceptance environment.
In addition, an owner connection string appeared in a private command-error
transcript during verification; explicit password-rotation authority is
required because the prior instruction prohibited role-password changes. The
healthy promoted deployment remains in place while these security and
authenticated acceptance obligations are resolved.

The Founder then explicitly authorized the required owner-password rotation
and one ephemeral Agent acceptance credential. The owner password was rotated;
the old credential now fails, the new credential passed read-only identity and
68/68 migration verification, and the promoted runtime remained healthy with
no bounded error or 5xx. This closes the database credential-disclosure
finding.

The temporary Agent credential could not be safely issued because Vercel does
not export the encrypted authentication reference-hash key and no owner-only
original copy was recoverable locally. No authentication bypass, HMAC oracle,
alternate hash key or runtime privilege expansion was introduced. Final status
therefore remains `BLOCKED — NOT COMPLETE` pending the original key through an
owner-only local file (or a separately reviewed key-rotation migration) and the
Founder's production wallet sign-in plus refresh verification.
