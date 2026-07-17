# Chain Adapter Module

The Chain Adapter module is IPO.ONE's sandbox-only, provider-neutral boundary
for Base Sepolia (`eip155:84532`) and X Layer Testnet (`eip155:1952`). It
normalizes untrusted chain observations into explicit Finality Proofs and the
shared Evidence envelope without allowing RPC response shapes into the
protocol kernel.

CHAIN-001A is deterministic and local. Logical provider slots exercise bounded
failover without making network calls. Receipts, balances, caps, confirmations,
and reorgs are synthetic conformance inputs. The module has no private-key,
contract-deployment, mainnet, custody, bridge, stablecoin, or real-funds
capability.

CHAIN-001B is a separate owner-approved live-testnet boundary implemented by
`modules/event-indexer`, `contracts`, and `deploy/testnet`. It may observe only
Base Sepolia and X Layer Testnet through fixed public endpoints and may execute
only the bounded Evidence-hash emitter run described in
`docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`. That approval does
not extend this adapter into a signing, funds, mainnet, or production boundary.

`runSandboxObligationPortabilityConformance(...)` binds a validated Human or
Agent sandbox Obligation workflow receipt to both ratified profiles. Its closed
receipt preserves the source Obligation, repayment, and Ledger references,
proves one chain-neutral canonical Payment reference, and retains distinct
synthetic Finality Proof and Evidence hashes at the adapter boundary. It still
makes no network call and is not a live testnet-execution claim.
