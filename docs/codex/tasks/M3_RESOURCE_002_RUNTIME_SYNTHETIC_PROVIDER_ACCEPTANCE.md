# M3-RESOURCE-002 — Runtime synthetic Provider and co-equal product acceptance

Status: `PASS — L0 LOCAL NO-FUNDS VERIFIED`

Baseline: `2c6d2493b1ab514b4ae1a8628ed00fc4f9d21036`

Implementation: `18cbdea64a7168b60633d3ce81a29f6b9669d3ff`

Evidence: `docs/codex/audits/M3-RESOURCE-002/audit.md`

Requirements: `REQ-EXEC-002`, `REQ-EXEC-005`, `REQ-CREDIT-005..009`,
`REQ-PAY-001..002`, `REQ-EVID-001..002`, `REQ-PRIV-001`, `REQ-AUTO-001`

## Context

`M3-RESOURCE-001` completed the shared Metered Usage domain, PostgreSQL,
Tenant Gateway, Evidence, Ledger and read-projection foundations. Its tests
also proved an injected synthetic Provider profile. The actual local product
runtime, however, still uses fail-closed default Provider dependencies and has
no operable Provider-to-admission path. Web can render a receipt only after one
already exists. This task closes that runtime/product gap without creating a
second obligation or business kernel.

## Scope

- add one local-only synthetic `provider_gateway_compute` signing adapter;
- persist its key material outside source control and bind one exact key ID;
- provision one exact Provider and per-Obligation SpendPolicy through the
  existing event/projection repositories;
- inject exact policy resolution and signature verification into the local
  private-pilot runtime only;
- provide one explicit, replay-safe local Provider command that signs and
  submits finalized `inference_tokens` / `token` usage;
- prove the Principal Web view and Agent API/MCP read the same durable receipt;
- prove refresh/restart/replay and representative denial behavior.

## Non-goals

No production runtime change, deployment, external Provider, production
credential, Provider marketplace, second resource profile, new Ledger or
Obligation, pricing/risk-policy decision, real funds, mainnet, signer custody,
withdrawal or transfer.

## Likely files

`apps/private-pilot/src/`, `apps/private-pilot/test/`,
`apps/private-pilot/test-postgres/`, `scripts/`, `package.json`, the M3 task and
audit records, and only directly required local-stack checks.

## Acceptance criteria

1. A local Agent Obligation with an active exact Mandate admits one signed,
   finalized and reconciled synthetic usage record with a deterministic charge.
2. The same idempotency key replays the byte-equivalent receipt and creates no
   second charge; conflicting identity or invalid signature fails closed.
3. The Provider key, resource, unit, price schedule and numerical caps are
   server-controlled; callers cannot redefine charge truth.
4. The receipt survives process restart and is visible from normal Principal
   Web navigation without internal IDs.
5. The Agent reads the same Evidence through the existing versioned API/MCP
   query surface.
6. No manual database edit is required for the workflow.
7. All results remain `sandboxOnly=true`, `productionFundsMoved=false` and
   `realFundsEnabled=false`.

## Test commands

```text
node --test apps/private-pilot/test/local-synthetic-metered-provider.test.js
DATABASE_URL=<isolated-postgres> IPO_ONE_LOCAL_METERED_USAGE_ACK=I_UNDERSTAND_LOCAL_SYNTHETIC_METERED_USAGE_ONLY pnpm run local:metered-usage --run-id <run-id>
pnpm run check:local-stack
DATABASE_URL=<isolated-postgres> pnpm check
```

## Security and permission boundary

- local profile only, with an explicit synthetic-only acknowledgement;
- private key file mode `0600`, parent directory mode `0700`, never logged or
  returned in receipts;
- exact Provider/key/resource/unit/price/cap/expiry bindings;
- System Worker-only admission through the existing authorization policy;
- no prompts, outputs, task content, PII, raw signature or secret persistence;
- fail closed on missing/stale/revoked/mismatched/replayed state; and
- no deployment, external service, signer, capital or real-value authority.

## Migration and rollback

No schema migration is planned. Rollback removes the local adapter/runtime
wiring and command entrypoint. Existing immutable Evidence and Ledger records
remain readable; no economic history is deleted.

## Required completion Evidence

Bind the exact commit, local runtime profile, Provider key ID, policy hash,
Obligation/Evidence/admission identifiers, replay result, Ledger balance,
Web/API/MCP parity, restart recovery, denial checks, full regression result and
an explicit statement that no production or real-value mutation occurred.

Final verdict: `PASS — L0 LOCAL NO-FUNDS VERIFIED`. This is local CODE,
RUNTIME and VERIFIED Evidence only. It is not DEPLOYED or production REACHABLE
Evidence and grants no external Provider, production or real-value authority.
