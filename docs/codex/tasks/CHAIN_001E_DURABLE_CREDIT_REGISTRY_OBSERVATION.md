# CHAIN-001E — Durable Credit Registry observation and reconciliation

Status: Implemented and verified with live Base Sepolia read-only evidence

## Context

CHAIN-001D completed one synthetic Base Sepolia Credit Authorization Registry
lifecycle and accepted a redacted safe-block receipt. That receipt is an
operator artifact; the product Event Indexer does not yet ingest the Registry
events or persist a Tenant-isolated read model.

The next safe step is read-only ingestion. It must turn the existing public
transactions into durable, replay-safe Evidence without another transaction,
signer, permission, or credit-policy change.

## Scope

- Observe only Base Sepolia (`eip155:84532`) through an approved fixed RPC slot.
- Verify the exact publication, proof-update, close, and pause transactions.
- Require successful receipts, zero native value, exact contract, exact
  calldata, exact event sequence, stable block hashes, and safe finality.
- Re-read the final authorization, paused state, and active state through
  bounded `eth_call`.
- Persist one hash-addressed aggregate in a dedicated Tenant-RLS PostgreSQL
  boundary with one hash-only outbox record.
- Deduplicate replay and reconcile the stored observation hash.
- Discard raw RPC payloads, raw calldata, and the temporary test account
  address before persistence.

## Non-goals

- No transaction, signer, wallet prompt, deployment, unpause, or contract
  mutation.
- No real funds, credit approval, limit, pricing, capital, custody, withdrawal,
  Provider payment, or Hyperliquid action.
- No automatic policy promotion or use of the observation as an authorizing
  score.
- No raw KYC/PII, strategy, credential, signature, account address, or RPC URL
  in durable Evidence.
- No mainnet or X Layer Registry claim.

## Likely files

- `modules/event-indexer/src/live-credit-registry-observer.js`
- `modules/event-indexer/src/credit-registry-observation-store.js`
- `modules/event-indexer/test/live-credit-registry-observer.test.js`
- `db/migrations/0040_credit_registry_chain_observations.*.sql`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`

## Acceptance criteria

1. The observer admits only the exact approved Base Sepolia RPC slots and a
   closed six-field query.
2. All four lifecycle transactions are successful, zero-value calls to the
   exact Registry with sequential version-bound calldata and events.
3. Every event block hash is re-read and the pause block is no later than the
   RPC safe block.
4. Final state is `Closed`, version `3`, paused, inactive, and matches the
   publication/update/close events.
5. The normalized observation contains no raw test account, calldata, RPC URL,
   provider payload, key, or signature.
6. In-memory and PostgreSQL stores deduplicate the same observation and reject
   drifted hashes or unsafe flags.
7. PostgreSQL records are Tenant isolated, immutable, and produce one
   hash-only pending outbox message.
8. Stored-record reconciliation recomputes the observation hash with no
   differences.
9. Existing chain, migration, PostgreSQL, and repository checks remain green
   under Node 26.

## Test commands

```sh
node --test modules/event-indexer/test/live-credit-registry-observer.test.js
pnpm run check:migrations
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security checklist

- [x] Read-only scope and no signer surface.
- [x] Mainnet and custom RPC hosts fail closed.
- [x] Transaction value, calldata, receipt, event, block and state are bound.
- [x] Raw account and raw provider payload are excluded from persistence.
- [x] Observation remains synthetic, non-authorizing and no-funds.
- [x] Tenant RLS, immutability, deduplication, outbox and reconciliation pass.
- [x] Complete repository regression passes.

## Current verification evidence

- Primary and secondary fixed Base Sepolia RPCs independently returned the same
  lifecycle observation hash:
  `0x1954e6182034e12f71d0551f7b2a698b1f44bcf5dc46102ac8a05a62115be94f`.
- All four lifecycle mutations are finalized, zero-value, calldata/event bound,
  and reconcile to `Closed`, version `3`, paused and inactive.
- The accepted read-only evidence is
  `artifacts/testnet/eip155-84532-chain-001e-read-20260728-001-credit-registry-observation.json`.
- The receipt declares `signerUsed=false`, `transactionBroadcast=false`,
  `rawAccountPersisted=false`, and `productionFundsMoved=false`.
- PostgreSQL integration passed `78/78`, including migration 0040, non-superuser
  startup, forced Tenant RLS, cross-Tenant isolation, immutable records,
  deduplication, one hash-only outbox message and deterministic reconciliation.
- Node `v26.5.0` complete repository check passed `609/609` with `0` failures;
  schema checks remained at `81` and migrations advanced to `40` ordered pairs.
