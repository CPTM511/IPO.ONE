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
