# TRANSPORT-001B: Agent Handoff Integration Kit

Status: Implemented locally under the already approved TRANSPORT-001 boundary
on 2026-07-15. This task adds no identity, transport, business, or funds
permission.

## Context

The Human Principal UI can now copy a closed `agent_handoff_manifest.v1`
document after eligible sandbox Mandate activation. The local Agent MCP adapter
exposes four reviewed self-owned tools, but developers still need a deterministic
way to validate that packet and construct the first `ipo_one_read_self` call
without putting credentials into files, model context, tool arguments, or the
browser.

## Scope

- Validate one bounded handoff document from standard input using strict JSON
  and the canonical Agent handoff schema.
- Require `status=ready` and exact parity with the four-tool MCP registry.
- Emit an immutable, non-authorizing local call plan for
  `ipo_one_read_self`, including fresh request/correlation/JSON-RPC IDs.
- Compose a reusable Host factory around one already authenticated
  `AgentTenantCommandClient`; pin Subject-scoped tools to the exact ready
  handoff Subject before Gateway authorization runs.
- Return only Subject/Mandate references and the first MCP call. Do not echo
  hashes, capabilities, limits, or the input manifest.
- Document the Principal -> handoff -> host composition -> first call workflow.

## Non-Goals

- No credential issuance, token/file/env loading, wallet proof, Subject
  activation, remote MCP/SSE/A2A endpoint, automatic MCP Host composition,
  database bootstrap, public deployment, Offer acceptance, execution,
  repayment, withdrawal, or funds movement.
- The CLI is a developer preflight over standard input. It does not grant the
  MCP process filesystem, shell, browser, or network tools.

## Likely Files

- `apps/agent-mcp/src/agent-handoff-plan.js`
- `apps/agent-mcp/src/handoff-cli.js`
- `apps/agent-mcp/src/agent-mcp-host.js`
- `apps/agent-mcp/README.md`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `security/test/gateway-security.test.mjs`
- `package.json`

## Acceptance Criteria

- [x] A valid ready manifest produces one frozen local-stdio call plan whose
  first tool is exactly `ipo_one_read_self`.
- [x] Waiting, malformed, oversized, duplicate-key, credential-bearing,
  remote-enabled, funds-enabled, and registry-drifted manifests fail closed.
- [x] CLI output does not repeat Mandate/terms hashes, capabilities, limits,
  credential material, or validator internals.
- [x] Direct MCP server execution still fails with
  `agent_mcp_composition_required`; verified Authentication Context remains an
  out-of-band Host responsibility.
- [x] The reusable Host factory accepts only `client` plus `manifest`, rejects
  caller authority fields, pins exact Subject scope, and reuses the same
  JSON-RPC/stdio adapter.
- [x] PostgreSQL integration proves Principal activation -> ready handoff ->
  Subject-pinned MCP Host -> `ipo_one_read_self` -> durable Gateway projection
  and authorization audit over the already authenticated Agent client.
- [x] The repository quality workflow executes the authenticated transport
  conformance suite so MCP/handoff drift cannot bypass CI.

## Test Commands

```sh
pnpm run check
pnpm run test:transport
pnpm run test:security
git diff --check
```

## Security Checklist

- [x] Input is strict JSON, 32 KiB maximum, depth/key bounded, and closed by
  schema.
- [x] No input field can select Tenant, Actor, role, approval, credential,
  endpoint, or funds authority.
- [x] Errors are stable and do not expose input, schema paths, stacks, or
  validator internals.
- [x] The plan is non-authorizing metadata and cannot start an authenticated
  MCP Host by itself.
- [x] The Host accepts no credential, Tenant, role, endpoint, listener, or funds
  authority; its authenticated Agent client must be injected out of band.
