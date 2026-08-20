# IDENTITY-ACCEPTANCE-UNBLOCK-001

Status: Complete — deployed from `main` and user-verified

## Context

FINAL-CREDIT-LOOP-001 reached the deployed closed no-funds pilot, but the
Founder wallet was bound only to the Principal Controller role and the retained
Agent credential no longer had its external private proof key. Those are
provisioning limitations, not product invariants.

## Scope

- Add durable same-Human role enrollment for `principal_controller` and
  `human_borrower` without creating a second Human Actor.
- Require an explicit wallet workspace choice and issue a session containing
  exactly one selected role and only that role's reviewed capabilities.
- Revalidate the selected enrollment on every authenticated request and record
  durable role-enrollment and role-selection events.
- Add an owner-controlled Golden Flow Agent bootstrap using a newly generated
  P-256 DPoP key pair, public-only registration, bounded expiry and revocation.
- Run the deployed Human H-03 through H-14 and Agent A-01 through A-09 flows,
  then revoke and destroy the temporary Agent credential and private keys.
- Normalize, merge, verify and deploy the final result from `main`.

## Non-goals

- No real funds, mainnet, custody, withdrawals, arbitrary spend, chain signer,
  shared credential, browser-injected Agent key or permanent test backdoor.
- No union-of-roles Human session and no weakening of DPoP, RLS, Tenant,
  Subject, ownership, Consent, Mandate or Evidence authorization.
- No mock, fixture, local-only or build-status substitution for deployed
  acceptance.

## Likely files

- `db/migrations/0063_selected_human_role_enrollment.*.sql`
- `modules/authentication/src/*`
- `modules/authorization/src/*`
- `apps/tenant-api/src/human-access-routes.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/web/src/index.html`, `apps/web/src/app.js`, `apps/web/src/styles.css`
- `scripts/*golden-flow*`
- authentication, authorization, PostgreSQL, transport and browser tests

## Acceptance criteria

1. One canonical Human Actor may hold both reviewed Human roles.
2. Wallet challenge and signed session bind one explicit selected role.
3. Requests authorize only that selected role and fail closed after enrollment,
   credential, membership, Tenant, policy or client invalidation.
4. Enrollment and selection are durable, PII-free authentication events.
5. Founder can complete the full deployed Human no-funds lifecycle.
6. A new Agent public JWK/thumbprint can be provisioned without persisting its
   private JWK, and the real remote SDK/MCP flow completes with DPoP.
7. Temporary Agent credentials and private-key material are revoked/destroyed
   after acceptance unless the Founder explicitly retains the fixture.
8. Final CI, deploy and critical smoke evidence bind the merged `main` SHA.

## Test commands

```sh
pnpm run check
pnpm run test:postgres
pnpm exec playwright test
git diff --check
```

## Permission boundary

Founder instruction `IDENTITY-ACCEPTANCE-UNBLOCK-001` explicitly authorizes
the no-real-funds closed-pilot role, credential, deployment and merge changes
in this issue. It grants no real-value, mainnet, custody, withdrawal, arbitrary
spend or signer authority.

## Migration and rollback

Migration 0063 adds a selected-role enrollment projection and a role binding to
one-use SIWE transactions. Before any secondary enrollment or role-selection
event exists it may be rolled back. Afterwards, revoke the added enrollment and
sessions, retain immutable events, and roll the application back forward; never
delete authentication or credit history to force a downgrade.

## Security checklist

- [x] One role per session; no capability union.
- [x] Server-derived role capabilities only.
- [x] Role selection is bound to the one-use SIWE transaction.
- [x] Every request revalidates credential and selected enrollment.
- [x] Private Agent JWK remained only in owner-only ephemeral storage or memory and was destroyed after revocation.
- [x] DPoP proof remains request-, token-, key- and replay-bound.
- [x] RLS and least-privilege role checks pass.
- [x] No funds or chain authority is introduced.

## Completion evidence

- PRs #23 through #27 were normalized, merged in dependency order and verified
  on final `main` SHA `f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194`.
- Production deployment `dpl_B7VcAfv5CHrHrermwr8K71aswDNp` is active at
  [https://ipo.one](https://ipo.one).
- H-03 through H-14 passed through visible Human controls using the Founder
  wallet's explicitly selected `human_borrower` enrollment.
- A-01 through A-09 passed through the deployed SDK/MCP transport using a new
  owner-controlled public-key bootstrap and an external ephemeral private key.
- The temporary Agent Credential was durably revoked; a post-revocation DPoP
  request failed closed, and all temporary private-key material was destroyed.
- Exact acceptance, release and rollback evidence is recorded in
  `docs/releases/FINAL_CREDIT_LOOP_001_COMPLETION.md`.
