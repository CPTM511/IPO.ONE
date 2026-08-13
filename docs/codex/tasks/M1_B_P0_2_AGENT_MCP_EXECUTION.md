# M1-B P0-2 — Agent MCP Provider-Scoped Durable Execution

## Status

- Status: Complete
- Parent issue: `M1_B_RELEASE_CLOSURE.md`
- Baseline commit: `ae6a0571d9052028b2043437938ca37d15b96f6b`
- Delivery level: L1 durable public no-funds sandbox

## Context

The advertised Agent MCP execution tool currently omits the Provider target
required by the durable Agent execution handler. The PostgreSQL Gateway already
enforces the active Mandate allowlist, Provider category, and derived Facility
scope, but the closed MCP schema rejects those fields and its adapter therefore
submits an empty business payload. Existing MCP tests stop at mocked clients, so
they cannot reveal the durable contract mismatch.

## Scope

- Carry exact `providerId` and `providerCategory` values from the closed MCP
  tool schema through the MCP adapter and authenticated Agent Tenant client to
  the versioned Tenant protocol request and durable Gateway handler.
- Preserve the existing shared Human/Agent execution operation and the durable
  Mandate, AccountBinding, Facility, purpose, Provider, Tenant, idempotency,
  Ledger, Lockbox, and Evidence checks.
- Exercise the real MCP host over the real PostgreSQL Tenant Gateway in the
  existing durable shared-kernel lifecycle.
- Prove fail-closed behavior for missing or wrong Provider scope, wrong
  category, stale handoffs backed by revoked or expired durable Mandates,
  out-of-scope Facility state, and an idempotency replay whose economic
  payload drifts.
- Establish revoked and expired Mandate state only through isolated test
  fixtures over the existing event/projection repository. No new product
  operation or live-policy permission is introduced.

## Non-Goals

- No new MCP tools, remote MCP/SSE, A2A, subscriptions, webhooks, or status
  architecture.
- No Provider discovery, dynamic Provider registration, arbitrary Venue calls,
  withdrawals, real funds, production credentials, or production authority.
- No weakening or bypass of Mandate, Facility, AccountBinding, or idempotency
  validation.
- No Human execution contract change and no broad SDK/MCP/Gateway refactor.

## Likely Files

- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `apps/agent-mcp/README.md`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- Tenant protocol conformance fixtures only if required to pin the existing
  Agent Provider-scope payload.

## Acceptance Criteria

1. `ipo_one_execute_sandbox_obligation` requires closed, exact `providerId`
   and `providerCategory` arguments and forwards them without renaming or
   defaulting.
2. The Agent Tenant client constructs a Provider-scoped protocol payload while
   the actor-neutral protocol continues to support Human execution without a
   Provider target.
3. A PostgreSQL integration reaches Agent identity, active CAIP-10
   AccountBinding, active Mandate, Credit Intent, Decision, Offer, Acceptance,
   Obligation, MCP controlled execution, Ledger, repayment, and Evidence using
   the real MCP host and real durable Gateway.
4. Missing/wrong Provider, wrong category, stale/revoked Mandate,
   out-of-scope Facility state, and replay-invalid execution fail closed.
5. Exact duplicate execution remains idempotent, sandbox-only,
   non-withdrawable, and produces one durable economic effect.
6. No production funds, signer, withdrawal, Venue-write, or real-credit
   authority is introduced.

## Test Commands

```sh
pnpm --filter @ipo-one/agent-mcp test
pnpm run test:transport
pnpm run test:postgres
```

The PostgreSQL test is expected to fail before the implementation because the
current MCP adapter rejects the required Provider fields as
`invalid_mcp_tool_arguments`.

## Security Checklist

- [x] MCP arguments remain a closed object with no credentials or
      Authentication Context.
- [x] Provider ID and category are explicit and exact; neither is inferred from
      untrusted model context.
- [x] The durable current Mandate and derived Facility remain authorization
      truth; revoked and expired durable Mandates fail closed.
- [x] Active CAIP-10 AccountBinding remains required for Agent execution.
- [x] Idempotency replay succeeds only for the exact command hash.
- [x] Ledger, Lockbox, Event, and Evidence writes remain atomic and Tenant
      scoped.
- [x] All outputs remain sandbox-only, non-withdrawable, and no-funds.

## Permission Boundary

This task authorizes only local source, test, and documentation changes for the
existing no-funds MCP execution path. It grants no deployment, production
credential, mainnet, signer, Provider/Venue write, withdrawal, or real-value
authority.

## Data and Migration Impact

No schema migration or data backfill is expected. The change closes an input
contract mismatch and exercises existing durable projections and constraints.

## Rollback Plan

Revert this bounded change set. Existing durable Gateway validation and stored
Tenant data remain valid because no schema or persistence format changes.

## Required Completion Evidence

- Exact failing-before MCP-over-PostgreSQL error.
- Passing Agent MCP unit/transport tests and durable PostgreSQL lifecycle.
- Durable execution receipt with exact Provider ID/category, Ledger and
  Evidence assertions, exact duplicate replay, and fail-closed negative cases.
- Diff and status proving no unrelated files, migrations, funds authority, or
  production settings changed.

## Completion Evidence

Root cause: the durable Agent execution handler already required and validated
`providerId` and `providerCategory`, and the typed obligation SDK already sent
them. The core MCP tool schema and adapter omitted both fields and the
`AgentTenantCommandClient` therefore constructed an execution command without
the Provider scope. Existing MCP tests ended at a mocked client and did not
cross the durable Gateway boundary.

Failing before implementation:

```text
node --test --test-name-pattern='local Agent MCP publishes exactly' \
  apps/agent-mcp/test/agent-mcp.test.mjs
TypeError: executed.result is undefined
```

The MCP adapter rejected the newly required Provider arguments as
`invalid_mcp_tool_arguments` before calling the durable client.

Passing evidence:

```text
node --test apps/agent-mcp/test/agent-mcp.test.mjs
12 passed, 0 failed

node --test --test-name-pattern='Agent client emits exact Provider scope' \
  modules/tenant-command-gateway/test/tenant-command-gateway.test.js
1 passed, 0 failed

pnpm run check:tenant-protocol
102 operations, 103 request fixtures, all checks passed

pnpm run test:transport
79 passed, 0 failed

DATABASE_URL=<fresh local PostgreSQL database> node --test \
  modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs
42 passed, 0 failed
```

The PostgreSQL lifecycle traverses `createAgentMcpHost` to the MCP adapter,
`AgentTenantCommandClient`, `TenantCommandGateway`, and PostgreSQL for exact
execution, duplicate replay, repayment, and Evidence. Missing Provider scope,
wrong Provider, wrong category, out-of-derived-Facility target, revoked durable
Mandate, expired durable Mandate, and economic replay drift all fail closed.
The revoked and expired cases retain pending Obligation authorization routing
so the durable execution handler returns `authority_not_current`; each asserts
zero additional execution receipt, Ledger transaction, Lockbox, credit event,
or Obligation event writes.

There is no migration, live-policy widening, product permission change,
production authority, signer, withdrawal, or real-funds change.
