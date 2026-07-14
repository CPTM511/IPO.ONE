# API-002: Durable Tenant Protocol Contract and Conformance

Status: Complete locally under the approved SECURITY-001 non-funds boundary.
This task is stacked on DATA-003B and does not expose the authenticated Tenant
Gateway on the public sandbox.

## Context

DATA-003 now provides one durable transaction protocol for Human and Agent
clients, but its five reviewed operations are represented only by JavaScript
handler conventions. The public OpenAPI describes a different anonymous demo
surface. Without a language-neutral private-protocol contract, runtime schema
enforcement, and conformance fixtures, an HTTP, MCP/A2A, CLI, or partner SDK
adapter could drift from the Gateway or accidentally accept caller-supplied
identity authority.

The Product Charter requires versioned machine-readable schemas and reusable
Human/Agent integrations. The Commercialization Roadmap explicitly records
authenticated runtime schema enforcement and compatibility policy as remaining
DATA-003 work. This issue closes that contract gap without creating a public
authenticated endpoint or granting new business authority.

## Scope

- Publish closed JSON Schema 2020-12 contracts for the Tenant protocol request,
  result, and operation catalog.
- Publish a machine-readable catalog for the five implemented operations with
  Actor type, resource type, capability, idempotency, request/result version,
  transport availability, and safety metadata.
- Require an explicit request schema version and bind it into durable command
  identity.
- Compile the published schemas with a pinned validator and enforce them at the
  Gateway before admission/authorization and before a handler response can be
  committed.
- Keep Authentication Context and trusted network facts outside the caller
  request contract. Human BFF and Agent workload adapters inject those facts
  only after request conformance succeeds.
- Add TypeScript declarations and transport-neutral JSON conformance fixtures
  for every implemented request and result plus representative fail-closed
  cases.
- Add a repository gate that proves handler, authorization, abuse-control,
  catalog, schema, fixture, and public-sandbox boundaries remain aligned.

## Non-Goals

- No public or private HTTP route, OAuth/OIDC endpoint, MCP server, A2A server,
  API key, production Credential provisioning, or production Tenant runtime.
- No Mandate activation, signature, account proof, Provider execution, credit,
  payment, custody, chain transaction, KYC/KYP, Human lending, or real funds.
- No change to operation permissions, role bundles, risk controls, public demo
  OpenAPI, cloud resources, DNS, or deployed `ipo.one` behavior.
- No claim that a published schema is production authorization or deployment
  approval.

## Likely Files

- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`
- `packages/api-contract/*`
- `modules/tenant-command-gateway/src/*`
- `modules/tenant-command-gateway/test*/*`
- `scripts/check-tenant-protocol.mjs`
- `package.json`, `pnpm-lock.yaml`, and versioned guidance/security documents

## Acceptance Criteria

- Every implemented Gateway operation has exactly one catalog entry and exactly
  one closed request/result contract.
- Valid Human and Agent fixtures pass the published schemas; unknown operation,
  unknown field, wrong resource, missing command idempotency, query idempotency,
  activation attempt, and caller-supplied authority fixtures fail.
- The Gateway rejects an invalid request before admission or object lookup.
- A handler response that violates the operation result contract rolls back the
  entire business command, Event, Evidence, projection, resource, execution,
  and audit transaction; admission reservations are released and a bounded
  failed admission record remains for abuse accounting.
- Exact replay remains valid and returns the same versioned result.
- Catalog metadata matches handler kind, authorization Actor/capability/resource
  policy, and ABUSE-001 classification in a repository-wide check.
- The public sandbox still imports no durable Gateway and advertises no private
  authenticated endpoint.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] Caller contract excludes Authentication Context, Tenant, Actor, client,
  Credential, roles, authorization capabilities/decisions, and network trust.
  Closed Mandate capability scope remains operation data, never Actor authority.
- [x] Requests and results are closed, bounded, versioned, and mutation-free
  during validation.
- [x] Unknown operations, fields, schema versions, resources, and result shapes
  fail closed with no validator internals exposed.
- [x] Commands require idempotency; queries prohibit it.
- [x] Runtime validation occurs before authorization side effects and before
  business response commit.
- [x] No schema or fixture contains secrets, signatures, raw account proofs,
  KYC data, PII, or production endpoints.
- [x] Public sandbox, AUTH-002, production identity, deployment, and real-value
  gates remain unchanged.

## Verification Record

- `pnpm run check`: 161 unit and contract tests pass.
- `pnpm run test:security`: 19 adversarial tests pass.
- `pnpm run test:postgres`: 43 PostgreSQL 17 tests pass, including 26 focused
  Tenant Gateway transaction, isolation, replay, race, and capacity cases.
- Live API smoke reaches settled transfer and fully repaid obligation state;
  demo Ledger remains balanced.
- Frozen install passes supply-chain policy; `pnpm audit --prod` reports no
  known vulnerabilities; secret scan and `git diff --check` pass.
