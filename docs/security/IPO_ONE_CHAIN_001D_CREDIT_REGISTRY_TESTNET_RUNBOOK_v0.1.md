# IPO.ONE CHAIN-001D Credit Registry Testnet Runbook v0.1

Version: v0.1
Date: 2026-07-28
Status: Completed on Base Sepolia; evidence accepted and signer destroyed

## Approval and security claim

The project owner approved one bounded, synthetic Credit Authorization
lifecycle on Base Sepolia on 2026-07-28. This runbook does not reuse or expand
CHAIN-001B. It authorizes only the exact CHAIN-001D steps below.

This approval does not authorize mainnet, X Layer writes, real assets, capital,
lending funds, custody, bridges, tokens, withdrawals, arbitrary calls,
production RPCs, Provider payments, or Hyperliquid orders.

## Exact target and lifecycle

- Chain: Base Sepolia, CAIP-2 `eip155:84532`.
- Contract: non-upgradeable
  `IpoOneCreditAuthorizationRegistryV1`.
- Canonical truth: accepted Offer and PostgreSQL state remain offchain.
- Chain state: synthetic hashes and one temporary test account only.
- Normal transaction sequence:
  1. deploy Registry;
  2. publish one synthetic authorization;
  3. update its synthetic repayment and credit-state proofs;
  4. close it with a synthetic settled-obligation proof;
  5. pause the Registry.
- Every transaction has native `value=0`.
- No additional authorization or transition is permitted in the run.

## Privacy and data boundary

Only deterministic bytes32 hashes are admitted for Subject/account binding,
accepted Offer, policy, Provider scope, credit state, and Obligation proof.
No raw KYC/PII, real product account, raw strategy, transaction history, model
input, prompt, credential, private key, seed phrase, mnemonic, or raw signature
may enter the contract, source, environment, logs, receipt, screenshot, or
repository evidence.

## Signer and faucet controls

- `IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001D` is required.
- The key is generated locally only under
  `/private/tmp/ipo-one-chain-001d`, as a regular `0600` file.
- The raw key is accepted only through a file path. It is never an environment
  value, command argument, log field, or repository value.
- Only official-faucet Base Sepolia ETH for gas may be received.
- Starting balance must be positive and no greater than `0.1 ETH`.
- The key is logically destroyed only after closed state, paused state, safe
  inclusion, reconciliation, and redacted evidence are verified.

## Transaction and gas caps

- Exactly five successful normal transactions are required.
- Maximum estimated or actual cost per transaction: `0.005` Base Sepolia ETH.
- Maximum estimated or actual cost for the complete run: `0.015` Base
  Sepolia ETH.
- A chain mismatch, balance-cap violation, gas-cap violation, non-zero value,
  unexpected event, stale version, bytecode mismatch, receipt failure, reorg,
  unsafe final block, reconciliation difference, or failed pause stops the run.

## Finality, evidence, and reconciliation

Each successful receipt is re-read from the fixed RPC. Its block number and
hash must still match. The final pause receipt must be at or below the current
Base Sepolia `safe` block before the run is accepted.

The final Registry record must match the exact expected local projection, have
status `Closed`, version `3`, return inactive, and the Registry must return
paused. A redacted receipt under `artifacts/testnet/` records the contract,
public deployer address, transaction hashes, block references, hashes, gas,
finality, reconciliation, and safety flags. It never records the key or raw
signature.

## Failure and recovery

If failure occurs before deployment, do not fund or reuse the key unnecessarily;
destroy it with the reviewed key-destruction command.

One bounded continuation is permitted after a successful sequential checkpoint
when an immediate post-receipt runtime-code, state, or final reconciliation read
was temporarily stale. The continuation must reuse the exact run ID, key,
completed transaction hashes, and contract. It verifies the deployment
transaction has nonce `0`, native `value=0`, exact compiled constructor
calldata and expected CREATE address. Each supplied lifecycle checkpoint must
be sequential without gaps, have nonce `1` through `4`, exact adapter or pause
calldata, native `value=0`, a successful receipt, and the exact expected event.
The lifecycle projection is reconstructed from the immutable publication
`validUntil`. The signer pending nonce must equal the number of accepted
checkpoints. Every remaining transition waits for its exact versioned state to
become readable before estimating the next transaction. A continuation must
not deploy another Registry or repeat a completed mutation, and the final run
must still contain exactly the original five transactions.

Any other post-deployment failure preserves the redacted recovery record and
the key only for the bounded emergency pause command. Do not publish or update
another authorization. Verify `paused=true`, record the recovery transaction,
then logically destroy the key. Any wrong-chain interaction, unexpected asset,
secret exposure, non-zero value, or unbounded permission is a hard incident.

Execution operator role:
`local_codex_executor_under_project_owner_approval`.
Incident owner role: `project_owner`.
The unique run ID must be recorded before any signing.

## Commands

All commands require the repository-pinned Node 26 runtime.

```sh
IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001D \
  pnpm run testnet:key:provision

IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY=CHAIN-001D \
IPO_ONE_TESTNET_CHAIN_ID=eip155:84532 \
IPO_ONE_TESTNET_KEY_FILE=/private/tmp/ipo-one-chain-001d/<key>.key \
IPO_ONE_TESTNET_RUN_ID=<unique-run-id> \
IPO_ONE_TESTNET_OPERATOR_ID=local_codex_executor_under_project_owner_approval \
  pnpm run testnet:credit-registry:preflight

# Use the same closed environment for the live run only after preflight is ready.
pnpm run testnet:credit-registry:run:once

# Only for the exact bounded sequential post-receipt visibility continuation:
IPO_ONE_TESTNET_RESUME_CONTRACT_ADDRESS=<registry-address> \
IPO_ONE_TESTNET_RESUME_DEPLOYMENT_TRANSACTION_HASH=<deployment-tx-hash> \
IPO_ONE_TESTNET_RESUME_PUBLICATION_TRANSACTION_HASH=<optional-publication-tx-hash> \
IPO_ONE_TESTNET_RESUME_PROOF_UPDATE_TRANSACTION_HASH=<optional-update-tx-hash> \
IPO_ONE_TESTNET_RESUME_CLOSE_TRANSACTION_HASH=<optional-close-tx-hash> \
IPO_ONE_TESTNET_RESUME_PAUSE_TRANSACTION_HASH=<optional-pause-tx-hash> \
  pnpm run testnet:credit-registry:run:once

# Only for a retained-key post-deployment recovery:
IPO_ONE_TESTNET_RECOVERY_CONTRACT_ADDRESS=<registry-address> \
  pnpm run testnet:credit-registry:emergency:pause
```

Do not paste signing material into any command or environment variable.
