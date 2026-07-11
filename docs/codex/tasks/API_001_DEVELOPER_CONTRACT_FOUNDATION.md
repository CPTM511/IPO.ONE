# API-001: Developer Contract Foundation

Status: Complete for the local sandbox surface (2026-07-11). This issue does
not authorize production authentication,
fund movement, deployment, or external provider execution.

## Context

The Product Charter positions V1 as an Agent Credit Network with a Developer
SDK, provider integrations, webhooks, and repeatable commercial onboarding. The
MVP Build Spec requires versioned OpenAPI, request validation, stable errors,
and typed client access. The current public demo has working HTTP routes but no
machine-readable API contract, stable problem format, request correlation, or
SDK boundary.

This issue is the first deliverable in the proposed V0.3 Pilot-Ready Control
Plane. It makes the existing demo API explicit and testable without claiming
that AuthN, tenant isolation, rate limits, durable command idempotency, or
production operations already exist.

## Scope

- Publish an OpenAPI 3.1.2 JSON contract for every current public MVP route.
- Mark the API and every money-adjacent surface as sandbox/demo-only.
- Add stable request IDs to success and error responses.
- Return RFC 9457-compatible `application/problem+json` errors with stable
  machine codes and no stack traces or database details.
- Add a zero-runtime-dependency JavaScript SDK with TypeScript declarations for
  the current Agent Lockbox workflow.
- Add OpenAPI/route parity checks, SDK unit tests, problem-contract tests, and
  negative API smoke assertions.
- Update the project truth documents and commercialization roadmap.

## Non-Goals

- No production AuthN, OAuth/OIDC provider, API-key issuance, tenant model,
  RBAC, rate limiter, billing, or entitlement system.
- No claim of HTTP command idempotency until a durable command gateway exists.
- No real provider, webhook, x402 facilitator, wallet custody, on/off-ramp,
  stablecoin, contract, or fund movement.
- No production deployment, secret, domain, certificate, or external account.
- No new production dependency or code generator.
- No Human credit execution or raw KYC/PII.

## Likely Files

- `api/openapi/ipo-one.v1.json`
- `packages/api-contract/*`
- `packages/sdk/*`
- `apps/api/src/server.js`
- `scripts/check-openapi.mjs`
- `scripts/smoke-api.mjs`
- `package.json`
- `README.md`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`

## Acceptance Criteria

- The OpenAPI document parses as JSON, declares 3.1.2, uses JSON Schema
  2020-12, and documents every route implemented by the API server.
- Every operation has a unique `operationId`, explicit success response,
  Problem Details error response, request-ID header, and demo maturity marker.
- Unknown API routes, invalid JSON, oversized bodies, domain conflicts, and
  unexpected failures map to stable HTTP status and Problem Details surfaces.
- Generic server failures never expose stack traces, SQL, filesystem paths, or
  raw internal error messages.
- SDK clients encode path parameters, support injected `fetch`, expose request
  IDs, parse Problem Details, and never retry mutating requests automatically.
- OpenAPI checks, SDK tests, API contract tests, existing tests, demo, and API
  smoke all pass.

## Test Commands

```sh
pnpm run check
pnpm run smoke:api
pnpm run demo
```

## Security Checklist

- [x] No credential, token, secret, private key, raw signature, or PII fixture.
- [x] Errors expose stable client guidance but not implementation internals.
- [x] SDK performs no automatic mutation retry or hidden network call.
- [x] SDK rejects base URLs containing credentials.
- [x] OpenAPI does not advertise unimplemented AuthN, idempotency, or funds.
- [x] Request IDs are bounded and sanitized before reflection.
- [x] Sandbox and no-real-funds boundaries are explicit in contract and docs.
- [x] Auth/RBAC/tenant/rate-limit design remains a separate human-reviewed issue.

## Verification Record

- `pnpm run check`: passed; 8 schemas, 21 OpenAPI paths/operations, 2 ordered
  migration pairs, and 72 database-free tests.
- `pnpm run smoke:api`: passed against the live local server through the SDK,
  including stable precondition, unknown-route, invalid-JSON, and request-ID
  failure cases.
- `pnpm run demo`: passed with a settled sandbox transfer, finalized settlement,
  fully repaid obligation, balanced ledger, and replayable Rail aggregate.
- `pnpm audit --prod`: no known production dependency vulnerabilities reported
  by the npm advisory service on 2026-07-11.
