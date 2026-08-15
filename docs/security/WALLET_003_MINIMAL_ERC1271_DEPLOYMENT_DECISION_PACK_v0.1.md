# WALLET-003 minimal ERC-1271 Testnet deployment decision pack v0.1

Status: `AWAITING_SEPARATE_HUMAN_APPROVAL`  
Prepared: 2026-07-23  
Decision ID: `WALLET-003-ERC1271-DEPLOY-001`  
Current deployment authority: **none**

This document is a decision package, not a deployment approval. The Founder
explicitly authorized preparation only. No key may be generated or received,
no faucet request may be made, no transaction may be signed or broadcast, and
no contract may be deployed from this package without a new explicit approval
that fills every required field below.

## Proposed immutable artifact

- source:
  `contracts/IpoOneMinimalErc1271TestWalletV1.sol`
- compiler: `solc 0.8.30+commit.73712a01.Emscripten.clang`
- optimizer: enabled, 200 runs
- metadata bytecode hash: none; CBOR append disabled
- source SHA-256:
  `d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787`
- creation bytecode Keccak-256:
  `0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2`
- deployed bytecode Keccak-256:
  `0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1`

The contract is non-upgradeable and immutable. Its only functional
authentication method is:

```text
isValidSignature(bytes32,bytes) -> bytes4
```

It accepts only a canonical 65-byte low-s ECDSA signature by one immutable
owner and returns only ERC-1271 magic `0x1626ba7e` on success. It automatically
stops validating after at most seven days. It rejects native value and has no
execution, call, transfer, approval, custody, token, lending, repayment,
administration, ownership-transfer, upgrade, proxy, or self-destruct surface.

## Proposed deployment scope

- chain: Base Sepolia only, CAIP-2 `eip155:84532`
- mainnet and X Layer deployment: prohibited
- constructor argument 1: one human-supplied, no-funds Testnet owner EOA
- constructor argument 2: an exact UTC expiry no more than seven days after
  the deployment block
- deployment count: one
- transaction value: exactly `0`
- maximum gas limit: `500000`
- maximum fee per gas: `5 gwei`
- maximum deployment gas budget: `0.0025 ETH`
- maximum deployer faucet balance: `0.01 ETH`
- subsequent contract transactions: none
- production identity, credit, Mandate, asset, funds, or authority: none

The owner and deployer may be different. Neither private key, seed phrase, raw
signature, pairing key, or reusable session secret may be provided to Codex,
the repository, logs, Events, Evidence, or reports. The accountable human
operator must provision and operate them out of band.

## Proposed one-run acceptance

After a separately approved deployment, the one permitted acceptance run
would:

1. independently compile and match all three hashes above;
2. verify chain ID 84532 and zero transaction value before signing;
3. record the deployment transaction hash and deployed address;
4. wait for a stable Base Sepolia `safe` block;
5. compare `eth_getCode` at that block with the approved deployed-bytecode
   hash;
6. run one Human EIP-191 ERC-1271 authentication proof;
7. run one Agent EIP-712 ERC-1271 account proof only if separately included in
   the signed decision;
8. perform one protected read;
9. prove account/chain change invalidation and idempotent logout;
10. retain only reference hashes and destroy or revoke ephemeral credentials.

Only one `eth_call` verification attempt per challenge is allowed. No transfer,
approval, balance discovery, arbitrary RPC, or transaction method is allowed
through the wallet connector.

## Evidence retained

- this decision document hash and approving human;
- compiler/source/creation/deployed bytecode hashes;
- chain ID, deployment transaction hash, contract address;
- owner address hash, never its key;
- deployment and verification block numbers/hashes/finality;
- verification method and challenge/signature reference hashes;
- invalidation/logout Event references;
- expiry and credential-destruction/revocation confirmation;
- `transactionValue: 0`;
- `productionFundsMoved: false`.

Raw constructor calldata, raw signatures, wallet telemetry, Project ID,
pairing data, private key, and seed phrase are excluded.

## Expiry and rollback

The instance ceases signature acceptance at immutable `expiresAt`. Because it
cannot hold funds or execute calls, retirement is abandonment after expiry:

- destroy the ephemeral deployer credential;
- disconnect the mobile pairing and clear memory storage;
- revoke/rotate the test WalletConnect Project ID;
- remove the deployed address from runtime configuration;
- retain redacted audit hashes only.

The contract cannot and need not be self-destructed.

## Required approval fields

All fields must be completed in a new explicit decision:

```text
Decision ID: WALLET-003-ERC1271-DEPLOY-001
Decision: APPROVE or REJECT
Approver and role:
Approval timestamp:
Approval expiry:
Base Sepolia owner EOA address:
Base Sepolia deployer EOA address:
Exact contract expiresAt (UTC):
Deployment gas limit (<=500000):
maxFeePerGas (<=5 gwei):
Maximum faucet balance (<=0.01 ETH):
Human EIP-191 E2E approved: yes/no
Agent EIP-712 E2E approved: yes/no
Human wallet operator:
Deployer operator:
Evidence custodian:
Credential destruction owner:
Source SHA-256 confirmed: yes/no
Creation bytecode Keccak-256 confirmed: yes/no
Deployed bytecode Keccak-256 confirmed: yes/no
```

An approval missing any field, changing any hash, chain, method, cap, owner,
expiry, or operator, or merely saying “continue,” is insufficient.

No deployment runner or transaction-building command is included at this
stage. It may be prepared only after the separate decision is approved.
