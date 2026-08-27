# AUTHN-008 — v1 retirement observation gate

Status: `PASS — DEPLOYED AND USER-VERIFIED`

Observation start: `2026-08-27T04:27:16.783Z`

Founder-shortened end decision: `2026-08-27`

Production deployment: `dpl_GqX1Z5y232pmos2WyZLoxicfu88f`

Production source: `3bb525ce168ef274fea862cd3d5e55d35b2577fd`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-UX-005`, `REQ-PRIV-001`

## Context

`AUTHN-008` completed `CUTOVER` to `single_v2`, and M2B-006 is
`PASS — DEPLOYED AND USER-VERIFIED`. The final `RETIRE` stage has now removed
every active historical READY Production deployment carrying v1 rollback
configuration while preserving the current Production deployment and a clean
single-v2 fallback.

The Founder first approved starting the observation gate on 2026-08-27, then
separately shortened the observation window and authorized deletion of the
exact deterministic safe deployment set after the complete read-only end
checks. This later decision did not authorize blind bulk deletion, database or
role mutation, current Production configuration changes, funds or chain state.

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

The Founder later made an explicit risk decision that the full 24-hour wait was
not mechanically required. That decision superseded only the elapsed-time
criterion; every technical end check, per-deployment classification rule and
post-deletion verification remained mandatory.

## Scope

- Record a non-secret, owner-read-only start baseline.
- Keep the current `single_v2` production deployment and v2 project environment
  configuration unchanged.
- After the Founder-shortened end decision, repeat readiness, migration, v1
  inventory, RLS, Cron and bounded-log checks.
- Inventory every retained production deployment before proposing deletion.
- Produce an exact deployment-ID deletion/revocation list for separate Founder
  approval.

## Non-goals

- No blind, alias-ambiguous, traffic-ambiguous or dependency-ambiguous deletion.
- No Vercel environment mutation, retention-policy change or redeployment.
- No secret export, download, printing, local file or artifact persistence.
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
The complete Vercel API inventory contained 58 READY Production deployments;
the earlier count of 20 was only the CLI default page, not the full inventory.
Every one of the 58 was recorded with deployment ID/URL, source SHA or an
explicit pre-manifest unavailability state, creation time, current alias state,
v1 environment-name state, bounded activity, references and exact disposition.

## Acceptance criteria

1. The Founder explicitly shortens the elapsed-time criterion without waiving
   any technical end check.
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
10. A separate Founder decision explicitly approves the exact deterministic
    safe `RETIRE` target list. Window completion alone grants no deletion
    authority.

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
- [x] Founder explicitly shortened the observation window.
- [x] End migration, inventory, RLS, readiness, Cron and log checks pass.
- [x] All retained Production deployments are classified exactly.
- [x] Exact destructive target list received separate Founder approval.
- [x] Post-retirement deployment/environment checks pass.

## Data, migration and rollback

This gate had no data or migration impact. After `RETIRE`, v1 restoration is
prohibited. Defects must be repaired forward from a clean single-v2 release;
deleted v1 deployments must not be restored during Vercel's provider-managed
recovery period.

## Required Evidence

- Start baseline:
  `artifacts/m2b-006/authn-008-retire-observation-baseline.json`.
- Full pre-delete classification:
  `artifacts/m2b-006/authn-008-ready-production-classification-predelete.json`.
- Batch deletion:
  `artifacts/m2b-006/authn-008-retire-deletion.json`.
- Final REVIEW resolution:
  `artifacts/m2b-006/authn-008-retire-review-resolution.json`.
- Post-delete retained inventory:
  `artifacts/m2b-006/authn-008-ready-production-classification-postdelete.json`.
- Final verification:
  `artifacts/m2b-006/authn-008-retire-final.json`.

## Final retirement result

- 58 READY Production deployments were classified.
- 55 exact obsolete deployments were deleted: 54 in the deterministic batch
  and one after its two non-canonical aliases were proven unnecessary.
- Current Production `dpl_GqX1Z5y232pmos2WyZLoxicfu88f` remains on exact SHA
  `3bb525ce168ef274fea862cd3d5e55d35b2577fd` at `https://ipo.one`.
- Clean single-v2 fallback `dpl_9Gxuxec5wgB1BMRS7UzoUvCYRhWu` is retained.
- `dpl_FcNXh5b8m6eEE1PrUgeNoEQxuJa6` remains `REVIEW`: it contains no v1
  environment name and has no alias, but its historical requests returned 503
  because runtime release ID `07b68bb...` did not match packaged source
  `3bb525ce...`. It is not an authorized rollback candidate.
- No remaining READY Production deployment contains a legacy v1 environment
  name.

Current verdict: `PASS — DEPLOYED AND USER-VERIFIED` for `AUTHN-008 RETIRE`.
