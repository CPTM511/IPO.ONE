# IPO.ONE Local Tenant HTTP Adapter

This package is the approved TRANSPORT-001 loopback adapter for the private
Tenant protocol. It is not the anonymous public sandbox and it is not a
standalone production service.

The host application must inject:

- the durable `TenantCommandGateway`;
- the approved Human OIDC BFF session verifier;
- the Agent workload token plus DPoP/mTLS verifier;
- a trusted Network Context factory.

`createTenantHttpServer(...)` accepts only the `127.0.0.1`, `development` or
`test`, `local_test`, and `trustProxy = false` profile. Directly executing
`src/server.js` intentionally exits with `tenant_api_composition_required`
instead of creating mock identity or credentials.

`createTenantPilotHost(...)` is the named local composition for an embedding
application that already owns those approved dependencies. Its closed input
accepts only the Gateway, Human BFF session verifier, Agent workload verifier,
trusted Network Context factory, per-session CSRF bootstrap provider, and
bounded local clock/port/mTLS hooks. It fixes host, proxy trust, environment,
credential source, web asset allowlist, and authentication resolver internally;
callers cannot select a public or production profile.

Routes are limited to:

- `POST /tenant/v1/operations`;
- `GET /tenant/v1/catalog`;
- `GET /tenant/v1/healthz`.

An embedding application may additionally inject
`createHumanAccessRouteHandler(...)`. It composes the reviewed Human OIDC/SIWE
primitives at `/auth/v1/*`: provider discovery, OIDC initiation/callback,
one-use wallet challenge/verification, and logout. The handler binds every OIDC
transaction to one configured provider, accepts only fixed same-origin
redirects, enforces Origin on wallet mutations, and serializes only Secure,
HttpOnly, host-only cookies. It adds no signup, Tenant/Actor selection, role,
Mandate, chain, or funds authority. The anonymous public sandbox does not inject
this handler and continues to advertise authentication as disabled.

For a closed PostgreSQL-backed pilot, use
`createPostgresHumanAccessComposition(...)`. The async factory verifies the
dedicated authentication-only database role and active Tenant-bound system
identity before constructing durable Credential, one-use transaction, session,
event, OIDC, SIWE, and route adapters. It accepts only reviewed provider objects,
numeric immutable Secret Manager version references, and pre-provisioned
Credentials. The factory also requires the branded result of
`loadAuthenticationRuntimeConfig(...)`; a caller-created lookalike cannot open
the deployment gate. It never reads secret values from ambient environment
variables, selects a Tenant from an HTTP request, enables signup, or grants
Mandate/funds authority.

The closed composition is not approved for hosted activation until its edge
binds OIDC initiation/callback and SIWE challenge/verification to the durable
credential-attempt admission profile plus reviewed WAF limits. Store capacity
is defense in depth, not a rate limiter; deploying these anonymous entry routes
without Tenant, Provider/account, and trusted-source limits is a release gate.

For the local Human pilot, a composition may inject
`createTenantWebAssetHandler()` into `createTenantHttpServer(...)`. This serves
only the fixed IPO.ONE shell asset allowlist (`/`, `index.html`, JavaScript,
CSS, icons, favicon, and manifest) from the same loopback origin. It does not
authenticate a user, add a business operation, expose credentials, or make the
private routes public; catalog and operation requests still require the
injected Human session or sender-constrained Agent verifier.

The fixed JavaScript allowlist includes every relative module imported by the
shell, including `agent-handoff-manifest.js`,
`agent-pilot-capability-manifest.js`, and Human workflow receipt builders. Transport conformance parses the
entry-module imports and fails if the module graph and allowlist drift.

Human BFF composition must pass a per-session `csrfTokenProvider` when creating
the web asset handler. The handler validates the 32-128 character base64url
token and injects it into the single fixed CSRF meta placeholder under
`cache-control: no-store` and `vary: cookie`. The browser sends it only in the
`x-csrf-token` header for same-origin private mutations. Without this bootstrap
the catalog may be readable, but every Human mutation remains disabled.

Run the adapter conformance tests with:

```sh
pnpm run test:transport
```

Public binding, production IdP credentials, proxy trust, TLS termination,
deployment, and real-funds authority require separate human approval.
