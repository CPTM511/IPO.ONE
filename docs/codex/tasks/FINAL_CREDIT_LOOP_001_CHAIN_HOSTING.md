# FINAL-CREDIT-LOOP-001 — CHAIN_HOSTING_001

## Context

The repair pack requires the hosted product to distinguish an offchain Evidence
digest from transaction submission, observation, finality and reconciliation.
The current Vercel Sandbox has no approved testnet signing authority. Historical
CHAIN artifacts therefore cannot prove or stand in for a signed-in user's
current lifecycle.

## Scope

- publish exact-release hosted chain capability at
  `/.well-known/ipo-one.json`;
- compose the current production capability as `DISABLED`;
- expose that discovery route in the Human and Agent OpenAPI contracts;
- render the same status through the visible Obligation Evidence receipt;
- keep current-user Evidence digests dynamic and offchain;
- hide chain mutation controls and explorer links while disabled;
- preserve explicit lifecycle vocabulary for queued, submitted, observed,
  finalized, reconciled and failed states;
- update deployment guidance and traceability.

## Non-goals

- no transaction submission;
- no signer, private key, RPC, contract or attestor credential;
- no mainnet, custody, funds movement, arbitrary spend or withdrawal authority;
- no use of historical artifacts as current-user Evidence;
- no activation path through an environment variable.

## Likely files

- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/src/tenant-openapi.js`
- `apps/private-pilot/src/production-runtime.js`
- `apps/web/src/app.js`
- production-host and real-browser tests
- deployment and traceability documentation

## Acceptance criteria

1. The hosted capability document binds chain status to the exact release SHA.
2. Current Vercel composition reports `DISABLED` and no configured chain stage.
3. Human UI visibly says `DISABLED`, explains why, and claims no transaction,
   observation, finality or reconciliation.
4. Agent OpenAPI exposes the equivalent machine-readable discovery operation.
5. Enabled status is rejected unless all Base Sepolia submission, observation,
   finality and reconciliation stages are explicitly composed.
6. Current-user Evidence digests remain offchain and historical artifacts are
   explicitly non-current.

## Test commands

```bash
node --test apps/tenant-api/test/production-tenant-host.test.mjs
pnpm run check:openapi
pnpm run test:browser:click-path
pnpm run lint
pnpm run typecheck
pnpm run test:security
pnpm test
```

## Security checklist

- [x] Current composition is fail-closed `DISABLED`.
- [x] No signer or transaction authority is introduced.
- [x] No PII, KYC, payload or full credit history is placed onchain.
- [x] Historical artifacts are not current-user records.
- [x] Explorer links and mutation controls remain hidden without composition.
- [x] Real funds, mainnet, custody and arbitrary spend remain disabled.

## Permission boundary

This PR implements truthful disabled status only. Enabling Base Sepolia writes
requires separate approved authority and a fully composed worker, observer,
finality and reconciliation path. It grants no production financial authority.

## Migration impact

None. This stage reads the migration-0062 durable Evidence/Credit State product
and adds no database schema.

## Rollback plan

Rollback the application deployment to the recorded PR2 or PR1 Vercel
deployment. Do not roll back or delete PostgreSQL state. Re-check Cron and exact
migration compatibility before promotion.

## Completion Evidence

- production-host capability assertions;
- Agent OpenAPI discovery assertion;
- real Chromium visible disabled-state assertion;
- exact commit, Vercel deployment ID, health and acceptance results in the
  FINAL-CREDIT-LOOP-001 completion report.
