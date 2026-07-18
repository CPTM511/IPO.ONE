# TRANSPORT-001E: Agent SDK MCP Credit Offer Workflow

Status: Implemented and verified locally on 2026-07-15 under the already
approved TRANSPORT-001 and CREDIT-001D boundaries. This task productizes the
existing TRANSPORT-001C composition helper; it grants no new tool, operation,
permission, identity, endpoint, credential, acceptance, obligation, execution,
repayment, or funds authority.

## Context

The local Agent MCP App already composes the four approved self-owned tools
from Agent self-read through deterministic Decision and optional Offer. The
returned receipt is now a closed machine contract, but the reusable workflow
implementation still lives inside `apps/agent-mcp`. The public SDK only wraps
the older anonymous demo HTTP surface, so an Agent integrator cannot consume
the reviewed local MCP workflow through the package intended for developers.

Product Charter v1.1 requires an Agent-friendly API/MCP entry and executable
SDK examples over the same deterministic credit kernel used by the Human UI.
TRANSPORT-001C explicitly defines this workflow as an SDK/Host composition
helper over the existing registry.

## Scope

- Add one closed local-stdio Agent MCP SDK client to `@ipo-one/sdk`.
- Move the existing four-step workflow implementation into the SDK so the MCP
  App delegates to one canonical implementation.
- Accept only a validated handoff manifest, one injected local JSON-RPC
  handler, and the literal `mcp_stdio_local` transport profile.
- Preserve exact Subject/Mandate scope, tool order, deterministic request and
  idempotency identifiers, result validation, and immutable receipt output.
- Export TypeScript contracts and executable documentation.
- Conformance-test exact parity between the SDK tool/operation pairs and the
  MCP App registry.

## Non-Goals

- No remote MCP/SSE/A2A transport, HTTP endpoint, socket, subprocess launcher,
  credential loader, token, wallet signing, filesystem access, arbitrary URL
  fetch, or dynamic tool discovery.
- No CAIP-10 proof, Subject activation, Offer acceptance, Obligation,
  execution, repayment, servicing, withdrawal, or real funds.
- No change to the anonymous demo SDK methods or claim that a Receipt is a
  production approval, contract, or attestation.

## Likely Files

- `packages/sdk/src/agent-mcp-client.js`
- `packages/sdk/src/index.js`
- `packages/sdk/index.d.ts`
- `packages/sdk/package.json`
- `packages/sdk/README.md`
- `packages/sdk/test/agent-mcp-client.test.js`
- `apps/agent-mcp/src/agent-credit-offer-workflow.js`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `security/test/gateway-security.test.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] `@ipo-one/sdk` exposes one Agent MCP client that reaches Decision and
  optional Offer using exactly the four approved tools.
- [x] The SDK and MCP App share one workflow implementation and one exact
  tool/operation pair list.
- [x] Configuration is closed and allows only a validated manifest, injected
  handler, and `mcp_stdio_local` profile.
- [x] Credentials, endpoints, Actor/Tenant/role selection, authority override,
  acceptance, and funds fields cannot enter SDK configuration or workflow
  input.
- [x] Existing App callers retain their API and stable bounded errors.
- [x] Reusing a workflow ID remains idempotent and output still conforms to
  `agent_credit_offer_workflow_receipt.v1`.
- [x] SDK, transport, security, PostgreSQL, and repository checks pass.

## Test Commands

```sh
node --test packages/sdk/test/*.test.js apps/agent-mcp/test/*.test.mjs
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] SDK transport is injected, local-profile-only, and creates no listener
  or credential boundary.
- [x] The handoff remains non-authorizing and exact Subject/Mandate scope is
  revalidated before tool execution.
- [x] All identifiers, amounts, terms, tool results, and receipt output remain
  closed, bounded, and schema-validated.
- [x] Failures expose stable codes without echoing request bodies, manifests,
  credentials, validator paths, or transport internals.
- [x] Public/remote transport, production identity, deployment, and real funds
  remain disabled.

## Verification Evidence

- `pnpm run check`: 213/213 tests passed; 33 schemas compiled.
- `pnpm run test:transport`: 18/18 tests passed, including the four Agent SDK
  conformance cases.
- `pnpm run test:security`: 21/21 tests passed.
- `pnpm run test:postgres`: 53/53 tests passed against a fresh temporary
  PostgreSQL database.
- Desktop and 390x844 Agent Runtime QA passed: no page-level horizontal
  overflow, SDK code remains locally scrollable, and console warnings/errors
  were empty.
- The current shell uses Node 26.0.0; align CI/release execution to the
  repository-required Node 24.18.x despite the green local suites.
