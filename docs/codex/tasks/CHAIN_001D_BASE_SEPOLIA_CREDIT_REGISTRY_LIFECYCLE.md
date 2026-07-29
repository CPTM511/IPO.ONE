# CHAIN-001D — Base Sepolia Credit Authorization lifecycle

Status: Verified live on Base Sepolia; Registry closed and paused

## Context

IPO.ONE can already produce a deterministic, non-publishable Credit
Authorization Registry binding preview, and the closed non-custodial Registry
contract and Base Sepolia adapter pass local tests. The repository does not yet
contain a Registry deployment, publication transaction, repayment-proof update,
closed authorization, or reconciled live receipt.

The project owner explicitly approved this bounded Base Sepolia task on
2026-07-28 after reviewing that gap. This approval is independent of
CHAIN-001B and does not expand its Evidence Emitter permission.

## Scope

- Use only Base Sepolia (`eip155:84532`) and an exact registered public RPC.
- Provision one CHAIN-001D ephemeral local signer under a private temporary
  directory and accept faucet-only gas.
- Compile and deploy `IpoOneCreditAuthorizationRegistryV1`.
- Create one deterministic synthetic, hash-only authorization projection.
- Publish the authorization, update it with a synthetic repayment proof, close
  it with a synthetic settled proof, and pause the Registry.
- Verify exact events, zero-value transactions, contract bytecode, Base
  Sepolia safe-block inclusion, final closed state, and paused state.
- Reconcile the final chain state against the expected local projection.
- Write a redacted receipt before logically destroying the ephemeral key.

## Non-goals

- No mainnet, X Layer write, bridge, token, stablecoin, real asset, real
  lending, custody, withdrawal, Provider payment, or Hyperliquid order.
- No raw Human or Agent address from a product account, KYC/PII, strategy,
  transaction history, model input, credential, signature, or private key in
  repository evidence.
- No production authorization, production capital commitment, contract
  upgrade, proxy, arbitrary call, or automatic product-runtime publication.
- No claim that a synthetic testnet authorization is legal or economic credit.

## Likely files

- `contracts/IpoOneCreditAuthorizationRegistryV1.sol`
- `deploy/testnet/ephemeral-key.mjs`
- `deploy/testnet/run-credit-registry-once.mjs`
- `deploy/testnet/emergency-pause-credit-registry.mjs`
- `deploy/testnet/test/credit-registry-live-run.test.js`
- `docs/security/IPO_ONE_CHAIN_001D_CREDIT_REGISTRY_TESTNET_RUNBOOK_v0.1.md`
- `artifacts/testnet/*credit-registry*.json`
- `package.json`

## Acceptance criteria

1. Runtime configuration accepts only CHAIN-001D, Base Sepolia, a fixed
   provider slot, a private owner-only key file, a bounded run ID, and a
   recorded operator role.
2. Starting balance is positive and no greater than `0.1` Base Sepolia ETH.
3. Exactly five normal transactions are admitted: deploy, publish, update
   proof, close, and pause.
4. Every transaction uses native `value=0`; per-transaction and whole-run gas
   caps fail closed before broadcast and after receipts.
5. Only deterministic synthetic hashes enter Registry state. The accepted
   Offer remains canonical offchain.
6. Published, updated, closed, and paused events are decoded and matched
   exactly to the expected authorization and versions.
7. The final record is `Closed`, version `3`, inactive, and exactly reconciled
   with the expected settled local projection.
8. The final transaction is observed at or below the Base Sepolia `safe` block,
   and each receipt block hash is re-read before acceptance.
9. Redacted evidence contains no key or raw signature. The key is logically
   destroyed only after the final evidence has been written.
10. Existing contract, adapter, chain, security, and repository checks pass.

## Test commands

```sh
node --test deploy/testnet/test/credit-registry-live-run.test.js
node --test deploy/testnet/test/ephemeral-key.test.js
node --test contracts/test/credit-authorization-registry.test.js
node --test modules/chain-adapter/test/credit-authorization-registry.test.js
pnpm run test:chain:live-unit
pnpm run check
pnpm run testnet:credit-registry:preflight
pnpm run testnet:credit-registry:run:once
git diff --check
```

## Security checklist

- [x] Owner approval is explicit and scoped to this task.
- [x] Base Sepolia is the only admitted write target.
- [x] Contract cannot transfer, custody, lend, borrow, withdraw, upgrade, or
      call an external contract.
- [x] Raw KYC/PII, product addresses, strategy data, and model inputs remain
      offchain.
- [x] Signer material is temporary, owner-only, outside the repository, and
      absent from command arguments and evidence.
- [x] All state writes are zero-value, hash-only, version-bound, and capped.
- [x] Normal completion closes the sole authorization and pauses the Registry.
- [x] Live faucet balance, five receipts, safe-block observation,
      reconciliation, and key destruction are verified.
- [x] Full repository regression is green after the implementation.

## Current verification evidence

- The faucet-only funding transaction supplied `0.002` Base Sepolia ETH to the
  isolated CHAIN-001D signer. It carried no calldata.
- Registry:
  `0x88926c11185E94bd8e9dE33959b6316CDA7c3e4A`.
- Synthetic authorization:
  `0x218a06527a138313936e9a199104dfbabe73f1f1d16e7e5c8189a0ff2edca088`.
- The exact five successful transactions are deployment
  `0x2594e6ca6cc060a3a2d422d9c333d27294e7baa21545622a75d12142a4ce9d1d`,
  publication
  `0x83e9a16305a4a67edebeb5ee5bdb4eb66e5bb3de0a4d7bd46595660f47835074`,
  proof update
  `0x9b9aba1d38c2c72983ccf16a37b530786aa52cd087e3bbc17806bb6863974730`,
  close
  `0xc8ce4334520f8e133bae26306ae6f9191d1aa0cb869b065124f989b0998dfc03`,
  and pause
  `0x2b6c4f01b2e6b3e7f4af8383976ef85cf3605bbce96b9c7c4e61047078a42c17`.
- All five transactions used native `value=0`. Actual testnet gas cost was
  `8558040000000` wei.
- The final pause block `44734587` was accepted below safe block `44734636`.
  Primary and secondary fixed RPCs independently returned chain ID `84532`,
  `Closed`, version `3`, paused, inactive, signer nonce `5`, and identical
  final proof hashes.
- Reconciliation returned no differences. The redacted live receipt is
  `artifacts/testnet/eip155-84532-chain-001d-live-20260728-001-credit-registry.json`.
- The temporary key file is absent after logical destruction. No secure erase
  of underlying storage media is claimed. The remaining faucet-only testnet
  balance is intentionally inaccessible and has no real value.
- Immediate post-receipt RPC reads were transiently stale during execution.
  Sequential, calldata-exact checkpoint recovery was added and locally tested;
  it accepted the original five transactions without broadcasting a sixth.
- Final Node `v26.5.0` repository check passed: `605` tests, `0` failures.
