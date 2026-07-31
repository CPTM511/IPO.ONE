# AUTHN-007 — Stale Browser Session Recovery

Status: Implemented, locally verified, and sealed in LOCAL-RC-002

## Context

The durable authentication layer correctly keeps signed-out, expired, and
revoked sessions inactive. A stale browser can still send the old host-session
and CSRF cookies while requesting the Web shell. The HTML CSRF bootstrap
provider currently propagates the durable rejection, replacing the sign-in
screen with raw Problem Details and preventing a fresh invited-wallet login.

## Scope

- Treat an explicitly rejected durable browser session as an unauthenticated
  Web-shell bootstrap.
- Render the normal privacy-closed sign-in screen without a CSRF bootstrap.
- Preserve durable revocation and require a fresh wallet signature to create a
  new session.
- Verify sign-out, credential revocation, restart persistence, and all four
  local workspaces.

## Non-goals

- Do not reactivate, rotate, or reuse a revoked Session.
- Do not add an automatic login, browser bearer token, public registration, or
  local authentication bypass.
- Do not change roles, capabilities, Mandates, credit policy, chain writes,
  deployment, or funds authority.

## Likely files

- `apps/tenant-api/src/postgres-human-access-composition.js`
- `modules/authentication/test-postgres/durable-human-authentication.test.mjs`
- focused browser and local-stack acceptance evidence

## Acceptance criteria

- A valid active session still injects its exact CSRF bootstrap.
- A signed-out, expired, deprovisioned, or otherwise rejected session renders
  the signed-out Web shell instead of raw Problem Details.
- The rejected Session remains terminal in PostgreSQL.
- A fresh invited-wallet SIWE login can replace the stale cookies and access
  only its approved workspace.
- Database and service restart do not restore the rejected Session.

## Test commands

```sh
node --check apps/tenant-api/src/postgres-human-access-composition.js
pnpm run test:postgres
pnpm run test:transport
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] Rejected sessions remain rejected.
- [x] No stale CSRF token is injected into HTML.
- [x] Non-session authentication/configuration failures still fail closed.
- [x] Fresh access still requires invited-wallet proof.
- [x] No production, remote-access, chain, or real-funds authority changes.

## Verification evidence

- Durable PostgreSQL authentication regression: 6 passed, including active
  CSRF bootstrap, explicit sign-out recovery, credential revocation, restart,
  one-use proofs, and Tenant isolation.
- Transport contract: 59 passed.
- Focused Web, wallet sign-out, Human access, and private-pilot tests: 25
  passed.
- Repository check: 666 passed, including 48 migrations, 76 Tenant operations,
  TRANSPORT-003, Web bundle integrity, schemas, OpenAPI, and boundary lint.
- `LOCAL-STACK-001` live acceptance passed against PostgreSQL 17, all four
  wallet-gated workspaces, durable Agent proof, worker, reconciliation, RLS,
  Evidence coverage, and an empty pending outbox.
- Stale-cookie HTTP regression returned `200 text/html` with the signed-out
  privacy shell and no CSRF bootstrap on ports 8787, 8788, 8789, and 8790.
- Playwright rendered all four local workspaces and opened the normal
  invited-wallet sign-in dialog on the Borrower workspace.
