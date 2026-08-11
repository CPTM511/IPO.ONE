# SAFE-AGENT-001 — Institutional Smart Account Reference Adapter

Status: `COMPLETE — VERIFIED_SANDBOX DISABLED REFERENCE ADAPTER`

Phase: 5 — Additional Providers

Date: 2026-08-10

## Context

The AECL delivery plan permits Safe/institutional wallets only through the
existing Agentic Wallet Provider SPI and conformance suite. Phase 1 already
provides EIP-712, ERC-1271 and ERC-6492 compatibility; Phase 2 provides the
canonical grant, target policy, preflight, simulation, effects and decision
kernel. Phase 5 must therefore be an adapter task, not a new Credit,
Obligation, Mandate, Ledger or execution-authority system.

Safe Smart Accounts support threshold owner signatures, EIP-712 transaction
hashing and ERC-1271 contract-signature validation. Safe Modules are materially
more powerful: an enabled module may execute through the Safe without the
normal owner-signature path. The reference adapter must fail closed on modules,
configuration drift, unknown capability or stale observation.

Governing requirements: `REQ-ID-004`, `REQ-EXEC-001`, `REQ-EXEC-004`,
`REQ-RISK-002`, ADR-038 and the AECL Phase 5 delivery plan.

## Scope

- Add a disabled-by-default Safe/institutional reference adapter through the
  existing `AgenticWalletProvider` SPI.
- Normalize a short-lived, hash-only Safe capability and account-configuration
  observation for Base Sepolia and X Layer Testnet profiles only.
- Project one canonical `walletPrepareExecution` request into a Safe
  transaction review record without retaining raw calldata, account addresses,
  signatures or provider responses.
- Require canonical `PreparedExecution` and `TransactionPreflightReceipt`
  truth; the adapter cannot create or widen either object.
- Map a clean, supported, module-free observation to `STEP_UP`; map unsupported
  required capability to `DENY`; map unknown capability, enabled modules or
  account-configuration drift to `QUARANTINE`.
- Permit `CALL` projection only. Deny `DELEGATECALL`, module execution,
  provider-side adjustment, raw passthrough and transaction submission.
- Add closed schemas, conformance fixtures, unit/security checks, boundary
  Evidence and an ADR/audit checkpoint.

## Non-goals and permission boundary

- No Safe creation, deployment, owner/threshold change, module/guard/fallback
  handler activation, Transaction Service call or Protocol Kit dependency.
- No signature collection, ERC-1271 network verification, Safe transaction
  hash claim, wallet RPC call, relayer, bundler or onchain transaction.
- No OpenAPI/SDK/MCP operation change: the existing canonical wallet operations
  remain the only transport surface.
- No new chain, contract, code hash, target, Provider, credential, secret,
  custody, production dependency, mainnet, deployment, real value, transfer,
  withdrawal or funds authority.
- No change to Credit, Obligation, Facility, Mandate, Ledger, Event, Evidence
  or reconciliation semantics.

## Likely files

- `modules/agentic-execution/src/safe-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/safe-agentic-wallet-adapter.test.js`
- `modules/agentic-execution/test/fixtures/safe-agentic-wallet-conformance.v1.json`
- `schemas/v2/safe-agentic-wallet-capability-observation.schema.json`
- `schemas/v2/safe-transaction-projection.schema.json`
- `schemas/v2/safe-account-configuration-comparison.schema.json`
- `docs/codex/audits/SAFE-AGENT-001/audit.md`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`

## Acceptance criteria

1. The adapter satisfies the existing SPI descriptor/provider shape without
   changing the SPI or canonical Credit/Obligation objects.
2. Only `eip155:84532` and `eip155:1952` are admitted; unknown chains fail.
3. Observations expire within five minutes and bind descriptor, chain,
   `contextEpoch`, Safe version, implementation/configuration hashes,
   threshold, nonce and exact capability statuses.
4. Unknown capability does not widen authority; stale observation fails.
5. Canonical `DENY`/`QUARANTINE` preflight cannot become provider approval.
6. Unsupported required Safe capability returns `DENY`.
7. Any enabled Safe Module, `DELEGATECALL`, owner/threshold/nonce/implementation,
   guard, fallback-handler or module-set drift returns `QUARANTINE` or `DENY`.
8. A clean supported fixture returns only `STEP_UP`; submission remains false.
9. Registry invocation fails because the reference provider is disabled and
   `externalCallsEnabled=false`.
10. Raw address, calldata, signature, credential and provider-response fields
    are rejected or absent from every durable/output projection.
11. Existing unit, schema, transport and migration gates remain green.

## Test commands

```sh
node --test modules/agentic-execution/test/safe-agentic-wallet-adapter.test.js
node --test modules/agentic-execution/test/*.test.js
pnpm test
pnpm run check:schemas
pnpm run check:migrations
git diff --check
```

No real-provider browser test applies because external Safe calls are explicitly
disabled. The required real-provider Evidence for a future activation remains a
separate reviewed issue.

## Security checklist

- [x] Descriptor, capability, chain, epoch and request hashes are exact.
- [x] Capability `unknown` is non-permissive and stale observations fail.
- [x] Safe Modules quarantine the projection because they may bypass normal
      owner-signature execution.
- [x] `DELEGATECALL`, raw calldata passthrough and provider adjustment are
      denied.
- [x] Canonical preflight remains mandatory and provider output cannot widen it.
- [x] Threshold approval is represented as `STEP_UP`, never silent `ALLOW`.
- [x] No raw account address, owner address, signature, credential or response
      is retained.
- [x] Adapter kill switch is the disabled descriptor plus registry denial.
- [x] Production, mainnet, deployment, custody and funds authority are false.

## Migration impact

None. This slice adds no table or canonical persistence behavior. New artifacts
are closed hash-only projections validated by JSON Schema.

## Module-size rationale

The Safe adapter is 576 lines because it keeps creation and independent
verification for three closed, hash-bound artifacts beside the disabled SPI
provider. Splitting the validators would add cross-module state vocabulary for
one provider without reducing behavior. This follows the existing reference
adapter pattern and introduces no new business kernel; a later external Safe
activation must split transport from projection before adding any network code.

## Rollback

Remove the Safe adapter export, its three schemas, fixtures, tests and audit
checkpoint. No database or canonical aggregate rollback is required. Preserve
all existing Phase 1–4 Evidence.

## Completion Evidence

Record exact focused/full test counts, schema inventory, changed files,
provider-boundary result, feature-flag state and the absence of external calls.
Completion may be `VERIFIED_SANDBOX` only, never Testnet, hosted, production or
real-value active.

Completed Evidence:
`artifacts/sandbox/safe-agent-001-conformance-20260810.json`.

Final verification: focused `9/9`, agentic-execution `51/51`, complete unit
`880/880`, transport `74/74`, fresh isolated PostgreSQL `85/85`, schemas
`131/131`, migrations `60/60`, source/boundary lint PASS, typecheck PASS and
`git diff --check` PASS. No external call or permission activation occurred.
