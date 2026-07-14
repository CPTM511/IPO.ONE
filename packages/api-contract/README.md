# API Contract Package

Defines two authority-free API contract layers:

- transport-level request correlation and RFC 9457-compatible Problem Details
  for the anonymous public sandbox; and
- the closed, transport-neutral `tenant_protocol_request.v1`,
  `tenant_protocol_result.v1`, and `tenant_protocol_catalog.v1` contracts for
  the six reviewed local durable Tenant operations, including the one-way
  protective Agent Subject freeze.

The Tenant protocol validator uses pinned Ajv with strict schemas, no type
coercion, defaults, additional-field removal, or remote schema loading. Human,
Operator, and Agent clients validate caller data before a trusted adapter injects
Authentication Context or network facts. The Gateway validates results before
a command can commit. The catalog and TypeScript declarations grant no
authentication, authorization, tenant, billing, deployment, or fund-movement
behavior.

Unknown server failures are deliberately redacted. Domain errors retain stable
machine codes and client-actionable descriptions without exposing stacks,
database errors, filesystem paths, or secrets. Approved admission errors may
add only the closed `manual`, `short`, or `long` retry class; configured limits,
Tenant utilization, object existence, and infrastructure topology are never
serialized.

Run catalog, handler, policy, fixture, and public-boundary conformance with
`pnpm run check:tenant-protocol`.
