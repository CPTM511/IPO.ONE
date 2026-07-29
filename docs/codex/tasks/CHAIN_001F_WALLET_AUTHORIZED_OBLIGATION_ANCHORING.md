# CHAIN-001F — Every durable Evidence hash requires a Base Sepolia anchor

Status: Local implementation and live Registry deployment complete; restricted
attestor active and historical Evidence anchoring in progress

## Context

IPO.ONE PostgreSQL Evidence hashes are immutable content digests, not
blockchain transaction hashes. The product must never present one as a BaseScan
transaction.

The project owner approved a new CHAIN-001F Base Sepolia testnet slice and
ratified the invariant that every durable `Evidence Envelope` receives one
chain-anchor requirement. Sensitive payloads remain offchain; the Registry
publishes only hashes and bounded protocol references.

CHAIN-001D is a separate, completed Credit Authorization Registry checkpoint.
Its Registry is closed and paused and its ephemeral signer was destroyed. It
must not be funded, reused, unpaused, or treated as the CHAIN-001F contract.

## Scope

- Insert one `evidence_chain_anchors` requirement atomically with every new
  durable `evidence_envelopes` row, and backfill historical envelopes.
- Deploy one ownerless, non-upgradeable, zero-value Base Sepolia Registry that
  emits one `EvidenceAnchored` event per hash, in batches of at most 16.
- Bind every event to Evidence hash, event-type hash, aggregate-reference hash,
  action digest, attestor, nonce, batch ordinal, and batch size.
- Require an exact, request-bound confirmation for Offer acceptance, sandbox
  execution, and sandbox repayment.
- Let a directly authenticated Human or Agent wallet submit its own exact
  zero-value Registry transaction.
- Reserve `account_relayer` and `system_attestor` modes for a separately
  configured restricted testnet attestor. Do not silently claim these modes
  are active.
- Verify transaction sender, destination, zero value, calldata, receipt,
  events, canonical block, safe/finalized heads, and approved RPC chain.
- Persist `pending`, `prepared`, `broadcast`, `unknown`, `included`, `safe`,
  `finalized`, `reorged`, `failed`, and `reconciled` states separately from
  immutable Evidence content.
- Preserve orphaned-block observations and permit a new prepared transaction
  after a verified reorg.

## Non-goals

- No mainnet, real lending funds, real repayment value, custody, withdrawal,
  token, public LP, arbitrary call, approval, upgrade, or production signer.
- No raw KYC/PII, transaction history, model input, prompt, signature, private
  key, mnemonic, or credential onchain.
- No claim that transaction submission equals chain inclusion or finality.
- No reuse of the CHAIN-001D Registry or signer.

## Implementation

- Contract: `contracts/IpoOneEvidenceAnchorRegistryV1.sol`
- Adapter: `modules/chain-adapter/src/evidence-anchor-registry.js`
- Durable store:
  `modules/event-indexer/src/evidence-anchor-store.js`
- Observer:
  `modules/event-indexer/src/evidence-anchor-observer.js`
- Private Human/Agent HTTP boundary:
  `apps/tenant-api/src/evidence-anchor-http.js`
- Atomic Evidence coverage:
  `modules/persistence/src/postgres-event-repository.js`
- Migrations:
  `db/migrations/0045_evidence_chain_anchors.up.sql` and
  `db/migrations/0046_evidence_anchor_coverage_guard.up.sql`; the bounded
  first-transaction compatibility repair is
  `db/migrations/0047_chain_001f_anchor_binding_repair.up.sql`
- Economic action confirmation:
  `modules/tenant-command-gateway/src/economic-action-confirmation.js`
- Browser confirmation and wallet submission:
  `apps/web/src/app.js`
- Deployment:
  `deploy/testnet/run-evidence-anchor-registry-deploy.mjs`
- Read-only deployment recovery:
  `deploy/testnet/reconcile-evidence-anchor-registry-deploy.mjs`
- Optional local system-attestor composition:
  `deploy/local/evidence-anchor.compose.yaml` and
  `scripts/local-evidence-anchor.mjs`

## Live Base Sepolia deployment checkpoint

- Registry:
  `0x78ba26d4a9211e8d4b0158c9e5443305278c1df0`
- Deployment transaction:
  `0x13f9aebe194ffe4aaac7d31a4a01e2540ed44c06e68d08809bbf339138caab72`
- Deployment block: `44775562`
- Runtime bytecode hash:
  `0x3f7d98dc8e6f49e4cfc77fde97fffcc398f6e850154608b99eb271aae23a040c`
- Both approved RPCs observed finalized head `44775623` with the exact reviewed
  runtime bytecode.
- Public-only artifact:
  `artifacts/testnet/eip155-84532-chain-001f-evidence-anchor-20260729-001.json`
- The isolated deployment key was logically destroyed after finality and must
  not be reused as an attestor.

At the post-deployment local snapshot, all `584` Evidence Envelopes had exact
anchor requirements, all were pending, and none were represented as a
transaction hash. Because each historical requirement has a distinct action
digest, Registry V1 requires one transaction per historical action group. The
worker therefore permits at most one `broadcast` or `unknown` transaction at a
time, but may submit the next nonce after the predecessor is included while
older transactions continue toward finality.

The separately approved local system attestor was provisioned on 2026-07-29:

- Public address:
  `0x66f0acF3457e7B73845FD33c764947fC5A220f2a`
- The owner-only key is stored only under the ignored local secret boundary and
  is excluded from Docker build context.
- The deployment key was not reused.
- Funding transaction:
  `0x6ecc7c5e82e1090e1e99290656fa015ac84d1f28632465629358d1fb2edf3375`
  transferred `0.002` Base Sepolia ETH to the exact attestor address and
  remained within the `0.01` balance cap.
- The separate `CHAIN-001F` write acknowledgement enabled only zero-value hash
  anchors to the fixed Registry.

The first live Evidence anchor transaction was
`0x8d68c224199f1144f4be9d31b27af86850ba40c4006fc6864daaa568dae4195e`.
It succeeded onchain, while the observer failed closed before finality because
the historical migration backfill held legacy SHA-256 binding hashes and the
first runtime path had recomputed SHA3-256 hashes. No second transaction was
sent until the incompatibility was corrected. Migration 0047:

- repairs only the exact accepted local-pilot Evidence and transaction;
- stores the previous and onchain hashes in an append-only, Tenant-isolated
  audit row;
- refuses the repair if any transaction, attestor, nonce, batch, action, or
  prior-hash field differs; and
- cannot be reversed after the live repair record exists.

The worker now encodes the exact durable `event_type_hash` and
`aggregate_ref_hash` for every pending requirement instead of deriving a
second hash dialect. The first transaction was subsequently re-observed
without resend and reached finalized status before later nonces proceeded.

The bounded historical catch-up snapshot is recorded in
`artifacts/testnet/eip155-84532-chain-001f-evidence-catchup-20260729-001.json`.
Nonce `0` through `621` cover `622` distinct Evidence requirements and `622`
distinct transactions; all `622` were finalized with zero error rows, missing
anchors, orphan anchors, fake transaction hashes, or unproved finality rows.
Evidence created after the snapshot remains outside that closed count and is
handled continuously by the active worker.

## Acceptance criteria

1. Evidence insert and anchor-requirement insert commit or roll back together.
2. Historical and new Evidence counts equal anchor-requirement counts.
3. The Registry rejects wrong chain, native value, duplicate hashes, duplicate
   action digests, expired requests, skipped attestor nonces, and batches over
   16.
4. Offer acceptance, execution, and repayment cannot pass their handlers
   without a confirmation bound to the exact operation, resource, business
   payload, and request ID.
5. A SIWE-authenticated Human must submit the wallet confirmation method;
   account and Agent protocol requests use their authenticated method.
6. Raw action signatures are not persisted or included in Evidence.
7. A submitted transaction is not `finalized` until the observer proves the
   exact successful event at or below the finalized head.
8. Unknown results are safe to observe again without repeating the economic
   command.
9. A canonical block mismatch records `reorged`, clears finality, preserves
   the old observation, and permits a new attempt.
10. UI labels pending, submitted, reorged, and finalized states distinctly and
    links only real EVM transaction hashes to BaseScan.
11. Contract, adapter, browser, PostgreSQL, migration, transport, and full
    repository regression tests pass on Node 26.
12. The deployment artifact contains only public chain evidence and the
    ephemeral deployer key is destroyed after verified finality.

## Test commands

```sh
node --test contracts/test/evidence-anchor-registry.test.js
node --test modules/chain-adapter/test/evidence-anchor-registry.test.js
node --test modules/event-indexer/test/evidence-anchor-observer.test.js
node --test modules/tenant-command-gateway/test/economic-action-confirmation.test.js
pnpm run check:migrations
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security checklist

- [x] Base Sepolia-only and native value fixed to zero.
- [x] No owner, administration, external call, token, custody, or upgrade path.
- [x] One durable anchor requirement per Evidence Envelope.
- [x] Exact economic-action confirmation enforced by the server handler.
- [x] Raw signatures and sensitive payloads excluded from persistence and chain.
- [x] Unknown, replay, duplicate, finality, and reorg behavior covered.
- [x] A new CHAIN-001F ephemeral deployer is isolated from CHAIN-001D.
- [x] Restricted account/system attestor configured and tested.
- [x] Live Base Sepolia Registry deployment finalized through two approved RPCs.
- [x] First real Evidence anchor finalized and re-read from Base Sepolia.
- [x] Bounded historical Evidence snapshot finalized on Base Sepolia.
