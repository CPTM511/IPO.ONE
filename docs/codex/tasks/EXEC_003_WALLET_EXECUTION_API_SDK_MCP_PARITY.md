# EXEC-003 — Wallet Execution API / SDK / MCP Parity

Status: IMPLEMENTED_UNVERIFIED — Phase 2 Founder review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

ADR-038 reserves one canonical wallet operation family. EXEC-003 must expose
that family through the authenticated Tenant Protocol, loopback OpenAPI,
TypeScript SDK and local Agent MCP without duplicating authorization or
business logic. Browser state and transport-specific handlers are not product
truth.

## Scope

- catalog the nine canonical wallet operations from capability discovery
  through read/prepare/approve/submit/read execution;
- route each operation through Tenant Command Gateway handler contracts;
- expose the same operation IDs and closed inputs through loopback OpenAPI,
  TypeScript SDK and local Agent MCP;
- add conformance fixtures proving identical operation/resource/payload
  semantics across Tenant, HTTP, SDK and MCP;
- keep submit present but fail closed after all binding/staleness checks because
  transactions remain disabled in `L0_LOCAL_NO_FUNDS`.

## Non-goals

- no UI execution mutation surface;
- no remote MCP/A2A, public endpoint or hosted deployment;
- no wallet popup, signature, raw send, RPC/Provider call, transaction,
  UserOperation, venue action or funds movement;
- no transport-specific business rule or authorization bypass;
- no production numeric permission or new Risk/Operations authority.

## Likely files

- `packages/api-contract/src/tenant-protocol.js`
- `schemas/v2/tenant-protocol-catalog.schema.json`
- `modules/tenant-command-gateway/src/*`
- `modules/authorization/src/*`
- `modules/abuse-control/src/*`
- `apps/tenant-api/src/tenant-openapi.js`
- `packages/sdk/src/*`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- transport conformance tests and completion Evidence.

## Acceptance criteria

1. Tenant catalog contains the exact nine ADR-038 wallet operations with closed
   actor, capability, resource, idempotency and no-funds metadata.
2. Every operation resolves through the authenticated Tenant Command Gateway;
   no transport owns business logic.
3. OpenAPI, SDK and MCP use the exact same operation IDs and request semantics.
4. MCP/SDK inputs reject unknown fields and raw transaction envelopes.
5. Human Principal Controller retains grant mutation/approval authority; Agent
   may prepare/read owned execution within an active grant but cannot widen it.
6. Submission rechecks exact payload, receipt freshness and grant context, then
   remains disabled locally without invoking an adapter.
7. Authorization and abuse-control classification cover every new operation.
8. Conformance fixtures demonstrate parity and stable fail-closed behavior.

## Test commands

```bash
node --test \
  modules/tenant-command-gateway/test/wallet-execution-handlers.test.js \
  packages/sdk/test/wallet-execution-client.test.js \
  apps/agent-mcp/test/wallet-execution-mcp-adapter.test.js \
  apps/tenant-api/test/wallet-execution-transport-conformance.test.mjs
pnpm test
```

## Security checklist

- [x] All operations use existing authentication, AuthZ, admission and Tenant
      context boundaries.
- [x] Unknown fields/operations and reserved authority fields fail closed.
- [x] No raw transaction/calldata parameter is exposed to Agent/browser.
- [x] Submit is a non-authorizing, disabled local guard.
- [x] No remote endpoint, credential, signer, Testnet or funds authority exists.

## Permission boundary

The Founder authorized local no-funds API/SDK/MCP parity only. Catalog presence
and a submission method do not authorize an adapter call or economic effect.

## Migration impact

No additional migration beyond EXEC-002 is expected. Transport configuration
and catalogs are additive and local-only.

## Rollback plan

Remove the nine catalog/transport bindings and handlers together. EXEC-002
domain Evidence remains readable; no external execution state exists.

## Completion Evidence

Implemented and stopped for Phase 2 review. See
`docs/codex/audits/EXEC-003/audit.md`.
