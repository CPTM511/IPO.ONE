# ADR-029: Provider-Neutral Multi-Chain Finality Adapter

Status: Accepted; CHAIN-001A/001C local conformance implemented and CHAIN-001B bounded live-testnet plan owner-approved
Date: 2026-07-16

## Context

Product Charter v1.1 requires Base Sepolia (`eip155:84532`) as the first
execution test profile and X Layer Testnet (`eip155:1952`) as the mandatory
portability profile. CAIP identifiers alone do not prevent provider response
shapes, implicit finality, duplicate logs, or reorg behavior from leaking into
the shared credit kernel.

The current approval boundary does not authorize a contract deployment,
private key, public RPC dependency, real token, bridge, custody path, or funds
movement. CREDIT-001C also remains a separate permission decision. The first
chain increment therefore has to prove the adapter and replay semantics without
claiming chain execution.

## Decision

1. Keep chain-specific observation handling in `modules/chain-adapter`. The
   protocol kernel receives a closed `chain_finality_proof.v1` plus the shared
   `evidence_event.v2`, never raw JSON-RPC responses.
2. Register only the two ratified test CAIP-2 identifiers. Both profiles use
   the same adapter implementation and the same conformance suite.
3. Keep profile fields versioned and closed. Logical provider slots, timeout,
   rate-limit, confirmation, reorg, execution-cap, exposure-cap, and pending
   transaction policies are configuration. URLs, credentials, and executable
   provider code are not profile data.
4. Mark every profile and proof `sandboxOnly: true`; mark every receipt and
   Evidence payload `productionFundsMoved: false`; reject any production claim.
5. Derive `canonicalPaymentRef` only from Obligation, Payment, Asset, and exact
   minor-unit amount. Do not include chain, transaction, block, RPC, or provider
   identifiers in the canonical reference.
6. Keep transaction, block, chain, and explicit finality in Finality Proof and
   Evidence. Inclusion maps to pending, safe maps to confirmed, finalization
   maps to finalized, and reorg invalidation maps to reorged.
7. Deduplicate an exact log, reject two simultaneously active logs for one
   canonical Payment, invalidate append-only evidence on reorg, and permit a
   replacement log only after invalidation.
8. Treat finalized evidence as non-reorgable in this deterministic sandbox
   model. A real chain adapter must separately justify its settlement/finality
   definition and failure handling.
9. Rebuild indexer state only from the admitted observation history. Restart
   replay must produce the same proof sequence, Evidence hashes, active Payment
   set, and exposure total.
10. Exercise provider failover with injected local readers and bounded logical
    slots. CHAIN-001A makes no network call and loads no dynamic plugin.

The local confirmation numbers and caps are conformance safety values, not
production risk policy or claims about the economic finality of either chain.

## Consequences

- Base Sepolia and X Layer Testnet now prove one portable canonical Payment
  shape without making Base part of the protocol boundary.
- UI and API consumers can distinguish submitted, included, safe, finalized,
  and invalidated evidence; inclusion cannot be presented as finality.
- Duplicate, failover, reorg, replacement, and restart behavior is executable
  without RPC availability or key material.
- A live receipt indexer, smart-contract emitter, durable observation store,
  RPC certification, and production finality policy remain explicit later
  increments and human approval gates.

## CHAIN-001B Addendum

Owner approval on 2026-07-16 activates live-testnet work only under the named
runbook. `modules/event-indexer` now owns the bounded JSON-RPC and durable
observation boundary. It reuses the CHAIN-001A proof/Evidence model and never
admits raw provider payloads into the kernel.

Base Sepolia uses the RPC `safe` and `finalized` tags after inclusion and block
hash revalidation. X Layer Testnet is conservatively inclusion-only because the
approved public interface does not provide a separately ratified settlement
claim. This difference stays behind the adapter; it cannot change the canonical
Obligation, Payment, Ledger, or Evidence envelope.

The only approved executable contract is the immutable
`IpoOneSandboxEvidenceEmitterV1`: no native value acceptance, token, bridge,
credit mutation, arbitrary external call, upgrade, or ownership transfer. A
normal run is exactly deploy, one hash-only Evidence event, then irreversible
retirement using an ephemeral faucet-funded testnet key.

Migration `0020_live_testnet_chain_observations` adds append-only normalized
observations/snapshots and a transition-guarded hash-only outbox under forced
Tenant RLS. Live deployment evidence is not complete until both approved chains
have a redacted transaction receipt and verified key destruction.

## Verification

- `pnpm run test:chain:conformance`
- `pnpm run test:indexer:reorg`
- `pnpm run test:chain:live-unit`
- `pnpm run test:postgres`
- `pnpm run check:schemas`
- `pnpm run lint:boundaries`
- `pnpm run check`
- `git diff --check`

Network identifiers were checked against the official Base connection
documentation and official X Layer network information on 2026-07-15:

- https://docs.base.org/base-chain/quickstart/connecting-to-base
- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
