# Hyperliquid Testnet operability assurance

This internal TC-403 module defines a closed, local/Testnet-only assurance
record for disaster recovery, failure safety, alert routing, reconciliation
objectives, capacity bounds, P0/P1 findings, and independent review.

The source-fixed policy is:

`policy/testnet-facility-operability-policy.v1.json`

It names `ipo_one_founder` as the interim no-funds/Testnet accountable owner
for incident, recovery, signer-lifecycle commissioning, Evidence custody, and
independent-review commissioning. That identifier is accountability only. It
is not a Credential, role assignment, signing key, pager delivery proof, or
runtime permission. The independent reviewer remains deliberately unassigned.
Alert candidates and runbook bindings are executable local policy, while
notification delivery and protected scheduling remain explicitly disabled.

The evaluator cannot mark its own work independently reviewed. It also cannot:

- call Hyperliquid;
- submit or retry an Exchange action;
- provision, rotate, revoke, approve, or use an API Wallet or signer;
- freeze, unfreeze, flatten, settle, repair, or mutate a Facility;
- post a Ledger transaction;
- restore a production database;
- deploy, access mainnet, pay, withdraw, transfer, or move funds.

The evaluator recomputes restore comparisons from complete manifests, validates
source-fixed drill runners and Evidence-envelope hashes, recomputes capacity
boundary arithmetic, requires retest hashes for resolved findings, and binds a
review envelope to the exact release commit, content-addressed dirty-worktree
artifact set, approved policy hash, and finding set. The machine result always
keeps `launchBlocked` true; even a future qualified external review can only
create a candidate for a separate Founder decision.

The physical disaster-recovery script accepts only a localhost database whose
name contains `test`, requires the exact `TC-403` acknowledgement, performs a
mode-0600 `pg_dump`, restores into a new ephemeral local database, compares
complete Facility/Ledger/Evidence and Trading Capital state fingerprints, and
then removes only the ephemeral restore database and backup directory. It
never mutates the source database. `pg_dump` and `pg_restore` must resolve to
non-writable PostgreSQL 17 binaries in source-fixed installation prefixes, and
the subprocess receives a minimal environment instead of the complete parent
environment.

```sh
DATABASE_URL='postgresql://127.0.0.1:55439/ipo_one_tc403_test' \
IPO_ONE_TC403_DRILL_APPROVAL=TC-403 \
pnpm run test:tc403:dr
```

Even when all local controls pass, the result is
`IMPLEMENTED_UNVERIFIED` and `BLOCKED_INDEPENDENT_REVIEW`. A separate reviewer
report can make a record ready for Founder acceptance, but can never set
`launchBlocked` false or grant production, mainnet, signing, API-wallet,
Exchange-write, payout, or funds authority.
