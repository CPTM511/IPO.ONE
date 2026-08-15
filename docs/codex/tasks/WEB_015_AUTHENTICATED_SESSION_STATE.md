# WEB-015: Authenticated session state and controls

Status: Implemented and verified on 2026-07-27 under Product Charter v1.1 and
the no-real-funds private-pilot boundary.

## Context

The authentication backend can establish a host-only Human session through an
approved OIDC provider or one-use wallet sign-in. The web shell does not provide
an explicit authenticated confirmation surface, Continue action, or Sign out
control. Its top-bar label can also show a connected wallet address while no
server session exists, which visually conflates wallet connection with
authentication.

The local private-pilot runtime injects a valid host session and CSRF bootstrap
without exposing the production authentication-discovery route. The browser
currently exits before probing the authenticated Tenant catalog whenever
discovery is unavailable, so that valid pre-provisioned session is rendered as
signed out.

## Scope

- Keep wallet connection and authenticated server-session state visually
  separate.
- Add an explicit signed-in confirmation surface with Continue to workspace and
  Sign out controls.
- Reuse the existing CSRF-bound `/auth/v1/logout` route; add no new endpoint.
- Allow a pre-provisioned private-pilot session with a valid CSRF bootstrap to
  prove itself through the authenticated Tenant catalog.
- Synchronize the top bar, access dialog, runtime gate, and private product
  surfaces after session verification.
- Keep wallet, OIDC, and local pre-provisioned sessions on one presentation
  state machine.

## Non-goals

- No new authentication provider, credential type, cookie, token, wallet
  method, chain, capability, role, Mandate, or authorization rule.
- No client-side authentication truth or browser-stored bearer token.
- No change to Session, CSRF, Gateway, Tenant, funds, risk, or protocol
  semantics.
- No production deployment or identity-provider configuration.

## Files likely to modify

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- authenticated browser-test support if required for verification
- `docs/codex/audits/WEB_015_AUTHENTICATED_SESSION_STATE/`

## Acceptance Criteria

- [x] Given no authenticated server session, the top bar says Sign in even when
  a wallet account is merely connected.
- [x] Given an authenticated OIDC or wallet session, the top bar says Signed in
  and the access dialog presents a clear verified-session state.
- [x] Given a newly verified wallet session that still needs a CSRF-bearing
  shell reload, Continue to workspace completes that reload.
- [x] Given an already verified workspace, Continue to workspace closes the
  dialog and returns focus to the product surface.
- [x] Given a production-capable authenticated session, Sign out uses the
  existing CSRF and idempotency boundary, then reloads into signed-out state.
- [x] Given the local private-pilot pre-provisioned session, unavailable auth
  discovery does not prevent the authenticated Tenant catalog from verifying
  the session.
- [x] Public sandbox and unavailable authentication remain fail-closed.

## Test Command

```sh
pnpm dlx node@24.18.0 --check apps/web/src/app.js
pnpm dlx node@24.18.0 --test apps/web/test/static-ui.test.js
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security Checklist

- [x] Session truth comes only from `/auth/v1/options` or a successful
  authenticated Tenant catalog plus valid CSRF bootstrap.
- [x] Sign out requires same-origin credentials, CSRF, and one idempotency key.
- [x] Wallet connection alone never becomes an authenticated session.
- [x] No cookie, credential, bearer token, signature, or raw account proof is
  exposed to page content or browser persistence.
- [x] Existing wallet-context invalidation remains fail-closed.
- [x] No API, permission, funds, risk, or deployment boundary changes.
