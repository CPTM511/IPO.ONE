# Live testnet Event Indexer

This module is the read-only boundary between approved public testnet RPCs and
IPO.ONE's existing Chain Adapters. CHAIN-001B admits Base Sepolia
(`eip155:84532`) and X Layer Testnet (`eip155:1952`), verifies the remote
`eth_chainId`, bounds every JSON-RPC body, decodes only the fixed
`SandboxEvidenceEmitted` event, and discards raw provider responses before
creating a `chain_finality_proof.v1` and redacted Evidence envelope.

CHAIN-001E adds a Base-Sepolia-only Credit Authorization Registry observer. It
verifies exact zero-value publication, proof-update, close, and pause
transactions; binds calldata to events; re-reads stable blocks and the final
closed/paused/inactive state; and excludes the temporary test account and raw
calldata from the normalized observation.

Base Sepolia may advance through RPC `safe` and `finalized` tags. X Layer is
conservatively inclusion-only in v1 because the public testnet documentation
does not define an RPC finality tag as an IPO.ONE economic settlement proof.
Neither mode represents legal settlement, real funds, or production finality.

`PostgresChainObservationStore` appends normalized observations, immutable
snapshots, and hash-only outbox messages inside a trusted Tenant transaction.
Restart reconciliation replays the admitted inputs through the same Chain
Adapter and compares the resulting snapshot hash. Raw RPC payloads, URLs,
credentials, private keys, and event data are never persisted.

`PostgresCreditRegistryObservationStore` writes the CHAIN-001E aggregate and one
non-authorizing hash-only outbox message into dedicated forced-RLS tables.
Exact replay is deduplicated, records are append-only, and reconciliation
recomputes the lifecycle observation hash. This path has no signer, broadcast,
credit-limit, funds, or production authority.
