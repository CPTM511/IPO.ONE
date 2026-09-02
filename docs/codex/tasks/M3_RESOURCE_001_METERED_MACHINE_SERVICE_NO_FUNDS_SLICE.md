# M3-RESOURCE-001 — Metered machine-service no-funds vertical slice

Status: `PASS — L0 LOCAL NO-FUNDS VERIFIED`

Baseline: `475b7baa6b65fc5d439e79d1fd07da4c4794e590`

Implementation: `b3cdfe9e5f242a785752ffee3036e6b6d638f8b8`

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

## Completion Evidence

The implementation and acceptance record is bound in
`docs/codex/audits/M3-RESOURCE-001/audit.md`.

- Migration head: `0073_metered_usage_evidence` (`73` ordered up/down pairs).
- Contracts: `147` JSON Schemas and `115` closed Tenant operations.
- Exact synthetic profile: one Provider, `inference_tokens`, `token`, one
  accepted price schedule and one existing Agent/Principal obligation path.
- Positive signed admission, byte-stable replay, conflicting duplicate denial,
  cross-Tenant/RLS denial, additive negative correction, immutable original
  Evidence, restart recovery, balanced Ledger, reconciliation and repayment
  all passed against PostgreSQL 17.
- Principal Web and Agent API/MCP consume the same bounded owned-Evidence
  result and expose the same review action.
- Full `pnpm check`: PASS, including `1257/1257` ordinary tests, security,
  transport, PostgreSQL, schema, protocol, migration, traceability, Web bundle,
  contract and local-stack checks.
- Runtime flags remain `sandboxOnly=true`, `productionFundsMoved=false` and
  `realFundsEnabled=false`; no external Provider or Venue mutation occurred.

This issue completed the shared kernel, durability, Tenant Gateway operation
and receipt projections. It did not wire the synthetic Provider dependencies
into the actual local private-pilot runtime or perform a real local
Provider-to-admission product run. That remaining product acceptance is tracked
by `M3-RESOURCE-002`; it must reuse this same path and must not create a second
product kernel. Stop again before deployment, external Provider integration,
another resource profile, production credentials or any real-value authority.

Final verdict: `PASS — L0 LOCAL NO-FUNDS VERIFIED`.
