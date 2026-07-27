# WALLET-003 pre-change mapping

Date: 2026-07-23  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## EOA and Human SIWE

- `HumanWalletBff` consumes one server-created SIWE transaction before
  signature verification and creates a host-only session only for a
  pre-provisioned active wallet Credential.
- The current production composition injects `viem.verifyMessage`, so the
  runtime implements only the EOA path.
- The signature input is bounded and never appears in Events, but the result
  does not explicitly distinguish EOA from ERC-1271.
- Base Sepolia (`84532`) and X Layer Testnet (`1952`) are the only admitted
  SIWE chain IDs.

## Agent account proof

- `EvmAccountProofAdapter` creates a chain-bound EIP-712 challenge and verifies
  a canonical low-s 65-byte EOA signature locally.
- The durable one-use challenge already binds Tenant, Subject, CAIP-10 account,
  purpose, nonce, issuance, expiry, typed-data hash, and protocol version.
- A contract-wallet signature can be longer than 65 bytes and is currently
  rejected before any distinct contract verification path exists.
- The browser-selected Human Provider does not define or revoke the separate
  durable Agent AccountBinding.

## Chain and RPC boundary

- `modules/event-indexer/src/bounded-json-rpc.js` is the existing bounded
  network adapter. Its current read allowlist contains only `eth_chainId`,
  `eth_blockNumber`, `eth_getBlockByNumber`, and
  `eth_getTransactionReceipt`.
- CHAIN-001B fixes exact primary/secondary public endpoints for the two
  testnets. Its approval covers observation and the tightly bounded Evidence
  emitter, not ERC-1271 `eth_getCode` or `eth_call`.
- ERC-1271 requires a distinct read-only adapter that verifies exact chain,
  retrieves non-empty contract code at one pinned block, invokes
  `isValidSignature(bytes32,bytes)` with `eth_call` at that same block, accepts
  only magic value `0x1626ba7e`, and revalidates the block/finality context.
- Timeout, response bytes, signature bytes, call-data bytes, block age,
  provider attempts, rate, and exact RPC methods must remain closed.
- RPC failure, timeout, wrong chain, missing code, reorg, stale block, revert,
  malformed return data, wrong magic, and unavailable finality must all fail
  closed without falling back from the contract path to EOA recovery.

## Browser and mobile connector

- WALLET-001 provides EIP-6963 discovery and explicit current-page Provider
  selection.
- WALLET-002 provides the shared `accountsChanged`, `chainChanged`,
  disconnect, Provider replacement, cross-tab quarantine, server invalidation,
  retry, and fresh-challenge lifecycle.
- The repository has no QR/mobile connector dependency, adapter, Project ID,
  pairing/session policy, approved origin metadata, or connector-specific
  storage boundary.
- The checked-in web application is native browser JavaScript served as a
  fixed module graph; it has no general client bundle or arbitrary connector
  loader.
- The development package explicitly says no approved QR/mobile connector
  exists. Adding one is a dependency, external-network, privacy, and session
  persistence decision owned by a human gate.

## PostgreSQL test environment

- Homebrew PostgreSQL `17.10` is already installed; it was not necessary to
  install PostgreSQL.
- No service is running and no `DATABASE_URL` was configured.
- A `/private/tmp` cluster initialization was attempted for isolated testing,
  but the sandbox denied PostgreSQL shared-memory creation.
- The required unsandboxed permission request was rejected by the approval
  infrastructure because its review model was unsupported. No system service,
  database, user data, or existing cluster was changed.

## Human decisions still required

Before dependency or live-network implementation, the owner must name:

1. the exact mobile/QR connector package and version;
2. its package integrity/license review and Project ID/origin policy;
3. allowed wallet methods, events, storage, expiry, and disconnect behavior;
4. exact testnet RPC endpoints and added read methods;
5. live E2E chain matrix;
6. approved ERC-1271 contract-wallet address and accountable human operator,
   or a separately approved minimal test-contract deployment;
7. evidence redaction, expiry, rollback, and connector/RPC revocation.

“Continue” or task start alone is not this approval under the package's Human
Approval Matrix.
