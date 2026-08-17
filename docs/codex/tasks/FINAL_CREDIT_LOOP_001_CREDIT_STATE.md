# FINAL-CREDIT-LOOP-001 / CREDIT_STATE_001

Status: `IN PROGRESS`

## Context

Terminal sandbox Obligation outcomes are durable, but the released product has
no durable, queryable Credit State projection. The current Track Record derives
a browser-local summary from one loaded Obligation and therefore cannot prove
cross-cycle history, outcome impact, replay parity, or restart recovery.

## Scope

- Add `credit_state_projection.v1`, derived only from immutable
  `credit_outcome.v1` records.
- Materialize the projection idempotently in the existing worker/Cron path.
- Add one authorized Human/Agent query over the shared Subject resource.
- Render outcome chronology and qualitative, Evidence-supported impact in the
  Human Credit Track Record.
- Expose the same query through the Agent SDK and MCP adapter.
- Identify the existing selective-disclosure artifact accurately as a
  Decision Passport; do not represent it as an outcome-history passport.

## Non-goals

- No universal score, automatic limit change, model authorization, real funds,
  mainnet, custody, signer, arbitrary spend, or new sensitive data.
- No restoration of the process-local legacy credit-learning `Map` service.
- No mutation of immutable `credit_outcomes`.

## Likely files

- `db/migrations/0062_durable_credit_state_projection.*.sql`
- `modules/credit-learning/src/*`
- `modules/tenant-command-gateway/src/*`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/sdk/src/agent-mcp-client.js`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `apps/web/src/{app.js,index.html}`
- focused unit, PostgreSQL, transport, and browser tests

## Acceptance criteria

- On-time, late/modified, and written-off outcomes produce deterministic
  qualitative factors and chronology without a score.
- Duplicate and reordered inputs produce the same projection hash.
- Worker replay repairs a missing/stale projection and creates no duplicate
  outcome.
- The projection survives PostgreSQL and worker restart and remains Tenant and
  Subject isolated.
- Human and Agent reads return the same projection schema and exact hash.
- Track Record visibly shows terminal outcome, chronology, impact, and Evidence
  lineage from the server response.

## Test commands

```sh
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run test:security
pnpm run test:transport
pnpm test
DATABASE_URL='<ephemeral PostgreSQL 17 URL>' pnpm run test:postgres
pnpm run test:browser:click-path
```

## Security and permission boundary

- The projection is non-authorizing, score-free, no-funds, Tenant-scoped, and
  contains only hashes, canonical IDs, outcome labels, bounded aggregates, and
  Evidence lineage already permitted by the outcome boundary.
- This issue permits an additive migration and the existing no-funds hosted
  sandbox deployment. It grants no chain write, production credit activation,
  real-value, signer, custody, or privacy-boundary authority.

## Data and rollback

- Add one derived table. The up migration is replay-safe and contains no source
  record rewrite.
- Down migration refuses to drop populated projection state. Rollback the code
  by restoring the prior deployment; retain the additive table until an owner
  explicitly verifies it is empty or authorizes derived-data deletion.

## Completion Evidence

Pending exact PR SHA, CI run, migration receipt, deployment ID, Human/Agent
query receipts, restart replay, and visible browser acceptance.
