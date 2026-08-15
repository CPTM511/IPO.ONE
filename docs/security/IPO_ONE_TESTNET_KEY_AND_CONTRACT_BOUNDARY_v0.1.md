# IPO.ONE Testnet Key and Contract Boundary v0.1

Version: v0.1
Date: 2026-07-16
Environment: Local conformance plus owner-approved bounded live-testnet execution

## Security Claim

CHAIN-001A proves a provider-neutral, replayable chain-finality boundary for
Base Sepolia and X Layer Testnet using deterministic local inputs. It does not
hold a key, call an RPC, deploy or invoke a contract, move a token, certify a
provider, or approve either chain for production.

## Permitted in CHAIN-001A

- The CAIP-2 identifiers `eip155:84532` and `eip155:1952`.
- Closed, versioned sandbox profile and Finality Proof contracts.
- Logical `primary` and `secondary` provider slots with injected test readers.
- Synthetic submitted, included, safe, finalized, invalidated, duplicate, and
  replay observations.
- Exact minor-unit execution and exposure caps that fail closed.
- Append-only Evidence creation with `productionFundsMoved: false`.

## Prohibited

- Mainnet identifiers or profiles marked production-approved.
- RPC URLs, API keys, bearer credentials, cookies, webhooks, signing material,
  seed phrases, mnemonics, private keys, or funded accounts in code, fixtures,
  profiles, logs, or CI.
- Dynamic adapter/plugin loading or arbitrary provider payload admission.
- Contract compilation, deployment, upgrade, verification, or invocation.
- Bridges, real stablecoins, custody, withdrawals, capital, lending funds, or
  cross-chain credit execution.
- Treating inclusion, a sandbox confirmation count, or testnet activity as
  legal/economic settlement or production finality.

## Threats and Controls

| Threat | CHAIN-001A control |
| --- | --- |
| Raw RPC/provider shape enters protocol state | Closed normalized observation allowlist; unknown fields rejected |
| Wrong-chain or mainnet replay | Exact profile chain match and two-entry approved test registry |
| Duplicate log creates a second Payment | Deterministic event key and exact duplicate disposition |
| Same Payment appears in two active logs | Chain-agnostic canonical Payment reference and active-log uniqueness |
| Reorg leaves credited evidence active | Explicit invalidation, exposure removal, and append-only reorged Evidence |
| Restart creates a different projection | Deterministic replay snapshot and Evidence-hash comparison |
| Provider outage changes protocol truth | Ordered bounded failover; provider slot omitted from canonical proof/Evidence |
| Oversized or accumulated synthetic value | Per-execution, per-chain exposure, and pending transaction caps |
| UI implies final settlement too early | Explicit pending/confirmed/finalized/reorged mapping |
| Test path acquires production authority | Hardcoded sandbox-only, synthetic-only, production-unapproved flags |

## Later Human Approval Gates

Before CHAIN-001B or any live testnet integration, human review must name and
approve the contract scope, deployer custody, ephemeral key procedure, RPC and
indexer providers, secret provisioning, faucet/test-token policy, transaction
caps, pause/kill controls, finality semantics, reorg depth, alerting, incident
owner, evidence retention, deployment target, rollback, and destruction of key
material.

Any mainnet, real asset, capital, custody, bridge, production RPC, contract
upgrade authority, or funds movement requires a separate production decision;
testnet approval cannot be reused as production approval.

## CHAIN-001B Ratification Addendum

On 2026-07-16 the project owner approved the three independently fail-closed
CHAIN-001B permissions: read-only live observation, a minimal non-upgradeable
testnet Evidence-hash emitter, and one-run execution with a locally generated
ephemeral signer. The approved controls are fixed by
`IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`.

This addendum supersedes the earlier CHAIN-001B approval gate only for those
two test networks and those three permissions. All mainnet, real-asset,
capital, lending, bridge, custody, arbitrary-call, production RPC, upgrade, and
production credit permissions remain prohibited and separately gated.
