# EXEC-001 — DelegatedWalletGrant + ExecutionTargetPolicy

Status: COMPLETE — Founder authorized on 2026-08-07 after accepting Phase 1 Evidence

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

ADR-038 and the AECL plan require the first Phase 2 issue to project current
Mandate, SpendPolicy, CreditLine, Obligation, AccountBinding and Tenant AuthZ
into a narrower wallet grant. Phase 1 delivered the connector and universal
signature boundary but intentionally left grant, target-policy and pending
exposure data absent.

## Scope

- add closed `DelegatedWalletGrant`, `ExecutionTargetPolicy` and pending
  exposure contracts;
- derive grant limits as the minimum of current canonical authority instead of
  accepting caller-authored limits;
- permit only the current Base Sepolia and X Layer Testnet profiles;
- add Human Principal Controller prepare/activate/revoke and owned Human/Agent
  read authorization policy without adding transport handlers;
- keep activation local-sandbox-only, non-signing and non-transacting;
- persist target policies, grants, transitions and pending exposure in
  Tenant-scoped forced-RLS tables with immutable ownership;
- commit state, Event, Evidence, outbox and durable response atomically through
  the existing serializable event runtime;
- reserve pending exposure under row locks against per-action, rolling-24h,
  aggregate and Obligation limits;
- enforce expiry, revocation, quarantine and `sessionEpoch` drift fail closed;
- add unit, authorization, schema, migration and PostgreSQL/RLS/concurrency
  Evidence.

## Non-goals

- no exact transaction payload, calldata, simulation or effects extraction;
- no `ALLOW | STEP_UP | DENY | QUARANTINE` preflight decision;
- no wallet submission, external permission provisioning or Provider adapter;
- no OpenAPI, SDK, MCP or browser mutation surface;
- no Risk/Operations grant mutation capability, global/adapter/chain control,
  production role or numeric production limit;
- no contract, credential, external signing, Testnet write, deployment,
  custody, real value or funds authority;
- no change to canonical credit, Obligation, Ledger or settlement truth.

## Likely files

- `packages/domain/src/enums.js`
- `modules/agentic-execution/src/*`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `schemas/v2/delegated-wallet-grant.schema.json`
- `schemas/v2/execution-target-policy.schema.json`
- `schemas/v2/pending-exposure-reservation.schema.json`
- `db/migrations/0055_agentic_execution_grants.*.sql`
- focused unit/PostgreSQL tests and completion audit.

## Acceptance criteria

1. A grant cannot be projected without a fresh server-created Authorization
   decision and mutually consistent active Mandate, SpendPolicy, CreditLine,
   Obligation and AccountBinding.
2. Grant chains, assets, Provider, targets, lifetime and limits are subsets of
   current canonical authority; unknown or changed authority rejects.
3. Prepared activation accepts only a strictly equal-or-narrower local
   permission projection and never contacts a wallet or Provider.
4. Revoked, expired or quarantined grants cannot become active again.
5. Account, chain or `sessionEpoch` drift prevents reservation.
6. Pending exposure is reserved in one serializable transaction under locks
   and cannot exceed per-action, rolling, aggregate or Obligation ceilings.
7. Every mutation creates immutable Event/Evidence/outbox records and an
   idempotent response in the same transaction.
8. Every new table is Tenant-scoped, forced-RLS, ownership-immutable and
   covered by cross-Tenant denial tests.
9. The runtime and receipts expose `transactionsAllowed=false`,
   `productionAuthority=false` and `fundsAuthority=false`.

## Test commands

```bash
node --test \
  modules/agentic-execution/test/agentic-execution-grant.test.js \
  modules/authorization/test/authorization-policy.test.js
pnpm run check:schemas
pnpm run check:migrations
pnpm run test:postgres
pnpm test
```

## Security checklist

- [x] External permission never exceeds live canonical authority.
- [x] Caller cannot choose grant monetary limits.
- [x] Unknown target, selector, chain, account or session fails closed.
- [x] Withdrawal, transfer, native value and token allowance default to zero/false.
- [x] Pending exposure cannot be double-reserved concurrently.
- [x] Revocation and expiry are monotonic.
- [x] Raw accounts, signatures, credentials and Provider payloads are not persisted.
- [x] No transaction, external call, production or funds authority is reachable.

## Permission boundary

The Founder authorized only this local no-funds permission/data scope. Human
Principal Controllers may prepare, locally activate and revoke owned grants;
Agents may read owned grants. EXEC-002/003, Risk/Operations grant controls,
provider permissions and all external execution remain separately reviewed.

## Migration impact

Migration 0055 will add only projection, transition and pending-exposure
tables. It adds no external dependency and does not modify Ledger balances.

## Rollback plan

The down migration must refuse rollback while a grant has an active pending
exposure, then remove the additive tables and functions. Code rollback removes
the internal policy, domain and store surfaces. No chain or economic state is
created.

## Completion Evidence

See `docs/codex/audits/EXEC-001/audit.md` for changed-file proof, the permission
matrix, schema/migration/RLS results, atomic reservation evidence, the remaining
EXEC-002 gate and the working local product URL.
