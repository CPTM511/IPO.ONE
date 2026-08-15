# TRANSPORT-001C: Agent MCP Credit Offer Workflow

Status: Implemented and verified locally on 2026-07-15. This task
only composes the four operations already approved under TRANSPORT-001 and
CREDIT-001C/CREDIT-001D. It adds no tool, permission, identity activation,
Offer acceptance, Obligation, execution, repayment, endpoint, credential, or
funds authority.

## Context

`CREDIT-001C` and `CREDIT-001D` require a draft Agent Mandate for Credit Intent
submission and deterministic evaluation. `MANDATE-001A` deliberately places
Principal activation after application and Offer, so an already-active runtime
handoff must not be reused to start a new application. The handoff contract
therefore has two explicit phases: `application_ready` binds the four-step
application path to one draft Mandate; `ready` binds later runtime work to the
same Mandate only after Principal activation. An injected authenticated Agent
client remains the only Host composition boundary.

## Scope

- Add one reusable local workflow over the existing four-tool MCP registry:
  self-read -> Credit Intent -> application read -> deterministic evaluation.
- Add a closed `application_ready` handoff state for the exact draft Mandate;
  preserve `ready` for the post-application, Principal-activated runtime phase.
- Derive `authorityId` from the exact handoff Mandate rather than accepting it
  from workflow input.
- Pin `ipo_one_request_credit` to both the handoff Subject and handoff Mandate.
- Use one caller-provided bounded workflow ID to derive stable request,
  correlation, JSON-RPC, and idempotency identifiers for safe retry.
- Validate every MCP result with the canonical Tenant protocol result contract
  and fail closed on Subject, Mandate, operation, or response drift.
- Return one immutable, bounded, sandbox-only workflow receipt with the final
  Decision and optional Offer; do not mint a new protocol object or Evidence.
- Prove the path over the real PostgreSQL Tenant Gateway and authorization
  audit, not only a mock MCP client.
- Prove an active `ready` Host cannot submit a new Credit Intent and fails with
  the stable application-handoff boundary error.

## Non-Goals

- No CAIP-10 ownership proof, Subject activation, production identity,
  credential loading, remote MCP/SSE/A2A, public endpoint, Offer acceptance,
  Obligation creation, sandbox execution, repayment, servicing, withdrawal, or
  funds movement.
- No new MCP tool or Tenant operation. The workflow is an SDK/Host composition
  helper over the existing reviewed registry.
- No claim that a workflow receipt is an attestation, acceptance, contract,
  credit approval for real funds, or portable production Evidence.

## Likely Files

- `apps/agent-mcp/src/agent-credit-offer-workflow.js`
- `packages/sdk/src/agent-mcp-client.js`
- `apps/agent-mcp/src/agent-mcp-host.js`
- `apps/agent-mcp/src/index.js`
- `apps/agent-mcp/README.md`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `apps/web/src/agent-handoff-manifest.js`
- `apps/web/test/agent-handoff-manifest.test.js`
- `schemas/v2/agent-handoff-manifest.schema.json`
- `api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json`
- `packages/api-contract/index.d.ts`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `security/test/gateway-security.test.mjs`
- `design-qa.md`

## Acceptance Criteria

- [x] An `application_ready` draft-Mandate handoff and bounded sandbox request
  use the four existing MCP tools in the exact approved order and return one
  immutable receipt.
- [x] An active `ready` runtime handoff cannot submit a new Credit Intent.
- [x] The workflow derives the exact handoff Mandate authority and accepts no
  Tenant, Actor, role, credential, endpoint, approval, acceptance, or funds
  field.
- [x] Subject, Mandate, operation, response-schema, or ownership drift fails
  before a later workflow step can execute.
- [x] Reusing the same workflow ID replays the existing Credit Intent and
  Decision without creating duplicates.
- [x] PostgreSQL integration proves the MCP route persists one Agent Credit
  Intent, deterministic Decision, and optional Offer with authorization audit.
- [x] A Human and Agent still converge on the same canonical Credit Intent,
  Decision, and Offer shapes.
- [x] Direct MCP server execution remains fail-closed and no remote transport
  or production authority is added.
- [x] TRANSPORT-001D freezes the returned receipt as a closed JSON Schema,
  runtime validator, TypeScript contract, and adversarial conformance fixture.
- [x] TRANSPORT-001E exposes the same canonical implementation through
  `IpoOneAgentMcpClient`; the MCP App remains a thin Host adapter and CI pins
  SDK/App/browser tool parity.

## Test Commands

```sh
pnpm run check
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Host request-credit scope is pinned to both manifest Subject and Mandate.
- [x] Draft application and active runtime handoffs are schema-distinct and a
  Host cannot silently cross their lifecycle boundary.
- [x] Workflow configuration is a closed object and contains no credential or
  caller-selected authority context.
- [x] All identifiers and numeric inputs are bounded before the first MCP call.
- [x] MCP errors and drift failures expose stable codes without response-body,
  credential, Tenant, or validator internals.
- [x] The result remains explicitly sandbox-only, non-authorizing, and without
  Offer-acceptance or funds semantics.
- [x] Existing Gateway admission, object authorization, idempotency, event,
  Evidence, projection, outbox, and audit boundaries remain authoritative.
