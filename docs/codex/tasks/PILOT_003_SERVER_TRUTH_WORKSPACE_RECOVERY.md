# PILOT-003 — Server-truth workspace recovery

Status: Implemented locally

## Context

The private no-funds lifecycle persisted its product state in PostgreSQL, but
the Human and Principal workspaces still needed browser-held opaque identifiers
to resume that state. A closed design-partner pilot must survive browser storage
loss without adding list, search, discovery, or cross-Actor access.

## Scope

- add one read-only Human operation that derives Tenant and Actor only from the
  verified Authentication Context;
- return a bounded set of active Subject, Consent, Credit Intent, Mandate, and
  Obligation resource references already bound to that Actor;
- distinguish the fixed Borrower and Principal Controller workspace shapes;
- restore the Human Subject/Consent/owned Obligation and Principal Agent
  Subject/Mandate through existing exact-resource reads;
- keep local browser storage as a convenience cache, not product truth;
- align catalog, schema, conformance, client, authorization, abuse-control, UI,
  tests, and commercialization status.

## Non-goals

- resource list, search, pagination UI, arbitrary discovery, or cross-Actor
  delegation;
- Risk, Auditor, Agent Runtime, Worker, Provider, or MCP access;
- raw KYC/PII, credentials, claims, Evidence payloads, or economics in the
  recovery result;
- remote transport, production identity, deployment, backup/DR, funds, or
  production approval.

## Likely files

- `modules/tenant-command-gateway/src/workspace-resume-handlers.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/authorization/src/authorization-constants.js`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`
- `apps/web/src/app.js`

## Acceptance criteria

- the request payload is exactly empty and cannot supply Tenant, Actor, role,
  relationship, resource type, or identifier;
- the query uses the authenticated Tenant and Actor, active authorization
  bindings, active resources, a fixed type allowlist, and a 32-row cap;
- exactly one approved Human role selects the response shape; ambiguous and
  unsupported roles fail closed;
- returned rows are closed, validated, PII-free resource references;
- Human and Principal workspaces recover after local/session storage is cleared;
- the Risk workspace remains connected and receives no recovery authority;
- no public route, Agent MCP tool, mutation, Event, funds action, or new
  production permission is introduced.

## Test command

```sh
node --test modules/tenant-command-gateway/test/workspace-resume-handlers.test.js
pnpm run check:tenant-protocol
pnpm run check
```

## Security checklist

- [x] Tenant and Actor are trusted-context only.
- [x] Query is Actor-bound, active-only, fixed-type, deterministic, and capped.
- [x] No caller-selected scope, list/search filter, cursor, or relationship.
- [x] Result contains no raw PII, KYC, credentials, claims, or payloads.
- [x] Existing exact-resource authorization still gates hydration reads.
- [x] Risk, Agent, Provider, Worker, public API, and MCP surfaces are excluded.
- [x] No real funds, remote access, or production authority is enabled.
