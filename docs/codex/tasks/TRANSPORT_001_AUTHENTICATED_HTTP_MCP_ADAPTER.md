# TRANSPORT-001: Authenticated HTTP and Agent MCP Adapter

Status: Approved by the project owner and implemented locally on 2026-07-15.
The HTTP profile remains loopback/test-only; remote MCP, public/private
deployment, production credentials, and real funds remain disabled.

## Context

The anonymous public sandbox exposes 21 demo OpenAPI operations, while the
durable Tenant Gateway exposes 17 closed local in-process operations. The two
surfaces intentionally have different trust boundaries. Product Charter v1.1
requires a Human-friendly application and Agent-friendly API/MCP entry over the
same durable protocol, without treating sandbox session IDs or request payloads
as authentication.

AUTHN-001 already provides provider-neutral Human OIDC BFF and Agent workload
token/DPoP verification contracts. AUTHZ-001, ABUSE-001, APPROVAL-001, and
API-002 provide authorization, admission, dual-control, and closed protocol
contracts. None of those modules is wired to a listener or MCP runtime.

## Approved Three-Part Permission Change

### 1. Enable a loopback-only authenticated Tenant HTTP adapter

- Add a separate `apps/tenant-api` runtime; do not add private operations to
  the anonymous `apps/api` server.
- Bind only to `127.0.0.1` in the initial profile and fail startup if a public
  host, proxy trust, production mode, or non-test IdP/credential source is
  requested.
- Accept one closed transport-neutral Tenant protocol envelope per request.
- Human requests derive Authentication Context from the approved OIDC BFF
  session and CSRF boundary. Agent requests derive it from a verified,
  audience-bound, sender-constrained workload token.
- Inject trusted Network Context inside the adapter. Tenant, Actor, roles,
  Credential, authorization, and network facts remain prohibited request
  fields.

Initial route shape:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/tenant/v1/operations` | Execute one catalog operation |
| `GET` | `/tenant/v1/catalog` | Return the non-authorizing filtered catalog |
| `GET` | `/tenant/v1/healthz` | Loopback readiness only |

The adapter returns versioned Tenant protocol results or bounded RFC 9457
Problem Details with request correlation. It grants no new business capability.

### 2. Enable a local stdio Agent MCP adapter with four self-owned tools

- Add a separate `apps/agent-mcp` stdio process. No HTTP/SSE listener, remote
  MCP endpoint, A2A network server, dynamic tool loading, shell execution, file
  access, or arbitrary URL fetch is enabled.
- Inject the verified Agent Authentication Context out of band; credentials are
  never MCP tool arguments, model context, output, logs, or Evidence.
- Publish only the Agent operations already allowed by the authorization
  registry, plus CREDIT-001D after its separate approval:

| MCP tool | Tenant operation | Availability |
| --- | --- | --- |
| `ipo_one_read_self` | `pilotReadAgentSelf` | Existing |
| `ipo_one_request_credit` | `pilotRequestCredit` | Existing |
| `ipo_one_read_credit_application` | `pilotReadCreditApplication` | Existing |
| `ipo_one_evaluate_credit_application` | `pilotEvaluateCreditApplication` | Requires CREDIT-001D |

- Tool schemas are generated from or conformance-checked against the same
  Tenant request/result contracts. MCP descriptions and maturity labels are
  non-authorizing metadata.
- The adapter cannot invoke Human, Operator, Risk, Auditor, Mandate-management,
  freeze, or Tenant-wide operations for an Agent Actor.

### 3. Approve transport availability metadata and conformance gates

- Expand the catalog availability model to distinguish
  `local_in_process`, `authenticated_http_loopback`, and `mcp_stdio_local`.
- Keep `publicEndpointEnabled = false`, production credential provisioning
  disabled, and deployment approval false.
- Add exact adapter/operation/Actor/capability parity checks so an operation
  cannot appear in HTTP or MCP unless the authorization registry, abuse policy,
  handler, schema, fixture, and adapter allowlist all agree.
- Add cross-transport golden tests proving local client, HTTP, and MCP return
  the same normalized result and stable error code for the same authenticated
  operation.

## Implemented Scope

- Implement the loopback Tenant HTTP adapter and local stdio MCP adapter.
- Compose existing Human session and Agent workload authentication verifiers
  into trusted adapter-owned Authentication Context.
- Add closed HTTP and MCP envelopes, result/problem mapping, size/depth/time
  limits, cancellation, concurrency, rate limits, and graceful shutdown.
- Add filtered catalog and capability-maturity discovery.
- Add conformance fixtures and end-to-end tests for Human and Agent entry.
- Document local developer setup without embedding credentials or private keys.
- Expose a non-authorizing browser handoff manifest after Principal-controlled
  Mandate activation. It may contain exact owned identifiers, hashes, bounded
  authority, and the four tool/operation pairs, but no credential, endpoint
  authority, Tenant selection, or ambient transport secret.
- Provide a bounded stdin-only developer preflight that validates one ready
  handoff and emits the first local `ipo_one_read_self` JSON-RPC call plan.
  Host authentication composition remains out of band and mandatory.
- Compose the existing four tools for a draft `application_ready` handoff
  through durable Decision/Offer. Preserve active `ready` as the later runtime
  phase and reject attempts to use it for a new application.
- Expose `createTenantPilotHost(...)` as the closed local embedding composition
  for Gateway, Human BFF session verification, Agent workload verification,
  trusted Network Context, CSRF bootstrap, and the fixed Human UI asset graph.
  The composition cannot add login routes or select public/production settings.
- Expose `createAgentPilotHost(...)` as the closed local stdio composition for
  Gateway, a Host-owned Agent authenticator, trusted Network Context, the exact
  handoff Subject, and the existing four-tool MCP Host. It re-authenticates
  every protocol command and cannot accept credentials or caller authority.

## Non-Goals

- No public route, DNS, TLS certificate, cloud load balancer, production IdP,
  production OAuth client, long-lived API key, browser bearer token, shared
  client secret, production Agent credential, remote MCP/SSE, A2A network
  endpoint, webhook, Provider worker, deployment, mainnet, real funds, or
  production lending authority.
- No new protocol capability, role inheritance, broad read, object enumeration,
  Mandate activation, Offer acceptance, Obligation, execution, payment, or
  withdrawal merely because a transport exists.
- No caller-supplied Authentication Context or network trust.

## Likely Files

- `apps/tenant-api/*`
- `apps/agent-mcp/*`
- `modules/authentication/*`
- `modules/tenant-command-gateway/*`
- `packages/api-contract/*`
- `api/tenant-protocol/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `security/test/*`
- `scripts/check-tenant-protocol.mjs`
- `docs/architecture/ADR-031-authenticated-transport-adapters.md`

## Acceptance Evidence

- [x] Human session and Agent workload authentication create the exact existing
  branded Authentication Context; request bodies cannot influence it.
- [x] Loopback HTTP and local MCP invoke the same Gateway and return the same
  normalized result/replay as local in-process clients.
- [x] MCP exposes only the four reviewed Agent self-owned tools; the evaluation
  tool is present because CREDIT-001D is now implemented and authorized.
- [x] Wrong Actor type, Tenant, audience, sender constraint, credential state,
  origin/CSRF, operation, resource, schema, idempotency, payload size, timeout,
  and rate limit fail before business commit.
- [x] Tool catalog, handler, AuthZ, abuse, schema, fixture, and adapter allowlist
  parity is exact and CI-enforced.
- [x] Public sandbox source, routes, discovery, OpenAPI, and deployment profile
  remain separate and import no durable Tenant Gateway runtime.
- [x] Logs, traces, errors, tool output, Evidence, and fixtures contain no raw
  token, cookie, DPoP proof, signature, secret, key, or PII.
- [x] The Agent API UI distinguishes 21 public demo operations, 17 private
  Tenant operations, and four local MCP tools; its copied handoff is explicitly
  non-authorizing, local-stdio-only, credential-free, remote-disabled, and
  funds-disabled.
- [x] The copied packet now conforms to the closed
  `agent_handoff_manifest.v1` JSON Schema. Valid/invalid fixtures, immutable UI
  construction, and CI parity against the four-tool MCP registry prevent
  browser/runtime drift.
- [x] `pnpm run agent:handoff:plan` consumes strict bounded stdin and emits a
  minimal `agent_handoff_call_plan.v1` without echoing hashes, capabilities,
  limits, credentials, validator internals, or transport authority.
- [x] The four-tool application workflow derives exact draft Mandate authority,
  persists one replay-safe Agent Intent/Decision/Offer through PostgreSQL, and
  does not allow an active runtime handoff to start a new application.
- [x] The named local Tenant Pilot Host loads the complete Human browser module
  graph and executes authenticated catalog/Human operations without a caller
  authority field; transport conformance fails if a relative module is absent
  from the fixed asset allowlist.
- [x] The named Agent Pilot Host binds each freshly authenticated Agent to the
  exact handoff Subject, executes the four-step application-to-Offer workflow,
  and serves the same bounded tool path over real local stdio without adding a
  credential loader or listener.

## Approval Gate

- [x] Approve the separate loopback-only authenticated `apps/tenant-api`
  adapter over the existing Tenant protocol.
- [x] Approve the local stdio `apps/agent-mcp` adapter with exactly the four
  Agent self-owned tools listed above and no remote MCP/A2A listener.
- [x] Approve the catalog availability expansion and cross-transport
  conformance/security gates while keeping public endpoint, production
  credentials, deployment, and real funds disabled.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run test:transport
git diff --check
```

## Security Checklist

- [x] Transport creates no capability and cannot widen Actor/resource scope.
- [x] Human CSRF/session and Agent token/sender constraints fail closed before
  Tenant resolution.
- [x] Requests/results, catalog entries, errors, timeouts, bytes, depth,
  concurrency, rate, and cancellation are closed and bounded.
- [x] MCP has no ambient filesystem, shell, browser, arbitrary network, secret,
  or dynamic-tool authority.
- [x] Public sandbox and production deployment remain unchanged.
