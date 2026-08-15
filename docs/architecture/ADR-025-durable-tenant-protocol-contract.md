# ADR-025: Durable Tenant Protocol Contract and Conformance

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

The durable Tenant Command Gateway is the shared application protocol for Human
and Agent callers, but its contract currently exists only in handler code and
client method conventions. The anonymous public demo OpenAPI cannot be reused:
it has no production authentication and intentionally represents process-local
synthetic state. Treating that document as the durable protocol would collapse
two different trust boundaries.

A future Human BFF, workload API, CLI, MCP/A2A adapter, or partner SDK needs one
transport-neutral request/result model. That model must not let a caller submit
Authentication Context or other authorization facts, and handler output must be
validated before durable state commits.

## Decision

1. Define `tenant_protocol_request.v1`, `tenant_protocol_result.v1`, and
   `tenant_protocol_catalog.v1` as closed JSON Schema 2020-12 contracts.
2. The caller request contains only operation data, object reference, reason,
   idempotency, correlation, bounded retry intent, and schema version.
   Authentication Context and trusted network context are transport-adapter
   inputs and are never request-body authority.
3. Every current operation has one exact request branch. Commands require an
   idempotency key; queries reject one. Unused resource, reason, and command
   fields are rejected rather than ignored.
4. Every current operation has one exact response branch. The Gateway validates
   a planned command response before committing it and validates query/replay
   responses before returning them. Runtime output is normalized through strict
   JSON semantics first; unsupported values, cycles, sparse arrays, non-finite
   numbers, and non-plain objects fail closed.
5. The published operation catalog records compatibility and availability but
   grants no authority. Handler, authorization, abuse-control, catalog, and
   fixture parity are enforced by one repository check.
6. Schema validation uses the pinned Ajv runtime against the published files,
   with coercion, default injection, additional-field removal, and remote schema
   fetching disabled. Validation never mutates client data.
7. Schema versions are exact. A shape change requires a new version; unknown
   versions fail closed. Old production versions may be deprecated only through
   a reviewed catalog update and the stated compatibility window.
8. The only enabled transport profile remains local in-process non-funds.
   Authenticated HTTP, MCP/A2A, and public access remain disabled deployment
   capabilities until their separate identity and operations gates are met.
9. The existing anonymous demo OpenAPI and `ipo.one` routes remain unchanged.
10. No Mandate activation, signature, account proof, Provider execution,
    credit, payment, custody, chain transaction, KYC/KYP, Human lending,
    deployment, or real funds are authorized by this decision.

## Consequences

- Human and Agent adapters share a language-neutral contract without sharing
  authentication mechanisms.
- Integration drift is detected before release and malformed requests are
  rejected before consuming object-resolution or authorization work.
- Invalid handler output cannot become durable committed state.
- Adding a private transport becomes an adapter task rather than a protocol
  rewrite, while its production identity and deployment gates remain explicit.

## Verification

- Schema and fixture tests cover all valid operations and representative
  authority, version, idempotency, resource, field, and activation failures.
- PostgreSQL tests prove invalid handler output rolls back atomically and exact
  replay remains compatible.
- Security tests prove caller authority fields and public Gateway exposure stay
  absent.
- Full schema, policy, unit, security, PostgreSQL, API smoke, demo, dependency,
  and repository checks run under Node.js 24.18.0.
