# METAMASK-AGENT-001 — Reference Agentic Wallet Adapter

Status: IMPLEMENTED_UNVERIFIED — stopped for Founder review after this adapter

Delivery mode: `L0_LOCAL_NO_FUNDS`

Date: 2026-08-07

Baseline branch: `codex/m1-b-deployable-sandbox`

Baseline commit: `dfba8d7ec6390ec79df6df21886bcf3525702e69`

## Context and current baseline

The Founder authorized Phase 3 after accepting Phase 2 Evidence. The
vendor-neutral `AGENTWALLET-001` SPI and conformance boundary is implemented
and remains unverified. This issue adds only the first Phase 3 reference
adapter. The source plan requires an immediate review stop after each vendor
adapter, so `OKX-AGENT-001` must not start in this delivery.

MetaMask currently exposes Advanced Permissions through ERC-7715 and separately
documents an Agent Wallet CLI with simulation, threat scanning and asynchronous
approval states. Those are external capability claims, not IPO.ONE authority.
This issue converts only trusted, closed observations and canonical permission
projections into local normalized artifacts.

## Scope

- define an exact MetaMask capability-observation contract for the four
  ERC-7715 permission methods and Agent Wallet security features;
- normalize that observation into the canonical Agentic Wallet capability
  contract, treating missing or unknown facts as non-permissive;
- prepare a hash-only ERC-7715 Advanced Permission projection from an already
  verified canonical external permission projection;
- fix `isAdjustmentAllowed=false`, exact CAIP-2-to-hex chain conversion, expiry,
  session and permission-data hash binding;
- compare a normalized wallet permission response against the prepared request
  and return `ALLOW`, `STEP_UP`, `DENY` or `QUARANTINE` without activating a
  grant;
- normalize MetaMask Agent Wallet simulation, threat and asynchronous approval
  facts into a closed security receipt;
- expose an exact nine-method, disabled local reference Provider satisfying the
  vendor-neutral SPI;
- add closed schemas, negative conformance tests and completion Evidence.

## Non-goals

- no `window.ethereum`, Smart Accounts Kit, `mm` CLI or Agent SDK invocation;
- no capability probe, wallet connection, popup, permission request, grant
  query, revocation call or Human approval delivery;
- no mnemonic, key, session file, credential, dependency installation or
  remote endpoint;
- no permission context redemption, DelegationManager call, account deployment,
  bundler, relayer, UserOperation, RPC, signature or transaction submission;
- no token/native allowance permission because current canonical target policy
  fixes approval mode and allowance to none/zero;
- no production, mainnet, Testnet, signer, funds or real-value authority;
- no changes to canonical authorization, preflight, Ledger, Obligation,
  settlement, reconciliation or Evidence business logic;
- no `OKX-AGENT-001` implementation.

## Likely files

- `modules/agentic-execution/src/metamask-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/metamask-agent-wallet-security.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/metamask-agentic-wallet-adapter.test.js`
- `schemas/v2/metamask-agentic-wallet-capability-observation.schema.json`
- `schemas/v2/metamask-advanced-permission-projection.schema.json`
- `schemas/v2/metamask-advanced-permission-response-comparison.schema.json`
- `schemas/v2/metamask-agent-wallet-security-receipt.schema.json`
- `scripts/check-schemas.mjs`
- `docs/codex/audits/METAMASK-AGENT-001/audit.md`

## Given / When / Then acceptance criteria

1. Given a trusted closed observation, when capabilities are normalized, then
   only exact observed support becomes `supported`; absent, malformed or
   `unknown` features remain unavailable.
2. Given Base Sepolia or X Layer Testnet, when a permission projection is
   prepared, then chain hex, projection hash, descriptor hash, capability hash,
   session epoch, permission type/data hash and expiry are exact and immutable.
3. Given IPO.ONE canonical policy forbids token approval and value movement,
   when a MetaMask token/native allowance permission is offered, then the
   adapter denies it rather than inventing authority.
4. Given ERC-7715 may return modified permission values, when the normalized
   response changes chain, type, recipient, permission data, expiry or enables
   adjustment, then the decision is `QUARANTINE`; exact response still requires
   `STEP_UP` because wallet approval is Human authority.
5. Given MetaMask Agent Wallet security facts, when simulation is missing,
   threat state is unknown/malicious, MFA is pending or the observation is
   stale, then the receipt is respectively `DENY`, `QUARANTINE`, `STEP_UP` or
   rejected as stale.
6. Given the reference Provider is registered, when any operation is invoked,
   then static registry gating rejects it before an external call.
7. Given open fields, raw wallet responses, addresses, permission contexts,
   transaction payloads or unsupported RPC methods, when validation runs, then
   they are rejected and are not retained.
8. Given completion Evidence, when reviewed, then no Provider call, permission,
   signature, transaction, wallet state, chain state or funds state exists.

## Exact test commands

```bash
node --test modules/agentic-execution/test/metamask-agentic-wallet-adapter.test.js
pnpm run check:schemas
pnpm run typecheck
pnpm run lint
pnpm test
```

## Security checklist

- [x] Adapter descriptor is disabled and external calls are disabled.
- [x] RPC vocabulary is an exact allowlist with no generic request escape hatch.
- [x] Capability observations are short-lived, synthetic/local and hash-bound.
- [x] Unknown or missing capability cannot become supported.
- [x] Advanced Permission projection cannot encode approval or asset authority.
- [x] `isAdjustmentAllowed` is always false.
- [x] Modified Provider response is quarantined before canonical activation.
- [x] Stale security/capability evidence is non-permissive.
- [x] Raw account, permission context, dependency calldata, signature, secret
      and Provider response are neither accepted nor retained.
- [x] No external permission provisioning, execution, production or funds
      authority exists.

## Permission boundary

Founder approval covers this first Phase 3 adapter only as local synthetic
L0/no-funds implementation and Evidence. It does not authorize installing or
calling MetaMask software, requesting wallet permissions, using credentials,
signing, submitting transactions, accessing Testnet/mainnet, deploying or
moving funds. Any external activation requires a new named permission review.

## Data and migration impact

No migration. All artifacts are immutable in-memory projections and tests.
No wallet response, account address, context, credential, Event or durable
financial record is stored.

## Rollback plan

Remove the MetaMask adapter module, export, three schemas, schema registry
entries, focused test, issue and audit. No external or durable state exists to
reverse.

## Required Evidence

- exact changed-file list and baseline drift statement;
- official-spec mapping for ERC-7715 and current MetaMask capability claims;
- negative proofs for unknown capability, unsupported permission, widened
  response, stale security state and disabled invocation;
- focused, schema, type, lint and repository test results;
- explicit external-call/no-signature/no-transaction/no-funds proof;
- clickable local product review URL;
- explicit stop before `OKX-AGENT-001`.

## Dependency and sequencing notes

Depends on ADR-038, Phase 2 contracts and `AGENTWALLET-001`. Vendor logic must
remain outside the shared Kernel and Provider foundation. Completion of this
issue requires a review stop; `OKX-AGENT-001` remains gated.

## Completion Evidence

Implemented and stopped after the first Phase 3 adapter. See
`docs/codex/audits/METAMASK-AGENT-001/audit.md`.
