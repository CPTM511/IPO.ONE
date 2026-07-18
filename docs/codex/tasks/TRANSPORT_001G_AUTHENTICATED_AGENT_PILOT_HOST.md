# TRANSPORT-001G: Authenticated Agent Pilot Host Composition

Status: Completed locally on 2026-07-16 under the project-owner-approved TRANSPORT-001 and
CREDIT-001D boundaries. This task composes existing local components and grants
no new operation, tool, permission, identity, endpoint, credential, acceptance,
obligation, execution, repayment, deployment, or funds authority.

## Context

The four-tool local Agent MCP adapter, the Subject/Mandate-pinned MCP Host, the
Agent Tenant client, and the shared deterministic Credit Intent -> Decision ->
Offer workflow are implemented and verified. An embedding application must
still assemble those pieces manually after authenticating the Agent.

Product Charter v1.1 requires an Agent-friendly entry over the same durable
kernel used by the Human UI. The local pilot therefore needs one named,
closed composition that proves each MCP tool call receives a fresh trusted
Agent Authentication Context and that the authenticated Actor is the exact
Subject named by the non-authorizing handoff manifest.

## Scope

- Add `createAgentPilotHost(...)` as the named local stdio composition.
- Accept only the existing Gateway, one validated handoff manifest, a no-arg
  Host-owned `authenticateAgent` function, and a trusted Network Context
  factory.
- Construct the existing `AgentTenantCommandClient` and existing
  `createAgentMcpHost(...)` internally.
- Re-authenticate every protocol command and fail before Gateway execution if
  the trusted Actor is not the exact Agent Subject in the handoff.
- Preserve the exact four-tool allowlist and existing Subject/Mandate scope.
- Document the embedding contract and add transport/security conformance.

## Non-Goals

- No token, key, secret, credential, Authentication Context, Actor, Tenant,
  role, capability, endpoint, or transport authority in configuration or MCP
  arguments.
- No environment-variable, filesystem, wallet, browser, shell, subprocess,
  HTTP/SSE/A2A, arbitrary network, or dynamic-tool loader.
- No CAIP-10 proof, Subject activation, Offer acceptance, Obligation,
  execution, payment, repayment, servicing, withdrawal, real funds, public
  binding, production identity, deployment, or production credential source.
- No change to the deliberately non-runnable bare `server.js` entrypoint.

## Likely Files

- `apps/agent-mcp/src/agent-pilot-host.js`
- `apps/agent-mcp/src/index.js`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `apps/agent-mcp/README.md`
- `security/test/gateway-security.test.mjs`
- `docs/codex/tasks/TRANSPORT_001_AUTHENTICATED_HTTP_MCP_ADAPTER.md`
- `docs/guidance/IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] One closed `createAgentPilotHost(...)` factory composes the existing
  Agent client and MCP Host without accepting ambient authority.
- [x] Every protocol command obtains a server-created Authentication Context
  and trusted Network Context through injected no-argument providers.
- [x] Non-Agent or wrong-Subject Authentication Context fails before Gateway
  execution with a bounded stable error.
- [x] MCP still publishes exactly four approved self-owned tools and preserves
  the existing manifest Subject/Mandate enforcement.
- [x] Unknown fields, getters, credential-bearing fields, and malformed
  configuration fail closed.
- [x] Bare server, public sandbox, Human Host, remote/public transport,
  production identity, deployment, and real-funds boundaries remain unchanged.
- [x] Targeted transport/security tests and the full repository check pass.

## Test Commands

```sh
node --test apps/agent-mcp/test/agent-mcp.test.mjs
pnpm run test:transport
pnpm run test:security
pnpm run check
node scripts/lint-boundaries.mjs
git diff --check
```

## Security Checklist

- [x] Configuration is a plain closed object with no getters or unknown keys.
- [x] Authentication is fresh per command and bound to the exact handoff
  Subject before authorization or business execution.
- [x] The manifest remains non-authorizing and credential-free.
- [x] No raw secret, token, key, Context, PII, request body, or unsafe failure
  detail is emitted through MCP results or errors.
- [x] No operation, tool, listener, transport, or funds authority is added.

## Verification Evidence

- `node --test apps/agent-mcp/test/agent-mcp.test.mjs`: 12/12. The named Host
  rejects wrong Actor/Subject before Gateway execution, re-authenticates all
  four Offer-workflow commands, and serves an authenticated call over actual
  newline-delimited local stdio.
- `pnpm run test:transport`: 22/22. Human loopback HTTP, local MCP, SDK, and both
  named Human/Agent Host compositions preserve the reviewed transport split.
- `pnpm run test:security`: 21/21. Static and adversarial gates preserve the
  closed configuration, fixed tool registry, public-sandbox separation, and
  no ambient credential/network loader.
- `pnpm run check`: 217/217; all 34 schemas, 17 private operations, 21 public
  operations, migrations, deployment, launch, approval, abuse, and protocol
  checks pass.
- `node scripts/lint-boundaries.mjs`, `node --check`, and `git diff --check`
  pass.
- The current shell is Node 26.0.0; release/CI execution still needs alignment
  to the repository-required Node 24.18.x.
