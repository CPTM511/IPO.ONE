# CHAIN-001: Base Sepolia and X Layer Testnet Conformance

Status: CHAIN-001A and the local compositional CHAIN-001C receipt are
implemented. CHAIN-001B real-testnet work was approved by the project owner on
2026-07-16 and is in implementation under the bounded testnet-only plan below.

## Context

IPO.ONE already validates CAIP-2/CAIP-10 identifiers but had no independent
chain-adapter, finality-proof, reorg, or restart-replay implementation. Product
Charter v1.1 selects Base Sepolia as the first execution test profile and X
Layer Testnet as the second portability profile without approving either for
production.

CHAIN-001 is split so adapter portability can be proved now without silently
authorizing a contract, RPC, private key, deployment, or real-value path.

## CHAIN-001A Scope (Implemented)

- Define a closed `chain_profile.v1` registry for Base Sepolia and X Layer
  Testnet with no URLs, credentials, or executable provider configuration.
- Use one versioned sandbox Chain Adapter and one Finality Proof contract for
  both profiles.
- Normalize synthetic submitted, included, safe, finalized, and invalidated
  observations into canonical finality plus shared Evidence.
- Prove deterministic duplicate handling, reorg invalidation, replacement-log
  admission, provider failover, caps, and restart replay without network calls.
- Keep canonical Payment references independent of chain, transaction, block,
  provider, and RPC fields.

## CHAIN-001C Scope (Implemented Locally)

- Bind a validated Human or Agent sandbox Obligation workflow receipt to both
  CHAIN-001A profiles.
- Preserve actual Obligation, repayment, principal Ledger and repayment Ledger
  references while proving one chain-neutral canonical Payment/kernel hash.
- Return a closed immutable receipt with profile-specific synthetic Finality
  Proof and Evidence hashes and explicit no-network/no-key/no-live-execution
  safety flags.
- Expose the pure local workflow through the Agent SDK without adding an MCP
  tool, Tenant operation, HTTP route, credential, permission, or funds input.

## CHAIN-001B Approved Three-Part Scope

The approval is decomposed into three independently fail-closed permissions:

1. **Read-only live observation:** connect only approved test-only RPC/indexer
   adapters, normalize untrusted receipts/logs, and persist/reconcile bounded
   observations through the existing CHAIN-001A contract.
2. **Test-only emitter and deployment:** compile and deploy one minimal,
   non-upgradeable Evidence-hash emitter per approved test profile. It accepts
   no token, value, credit, Obligation mutation, bridge, withdrawal, or arbitrary
   call and is not a settlement or production contract.
3. **Ephemeral signer and one-run execution:** provision a locally generated,
   testnet-only deployer through explicit secret injection, enforce zero-value
   transaction/gas/count caps and pause/kill controls, retain redacted Evidence,
   then destroy local key material. No key enters source, fixtures, logs, CI, or
   durable protocol state.

- Implement live testnet event emitters and observation/receipt ingestion needed
  to prove real testnet indexing; the local CHAIN-001C portability receipt is
  not a live-chain receipt.
- Connect approved test-only RPC/indexer providers and certify their response
  adapters against the CHAIN-001A boundary.
- Add a durable chain-observation store and outbox/reconciliation path.
- Replace the local sandbox confirmation model with reviewed per-chain
  finality and incident policy.
- Provision ephemeral testnet keys only under the approved three-part boundary
  above and the named implementation controls in the testnet runbook.

## Non-Goals

- No mainnet, bridge, real stablecoin, custody, production RPC, production
  contract, token, cross-chain loan, or capital movement.
- No Base- or X Layer-specific fields in the protocol kernel.
- No unreviewed contract deployment or private-key handling in CI.

## Likely Files

- `modules/chain-adapter/*` (CHAIN-001A)
- `modules/event-indexer/*` (CHAIN-001B)
- `contracts/*` (CHAIN-001B)
- `schemas/v2/chain-profile.schema.json` (CHAIN-001A)
- `schemas/v2/chain-finality-proof.schema.json` (CHAIN-001A)
- `packages/api-contract/*` (future external surface)
- `deploy/testnet/*` (CHAIN-001B)
- `docs/architecture/ADR-029-multi-chain-finality-adapter.md` (CHAIN-001A)
- `docs/security/IPO_ONE_TESTNET_KEY_AND_CONTRACT_BOUNDARY_v0.1.md` (CHAIN-001A)

## Acceptance Criteria

- [x] Both profiles pass the same adapter and Event/Evidence conformance suite.
- [x] Canonical IDs and kernel schemas contain no RPC/provider-specific shape.
- [x] Duplicate logs, delayed receipts, reorg invalidation, restart replay, and
  provider failover are deterministic and tested.
- [x] Finality state is explicit in the adapter contract; inclusion maps to
  pending rather than finalized. UI rendering remains WEB-002 work.
- [x] Per-chain exposure and execution caps fail closed in the local runtime.
- [x] CHAIN-001A uses no test key, RPC credential, or network call.
- [x] CHAIN-001C binds actual Human/Agent sandbox Obligation, repayment, and
  Ledger references to both profiles without adding chain fields to the kernel.
- [x] CHAIN-001C is available as one closed immutable Agent SDK contract and
  explicitly denies live testnet execution.
- [x] CHAIN-001B three-part testnet permission plan is owner-approved.
- [x] CHAIN-001B ephemeral key provisioning and logical destruction are
  implemented and tested without claiming physical flash-storage erasure.
- [x] Both approved public RPC profiles pass live correct-chain, read-only head
  observation with no signing or production funds movement.
- [x] The minimal immutable emitter, fixed ABI observer, reorg/replay indexer,
  durable Tenant-RLS store, outbox, reconciliation, gas/count/balance caps,
  emergency retirement, and redacted receipt path are implemented.
- [ ] One deploy/emission/retirement receipt is retained for each approved
  chain and both ephemeral keys are verified destroyed. These two live runs
  await faucet-only testnet gas.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:chain:conformance
pnpm run test:indexer:reorg
pnpm run test:chain:live-unit
pnpm run testnet:observe:heads
git diff --check
```

## Security Checklist

- [x] Chain/RPC input is untrusted, bounded, and normalized.
- [x] Reorg and replay cannot duplicate active Payment evidence; CHAIN-001C
  binds the local canonical Payment to source lifecycle Ledger references,
  while durable live-chain Ledger reconciliation remains CHAIN-001B work.
- [x] CHAIN-001A has no testnet key, RPC credential, or secret surface.
- [x] Adapter has no credit, Consent/Mandate, spend, or execution entry point;
  caps fail closed inside its limited observation boundary.
- [x] Live RPC methods, endpoints, response bytes, timeouts, redirects, event
  ABI, emitter calls, transaction value/count/gas, faucet balances, key files,
  and failure recovery are closed and bounded.
- [x] Durable live observations are normalized, append-only, Tenant-isolated,
  outbox-backed, and replay-reconciled without raw RPC or signing material.
- [x] No mainnet or real-value capability is enabled.

## Local Evidence (updated 2026-07-17)

- `pnpm run test:chain:conformance`: 6/6 passed, including Human/Agent
  Obligation portability and fail-closed input/linkage/cap negatives.
- `pnpm run test:indexer:reorg`: 5/5 passed, including aggregate exposure and
  pending transaction cap rejection.
- `pnpm run test:chain:live-unit`: 9/9 contract, ephemeral-key, bounded RPC,
  fixed-event observer, wrong-chain/binding denial and restart reconciliation.
- `pnpm run check:schemas`: 38 closed schema contracts passed.
- `pnpm run lint:boundaries`: passed with `chain-adapter` and `event-indexer`
  registered.
- `pnpm run check`: 268/268 database-free tests passed across the full repository.
- `pnpm run test:transport`: 35/35; `pnpm run test:security`: 21/21;
  `pnpm run test:postgres`: 54/54 against a fresh disposable PostgreSQL 17
  database, including live-chain composite Tenant keys, RLS, immutability,
  outbox and reconciliation.
- `git diff --check`: passed.
- Official network identifiers rechecked against Base and X Layer documentation.

## CHAIN-001B Live Evidence (2026-07-17)

- `artifacts/testnet/live-heads-2026-07-17T00-30-18-597Z.json` records two
  successful correct-chain observations (four bounded read-only RPC calls in
  total), no signing, and `productionFundsMoved: false`.
- Contract/key/observer unit evidence and full PostgreSQL counts are updated by
  the verification run before task closure.
- No live emitter transaction is claimed yet; both one-run addresses remain
  faucet-unfunded and the task stays open until the two redacted receipts exist.
