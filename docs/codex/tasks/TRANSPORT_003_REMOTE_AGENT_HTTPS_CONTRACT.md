# TRANSPORT-003 — Remote Agent HTTPS contract and conformance client

Status: Implemented locally; remote participant access and deployment remain
disabled

## Context

`AUTHN-005` provides invite-bound Human and Agent credential lifecycle
contracts without issuing an external credential. `DEPLOY-001` selects a
same-origin protected private runtime but keeps ingress and launch disabled.
The next L0/L1 boundary is to publish the exact remote Agent HTTPS contract and
prove a client against it without activating a hosted endpoint.

The existing production Host, PostgreSQL runtime, workload verifier, and
minimal mTLS client are reused. This issue closes contract, correlation,
idempotency, and unknown-outcome semantics; it does not create another
application protocol.

## Scope

- Publish a checked-in OpenAPI 3.1.2 contract for the canonical
  `tenant_protocol_request.v1` and `tenant_protocol_result.v1` envelopes.
- Require an issuer/audience-bound short-lived workload JWT together with
  trusted mTLS sender binding.
- Publish the same Agent contract from the protected production Host.
- Provide a Node Agent conformance client that:
  - accepts credentials only through injected/file-backed adapters;
  - requires HTTPS, certificate validation, TLS 1.2 or newer, and mTLS;
  - validates request and result schemas;
  - binds the response request ID and operation ID to the exact request;
  - distinguishes known Problem Details from an unknown transport outcome; and
  - never automatically retries an unknown economic command with a new
    idempotency key.
- Add static drift checks and transport tests to the repository quality gate.

## Non-goals

- No hosted deployment, DNS, edge activation, public listener, remote
  participant access, credential issuance, IdP/vendor activation, or Secret
  Manager mutation.
- No browser-visible workload token, bearer-only Agent profile, shared Agent
  credential, caller-selected Tenant/Actor/role/capability, or credential in a
  manifest.
- No remote MCP/A2A listener.
- No Provider production callback, Hyperliquid signed action, venue signer,
  testnet write, mainnet, withdrawal, custody, lending capital, or real funds.
- No new business operation, permission, Risk policy, limit, Facility state,
  or protocol state machine.
- No automatic retry after timeout, disconnect, malformed response, or response
  binding drift.

## Likely files

- `api/tenant-protocol/ipo-one.agent-https.v1.json`
- `apps/tenant-api/src/tenant-openapi.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/test/production-tenant-host.test.mjs`
- `packages/sdk/src/production-agent-client.js`
- `packages/sdk/production-agent-client.d.ts`
- `packages/sdk/test/production-agent-client.test.js`
- `scripts/check-agent-https-transport.mjs`
- `package.json`
- `deploy/closed-pilot/README.md`
- `docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md`

## Acceptance criteria

1. The checked-in Agent contract uses OpenAPI 3.1.2 and JSON Schema 2020-12,
   references the exact canonical Tenant request/result schemas, and advertises
   no new business operation.
2. Agent operation and catalog access require one security requirement
   containing both workload JWT and mutual TLS; bearer-only access is never
   advertised.
3. The contract fixes `POST /tenant/v1/operations`, stable Problem Details,
   `X-Request-ID`, exact-operation result binding, idempotency replay, and
   timeout-as-unknown semantics.
4. Every remote, funds, Human credit, testnet-write, signer, and arbitrary
   withdrawal safety flag remains false; the publication origin is
   non-routable and activation remains disabled.
5. The production Host publishes the reviewed Agent contract only after its
   existing HTTPS-origin and trusted-edge checks.
6. The conformance client rejects HTTP origins, credential-bearing URLs,
   malformed/expired/over-five-minute tokens, invalid requests, invalid
   results, mismatched request IDs, and mismatched operation IDs.
7. Known HTTP failures return bounded API error metadata. Timeout, disconnect,
   invalid success response, or response-binding drift return
   `outcome = unknown` and instruct mutation callers to replay the exact
   request with the same idempotency key or reconcile first.
8. The client performs no automatic retry and never writes a token,
   certificate, key, request payload, or private response to logs.
9. The closed-pilot topology remains `launchBlocked`, ingress/edge activation
   remains disabled, and remote participant access remains false.
10. Transport, static contract, repository, and PostgreSQL regression checks
    remain green.

## Test commands

```sh
pnpm run check:agent-https-transport
pnpm run test:transport
pnpm run check
pnpm run test:postgres
git diff --check
```

## Security checklist

- [x] Workload JWT and mTLS are an AND requirement.
- [x] The workload token lifetime is bounded to five minutes.
- [x] Tenant, Actor, role, capability, and trusted network facts remain
      server-derived.
- [x] Request and response bindings fail closed.
- [x] Unknown command outcomes cannot trigger a new automatic mutation.
- [x] No token, key, certificate, signature, PII, or raw authentication
      context enters the contract or error output.
- [x] No remote MCP, signer, withdrawal, testnet write, or real-funds authority
      was added.
- [x] Deployment and remote participant access remain disabled.

## Rollback

Remove the Agent-specific OpenAPI publication route, the checked-in contract,
the SDK subpath export, and the TRANSPORT-003 check while leaving the existing
loopback Host, Tenant protocol, PostgreSQL state, authentication records, and
business operations unchanged. No external endpoint or credential is activated
by this issue, so rollback requires no participant, signer, DNS, fund, or
database-state migration.
