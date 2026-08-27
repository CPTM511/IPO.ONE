# AUTHN-008 — v1 retirement observation gate

Status: `OBSERVING — RETIRE NOT AUTHORIZED`

Observation start: `2026-08-27T04:27:16.783Z`

Earliest end: `2026-08-28T04:27:16.783Z`

Production deployment: `dpl_GqX1Z5y232pmos2WyZLoxicfu88f`

Production source: `3bb525ce168ef274fea862cd3d5e55d35b2577fd`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-UX-005`, `REQ-PRIV-001`

## Context

`AUTHN-008` completed `CUTOVER` to `single_v2`, and M2B-006 is
`PASS — DEPLOYED AND USER-VERIFIED`. The final stage, `RETIRE`, removes the
remaining v1 rollback material only after a bounded observation window and a
new exact production approval.

The Founder approved starting the next step on 2026-08-27. This approval starts
and records the observation gate. It does not authorize deleting an environment
secret, deleting a deployment, changing retention policy, redeploying,
modifying a runtime role or database row, or retiring rollback capability.

## Window decision

The observation window is 24 hours from the immutable
`reference_hash_cutover` Event:

- wallet/OIDC challenges are bounded to 10 minutes;
- the credential abuse-control rate window is bounded to 10 minutes;
- the maximum configurable DPoP replay lifetime is 361 seconds;
- the deployed Session implementation defaults to an 8-hour absolute lifetime,
  while the database contract permits no more than 24 hours; and
- scheduled reconciliation runs every 15 minutes, so a 24-hour window contains
  up to 96 scheduled cycles.

Twenty-four hours therefore dominates every legacy authentication lifetime and
provides one full operational day without adding an arbitrary multi-day delay.
The window is measured from the cutover Event, not from this document commit.

## Scope

- Record a non-secret, owner-read-only start baseline.
- Keep the current `single_v2` production deployment and v2 project environment
  configuration unchanged.
- At or after the earliest end, repeat readiness, migration, v1 inventory, RLS,
  Cron and bounded-log checks.
- Inventory every retained production deployment before proposing deletion.
- Produce an exact deployment-ID deletion/revocation list for separate Founder
  approval.

## Non-goals

- No `RETIRE` execution in this issue state.
- No deletion of `dpl_9VrySxPRMYDg5amcA88u4GyeqjMm` or any other deployment.
- No Vercel environment mutation, retention-policy change or redeployment.
- No secret export, download, printing, local file, shell-history or artifact
  persistence.
- No database write, credential/session mutation, migration, role/grant change,
  downgrade or historical Event/hash deletion.
- No signer, chain, Pool/Venue, mainnet, real-funds, custody, transfer or
  withdrawal action.
- No M3 or new product phase is inferred from authentication retirement.

## Current retirement target boundary

The current Production environment lists only:

- `IPO_ONE_AUTH_REFERENCE_HASH_MODE`;
- `IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY`; and
- `IPO_ONE_AUTH_NEXT_REFERENCE_HASH_KEY_REF`.

The legacy `IPO_ONE_AUTH_REFERENCE_HASH_KEY` and `_REF` names are absent from
the current project environment. Vercel environment changes do not alter prior
deployments, so retained deployments must still be classified individually
([Vercel environment-variable behavior](https://vercel.com/docs/environment-variables/managing-environment-variables)).
The known overlap rollback deployment
`dpl_9VrySxPRMYDg5amcA88u4GyeqjMm` remains `READY`; 20 `READY` Production
deployments were visible at baseline, of which only the current single-v2
deployment and the named overlap rollback are conclusively classified in this
gate. No broader deletion scope may be inferred.

## Acceptance criteria

1. The end check runs at or after `2026-08-28T04:27:16.783Z`.
2. `https://ipo.one/readyz` remains HTTP 200 at exact SHA
   `3bb525ce168ef274fea862cd3d5e55d35b2577fd`, `single_v2`, and
   `realFundsEnabled=false`.
3. Owner-read-only verification proves exactly 69 release migrations with exact
   names/checksums at `0069_auth_reference_hash_key_rotation`.
4. Active v1 credentials, role enrollments and Sessions; pending v1 OIDC and
   wallet transactions; and live v1 replay entries are all zero.
5. The six authentication relations retain enabled and forced RLS with one
   tenant-isolation policy each.
6. Bounded logs from the cutover window contain no unexplained authentication
   4xx, HTTP 5xx or error/fatal entry, and scheduled Cron has successful runs.
7. Current Production environment metadata still exposes no legacy v1 variable
   name and no secret value is read or printed.
8. Every retained Production deployment is classified by exact deployment ID,
   source/mode boundary and retirement disposition. Unknown classification
   blocks retirement.
9. The proposed destructive target list excludes the current production
   deployment and preserves immutable database credentials, Sessions, Events,
   Evidence and migration history.
10. A separate Founder decision explicitly approves or rejects the exact
    `RETIRE` target list. Window completion alone grants no deletion authority.

## Test commands

```sh
curl -fsS https://ipo.one/readyz
pnpm check:product-traceability
pnpm check:vercel-sandbox
pnpm test
git diff --check
```

The Neon migration/inventory check must use a fresh owner connection only in
process memory, begin `READ ONLY`, compare the repository migration set, and
emit counts and booleans only. Vercel checks must list environment and
deployment metadata only; `vercel env pull`, secret export and deployment
deletion are prohibited.

## Security checklist

- [x] Start baseline is owner-read-only and contains no secret value.
- [x] Production is `single_v2` with no current legacy environment variable.
- [x] Six v1 dependency counters are zero at start.
- [x] Migration and RLS start baseline is exact.
- [x] Known overlap rollback remains available during the window.
- [ ] Twenty-four-hour end time has elapsed.
- [ ] End migration, inventory, RLS, readiness, Cron and log checks pass.
- [ ] All retained Production deployments are classified exactly.
- [ ] Exact destructive target list receives separate Founder approval.
- [ ] Post-retirement deployment/environment checks pass.

## Data, migration and rollback

This observation gate has no data or migration impact. Before a later
`RETIRE`, rollback remains the forward-only dual-key deployment path recorded
in the AUTHN-008 runbook. If any end criterion fails, keep all retained
material unchanged, record `BLOCKED — NOT COMPLETE`, and repair forward.

## Required Evidence

- Start baseline:
  `artifacts/m2b-006/authn-008-retire-observation-baseline.json`.
- End baseline: a new non-secret artifact created only after the earliest end.
- Separate exact retirement decision and, if approved, a post-retirement
  verification artifact.

Current verdict: `BLOCKED — NOT COMPLETE` for `RETIRE`; observation is active.
