# Live testnet Event Indexer

This module is the CHAIN-001B boundary between approved public testnet RPCs and
IPO.ONE's existing provider-neutral Chain Adapter. It admits only Base Sepolia
(`eip155:84532`) and X Layer Testnet (`eip155:1952`), verifies the remote
`eth_chainId`, bounds every JSON-RPC body, decodes only the fixed
`SandboxEvidenceEmitted` event, and discards raw provider responses before
creating a `chain_finality_proof.v1` and redacted Evidence envelope.

Base Sepolia may advance through RPC `safe` and `finalized` tags. X Layer is
conservatively inclusion-only in v1 because the public testnet documentation
does not define an RPC finality tag as an IPO.ONE economic settlement proof.
Neither mode represents legal settlement, real funds, or production finality.

`PostgresChainObservationStore` appends normalized observations, immutable
snapshots, and hash-only outbox messages inside a trusted Tenant transaction.
Restart reconciliation replays the admitted inputs through the same Chain
Adapter and compares the resulting snapshot hash. Raw RPC payloads, URLs,
credentials, private keys, and event data are never persisted.
