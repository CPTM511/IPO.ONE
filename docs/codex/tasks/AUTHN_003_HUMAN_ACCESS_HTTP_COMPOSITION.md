# AUTHN-003: Human Access HTTP Composition

Status: implemented and verified locally on 2026-07-17

## Context

AUTHN-002 provides reviewed OIDC Authorization Code + PKCE and one-use SIWE
authentication primitives. WEB-013 provides the commercial account and network
onboarding UI. The private Tenant host still needs one same-origin HTTP boundary
that composes those primitives without making the anonymous public sandbox an
authentication service.

## Scope

- Add a closed Human access route handler for authentication discovery, OIDC
  initiation/callback, SIWE challenge/verification, and logout.
- Bind each OIDC login transaction to one configured provider so a Google,
  email, or future common-IdP callback cannot be confused with another flow.
- Serialize only reviewed Secure, HttpOnly, host-only cookies and fixed
  same-origin redirects.
- Require exact Origin on unauthenticated wallet mutations and strict bounded
  JSON bodies.
- Allow the loopback Tenant host to inject this handler while preserving its
  existing non-public transport configuration.

## Non-Goals

- No open signup, account linking, caller-selected Tenant/Actor/roles, mainnet,
  wallet transaction, token approval, or funds authority.
- No embedded client secret, browser bearer token, refresh token, raw identity
  claim, wallet signature persistence, or public-sandbox activation.
- No production proxy, TLS, IdP, durable session-store, or release-policy
  unlock in this task.

## Likely Files

- `apps/tenant-api/src/human-access-routes.js`
- `apps/tenant-api/src/tenant-http-adapter.js`
- `apps/tenant-api/src/tenant-pilot-host.js`
- `modules/authentication/src/human-bff.js`
- `modules/authentication/src/login-transaction-store.js`
- `apps/tenant-api/test/human-access-routes.test.mjs`

## Acceptance Criteria

- `GET /auth/v1/options` truthfully reports configured providers, wallet
  authentication, supported test chains, and validated session state.
- OIDC initiation sets one short-lived Lax transaction cookie and redirects to
  the exact BFF authorization URL; callback consumes the provider-bound
  transaction and issues only the reviewed host session.
- Wallet challenge and verification accept only exact same-origin POSTs, one of
  the two approved chain IDs, closed JSON bodies, and the one-use BFF result.
- Logout revokes the current session with same-origin CSRF and expires the
  session cookie.
- The public sandbox remains disabled and the Tenant listener remains loopback,
  local-test, and non-production only.

## Test Command

```sh
pnpm run test:transport
pnpm run test:security
pnpm run check
```

## Security Checklist

- [x] Provider identity is bound inside the OIDC transaction, not trusted from
  the callback query alone.
- [x] Cookies are host-only, Secure, HttpOnly, bounded, and CRLF-safe.
- [x] Wallet endpoints enforce exact Origin and strict JSON before BFF calls.
- [x] Authentication responses contain no token, signature, credential, role,
  capability, Tenant, or CSRF secret.
- [x] Public and real-funds profiles remain unchanged and fail closed.

## Verification

- `pnpm run test:transport`: 42/42 passed, including live loopback OIDC,
  SIWE, logout, cross-origin, provider-confusion, duplicate-key, and open-body
  cases.
- `pnpm run test:security`: 24/24 passed, including the public/private route
  separation and cookie-only source boundary.
- `pnpm run check`: 333/333 passed on Node 24.18.0.
