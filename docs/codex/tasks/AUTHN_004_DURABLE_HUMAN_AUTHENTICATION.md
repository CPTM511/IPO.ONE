# AUTHN-004: Durable Human Authentication

Status: Implemented and verified locally on 2026-07-18. Production IdP
registration, protected HTTPS deployment, independent review, and release
evidence remain closed.

## Context

AUTHN-001 through AUTHN-003 established the provider-neutral OIDC/SIWE model
and HTTP routes, but their process-local stores were not restart-safe. A closed
commercial pilot needs durable, Tenant-isolated credentials, one-use login
transactions, host sessions, and audit truth without persisting raw provider
subjects, wallet addresses, nonces, verifiers, cookies, CSRF tokens, or token
identifiers.

## Scope

- Add reversible PostgreSQL projections for Credentials, OIDC transactions,
  SIWE transactions, Human sessions, and authentication events.
- Enforce forced RLS, immutable Tenant/Actor binding, guarded state changes,
  bounded lifetimes, and safe-integer versions at the database boundary.
- Consume login transactions with atomic `DELETE ... RETURNING` semantics.
- Encrypt recoverable transaction material with AES-256-GCM and keyed,
  namespace-separated references for every lookup or correlation value.
- Revalidate Credential, Actor, Membership, client, policy, role, capability,
  and expiry state on every session use.
- Revoke a Credential and all active sessions in one PostgreSQL transaction.
- Compose reviewed OIDC and SIWE providers through one closed startup factory
  that verifies the dedicated database role, Tenant system identity, and
  immutable Secret Manager version references.
- Keep Credential provisioning closed and Human/Agent business authority in the
  shared authorization and Mandate layers.

## Non-Goals

- No open registration, password database, raw KYC/PII storage, browser token
  storage, external-role authorization, public Tenant routes, mainnet, custody,
  withdrawals, or real funds.
- No embedded Google client secret, provider discovery by URL, dynamic redirect
  URI, or runtime-selected Tenant.
- No claim that a local adapter is a deployed IdP, protected environment,
  independent penetration test, or commercial lending approval.

## Files

- `db/migrations/0025_durable_human_authentication.up.sql`
- `db/migrations/0025_durable_human_authentication.down.sql`
- `modules/authentication/src/postgres-human-authentication.js`
- `modules/authentication/src/human-session-bff.js`
- `modules/authentication/src/security-utils.js`
- `apps/tenant-api/src/postgres-human-access-composition.js`
- `modules/authentication/test-postgres/durable-human-authentication.test.mjs`

## Acceptance Criteria

- A session survives adapter restart and fails closed after Credential rotation,
  suspension/revocation, Actor disablement, or Membership drift.
- OIDC transaction handles are consumed only by a fully bound state, provider,
  redirect, and live-expiry match; malformed or guessed callbacks cannot burn a
  victim's pending login. Valid OIDC and SIWE attempts remain one-use under
  duplicate and concurrent execution.
- Raw external subjects, wallet addresses, transaction secrets, cookie/CSRF
  values, and token JTIs cannot be found in database or event serialization.
- A dedicated non-owner/non-superuser/non-`BYPASSRLS` role has exactly the
  authentication table privileges and cannot read credit or financial tables.
- Startup rejects any missing `ENABLE/FORCE RLS`, extra permissive policy, or
  drift from the exact reviewed Tenant policy set on every accessible table.
- The startup composition rejects an inactive or cross-Tenant system identity,
  an unversioned/mismatched secret reference, a forged runtime approval, an
  unreviewed provider shape, or a deployment with neither OIDC nor SIWE.
- Credential deprovision and active-session revocation commit atomically.
- Migration up/down ordering, Schema contracts, unit, transport, security, and
  real PostgreSQL tests pass under Node 24.18.0.

## Test Command

```sh
pnpm dlx node@24.18.0 scripts/check-migrations.mjs
pnpm dlx node@24.18.0 scripts/check-schemas.mjs
pnpm dlx node@24.18.0 --test modules/authentication/test/*.test.js
DATABASE_URL=postgresql://127.0.0.1:55432/ipo_one_test \
  pnpm dlx node@24.18.0 --test --test-concurrency=1 \
  modules/authentication/test-postgres/durable-human-authentication.test.mjs
pnpm run test:security
pnpm run test:transport
pnpm run check
```

## Security Checklist

- [x] Forced RLS and Tenant context guards cover all five projections.
- [x] The runtime role is least privilege and denied business-table access.
- [x] Startup proves exact table/column ACLs, forced RLS, and the closed policy
  set; real PostgreSQL negative tests disable RLS and add a bypass policy.
- [x] Recoverable transaction values are AES-GCM encrypted with namespace AAD.
- [x] External identities and browser secrets are stored only as keyed hashes or
  encrypted envelopes.
- [x] Login transactions are consumed atomically only after their complete
  binding validates; malformed or cross-provider attempts leave them usable.
- [x] Session lifetime, safe integer, state transition, and immutable binding
  invariants are enforced in PostgreSQL as well as JavaScript.
- [x] Credential/session deprovision is one serializable transaction.
- [x] Secret references require immutable numeric Secret Manager versions.
- [x] Public sandbox authentication remains truthfully disabled.
- [ ] Named IdP/client registration, managed secrets, backup/restore exercise,
  persistent credential-attempt admission plus hosted WAF limits, protected
  HTTPS deployment, independent security review, and exact-release approval
  evidence are complete.
