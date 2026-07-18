# IPO.ONE CHAIN-001B Live-Testnet Runbook v0.1

Version: v0.1
Date: 2026-07-16
Status: Owner-approved; read-only dual-chain observation verified; funded
emitter runs pending faucet-only gas

## Approval and Security Claim

The project owner approved EVIDENCE-001B, TRANSPORT-002, and the three-part
CHAIN-001B live-testnet plan on 2026-07-16. This runbook activates only the
CHAIN-001B testnet boundary. It does not authorize mainnet, real assets,
capital, lending funds, custody, bridges, arbitrary calls, production RPCs, or
production credit execution.

The permitted targets are exactly:

- Base Sepolia: `eip155:84532`.
- X Layer Testnet: `eip155:1952`.

Every transaction is testnet-only, zero-value at the contract call boundary,
and limited to deploy, one Evidence-hash emission, and irreversible retirement.

## Approved Three-Part Permission Plan

1. **Read-only observation.** Use the fixed public HTTPS endpoints registered
   in `modules/event-indexer/src/live-testnet-config.js`. Admit only bounded
   JSON-RPC methods and normalize receipts/logs into the existing Finality Proof
   and Evidence contracts. Raw provider responses are discarded.
2. **Minimal emitter.** Compile and deploy
   `IpoOneSandboxEvidenceEmitterV1`. It is non-upgradeable, has no payable
   execution, token, bridge, withdrawal, credit, proxy, ownership-transfer, or
   arbitrary-call surface, and becomes permanently unusable after retirement.
3. **Ephemeral signer.** Generate a unique local testnet key only under
   `/private/tmp/ipo-one-chain-001b`, require mode `0600`, fund it only from an
   official faucet, execute one bounded run, retain a redacted receipt, and
   logically destroy the key. The tooling makes no physical secure-erasure
   claim for flash storage.

## Providers and Finality

| Chain | Primary endpoint | Secondary endpoint | Admitted finality claim |
| --- | --- | --- | --- |
| Base Sepolia | `https://sepolia.base.org/` | `https://base-sepolia-rpc.publicnode.com/` | Inclusion plus `safe`/`finalized` block-tag checks |
| X Layer Testnet | `https://testrpc.xlayer.tech/terigon` | `https://xlayertestrpc.okx.com/terigon` | Inclusion only; never upgraded to safe/finalized by local inference |

Endpoints are exact-match configuration, not caller input. Redirects,
credentials, URL queries/fragments, unknown chains, dynamic plugins, oversized
responses, and unapproved JSON-RPC methods fail closed.

Before accepting an Evidence observation, the observer verifies chain ID,
receipt success, emitter address, event signature, indexed hashes, source
Evidence binding, and that the event block hash still matches a fresh read.
Reorg or mismatch invalidates the observation through the append-only indexer;
duplicates are idempotent.

## Faucet, Balance, Transaction, and Gas Caps

- Faucet funding is gas-only. No stablecoin, token, bridge, or asset transfer is
  requested or accepted.
- Maximum deployer starting balance is `0.1 ETH` on Base Sepolia and `0.2 OKB`
  on X Layer Testnet. A higher balance fails closed.
- Exactly three successful transactions are permitted per normal run: deploy,
  one Evidence emission, retire.
- Every call sets native `value` to zero.
- Maximum estimated cost is `0.005` native testnet gas token per transaction and
  `0.01` per complete run. Actual gas is checked again after receipts.
- One emitter admits at most one event in this run, expires after two hours,
  supports an irreversible emergency pause, and is retired before key
  destruction.

## Custody and Secret Controls

- A key is generated locally only after
  `IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001B` is present.
- Raw private keys, seed phrases, or mnemonics must never enter source, Git,
  fixtures, environment variables, command-line arguments, logs, receipts,
  CI, screenshots, durable protocol state, or support messages.
- The runner accepts a private key *file path* only. It rejects CI and rejects
  symlinks, non-regular files, or permissions other than `0600`.
- A redacted Evidence/transaction receipt is written before logical key
  destruction. Final repository evidence records hashes, public addresses,
  transaction references, gas, and safety flags only.
- If a run fails after deployment, the key is retained only for bounded
  emergency retirement and a private recovery record names the exact command.
  After retirement verification, the key is logically destroyed.

## Durable Storage and Reconciliation

Migration `0020_live_testnet_chain_observations` provides append-only,
Tenant-RLS-protected observations and snapshots plus a transition-guarded
hash-only outbox. It stores normalized proofs and Evidence, never raw RPC
payloads or signing material. Restart replay must reproduce the same indexer
snapshot and Evidence hashes; reconciliation fails closed on divergence.

Redacted run receipts under `artifacts/testnet/` are retained as launch-gate
evidence. Temporary key and recovery files stay in the private temp boundary
only until verified retirement and logical destruction. Production retention,
SIEM, paging, and regulatory record policy remain a separate approval gate.

## Operations, Alerting, and Incident Owner

- Execution owner and incident owner: the CHAIN-001B approving project owner;
  the human operator must record the operator identity and run ID in the change
  record before signing.
- Alert immediately on wrong chain, RPC mismatch, event mismatch, reorg,
  response/timeout limit, gas or balance cap, transaction failure, failed
  retirement, replay divergence, outbox failure, or key-destruction failure.
- First response is stop, preserve redacted evidence, perform no new emission,
  use the emergency retirement command if a deployed emitter remains active,
  verify `retired == true`, destroy the key, and reconcile durable state.
- Any unexpected asset receipt, mainnet interaction, secret exposure, or
  unbounded permission is a hard incident and ends CHAIN-001B execution.

## Commands

All commands require Node `24.18.0` from `.nvmrc` / `.node-version`.

```sh
pnpm run test:chain:live-unit
pnpm run testnet:observe:heads
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001B pnpm run testnet:key:provision
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001B pnpm run testnet:run:once
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001B pnpm run testnet:emergency:retire
```

Normal execution requires the remaining closed environment inputs documented
by `deploy/testnet/run-emitter-once.mjs`. Do not paste key material into them.

## Current Verification Evidence

- `artifacts/testnet/live-heads-2026-07-17T00-30-18-597Z.json` records successful
  read-only, correct-chain observations from both approved networks with no
  signing and `productionFundsMoved: false`.
- Contract, key-lifecycle, observer, adapter, reorg, migration, security, and
  PostgreSQL tests are the executable approval evidence.
- Live emitter transactions remain pending official faucet gas. Read-only
  reachability is not represented as contract deployment or chain execution.
- The latest balance-only check at `2026-07-17T01:43:16.000Z` still returned
  `0` wei on both approved ephemeral deployers. No transaction was submitted.

## Rollback and Destruction

The deployed emitter has no upgrade or ownership-transfer route. Rollback is
therefore operational: pause if necessary, irreversibly retire, stop the
indexer, preserve append-only Evidence, reconcile projections, destroy the
ephemeral key, and revoke the profile from the runtime registry in a reviewed
change. Historical observations are invalidated append-only rather than
deleted. Testnet approval cannot be promoted to production.

## Official Network References

- Base connection and RPC documentation:
  https://docs.base.org/base-chain/quickstart/connecting-to-base
- Base RPC overview:
  https://docs.base.org/base-chain/api-reference/rpc-overview
- Base transaction finality:
  https://docs.base.org/base-chain/network-information/transaction-finality
- Base testnet faucets:
  https://docs.base.org/base-chain/network-information/network-faucets
- X Layer network information:
  https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
- X Layer faucet:
  https://web3.okx.com/xlayer/faucet
