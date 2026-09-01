# M3-RESOURCE-001 — Metered machine-service no-funds vertical slice

Status: `IN PROGRESS — L0 LOCAL NO-FUNDS ONLY`

Baseline: `475b7baa6b65fc5d439e79d1fd07da4c4794e590`

Requirements: `REQ-EXEC-002`, `REQ-EXEC-005`, `REQ-CREDIT-005..009`,
`REQ-PAY-001..002`, `REQ-EVID-001..002`, `REQ-PRIV-001`, `REQ-AUTO-001`

## Context and scope

Implement one synthetic Provider, one `inference_tokens` resource class, one
`token` unit and one accepted price schedule. Admit signed, replay-safe metered
usage through the existing Tenant Gateway, Facility/Obligation/Ledger and
Evidence paths, then expose matching Principal Web and Agent API/MCP receipts.

## Non-goals

No external Provider, production credential, deployment, real funds, mainnet,
signer, custody, withdrawal, transfer, new Ledger/Obligation, marketplace,
orchestration platform, pricing decision or risk-policy change.

## Likely files

`schemas/v2/`, `packages/domain/`, `modules/tenant-command-gateway/`, one
additive RLS migration, `packages/api-contract/`, `apps/agent-mcp/`, `apps/web/`
and their tests.

## Acceptance criteria

- Given exact active authority and policy, valid finalized usage creates one
  deterministic capped charge and canonical receipt.
- Identical replay returns the same result without a second charge.
- Forged, conflicting, stale, revoked, wrong-unit, wrong-price, over-cap,
  disputed or unreconciled usage creates no utilization.
- Corrections preserve the original Evidence and post an additive delta.
- PostgreSQL restart/replay and Tenant/RLS denial preserve truth.
- Principal Web and Agent API/MCP show the same state and next action.

## Test commands

```text
node --test packages/domain/test/metered-usage-evidence.test.js
pnpm run check:schemas
pnpm run check:tenant-protocol
pnpm run check:product-traceability
DATABASE_URL=<isolated-postgres> node --test <M3 PostgreSQL tests>
pnpm check
```

## Security checklist

- closed schema and integer arithmetic;
- Provider/key/signature/nonce/window binding;
- Tenant/Actor/Subject/Principal/Mandate/Facility/Authorization recheck;
- exact resource/unit/price hash/caps/expiry;
- replay, correction and unknown-outcome fail closed;
- no prompts, outputs, task content, PII, credentials or raw signatures; and
- no external or real-value authority.

## Data, migration and rollback

Any migration is additive, forced-RLS protected and immutable-history based.
Rollback disables admission, preserves Evidence/Ledger history and removes no
economic record.

## Required Evidence

Exact commit/migration/schema/API versions; positive, denial, replay,
correction, restart/RLS and Web/API/MCP parity; reconciliation; zero scoped
P0/P1; explicit `sandboxOnly=true` and `productionFundsMoved=false`.

Permission/funds/deployment impact: **none**.
