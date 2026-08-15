# TRANSPORT-001F: Authenticated Human Pilot Host Composition

Status: Completed locally on 2026-07-16 under the project-owner-approved TRANSPORT-001,
HUMAN-001C, CREDIT-001D, and HUMAN-001D boundaries. This task composes existing
adapters and fixes the Tenant web module dependency closure; it creates no new
operation, role, capability, identity authority, public endpoint, deployment,
or funds authority.

## Context

The loopback Tenant HTTP adapter, Human OIDC BFF verifier, Agent workload
verifier, fixed web asset handler, and durable Gateway exist independently.
There is no named factory that wires them into one bounded local Human pilot
Host. Direct execution still exits with `tenant_api_composition_required`.

The Human Receipt increment also added a relative browser import for
`human-credit-offer-workflow-receipt.js`, but the Tenant web asset allowlist
does not serve that file. The public sandbox can still render it through its
separate server, while the authenticated Tenant Host fails the module graph at
runtime.

## Scope

- Add one `createTenantPilotHost(...)` composition factory that accepts only
  the existing Gateway, Human BFF session verifier, Agent workload verifier,
  trusted Network Context factory, per-session CSRF bootstrap provider, and
  bounded local port/clock/mTLS hooks.
- Fix the fixed Tenant web asset allowlist to serve the Human Receipt module.
- Keep the Listener fixed to `127.0.0.1`, development, `local_test`, no proxy
  trust, and the existing three Tenant routes.
- Add an end-to-end loopback test proving one Human cookie/CSRF session can load
  the complete UI module graph, read the authenticated catalog, and execute an
  existing Human query without caller-supplied authority.
- Add CI checks that every relative module imported by `app.js` is present in
  the fixed allowlist.

## Non-Goals

- No OIDC login, callback, token exchange, logout, or session-issuance HTTP
  route. The approved OIDC callback contract requires HTTPS; weakening it for
  the HTTP loopback listener is prohibited.
- No production IdP/client, TLS, proxy, DNS, deployment, public/private remote
  endpoint, bearer token in the browser, raw session/CSRF output, or credential
  storage.
- No identity proof, Subject activation, Offer acceptance, Obligation,
  execution, repayment, servicing, or real funds.

## Likely Files

- `apps/tenant-api/src/tenant-pilot-host.js`
- `apps/tenant-api/src/index.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/tenant-api/README.md`
- `security/test/gateway-security.test.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] The named factory composes the exact existing Human, Agent, CSRF,
  Network Context, Gateway, and web asset boundaries without accepting caller
  authority or credentials in its configuration.
- [x] Host configuration is closed and cannot select a public host,
  production environment, proxy trust, or remote credential source.
- [x] The authenticated Tenant shell loads every relative browser module,
  including the Human Workflow Receipt implementation.
- [x] Human catalog and operation calls derive Authentication Context only from
  the injected BFF session verifier and preserve exact origin/CSRF inputs.
- [x] Static assets create no Authentication Context and cannot reach the
  Gateway.
- [x] Full, transport, security, and browser module-loading checks pass.

## Test Commands

```sh
pnpm run test:transport
pnpm run test:security
pnpm run check
git diff --check
```

## Security Checklist

- [x] No cookie, CSRF token, access token, DPoP proof, Authentication Context,
  raw PII, private key, or secret is logged, returned in a Receipt, or embedded
  in static JavaScript.
- [x] Relative module serving remains a fixed allowlist; no caller path becomes
  a filesystem path.
- [x] Human and Agent authentication remain mutually exclusive and out of band.
- [x] Existing size, depth, timeout, concurrency, request, result, and Problem
  Details boundaries remain unchanged.
- [x] Public sandbox, remote MCP, production identity, deployment, and real
  funds remain disabled.

## Verification Evidence

- `pnpm run test:transport`: 19/19. The named Host serves the complete fixed
  module graph, injects the session CSRF bootstrap, authenticates catalog and
  Human self-read through the BFF resolver, and never passes caller authority.
- `pnpm run test:security`: 21/21. Static checks lock the Host to
  `127.0.0.1`, development, `local_test`, no proxy trust, and reject unknown
  configuration such as `accessToken`.
- `pnpm run check`: 217/217 with 34 schemas and all policy/contract drift gates.
- Real in-app browser navigation to a temporary `createTenantPilotHost` at
  `127.0.0.1:3011` executed `app.js`, changed connection state from its static
  initial value, rendered the Human Receipt control, produced no browser logs,
  and had `scrollWidth === innerWidth` at 1280px.
- The temporary Host was terminated after QA. Node 26.0.0 emitted the expected
  engine warning; the release baseline remains Node 24.18.x.
