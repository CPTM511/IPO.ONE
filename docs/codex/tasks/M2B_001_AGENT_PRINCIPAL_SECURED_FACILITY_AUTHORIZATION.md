# M2B-001 — Agent/Principal secured-Facility authorization

Status: `FOUNDER-ACCEPTED LOCAL ENGINEERING — AUTHENTICATED PRODUCT REVIEW PENDING`

Baseline: `ad5cce4c3477cb5732f4601d892e13e223382abe`

Requirements: `REQ-CORE-001`, `REQ-ID-002`, `REQ-ID-004`, `REQ-ID-005`,
`REQ-CREDIT-008`, `REQ-TRADE-001`, `REQ-TRADE-005`, `REQ-AGENT-POOL-001`,
`REQ-EVID-001`, `REQ-EVID-002`

## Context

The bounded v0.2.0 M2A review passed. The repository already has the shared
Agent Subject, accountable Principal, active Mandate, execution
AccountBinding, canonical Obligation, Trading Capital Facility and finalized
Pool Obligation binding/projection. It does not yet have one durable object
that proves all of those exact authorities converge before an Agent may enter
the M2B goal-level execution family.

## Scope

- Add one closed domain authorization binding an active Agent Subject,
  accountable Principal, active exact Mandate, active execution
  AccountBinding, canonical pool-backed Obligation, active Pool binding and
  one Trading Capital Facility over the same Obligation.
- Bind the authorization to the goal-level operation family
  `agent_trading_capital_intent.v1`, limited to `open` and protective `close`.
- Persist the authorization with forced Tenant RLS, idempotent command
  Evidence and explicit revocation.
- Expose create/read/revoke through the same Tenant protocol, Agent SDK and MCP
  surfaces.
- Deny stale, expired, revoked, replayed, wrong-account, wrong-Subject,
  wrong-Principal, wrong-Obligation, wrong-Facility or unreconciled requests
  before any nonce or signing boundary.

## Non-goals

- No Hyperliquid network call, venue binding, delegate, signer, nonce,
  transaction preparation or submission.
- No withdrawal, transfer, custody, leverage-on-leverage, mainnet, real funds,
  production credential or public deployment.
- No second Subject, Mandate, Facility, Obligation, Ledger, Event, Evidence or
  reconciliation kernel.
- No numerical live-risk policy and no M2B-002 implementation.

## Likely files

- `packages/domain/src/agent-secured-facility-authorization.js`
- `packages/api-contract/src/tenant-protocol.js`
- `schemas/v2/tenant-protocol-request.schema.json`
- `modules/tenant-command-gateway/src/agent-secured-facility-authorization-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `db/migrations/0066_agent_secured_facility_authorizations.*.sql`
- Agent SDK/MCP adapters and focused tests

## Acceptance criteria

- Given exact current shared-kernel resources, when authorization is created,
  then one immutable hash binds every resource/version and the closed operation
  family without granting venue or funds authority.
- Given the same request and idempotency identity, when replayed, then the same
  authorization and Evidence are returned without a duplicate row or Event.
- Given any stale, expired, revoked, mismatched or unreconciled input, when
  creation or read-for-use is attempted, then the request denies before nonce,
  signing or external execution.
- Given revocation, when the Agent retries, then new-risk authorization remains
  denied after restart while the historical Event/Evidence remains queryable.
- Human Web and Agent protocol surfaces continue to read the same canonical
  Obligation and Facility; no parallel economic state is introduced.

## Test commands

```sh
node --test packages/domain/test/agent-secured-facility-authorization.test.js
node --test modules/tenant-command-gateway/test/agent-secured-facility-authorization-handlers.test.js
node --test apps/agent-mcp/test/agent-secured-facility-authorization-mcp-adapter.test.js
pnpm test:postgres
pnpm test:security
pnpm test:transport
pnpm test
```

## Security checklist

- [ ] Closed inputs and exact identifiers/versions/hashes.
- [ ] Tenant, Actor, Subject, Principal and resource authorization rerun.
- [ ] Current Mandate, AccountBinding, Facility, Pool binding and reconciliation
  required.
- [ ] Revocation, expiry, replay and restart fail closed.
- [ ] No raw account, signature, private key, credential, KYC or PII persisted.
- [ ] Venue/network/submission/signing/funds authority hard-coded false.
- [ ] Event, Evidence and response are atomic and idempotent.

## Permission boundary

Founder authorization unlocks only this L0 local no-funds binding. M2B-002 and
every external signer, nonce, Hyperliquid write, testnet run, deployment,
mainnet or real-value action require their own later approval.

## Data and migration impact

One additive forced-RLS table and projection type are permitted. The down
migration may run only while the table is empty; accepted authorization and
revocation Evidence is append-only.

## Rollback

Disable the operation catalog, revoke active authorizations, preserve Event and
Evidence history, and retain the M2A Pool/Obligation truth unchanged. Do not
delete or rewrite canonical economic history.

## Required Evidence

Focused domain/gateway/SDK/MCP/PostgreSQL tests, negative matrix, migration and
RLS checks, restart/replay receipt, aggregate gates, exact SHA and clickable
local product URL.

## Sequencing

M2B-001 follows the accepted v0.2.0 review. M2B-002 remains blocked until this
issue is completed, independently reviewed where required and explicitly
accepted.

Founder acceptance of the local engineering result was recorded on 2026-08-25
for exact commit `2e27c35d09530404a2eea9b35168abcbb7306cbc`. Both GitHub quality
gates passed and the exact local stack was healthy. The controlled in-app
browser had no compatible EVM wallet, so authenticated visible-click product
acceptance was not claimed and PR #54 remains Draft. The Founder separately
authorized M2B-002 local pre-write composition to proceed as a stacked branch;
that authorization grants no Hyperliquid write, signer, nonce, launch-profile,
mainnet, real-value or production authority.
