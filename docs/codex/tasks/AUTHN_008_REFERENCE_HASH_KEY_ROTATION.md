# AUTHN-008 — Authentication reference-hash key rotation

Status: `PLANNED — IMPLEMENTATION AND PRODUCTION EXECUTION NOT AUTHORIZED`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-UX-001`, `REQ-UX-002`, `REQ-UX-005`

## Context

The deployed no-funds closed-pilot runtime still holds the current
`IPO_ONE_AUTH_REFERENCE_HASH_KEY` as a non-exportable Vercel secret, but the
owner copy is unavailable. Production health proves that the current runtime
can still use that key; it does not make the raw value recoverable.

The key is an HMAC key, not an encryption key. PostgreSQL contains only keyed
reference hashes for Subjects, sender constraints, login transactions,
Sessions, CSRF values, token identifiers, invitation references and network
references. The original values cannot be recovered or bulk-rehashed from the
stored hashes. The credential Subject binding and Session binding are also
guarded as immutable. Replacing the environment variable directly would
therefore orphan active credentials and Sessions.

On 2026-08-26 the Founder authorized formulation of a key-rotation migration.
This issue records the smallest correct migration. That authorization does not
authorize code implementation, a database migration, secret creation, Vercel
environment mutation, deployment, production data mutation or credential
issuance.

## Decision

Use a time-bounded, fail-closed `v1 -> v2` overlap. Never export or recover the
current raw key and never rewrite historical Events.

1. Keep the current Vercel secret as `v1` only inside the deployed runtime.
2. Introduce a separately generated `v2` key, immutable key-version identifier
   and digest-bound Vercel secret reference.
3. Before overlap begins, terminally revoke all active `v1` Sessions and delete
   only expired or unconsumed login transactions under their existing guarded
   cleanup rules. A browser must sign again; pending challenges are not carried
   across the boundary.
4. During overlap, all new login transactions, Sessions, CSRF values, token
   identifiers, invitation references and sender constraints are written with
   `v2`. The `v1` hasher is permitted only for a bounded credential lookup after
   a new cryptographic proof succeeds.
5. Rebind a Human credential only after a fresh SIWE proof from the same wallet.
   In one tenant-scoped transaction, create a new `v2` credential, copy only the
   already-active reviewed role enrollments and capabilities, revoke the `v1`
   credential and its old enrollments, append a key-versioned rebind Event, and
   create the new Session against the `v2` credential. No role, capability,
   client, policy or expiry may broaden.
6. Do not migrate an Agent from stored hashes. Each active workload must prove
   its current private-key/DPoP control and rotate to a new sender binding, or be
   revoked and reprovisioned under `v2`. The already-revoked Golden Flow Agent
   remains revoked; its destroyed private key is never recreated.
7. Cut over to `v2`-only only when an owner-read inventory proves zero active
   `v1` credentials, Sessions, role enrollments and pending transactions. Any
   unknown, duplicate or ambiguous binding stops the cutover.
8. Retain the old secret and dual-key release for a bounded rollback window.
   Removal of the old Vercel secret is a separate, explicit production action
   after post-cutover acceptance. Historical hashes and Events remain immutable
   and version-attributed.

## Scope

- Add explicit reference-hash key-version metadata to every durable row whose
  lookup depends on the key.
- Add a dual-hasher abstraction with exactly one primary write key and at most
  one legacy lookup key.
- Add one transactional Human rebind operation and one workload
  rotate-or-reprovision path.
- Add a read-only inventory/preflight command and a cutover assertion that
  fails closed on any active `v1` dependency.
- Add immutable authentication Events for credential reference rebind and
  rotation cutover without changing old Event payloads.
- Preserve replay and abuse-control safety across the hash boundary; key
  rotation must not reset an attacker's replay or rate-limit budget.
- Update production configuration validation, bootstrap/revocation selectors,
  readiness truth and Evidence generation.

## Non-goals

- No raw-key export, key recovery, hash reversal or historical rehash.
- No in-place mutation of an immutable credential Subject binding.
- No authentication bypass, synthetic proof, hidden session restoration or
  automatic account relinking.
- No role/capability/policy expansion, public registration or tenant switching.
- No production action under this planning issue.
- No chain write, signer, mainnet, real funds, custody, Pool/Venue write,
  transfer or withdrawal.

## Proposed data changes

The implementation issue may allocate the next additive migration number only
after review. The migration must:

- add `reference_hash_key_version` with a validated, non-secret identifier to
  `authentication_credentials`, `authentication_oidc_transactions`,
  `authentication_wallet_transactions`, `authentication_sessions`,
  `authentication_session_invalidations` and
  `authentication_replay_entries`;
- label existing rows `v1` without recomputing any hash;
- require all newly inserted rows to carry the runtime primary version;
- preserve old credential and Session rows as immutable or terminal records;
- admit `credential_reference_rebound` and `reference_hash_cutover` Events with
  old/new credential identifiers, old/new non-secret key versions and no raw
  external Subject, wallet, signature, token, sender key or secret; and
- allow future Session, role-selection and invitation Event payloads to carry a
  non-secret key version while preserving the exact legacy payload shapes;
- retain forced RLS, tenant foreign keys and append-only Event guards.

An invalidation key version must equal the referenced Session version; it must
not accept an unbound version claim. Existing invitation and Session hashes
embedded in immutable Events remain `v1` historical facts. New Events must
carry their non-secret key version.

The same runtime key currently derives `network.forwarded` references used by
short-lived abuse-control buckets and immutable authorization audit Events.
Historical audit rows remain unchanged and are version-attributed by the
cutover Evidence. During overlap each applicable credential/network attempt
must reserve both the `v1` and `v2` transient abuse dimensions until the
maximum old bucket lifetime has elapsed; otherwise rotation would reset the
caller's rate budget. In-memory keyed replay stores are restarted empty only
after the durable replay cache and credential status make old proofs invalid.

## Runtime state machine

Only these modes are valid:

- `single_v1`: current runtime, `v1` reads/writes only;
- `overlap_v2_write_v1_lookup`: `v2` writes only; `v2` lookup first; a single
  `v1` fallback is allowed only for verified credential rebind;
- `single_v2`: `v2` reads/writes only; `v1` configuration is rejected.

Missing keys, mismatched digest references, equal `v1`/`v2` key digests,
unknown versions, more than one legacy key, legacy writes, dual matches,
unreviewed identity drift, or an attempted mode regression must make readiness
fail. Normal catalog and business endpoints must not start in that state.

## Likely files

- `modules/authentication/src/security-utils.js`
- `modules/authentication/src/postgres-human-authentication.js`
- `modules/authentication/src/human-wallet-bff.js`
- `modules/authentication/src/machine-authenticator.js`
- `apps/private-pilot/src/production-environment.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/tenant-api/src/postgres-human-access-composition.js`
- the next reviewed additive migration under `db/migrations/`
- focused PostgreSQL, production-environment, bootstrap and browser tests
- `docs/security/IPO_ONE_AUTH_REFERENCE_HASH_KEY_ROTATION_RUNBOOK_v0.1_DRAFT.md`

## Acceptance criteria

1. A migration fixture at the current head upgrades additively and labels all
   existing rows `v1` without hash or Event mutation.
2. The runtime accepts the three exact modes above and rejects every malformed,
   ambiguous or digest-unbound key configuration before readiness.
3. A fresh SIWE proof can atomically rebind one Human identity to `v2`; replay,
   wallet mismatch, tenant mismatch, changed authorization, duplicate binding
   and partial-transaction failure all fail closed.
4. Old Sessions and pending challenges cannot authenticate after overlap starts.
   Refresh, logout/login, process restart and duplicate requests remain safe.
5. Workload rebind requires fresh asymmetric proof and sender rotation, or a
   newly reviewed credential. A revoked credential remains rejected.
6. Cutover refuses to proceed while any active `v1` dependency exists and emits
   only non-secret inventory counts and immutable Evidence.
7. In `single_v2`, all `v1` login, Session, token and sender references fail;
   `v2` Human refresh/recovery and one bounded Agent authorized read pass.
8. Tenant isolation, forced RLS, role selection and the exact 109-operation
   Tenant catalog remain unchanged.
9. Full local tests and visible-click browser acceptance pass before any remote
   deployment is requested.
10. A request cannot gain an extra credential-attempt, discovery or network
    budget at overlap, and durable `v1` proof replays remain rejected until
    they expire even after restart.

## Test commands

```sh
pnpm check
pnpm test
pnpm run test:postgres
pnpm run test:transport
pnpm run local:acceptance
pnpm check:product-traceability
git diff --check
```

## Security checklist

- [ ] Raw `v1` and `v2` keys never appear in logs, artifacts, shell history or
      database rows.
- [ ] Both Vercel values are sensitive secrets bound to immutable SHA-256 refs.
- [ ] `v1` is lookup-only during overlap and inaccessible to business handlers.
- [ ] Rebind requires current cryptographic control and exact tenant/Actor
      continuity.
- [ ] Authorization cannot broaden during the clone/rebind transaction.
- [ ] All old Sessions/challenges are terminal before `v2` Session issuance.
- [ ] Duplicate or ambiguous Subject/sender matches fail closed.
- [ ] Cutover inventory is owner-read-only and contains counts/IDs, no secrets.
- [ ] Historical Events are not rewritten.
- [ ] Rollback does not require a destructive downgrade.
- [ ] No production, chain or funds authority is inferred.

## Migration and rollback

The database change is additive. Use side-by-side `v1` and `v2` credential rows
so rollback can reactivate the dual-key release without restoring or mutating
historical hashes. Do not drop columns, delete credentials, rewrite Events or
downgrade a migration.

Before production execution, create a manual database snapshot and record the
exact deployment, migration history and active-version inventory. If overlap
acceptance fails, stop new rebinds, keep `v2` rows and Events as recorded facts,
retain both secrets, restore the last known dual-key release and reconcile
forward. Database restore is an exceptional destructive action requiring a new
exact authorization.

## Required Evidence

Exact source SHA/tree, migration name/checksum, pre/post key-version inventory,
secret reference digests but never values, deployment identity, readiness mode,
Human SIWE/rebind/refresh receipts, Agent proof/read/revocation receipts,
negative old-session and old-workload checks, RLS/tenant checks, bounded logs,
rollback identity and explicit no-funds/no-chain truth.

## Permission boundary and next gate

This document is a plan only. Implementation and local synthetic/no-funds
testing require a new explicit Founder approval of `AUTHN-008`. Production key
creation, schema migration, Vercel configuration, deployment, rebind, cutover
and old-key deletion then remain separately approved actions under the runbook.
