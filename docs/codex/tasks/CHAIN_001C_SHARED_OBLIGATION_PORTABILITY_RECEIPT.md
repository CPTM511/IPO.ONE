# CHAIN-001C: Shared Obligation Portability Receipt

Status: Implemented and verified locally on 2026-07-16 under the already-approved CHAIN-001A, CREDIT-001E/F,
SERVICING-001, HUMAN-001C, and TRANSPORT-001 boundaries. This task composes
existing sandbox-only contracts and grants no new operation, permission,
endpoint, network, key, deployment, or funds authority.

## Context

IPO.ONE already proves that one provider-neutral adapter handles Base Sepolia
(`eip155:84532`) and X Layer Testnet (`eip155:1952`) with deterministic
finality, reorg, replay, failover, and cap behavior. Human and Agent pilots now
also produce closed receipts for the same shared `obligation.v2`, signed
sandbox execution, Ledger posting, and synthetic repayment lifecycle.

The remaining local conformance gap is to bind an actual Human or Agent
sandbox Obligation repayment to both approved chain profiles without allowing
chain, transaction, block, provider, or RPC fields into the canonical Payment
or Obligation kernel.

## Scope

- Parameterize the existing CHAIN-001A conformance runner with one closed
  canonical Payment input derived from a validated Human or Agent sandbox
  Obligation workflow receipt.
- Add `sandbox_obligation_portability_receipt.v1` as a closed, immutable
  machine contract binding Obligation, repayment, and Ledger references to two
  synthetic finalized chain-profile proofs.
- Prove both profiles produce the same canonical Payment reference and kernel
  invariant while retaining distinct chain Finality Proof and Evidence hashes.
- Expose the pure local conformance workflow through the Agent SDK.
- Preserve the existing fixed CHAIN-001A conformance path and all fail-closed
  reorg, replay, provider-failover, and cap checks.

## Non-Goals

- No live testnet receipt, RPC/indexer provider, contract, wallet, signer,
  private key, faucet, deployment, or network call.
- No new Tenant protocol operation, MCP tool, HTTP endpoint, credential,
  Authentication Context, authorization grant, or production permission.
- No mainnet, bridge, real stablecoin, withdrawal, custody, capital movement,
  or claim that CHAIN-001B is approved or complete.
- No chain-specific field in `obligation.v2`, Repayment, Ledger, or the
  canonical Payment reference.

## Likely Files

- `modules/chain-adapter/src/conformance.js`
- `modules/chain-adapter/src/obligation-portability.js`
- `modules/chain-adapter/test/chain-conformance.test.js`
- `schemas/v2/sandbox-obligation-portability-receipt.schema.json`
- `packages/api-contract/*`
- `packages/sdk/*`
- `api/tenant-protocol/conformance/sandbox-obligation-portability-receipt.v1.fixtures.json`
- `scripts/check-schemas.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`

## Acceptance Criteria

- [x] A validated Human or Agent sandbox Obligation receipt produces one
  immutable portability receipt across exactly Base Sepolia and X Layer
  Testnet.
- [x] Obligation ID, repayment ID, asset, amount, principal Ledger reference,
  and repayment Ledger reference remain bound to the source lifecycle.
- [x] Both profile results share exactly one canonical Payment reference and
  kernel invariant; chain-specific Finality Proof/Evidence hashes remain at the
  adapter boundary.
- [x] Duplicate handling, reorg invalidation, replacement admission, restart
  replay, bounded provider failover, and execution caps still fail closed.
- [x] The Agent SDK exposes the pure local workflow without adding an MCP tool,
  endpoint, credential, or authority-bearing input.
- [x] Output states that it is sandbox-only, non-authorizing,
  non-withdrawable, made no network call, and moved no production funds.
- [x] Schema, SDK, chain conformance, security, transport, PostgreSQL, and full
  repository checks pass under Node 24.18.0.

## Test Commands

```sh
node --test modules/chain-adapter/test/*.test.js packages/api-contract/test/*.test.js packages/sdk/test/*.test.js
pnpm run test:chain:conformance
pnpm run test:indexer:reorg
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] Source workflow input is a closed, validated Human or Agent no-funds
  receipt; unknown shapes and mutable drift fail closed.
- [x] Canonical Payment identity excludes chain, transaction, block, provider,
  and RPC data.
- [x] Chain reports expose synthetic proof hashes only and never URLs,
  credentials, secrets, signatures, or private keys.
- [x] Both ratified profiles are required exactly once; mainnet and unapproved
  chain identifiers fail closed.
- [x] Execution and exposure caps remain enforced inside each adapter.
- [x] No-real-funds, no-network, no-deployment, no-withdrawal, and
  non-authorizing boundaries remain explicit in code, schema, tests, and docs.

## Verification Evidence

- `.nvmrc`, `.node-version`, the runtime gate, and every command used Node
  24.18.0 with pnpm 11.1.3.
- `pnpm run check`: 255/255 repository tests passed; 37 closed schemas, 28
  private Tenant operations, 19 reversible migrations, and five workflow/
  portability fixture sets passed their drift gates.
- `pnpm run test:transport`: 32/32; the exact six-tool MCP registry remained
  unchanged while the pure SDK portability workflow passed.
- `pnpm run test:security`: 21/21.
- `pnpm run test:postgres`: 53/53 against a fresh disposable PostgreSQL 17
  database over TCP; the database and temporary server were removed/stopped.
- Target chain/API/SDK tests: 40/40; CHAIN-001A conformance now includes Human
  and Agent lifecycle binding, integrity, accessor, linkage and cap negatives.
- `git diff --check`: passed.
