# TRANSPORT-001D: Agent Workflow Receipt Contract

Status: Implemented and verified locally on 2026-07-15 under the already
approved TRANSPORT-001 boundary. This task hardens an existing workflow output;
it creates no tool, operation, permission, credential, endpoint, deployment,
Offer acceptance, Obligation, execution, repayment, or funds authority.

## Context

TRANSPORT-001C returns an immutable
`agent_credit_offer_workflow_receipt.v1` after the four approved local MCP
tools reach Decision and optional Offer. The runtime validated every underlying
Tenant result, but the composed receipt itself had no language-neutral JSON
Schema, exported validator, TypeScript contract, or adversarial conformance
fixture. That left an avoidable SDK and Host-integration drift boundary.

## Scope

- Define one closed JSON Schema 2020-12 receipt contract.
- Reuse the canonical Tenant Credit Intent, Decision, and Offer summary
  definitions rather than creating parallel economic object shapes.
- Freeze the exact four-step tool, operation, order, and response-schema tuple.
- Require explicit no-credential, no-public-endpoint, no-remote-MCP, and
  no-funds statements.
- Validate the composed receipt before returning it from the workflow.
- Export TypeScript declarations and mutation-free runtime validator helpers.
- Add one valid contract fixture plus adversarial mutation cases.

## Non-Goals

- No new MCP tool, Tenant operation, network listener, Host credential loader,
  Agent authentication method, or production transport.
- No Subject activation, Offer acceptance, Obligation, execution, payment,
  repayment, servicing, Evidence issuance, or portable production attestation.
- No claim that a successful receipt is a real credit approval or contract.

## Files Likely to Modify

- `schemas/v2/agent-credit-offer-workflow-receipt.schema.json`
- `api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json`
- `packages/api-contract/src/agent-credit-offer-workflow-receipt.js`
- `packages/api-contract/src/index.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `apps/agent-mcp/src/agent-credit-offer-workflow.js`
- `apps/agent-mcp/test/agent-mcp.test.mjs`
- `scripts/check-schemas.mjs`
- `schemas/README.md`
- `apps/agent-mcp/README.md`
- `docs/architecture/ADR-031-authenticated-transport-adapters.md`

## Acceptance Criteria

- [x] A valid workflow output conforms to one closed
  `agent_credit_offer_workflow_receipt.v1` schema and remains deeply immutable.
- [x] The receipt contains an Agent Mandate Credit Intent and Decision plus an
  optional canonical Offer; it does not define duplicate economic contracts.
- [x] `offer_ready` requires an approved Decision and non-null offered Offer;
  `decision_complete` requires a rejected/frozen Decision and null Offer.
- [x] The four steps are fixed to the reviewed tool/operation/order/result
  schema tuple.
- [x] Credentials, public endpoint, remote MCP, production funds, and funds
  authority are each explicitly false.
- [x] Unknown fields, authority-type drift, tool-order drift, missing Offer,
  credentials, remote MCP, and funds authority fail conformance.
- [x] Runtime validation is mutation-free and exposes one stable redacted error.

## Test Commands

```sh
pnpm run check:schemas
node --test packages/api-contract/test/api-contract.test.js
pnpm run test:transport
pnpm run check
git diff --check
```

## Verification Record

- `pnpm run check`: 209/209 tests passed; 33 schemas compiled.
- `pnpm run test:transport`: 14/14 tests passed.
- `pnpm run test:security`: 21/21 tests passed.
- `pnpm run test:postgres`: 53/53 tests passed against a fresh temporary
  PostgreSQL database.
- Receipt conformance: one valid fixture and seven adversarial mutations.
- Verified locally on 2026-07-15. The current shell uses Node 26.0.0, so the
  repository's required Node 24.18.x runtime remains an environment-alignment
  action despite the green suites.

## Security Checklist

- [x] The receipt remains output-only and non-authorizing.
- [x] It contains no token, cookie, proof, signature, key, secret, Tenant
  selector, role, Authentication Context, or network endpoint.
- [x] It cannot broaden the exact handoff Subject or Mandate authority.
- [x] It cannot represent Offer acceptance, funds movement, or production
  approval.
- [x] Underlying Gateway authorization, admission, idempotency, audit, Event,
  Evidence, outbox, and projection controls remain authoritative.
