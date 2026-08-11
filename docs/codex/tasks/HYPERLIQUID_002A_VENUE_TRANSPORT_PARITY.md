# HYPERLIQUID-002A — Local Venue Transport Parity

## Context

HYPERLIQUID-002 established the local, offline HyperCore venue adapter boundary. Founder approval now permits exposing that boundary through the existing Tenant Protocol, AuthZ, abuse-control, OpenAPI, TypeScript SDK, and local MCP surfaces.

## Scope

- Register the eight canonical `venue*` operations in the versioned Tenant Protocol.
- Apply explicit Human/Agent capabilities, ownership, MFA, idempotency, and quota classes.
- Route every transport through the same Tenant command/query handlers.
- Publish matching OpenAPI, TypeScript SDK, local MCP, and conformance fixtures.
- Keep delegate activation, external revocation, and Exchange submission fail-closed.

## Non-goals

- No `approveAgent`, API wallet creation, credential handling, official Hyperliquid signing, external request, Testnet write, deployment, production permission, or funds movement.
- No remote MCP/A2A activation and no transport-specific business logic.
- No persistence migration or live Venue application composition.

## Likely files

- `packages/api-contract/`, `api/tenant-protocol/`, `schemas/v2/tenant-protocol-*`
- `modules/authorization/`, `modules/abuse-control/`, `modules/tenant-command-gateway/`
- `apps/tenant-api/`, `packages/sdk/`, `apps/agent-mcp/`
- `scripts/check-tenant-protocol.mjs`

## Acceptance criteria

1. Tenant catalog, AuthZ, abuse policy, Gateway, OpenAPI, SDK, and MCP expose the same ordered eight-operation family.
2. All operations remain private, local/no-funds, and carry `fundsAuthority: false`.
3. Delegate lifecycle mutations require a Human Principal Controller and recent MFA; an Agent cannot mint, activate, or revoke a delegate.
4. Agent execution is limited to discovery/read/prepare/submit guards under owned resources.
5. Activation and submission remain disabled and return explicit fail-closed errors.
6. Valid/invalid conformance fixtures and cross-transport tests pass.

## Test commands

- `pnpm run check:tenant-protocol`
- `pnpm run check:schemas`
- `pnpm run check:openapi`
- targeted Venue AuthZ/Gateway/SDK/MCP/transport tests
- `pnpm test`

## Security checklist

- [ ] Unknown operations and unknown fields fail closed.
- [ ] Cross-tenant resources remain denied by canonical AuthZ.
- [ ] Agent delegate administration is denied.
- [ ] Recent MFA gates Human delegate administration.
- [ ] No raw key, credential, signature, or raw Venue payload is accepted.
- [ ] External activation, revocation, and Exchange submission remain disabled.
- [ ] Every transport invokes the same Tenant Protocol operation.

## Permission boundary

Founder-approved: local L0 no-funds permission and data scope for Venue Tenant Protocol, AuthZ, OpenAPI, TypeScript SDK, and MCP parity only. All external or value-bearing capability remains separately gated.

## Migration impact

None. This issue adds contracts and local routing only.

## Rollback plan

Remove the Venue operation family from the catalog, schemas, AuthZ, abuse policy, Gateway composition, SDK, MCP, OpenAPI metadata, and fixtures. The underlying offline adapter remains inert.

## Completion Evidence

Record changed surfaces, test counts, explicit disabled controls, and the next external Testnet review gate under `docs/codex/audits/HYPERLIQUID-002A/`.
