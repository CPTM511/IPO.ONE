# AUTHN-001: Human and Workload Identity Boundary

Status: Local non-funds foundation implemented on 2026-07-13 under the approved
SECURITY-001 SEC-D01 through SEC-D09 decision pack. Human IdP vendor, durable
authenticated routes, production credentials, and deployment remain gates.

## Context

The public sandbox has no customer identity and correctly treats its session ID
as an isolation hint, not a credential. A closed pilot needs provider-neutral
Human and machine authentication that maps to internal Actor records without
turning wallet proofs, external groups, or token roles into protocol authority.

## Scope After Approval

- Implement a provider-neutral OIDC Authorization Code plus PKCE BFF contract
  for Human operators; IPO.ONE stores no Human password.
- Keep access and refresh tokens server-side. Issue only a rotated `Secure`,
  `HttpOnly`, host-only SameSite session cookie with CSRF protection.
- Validate exact issuer, audience, redirect URI, algorithm, critical headers,
  `state`, `nonce`, PKCE, time claims, claim version, and bounded clock skew.
- Require phishing-resistant MFA and authentication age of at most 15 minutes
  for risk, admin, credential, approval, and break-glass actions.
- Implement provider-neutral OAuth machine-token verification with asymmetric
  client authentication, audience restriction, maximum five-minute lifetime,
  unique `jti`, and sender-constraint verification boundaries.
- Support DPoP for Agent clients and `private_key_jwt` or mTLS profiles for
  Provider/system workers without selecting a production vendor.
- Map external `sub` and client identity to active internal Actor/credential
  records; external groups and roles never become capabilities directly.
- Event credential issuance, rotation, revocation, expiry, session rotation,
  and compromise response without persisting raw credential material.
- Provide a local deterministic test issuer and key-rotation fixtures only.

## Non-Goals

- No implementation before SECURITY-001 approval is recorded.
- No production IdP selection, live OAuth client, production signing key,
  shared steady-state client secret, wallet custody, webhook authentication,
  authorization policy, real funds, KYC/KYP, or deployment.
- No browser-visible bearer or refresh token.
- No wallet address, Subject, Principal, Mandate, or API parameter as identity.

## Likely Files

- `modules/identity/*`
- `modules/authorization/*`
- `apps/api/src/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `schemas/*`
- `db/migrations/*`
- `security/test/*`
- `docs/architecture/*`

## Acceptance Criteria

- Human login, callback, logout, session rotation, inactivity, absolute expiry,
  revocation, deprovisioning, CSRF, and recent-MFA flows are deterministic and
  negative-tested.
- Unknown issuer/audience/algorithm/critical header/claim, missing sender
  constraint, expired/not-yet-valid/replayed token, revoked client, and stale
  auth time fail before tenant or resource access.
- JWKS refresh, rollover overlap, cache bounds, network failure, and key
  withdrawal fail predictably without accepting an untrusted key.
- Machine tokens are tenant-, actor-, audience-, capability-, and policy-bound;
  a token for one client cannot be replayed by another sender.
- Browser storage, logs, errors, Evidence, traces, and fixtures contain no raw
  token, code, cookie, private key, signature, password, or PII.
- Authentication creates no business authorization by itself and commits no
  protocol mutation.
- A production IdP/client configuration cannot start without an external
  deployment approval and secret-manager reference.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Local Foundation Evidence

- `modules/authentication` implements closed JWT preflight, asymmetric JOSE
  verification, pinned and bounded JWKS refresh, active Actor/Credential binding,
  HMAC identity references, and a branded non-authorizing Authentication Context.
- Human OIDC BFF tests cover S256 PKCE, one-time state/nonce transactions,
  registered redirects, strict token response shape, host cookies, CSRF, login
  fixation, rotation, logout, inactivity, absolute expiry, deprovisioning, and
  recent phishing-resistant MFA; IdP code exchange has a hard timeout.
- Workload tests cover five-minute token limits, closed claims, tenant/client/
  actor/policy/capability binding, DPoP request and access-token binding, proof
  replay, trusted mTLS evidence, credential and Actor revocation, JWKS overlap,
  key withdrawal, cache bounds, unknown-key refresh cooldown, network failure,
  and fetch timeout.
- Credential and session lifecycle events use closed payloads and contain no raw
  external subject, token, authorization code, cookie, verifier, signature,
  private key, or PII. Test signing keys are generated only in memory.
- Authentication Context v2 binds the exact active Credential version. Workload
  authorization and Human sessions fail immediately after Credential rotation;
  reviewed Human OIDC clients can serve multiple distinct subjects and bind one
  Human identity to separate tenant credentials without weakening unique
  workload-client binding inside a tenant.
- `modules/persistence` accepts source `verified_authentication` only when the
  exact branded Authentication Context matches Tenant, Actor, and policy values.
- ADR-018 records the boundary and explains why OIDC `nonce` and OAuth `cnf` are
  profile security fields rather than business authorization claims.

The foundation is intentionally not wired to `apps/api` or `ipo.one`. Durable
credential/session/replay/event repositories are DATA-003 work. AUTHZ-001 now
provides the local membership, route, capability, ownership, AccessGrant,
revalidation, and non-enumerating error contracts; durable command composition,
approval issuance, abuse controls, and deployment remain follow-on work.

## Security Checklist

- [x] SECURITY-001 approval record is linked.
- [x] OIDC, OAuth, DPoP/private-key/mTLS profiles match the approved decision.
- [x] Token/session schemas are closed and size-bounded.
- [x] Issuer, audience, algorithms, redirect URIs, and key sources are pinned.
- [x] Session fixation, CSRF, replay, key rotation, and revocation are tested.
- [x] Privileged actions require recent phishing-resistant MFA.
- [x] External roles never map directly to runtime capabilities.
- [x] No raw credential or private key is committed or logged.
- [x] Production IdP and credentials remain separate deployment approvals.
