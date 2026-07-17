# SERVICING-002A: Dual-native owned Obligation read and reload hydration

Status: Implemented and verified locally on 2026-07-17 under the project
owner's standing authorization for the permissions required to continue the
commercial-product build. This approval and implementation are limited to the
exact-owner, read-only, PII-free, no-real-funds surface below. Commercial
product requirements supersede legacy DEMO behavior where they conflict.

## Context

The shared kernel persists `obligation.v2`, installments, servicing state and
Evidence in server-authoritative projections. Human and Agent clients can
execute, repay and read Evidence for an exact owned Obligation, but cannot read
the current Obligation projection itself. The Human Servicing Case therefore
depends on page memory and disappears after reload. An Agent can mutate the same
state through SDK/MCP but cannot rehydrate it from the same authoritative read.

Commercial operation requires recoverable state. A browser may remember an
opaque Obligation identifier as navigation context, but it must never persist or
treat an Obligation snapshot as authority.

## Scope

- Add `obligation.read.owned` and `pilotReadOwnObligation` for Human and Agent.
- Require the exact Obligation ID, active Actor ownership, current membership
  and credential checks; preserve non-enumerating denial behavior.
- Return one bounded `tenant_owned_obligation_view.v1` composed from the durable
  `obligation.v2` projection plus at most the latest servicing action.
- Add matching Human/Agent Tenant client methods, a typed Agent SDK read client,
  and local stdio MCP tool `ipo_one_read_obligation`.
- Let the Human browser remember only the opaque Obligation ID in
  `sessionStorage`, re-read server state after reload, and render the existing
  Servicing Case from that validated response.
- Expose the same read entry in Agent Runtime metadata without showing a Human
  case in Agent mode.
- Update protocol/catalog fixtures, type declarations, policy and transport
  conformance, security tests, and commercialization traceability.

## Non-goals

- No Obligation list, portfolio enumeration, fuzzy lookup, search, operations
  queue, Auditor grant, cross-Tenant read or public endpoint.
- No client-authored lifecycle, DPD, schedule, balance, servicing or Evidence
  state; no persisted browser snapshot as truth.
- No new write, approval, servicing transition, repayment, execution, provider,
  chain, deployment, custody, withdrawal, capital or real-funds authority.
- No raw KYC/PII, account address, credential, signature, provider payload or
  authorization binding in the response.

## Likely files

- `schemas/v2/tenant-protocol-*.schema.json`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `modules/authorization/src/authorization-*.js`
- `modules/abuse-control/src/tenant-abuse-policy.js`
- `modules/tenant-command-gateway/src/owned-obligation-query-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `apps/agent-mcp/src/agent-mcp-*.js`
- `packages/sdk/src/agent-obligation-client.js`
- `apps/web/src/app.js`
- `apps/web/src/agent-*-manifest.js`
- `api/tenant-protocol/`
- relevant unit, PostgreSQL, security and transport tests

## Acceptance criteria

- [x] Human and Agent owners receive byte-equivalent Obligation and latest
  servicing-action semantics from one handler and one response schema.
- [x] Non-owner, wrong-Tenant, revoked/stale credential, missing projection and
  malformed request cases fail closed without revealing resource existence.
- [x] The result contains only the shared Obligation summary, optional latest
  servicing action, trusted `asOf`, and explicit sandbox/no-funds flags.
- [x] Human reload stores only an opaque ID, re-authorizes through the Tenant
  protocol, and never renders cached Obligation truth.
- [x] Agent SDK and local MCP expose the same exact read and accept no caller
  authentication context or ownership claim.
- [x] Existing execution, repayment, Evidence, Auditor and privileged servicing
  behavior remains unchanged.
- [x] Full unit, PostgreSQL, security, transport and schema gates pass.

## Test commands

```sh
pnpm run check:tenant-protocol
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
git diff --check
```

## Security checklist

- [x] Ownership comes only from the durable authorization resource.
- [x] Query is exact-ID, bounded, read-quota, idempotency-prohibited and
  `fundsAuthority=false`.
- [x] Client storage contains only the opaque identifier and is treated as an
  untrusted lookup hint.
- [x] Response and UI exclude raw PII, credentials, bindings and provider data.
- [x] Human and Agent roles receive the same narrow capability; operator and
  Auditor scopes are not broadened.
- [x] `sandboxOnly=true`, `productionFundsMoved=false` and `withdrawable=false`
  remain explicit.

## Verification evidence

- `pnpm run check`: 301/301 tests passed; 46 schemas, 33 private Tenant
  operations, 50 abuse-control classifications and 23 migrations passed.
- `pnpm run test:postgres`: 61/61 passed on PostgreSQL 17, including exact
  Human/Agent ownership, non-owner and cross-Tenant denial, repayment action
  hydration and process-restart recovery.
- `pnpm run test:security`: 21/21 passed.
- `pnpm run test:transport`: 37/37 passed; the closed Agent surface contains
  eleven local MCP tools.
- Browser QA completed Subject -> Consent -> Intent/Decision/Offer -> exact
  acceptance -> signed sandbox execution -> reload -> repayment -> Cured ->
  Payments reload. A clean tab also restored the same case by exact ID.
- Desktop and 390x844 captures plus the Aave/IPO.ONE comparison are under
  `artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/`.
