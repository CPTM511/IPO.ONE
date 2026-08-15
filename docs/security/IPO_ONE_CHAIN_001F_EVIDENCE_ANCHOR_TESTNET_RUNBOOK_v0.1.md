# IPO.ONE CHAIN-001F Evidence Anchor Testnet Runbook v0.1

Version: v0.1
Date: 2026-07-29
Status: Approved scope; Registry deployment and first anchor finalized,
historical anchoring in progress

## Approval and boundary

The project owner approved deployment and testing of one new ownerless Evidence
Anchor Registry on Base Sepolia and ratified the rule that every durable
Evidence hash must receive an onchain anchor requirement.

This approval is limited to hash-only, zero-native-value Base Sepolia
transactions. It does not authorize mainnet, real loans, real repayment value,
capital, custody, token transfers, withdrawals, public LPs, arbitrary calls,
production signers, or production deployment.

CHAIN-001D is closed. Its Registry, signer, balance, and checkpoint are not part
of this run and must not be reused.

## Exact deployment

- Chain: Base Sepolia, CAIP-2 `eip155:84532`.
- Contract: `IpoOneEvidenceAnchorRegistryV1`.
- Registry properties: ownerless, non-upgradeable, no external calls, rejects
  native value, maximum batch size 16.
- Deployment transaction native value: exactly zero.
- Deployer: new CHAIN-001F ephemeral key under
  `/private/tmp/ipo-one-chain-001f/`.
- Current approved deployer address:
  `0xCbAd34dE1d42d87EaDD543A22f0B162BAc33f743`.
- Maximum starting balance: `0.01` Base Sepolia ETH.
- Maximum estimated deployment gas cost: `0.002` Base Sepolia ETH.
- Approved RPC observations: both configured Base Sepolia provider slots.

### Finalized deployment checkpoint

- Contract:
  `0x78ba26d4a9211e8d4b0158c9e5443305278c1df0`
- Transaction:
  `0x13f9aebe194ffe4aaac7d31a4a01e2540ed44c06e68d08809bbf339138caab72`
- Block: `44775562`
- Both approved RPCs observed finalized head `44775623` and exact runtime
  bytecode hash
  `0x3f7d98dc8e6f49e4cfc77fde97fffcc398f6e850154608b99eb271aae23a040c`.
- The public-only deployment artifact is
  `artifacts/testnet/eip155-84532-chain-001f-evidence-anchor-20260729-001.json`.
- The deployment key was logically destroyed after verification and is not an
  attestor.

## Privacy boundary

Only Evidence hash, event-type hash, aggregate-reference hash, action digest,
public attestor address, nonce, and batch position may be emitted. Raw
Evidence, KYC/PII, account records, prompts, strategies, model inputs,
credentials, signatures, private keys, mnemonics, and real transaction history
must not enter calldata, logs, artifacts, screenshots, or source control.

## Preflight

The pinned Node 26 runtime and exact environment are required:

```sh
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001F \
IPO_ONE_TESTNET_CHAIN_ID=eip155:84532 \
IPO_ONE_TESTNET_PROVIDER_SLOT=primary \
IPO_ONE_TESTNET_KEY_FILE=/private/tmp/ipo-one-chain-001f/evidence-registry-deployer-20260729.key \
IPO_ONE_TESTNET_RUN_ID=evidence-anchor-20260729-001 \
  pnpm run testnet:evidence-anchor:preflight
```

Preflight must prove:

- both RPCs report chain ID 84532;
- deployer balance is positive and within the cap;
- predicted address is unused;
- compiled creation bytecode hash matches the reviewed source;
- estimated gas is within the cap;
- constructor calldata and native value are exact.

Any mismatch stops the run before signing.

## Deployment

Use the identical environment only after a ready preflight:

```sh
pnpm run testnet:evidence-anchor:deploy
```

The runner sends one deployment transaction, verifies the successful receipt,
waits until the deployment block is finalized, compares runtime bytecode
through both approved RPCs, writes a redacted artifact under
`artifacts/testnet/`, and then destroys the deployer key.

If a transaction hash was returned but final verification times out, do not
deploy again. Preserve the key and transaction hash for a bounded read-only
reconciliation. Use the exact recovered transaction hash with the read-only
recovery command:

```sh
IPO_ONE_TESTNET_TRANSACTION_HASH=0x... \
  pnpm run testnet:evidence-anchor:reconcile
```

The recovery command has no wallet client or send method. It verifies the
original deployment calldata, zero value, sender, nonce, receipt, canonical
block, both finalized heads, and exact compiled runtime bytecode before writing
the artifact and destroying the deployer key.

## First Evidence anchor

After the contract address is configured in the local runtime:

1. authenticate with the invited Human or Agent identity;
2. load one owned Obligation Evidence timeline;
3. verify the UI shows every server Evidence hash as pending, never as a
   transaction;
4. connect the exact Base Sepolia wallet;
5. request one bounded batch;
6. verify wallet transaction destination equals the deployed Registry,
   `value=0`, and calldata is non-empty;
7. approve the transaction in the wallet;
8. submit the real transaction hash to the private API;
9. observe sender, destination, value, calldata, receipt, all emitted events,
   canonical block, and finalized head;
10. re-read status and show `finalized` only after the observer succeeds.

The first accepted live Evidence artifact records the public transaction and
block references, Registry address, hashes, finality proof, approved RPC count,
and safety flags. It contains no raw Evidence or signing material.

## Restricted local system attestor

The standard local worker remains unsigned. A separate CHAIN-001F approval is
required before provisioning or enabling the optional system attestor. Its key
is stored under the ignored `.ipo-one/local-stack/` secret boundary, excluded
from Docker build context, and mounted read-only into the worker. It is not the
destroyed deployment key.

The separately approved local attestor public address is
`0x66f0acF3457e7B73845FD33c764947fC5A220f2a`. Provisioning is complete, but
the standard unsigned worker remains the default composition.

Provisioning creates the key but enables no chain writes:

```sh
IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR=CHAIN-001F \
  pnpm run local:evidence-attestor:init
```

Read the public address, capped balance, and coverage without exposing the key:

```sh
pnpm run local:evidence-anchor:status
```

After the exact attestor address is funded above zero and at or below `0.01`
Base Sepolia ETH, a second explicit acknowledgement enables only zero-value
hash anchors to the fixed Registry:

```sh
IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES=CHAIN-001F \
  pnpm run local:evidence-anchor:enable
```

The attestor rejects any other destination, native value, chain, or calldata
shape, and caps one estimated transaction at `0.0005` Base Sepolia ETH. Disable
the optional composition without deleting its key:

```sh
pnpm run local:evidence-anchor:disable
```

### First system-attestor checkpoint

- Funding transaction:
  `0x6ecc7c5e82e1090e1e99290656fa015ac84d1f28632465629358d1fb2edf3375`
- Funding amount: `0.002` Base Sepolia ETH.
- First Evidence anchor transaction:
  `0x8d68c224199f1144f4be9d31b27af86850ba40c4006fc6864daaa568dae4195e`
- Attestor nonce: `0`.
- Native value: `0`.

The first transaction succeeded onchain but initially exposed a historical
binding-dialect mismatch: migration 0045 had backfilled SHA-256 event and
aggregate hashes, while the runtime sender recomputed SHA3-256 hashes from
plaintext references. The observer rejected the mismatch and the worker sent
no next nonce. Migration 0047 repaired only the exact accepted transaction,
preserved both hash pairs in an append-only RLS-protected audit record, and the
worker was changed to encode the exact durable hashes for all later anchors.
After re-observation, the first transaction reached finalized status without
resend.

The finalized historical catch-up checkpoint is
`artifacts/testnet/eip155-84532-chain-001f-evidence-catchup-20260729-001.json`.
It closes attestor nonce `0` through `621`: `622` Evidence requirements,
`622` distinct zero-value transactions, and `622` finalized anchors with no
error, missing, orphaned, fake-transaction-hash, or unproved-finality rows.
Later reconciliation Evidence is deliberately excluded from that immutable
snapshot and continues through the same worker.

## Reconciliation and reorg

- `unknown` is an observation state, not permission to repeat the economic
  action.
- Re-observe the same transaction hash first.
- A receipt failure records `failed` and never claims an anchor.
- A canonical block-hash mismatch records `reorged`, removes finalized status,
  and preserves the orphaned-block observation.
- Only after `reorged` may the same Evidence requirement be prepared for a new
  zero-value transaction; the previous observation remains immutable.
- Coverage is complete only when Evidence count equals anchor-requirement count
  and every required anchor is finalized.

## Key handling

Never paste a private key into a command, environment variable, log, issue,
chat, artifact, or repository file. The deployer key path is a local reference
only. A future restricted account/system attestor must use a separate key and a
separate named approval; the deployment key is not an attestor.
