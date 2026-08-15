# TRANSPORT-001H: Agent Sandbox Obligation SDK Workflow

Status: Implemented and verified locally on 2026-07-16 under the project-owner-approved
IDENTITY-001, CREDIT-001E/F, SERVICING-001, and TRANSPORT-001 boundaries. This
task composes already-approved private Tenant protocol operations. It grants no
new operation, permission, MCP tool, endpoint, credential, deployment, or funds
authority.

## Context

The active Agent Subject and Mandate can already accept an Offer into the same
`obligation.v2` kernel used by Human borrowers, execute that Obligation over the
signed no-real-funds sandbox rail, and post a synthetic repayment. The Agent
Tenant client and PostgreSQL integration suite exercise those operations, but
an Agent integrator must still orchestrate three low-level commands and verify
their cross-step identity, authority, accounting, and safety invariants.

Product Charter v1.1 requires an Agent-friendly product interface over the
shared deterministic kernel. The SDK therefore needs one closed, replay-safe
workflow above the approved Tenant protocol without expanding the reviewed MCP
tool registry.

## Scope

- Add `agent_sandbox_obligation_workflow_receipt.v1` as a closed machine
  contract for Offer acceptance, shared Obligation creation, sandbox execution,
  accounting, and synthetic repayment.
- Add one local in-process Agent SDK client that accepts only a validated active
  handoff manifest, an injected authenticated Tenant protocol executor, and the
  literal `local_in_process` profile.
- Require the exact active Mandate capabilities `accept_credit_offer`,
  `execute_sandbox_credit`, and `route_repayment` before any command is sent.
- Compose only `pilotAcceptCreditOffer`, `pilotExecuteSandboxObligation`, and
  `pilotPostSandboxRepayment` with deterministic request, correlation, and
  idempotency identifiers.
- Validate every Tenant protocol result and all cross-step Subject, Mandate,
  Offer, Obligation, asset, amount, sandbox, withdrawal, and production-funds
  invariants.
- Return one deeply immutable, schema-validated receipt and prove replay
  behavior.

## Non-Goals

- No MCP tool, remote MCP/SSE/A2A transport, public or new HTTP endpoint,
  listener, socket, subprocess, dynamic discovery, arbitrary URL, or deployment.
- No credential, token, wallet key, Authentication Context, Tenant, Actor, role,
  permission, capability, or authority override in SDK input.
- No new Tenant protocol operation or capability; no real funds, withdrawal,
  capital commitment, production identity, production execution, or mainnet.
- No operator servicing action. DPD/default/cure/restructure/repurchase/write-off
  remain in the approved shared servicing kernel and privileged operator/worker
  clients.

## Likely Files

- `schemas/v2/agent-sandbox-obligation-workflow-receipt.schema.json`
- `api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json`
- `packages/api-contract/src/agent-sandbox-obligation-workflow-receipt.js`
- `packages/api-contract/src/index.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `packages/sdk/src/agent-sandbox-obligation-client.js`
- `packages/sdk/src/index.js`
- `packages/sdk/index.d.ts`
- `packages/sdk/README.md`
- `packages/sdk/test/agent-sandbox-obligation-client.test.js`
- `scripts/check-schemas.mjs`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`

## Acceptance Criteria

- [x] One active Agent can accept an approved Offer, create `obligation.v2`,
  execute it on the sandbox rail, and post a synthetic repayment through one
  SDK workflow.
- [x] The SDK sends exactly three already-approved Tenant protocol operations
  with stable replay identifiers and no authority-bearing caller fields.
- [x] Missing Mandate capabilities, malformed acknowledgements/repayments,
  unknown fields, getters, result drift, or cross-step identity drift fail
  before unsafe continuation with bounded error codes.
- [x] Output is deeply immutable and conforms to a closed versioned receipt.
- [x] Receipt proves `sandboxOnly=true`, `productionFundsMoved=false`, and
  `withdrawable=false` and includes the shared Obligation, signed sandbox
  execution receipt, ledger transaction reference, and repayment.
- [x] Existing MCP tool registry remains byte-for-byte unchanged.
- [x] SDK, schema, transport, security, PostgreSQL, and full repository checks
  pass under Node 24.18.0.

## Test Commands

```sh
node --test packages/sdk/test/*.test.js packages/api-contract/test/*.test.js
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] Configuration and workflow input are closed plain data objects; getters,
  symbols, credentials, endpoint selectors, and authority overrides fail closed.
- [x] The handoff remains non-authorizing and the injected executor owns fresh
  authentication and network context.
- [x] The active Subject/Mandate and three explicit capabilities are verified
  before command execution.
- [x] Each response is validated before its identifiers are reused by the next
  economic command.
- [x] Failures do not echo hashes, amounts, request bodies, credentials,
  validator paths, or transport internals.
- [x] No-real-funds, non-withdrawable, private, local-only boundaries remain
  explicit in code, schema, tests, and documentation.

## Verification Evidence

- `.nvmrc` and `.node-version` both pin `24.18.0`; the repository runtime gate
  confirmed Node v24.18.0 and pnpm 11.1.3.
- `pnpm run check`: 247/247 tests passed; 35 schemas, 28 private operations,
  19 reversible migration pairs, and the three workflow-receipt fixture sets
  passed their drift gates.
- `pnpm run test:transport`: 31/31, including immutable three-step execution,
  replay, scope denial, drift rejection, and exact unchanged six-tool MCP
  registry coverage.
- `pnpm run test:security`: 21/21, including public-sandbox isolation and
  adversarial ingress tests.
- `pnpm run test:postgres`: 53/53 against a fresh temporary PostgreSQL 17
  database, including the underlying Agent Offer acceptance, shared
  Obligation, signed execution, balanced Ledger, repayment, servicing,
  Evidence, replay, restart, and reconciliation paths.
- `git diff --check` passed.
