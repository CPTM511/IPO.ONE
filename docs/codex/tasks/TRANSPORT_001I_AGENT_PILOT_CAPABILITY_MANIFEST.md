# TRANSPORT-001I: Agent Pilot Capability Manifest

Status: Completed locally on 2026-07-16 under the already-approved TRANSPORT-001, IDENTITY-001,
CREDIT-001E/F, SERVICING-001, and CHAIN-001A/C boundaries. This task exposes
existing local capabilities as non-authorizing product metadata. It grants no
new Tenant operation, MCP tool, endpoint, credential, permission, deployment,
or funds authority.

Supersession note (2026-07-16): this document records the six-tool boundary at
the time TRANSPORT-001I closed. The later, separately approved EVIDENCE-001B and
TRANSPORT-002 increments supersede that registry with
`agent_mcp_registry.v2`, ten tools, owned Evidence read, and three bounded
economic lifecycle tools. Historical acceptance evidence below is unchanged.

## Context

The Agent Runtime page accurately lists the six approved local MCP tools, but
its visible SDK quick start stops at Decision/Offer. The already implemented
post-application SDK workflow for Offer acceptance, shared Obligation,
sandbox execution/Ledger and repayment, plus the local dual-chain portability
workflow, are discoverable only in repository documentation. An Agent or
integrator therefore cannot obtain one closed machine-readable description of
the complete approved local pilot path or distinguish MCP tools from SDK
compositions without reading source code.

## Scope

- Add `agent_pilot_capability_manifest.v1` as a closed non-authorizing contract
  derived from one validated `agent_handoff_manifest.v1`.
- Describe exactly three staged SDK workflows: Credit Offer over the six-tool
  local MCP composition, sandbox Obligation/repayment over the authenticated
  local Tenant executor, and no-network dual-chain portability conformance.
- Compute workflow availability from handoff status and exact Mandate
  capabilities without expanding the handoff or authorizing a call.
- Include the exact six-tool MCP registry and explicitly state that economic
  lifecycle tools are not exposed through MCP.
- Produce byte-equivalent browser and SDK builders, conformance fixtures, type
  declarations, and fail-closed drift checks.
- Update the Agent Runtime UI to display/copy the capability packet, show all
  three workflow stages and their current readiness, and provide a complete
  local SDK lifecycle example.

## Non-Goals

- No seventh MCP tool, economic MCP tool, new Tenant operation, HTTP route,
  remote MCP/SSE/A2A endpoint, listener, credential delivery, or authority
  override.
- No automatic execution, hidden command, dynamic tool discovery, wallet key,
  signer, Provider call, RPC, live chain transaction, deployment, withdrawal,
  real credit, or production funds.
- No Human/Agent self-service Evidence; that remains `EVIDENCE-001B`.
- No approval of `TRANSPORT-002` or `CHAIN-001B`.

## Likely Files

- `schemas/v2/agent-pilot-capability-manifest.schema.json`
- `packages/api-contract/*`
- `packages/sdk/*`
- `apps/web/src/agent-pilot-capability-manifest.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/*`
- `api/tenant-protocol/conformance/agent-pilot-capability-manifest.v1.fixtures.json`
- `scripts/check-schemas.mjs`
- `scripts/check-tenant-protocol.mjs`
- Product Charter traceability and commercialization roadmap

## Acceptance Criteria

- [x] Waiting, draft application-ready, and active runtime-ready handoffs each
  produce one closed immutable capability manifest with an exact next action.
- [x] The manifest contains exactly six unchanged MCP tool pairs and exactly
  three existing SDK workflows in lifecycle order.
- [x] Offer workflow readiness requires application-ready draft authority;
  Obligation readiness requires active authority plus the three exact Mandate
  capabilities; portability remains an input-receipt-only local conformance
  workflow.
- [x] Manifest validation rejects entry-point, receipt version, availability,
  Handoff, tool-registry, safety, credential, endpoint, or funds drift.
- [x] Browser and SDK builders return byte-equivalent manifests from the same
  handoff fixtures.
- [x] Agent Runtime visibly separates MCP tool availability from SDK workflow
  availability and presents the complete Offer -> Obligation/repayment ->
  portability sequence.
- [x] Desktop and mobile screenshots show readable hierarchy, no horizontal
  overflow, honest locked states, and keyboard-addressable copy/navigation
  controls.
- [x] Full runtime, schema, transport, security, PostgreSQL and repository
  checks pass under Node 24.18.0.

## Test Commands

```sh
node --test apps/web/test/*.test.js packages/api-contract/test/*.test.js packages/sdk/test/*.test.js
pnpm run check:tenant-protocol
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] Input is one validated closed Handoff data graph; accessors, symbols,
  unknown fields and malformed manifests fail closed.
- [x] Availability derives only from Handoff status and its already reviewed
  Mandate capabilities.
- [x] MCP registry parity remains exact and economic lifecycle operations are
  explicitly absent from MCP.
- [x] No credential, Tenant/Actor/role, Authentication Context, authorization
  decision, endpoint selector, network target, signer, secret, or key is added.
- [x] Output is metadata only, deeply immutable, non-authorizing,
  sandbox-only, non-withdrawable and has no funds authority.
- [x] UI copy distinguishes local SDK composition from approved MCP tools and
  never claims live chain or production execution.

## Completion Evidence

- Node 24.18.0 and pnpm 11.1.3 full quality gate: 260/260 tests; 38 closed
  schemas; Tenant protocol checks include three capability-manifest states and
  eight invalid mutations.
- Authenticated Human/Agent transport: 32/32. Security: 21/21. Fresh
  PostgreSQL 17 TCP profile: 53/53. `git diff --check`: clean.
- Browser QA at the normal desktop viewport and 390x844 verified the Agent
  Runtime route, waiting-state workflow labels, keyboard-addressable controls,
  and no page-level horizontal overflow. Screenshots are stored under
  `artifacts/product-design-audit/2026-07-16-agent-runtime-capabilities/`.
- The fixed authenticated Human Host asset allowlist now serves the capability
  module from the same loopback origin; transport conformance rejects any
  entry-module/allowlist drift.
- No MCP tool, Tenant operation, endpoint, credential, production permission,
  network target, signer, live-chain action, withdrawal, or funds capability
  was added by TRANSPORT-001I itself. Later permissions are governed by their
  own completed task records and the CHAIN-001B runbook.
