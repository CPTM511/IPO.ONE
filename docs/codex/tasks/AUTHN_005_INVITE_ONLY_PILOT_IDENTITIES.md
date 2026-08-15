# AUTHN-005 — Invite-only pilot identities and credential lifecycle

Status: Completed locally; hosted provider and credential issuance remain
unapproved

## Context

LOCAL-STACK-001 proves fixed Human, Agent, and Risk identities locally.
DEPLOY-001 defines a durable hosted topology, but remote access and vendor
activation remain blocked. The next delivery-guide issue is to make the
existing controlled bootstrap suitable for a small invited cohort without
adding public signup, configurable permissions, or long-lived credentials.

The current production bootstrap is pre-provisioned only, but its credential
entries are not bound to a unique invitation, have no required expiration, and
do not yet provision the Risk Operations profile. Its explicit capability
snapshots also predate the authenticated Credit Registry Evidence read.

## Scope

- Version the controlled bootstrap as `ipo_one_production_bootstrap.v2`.
- Require one unique invitation identifier and one bounded expiration for
  every Human or Agent credential.
- Keep wallet-based Human identities and mTLS-bound Agent identities as the
  only provisionable profiles in this issue.
- Add a wallet-authenticated Risk Operations profile with recent-MFA policy
  preserved by the existing authentication and authorization layers.
- Derive every role and capability set from closed server-side profile
  definitions; reject caller-supplied roles, permissions, or capability lists.
- Persist only hashed invitation, external-subject, and sender-constraint
  references.
- Reuse the existing durable credential rotation, suspension, revocation,
  expiry, and atomic session-deprovisioning lifecycle.

## Non-goals

- No external IdP/KYC vendor selection, OAuth client registration, procurement,
  Secret Manager write, hosted deployment, public endpoint, or remote access.
- No public/self-service signup, email invitation, magic link, bearer API key,
  shared Agent credential, or browser-visible token.
- No raw KYC/PII persistence, wallet address in events, credential secret,
  certificate, private key, or sender thumbprint in bootstrap results.
- No new credit, risk, funds, trading, signing, withdrawal, or production
  authority.
- No change to the running local synthetic identity profile.

## Likely files

- `apps/private-pilot/src/production-bootstrap.js`
- `apps/private-pilot/test/production-environment.test.js`
- `apps/private-pilot/test-postgres/production-bootstrap.test.mjs`
- `apps/private-pilot/test-postgres/production-runtime-e2e.test.mjs`
- `modules/authentication/README.md`
- `docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md`

## Acceptance criteria

1. Bootstrap v1 and unknown shapes fail closed; v2 requires exact credential
   invitation and expiration fields.
2. Invitation identifiers are unique across the Tenant's durable bootstrap
   history and are stored only as keyed hashes in immutable authentication
   events.
3. Credentials expire after at most 90 days and bootstrap rejects expired,
   excessively long, malformed, or non-canonical timestamps.
4. Human Borrower, Principal Controller, Agent Runtime, and Risk Operator are
   the only provisionable profiles.
5. Human profiles require an approved-chain canonical CAIP-10 wallet
   credential; Agent Runtime requires a unique mTLS sender thumbprint and an
   invited Principal Controller.
6. Roles and capabilities are server-derived; permission injection and
   mismatched existing records fail closed.
7. Every provisioned profile receives only its reviewed capability snapshot,
   including the read-only Credit Registry Evidence capability where
   applicable.
8. Bootstrap result and events contain no external subject, wallet address,
   sender thumbprint, credential material, or private data.
9. Existing rotation, deprovisioning, forced RLS, least-privilege database
   roles, runtime, PostgreSQL, and complete repository checks remain green.

## Test commands

```sh
node --test apps/private-pilot/test/production-environment.test.js
pnpm run test:postgres
pnpm run check
git diff --check
```

## Completion evidence

- Node `v26.5.0` complete repository check passed: `616/616`.
- PostgreSQL integration and migration lifecycle passed: `78/78`.
- Schema checks passed for 81 contracts and migration checks passed for 42
  ordered up/down pairs.
- The rebuilt LOCAL-STACK-001 runtime applied all 42 migrations and passed live
  acceptance for the authenticated Human, Agent, and Risk workspaces, forced
  RLS, worker heartbeat, reconciliation, and an empty pending outbox.
- No external IdP, participant credential, remote endpoint, signer, trading
  venue, or funds authority was provisioned.

## Rollback

- Before any v2 credential is registered, migration 0042 may be rolled back
  with its checked-in down migration.
- After an invitation-bound credential event exists, do not delete or rewrite
  immutable authentication history to force a schema rollback. Disable the
  bootstrap entry point, revoke or deprovision the affected credentials through
  the existing lifecycle, verify active sessions are invalidated, keep migration
  0042 forward-compatible, and restore the prior application release.
- Remote access and credential issuance remain closed, so the current local
  checkpoint can also be stopped by taking down the local stack without any
  external participant impact.

## Security checklist

- [x] Invite-only and no self-signup boundary is enforced.
- [x] Every credential is expiry-bound to at most 90 days.
- [x] Roles and capabilities cannot be supplied by the caller.
- [x] Human and Agent credential types remain sender-constrained and separate.
- [x] Invitation, subject, and sender references are hashed before persistence.
- [x] Revocation invalidates active sessions through the existing durable path.
- [x] Remote access, external provider activation, funds, and signing remain
      disabled.
- [x] PostgreSQL and complete repository regression pass.
