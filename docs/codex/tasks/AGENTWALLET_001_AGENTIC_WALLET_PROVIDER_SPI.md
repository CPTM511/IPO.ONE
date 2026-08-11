# AGENTWALLET-001 — Agentic Wallet Provider SPI

Status: IMPLEMENTED_UNVERIFIED — Phase 3 adapter-foundation review required

Delivery mode: `L0_LOCAL_NO_FUNDS`

Date: 2026-08-07

Baseline branch: `codex/m1-b-deployable-sandbox`

Baseline commit: `dfba8d7ec6390ec79df6df21886bcf3525702e69`

## Context and current baseline

ADR-038 fixes one vendor-neutral Delegated Agentic Wallet Provider SPI after
the Phase 2 grant, exact-payload, preflight and transport contracts. EXEC-001
through EXEC-003 are implemented but remain unverified pending Founder review.
The Founder has now authorized Phase 3. The smallest active issue is the
provider-neutral SPI and conformance harness; MetaMask and OKX remain separate
later adapter issues.

The accepted stacked worktree is intentionally dirty with Phase 1 and Phase 2
implementation and Evidence. This issue preserves that work and does not claim
a sealed release candidate.

## Scope

- define the exact versioned Provider descriptor and capability contract;
- define the closed SPI methods fixed by ADR-038;
- validate JSON-safe, bounded, immutable operation inputs and normalized
  results;
- compile an external permission projection that is equal to or narrower than
  one verified `DelegatedWalletGrant` and `ExecutionTargetPolicy`;
- add a static in-process registry with unique adapter IDs and no dynamic code
  loading;
- add a reusable conformance harness proving method, payload, result, stale
  context and fail-closed behavior;
- provide one disabled local reference provider proving that catalog presence
  cannot call an external system;
- add closed JSON Schemas and completion Evidence.

## Non-goals

- no MetaMask, OKX or other vendor adapter;
- no Provider discovery over network, SDK, MCP, CLI, TEE or wallet API;
- no external permission provisioning, grant activation, Human popup or
  step-up delivery;
- no wallet signature, transaction, UserOperation, RPC, chain write or funds
  movement;
- no new production dependency, credential, secret, contract, deployment,
  Testnet/mainnet profile or remote endpoint;
- no adapter/global/chain pause permission or operational authority;
- no changes to canonical Mandate, SpendPolicy, CreditLine, Obligation, Ledger,
  Event, Evidence or reconciliation semantics;
- no implementation of `METAMASK-AGENT-001` or `OKX-AGENT-001`.

## Likely files

- `modules/agentic-execution/src/agentic-wallet-provider.js`
- `modules/agentic-execution/src/agentic-wallet-provider-conformance.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/agentic-wallet-provider.test.js`
- `schemas/v2/agentic-wallet-provider-descriptor.schema.json`
- `schemas/v2/agentic-wallet-provider-capabilities.schema.json`
- `schemas/v2/external-wallet-permission-projection.schema.json`
- `schemas/v2/agentic-wallet-provider-request.schema.json`
- `schemas/v2/agentic-wallet-provider-result.schema.json`
- `scripts/check-schemas.mjs`
- `docs/codex/audits/AGENTWALLET-001/audit.md`

## Given / When / Then acceptance criteria

1. Given a provider implementation, when it is registered, then its descriptor
   and exact nine-method SPI are closed, versioned, immutable and unique.
2. Given missing, malformed, changed, unsupported or `unknown` capabilities,
   when the provider is evaluated, then the relevant operation is unavailable
   and no broader fallback is selected.
3. Given a verified active canonical grant and target policy, when an external
   permission is compiled, then every chain, target, selector, asset, limit,
   expiry and session epoch is equal to or narrower than canonical authority.
4. Given a provider result, when it is normalized, then it is bounded,
   operation-bound, hash-bound, redacted and cannot claim canonical Ledger or
   settlement truth.
5. Given a prepared execution and preflight receipt, when `submit` is invoked
   through the disabled local provider, then it rejects before any external
   call with a stable no-funds reason code.
6. Given extra methods, open input fields, an alternate payload, stale context,
   capability drift or a widened permission, when conformance runs, then the
   adapter fails closed.
7. Given two adapters with the same ID or a request for an unregistered or
   disabled adapter, when the registry resolves it, then resolution fails
   without dynamic loading or fallback.
8. Given this issue is complete, when repository Evidence is reviewed, then no
   external response, credential, signature, transaction or financial state
   exists.

## Exact test commands

```bash
node --test modules/agentic-execution/test/agentic-wallet-provider.test.js
pnpm run check:schemas
pnpm run typecheck
pnpm run lint
pnpm test
```

## Security checklist

- [x] Provider IDs and descriptors are bounded and server-configured.
- [x] The registry performs no dynamic import, package discovery or URL load.
- [x] Unknown capability is non-permissive and no raw fallback exists.
- [x] Permission projection cannot widen grant or target policy.
- [x] Exact prepared payload and preflight hashes cannot be substituted.
- [x] Disabled, stale, changed or unregistered providers fail before invocation.
- [x] Provider results cannot mutate Ledger, Obligation or settlement truth.
- [x] No raw signature, credential, PII, secret or unbounded vendor response is
      accepted or persisted.
- [x] Withdrawal, transfer, broad approval and arbitrary calldata remain
      unavailable.

## Module-size split rationale

`agentic-wallet-provider.js` is temporarily larger than the 500-line SHOULD
target because descriptor, capability, permission, request and result hashes
share one private closed-shape/canonicalization boundary. Splitting those
private canonicalizers before the first conformance baseline would create
duplicate hash semantics or circular imports. The independently evolving
conformance runner is already split into its own module. The first vendor
adapter issue must keep vendor code in a separate sub-500-line module and may
not add vendor logic to this foundation file; a behavior-preserving contracts /
permission / runtime split is required before this foundation grows further.

## Permission boundary

This Phase 3 authorization is applied to the vendor-neutral L0 local no-funds
SPI and conformance harness only. It grants no external Provider permission,
credential, signer, RPC, wallet popup, transaction, UserOperation, chain write,
deployment or funds authority. Vendor adapters remain separate active issues
and must stop for review after each adapter.

## Data and migration impact

No migration is planned. AGENTWALLET-001 adds contracts, pure validation,
in-memory static registration and tests only. Phase 2 PostgreSQL execution and
Evidence tables remain unchanged.

## Rollback plan

Remove the provider-neutral module, its export, schemas, schema registry entries
and focused tests. No database, Provider, wallet, chain or funds state exists
to reverse.

## Required Evidence

- exact changed-file list and baseline drift statement;
- conformance matrix for all nine SPI methods;
- negative proofs for unknown capability, open shape, widened permission,
  stale context, duplicate/unregistered adapter and disabled submit;
- schema, lint, type and repository test results;
- explicit external-call and no-funds proof;
- clickable local product review URL;
- completion audit with remaining MetaMask/OKX gates.

## Dependency and sequencing notes

This Founder-directed AECL issue is an approved scoped exception to the general
ordered product program and does not partially implement unrelated later
issues. It depends on ADR-038 and the Phase 2 contracts. `METAMASK-AGENT-001`
and `OKX-AGENT-001` may start only as separate issue-sized deliveries; each
must stop for review after its adapter Evidence.

## Completion Evidence

Implemented and stopped at the provider-foundation boundary. See
`docs/codex/audits/AGENTWALLET-001/audit.md`.
