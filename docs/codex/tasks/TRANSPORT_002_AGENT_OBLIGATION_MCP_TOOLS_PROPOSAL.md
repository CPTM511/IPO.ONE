# TRANSPORT-002: Agent Obligation MCP Tools Proposal

Status: All three bounded tool permissions were approved by the project owner
and completed locally on 2026-07-16. The approval remains local-stdio,
authenticated, sandbox-only, non-withdrawable, and no-real-funds.

## Context

TRANSPORT-001 deliberately limits the local Agent MCP registry. The already
approved Tenant protocol and Agent SDK can now exercise the Obligation
lifecycle, but publishing economic commands as MCP tools changes the
machine-facing attack surface and requires explicit human review.

## Proposed Three-Part Permission Plan

1. Publish `ipo_one_accept_credit_offer` mapped only to
   `pilotAcceptCreditOffer` and exact self-owned `credit_offer` scope.
2. Publish `ipo_one_execute_sandbox_obligation` mapped only to
   `pilotExecuteSandboxObligation` and exact self-owned sandbox `obligation`
   scope.
3. Publish `ipo_one_post_sandbox_repayment` mapped only to
   `pilotPostSandboxRepayment` and exact self-owned sandbox `obligation` scope.

Each tool would remain local-stdio-only, require the existing authenticated
Agent Host, active Subject and Mandate, exact per-operation capability,
idempotency, quota, abuse-control, audit, and no-real-funds checks.

## Non-Goals

- No remote/public MCP, SSE, A2A, HTTP exposure, dynamic tools, credential
  input, Actor/Tenant selection, arbitrary resource access, or servicing tools.
- No real funds, withdrawal, production execution, mainnet, capital, tokens,
  governance, or provider-spend expansion.
- No implementation until all three permission additions are explicitly
  approved by the project owner.

## Approval Gate

- [x] Approve `ipo_one_accept_credit_offer`.
- [x] Approve `ipo_one_execute_sandbox_obligation`.
- [x] Approve `ipo_one_post_sandbox_repayment`.

## Acceptance Criteria

- [x] The fixed registry contains exactly ten named tool/operation pairs: the
  prior six, owned Evidence read, and the three approved economic lifecycle
  tools.
- [x] Offer acceptance, sandbox execution, and synthetic repayment require an
  active runtime handoff and preserve the existing Gateway authorization,
  idempotency, quota, Evidence, Ledger, and no-funds controls.
- [x] Tool arguments cannot select Tenant, Actor, Credential, Authentication
  Context, remote endpoint, arbitrary resource, chain, account, or destination.
- [x] The capability manifest, web Runtime view, SDK registry, MCP Host, schema,
  fixtures, types, and protocol drift gate agree on registry v2 and ten tools.
- [x] Full unit, PostgreSQL, security, transport, and chain gates pass under
  Node 24.18.0.

## Test Commands

```sh
pnpm run check:tenant-protocol
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] MCP remains local stdio with Host-injected fresh authentication and
  trusted Network Context.
- [x] Economic commands remain self-owned, active-Mandate-scoped,
  nonwithdrawable, sandbox-only, and no-real-funds.
- [x] No remote MCP/SSE/A2A, dynamic tool registration, credential input,
  public listener, mainnet, production execution, capital, custody, bridge, or
  funds authority is introduced.

## Completion Evidence

- The exact ten-tool registry and 29-operation private protocol pass the drift
  gate with 42 request and 35 result fixtures.
- Authenticated Human/Agent transport passes 35/35 and security passes 21/21.
- Node 24.18.0 full repository gate passes 268/268; fresh PostgreSQL 17 passes
  54/54; all schema, migration, authorization, quota, reorg, and chain gates
  pass.
