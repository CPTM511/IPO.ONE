# EVM-WALLET-001 — Standards-First EVM Wallet Connector

Status: IMPLEMENTED / REVIEW READY — Founder authorized on 2026-08-07

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

ADR-038 requires injected EIP-6963 and WalletConnect providers to sit behind
one vendor-neutral, capability-negotiated EVM connector. The current browser
still exposes raw EIP-1193 providers to application code, and the WalletConnect
facade admits caller-supplied `eth_sendTransaction` calldata.

## Scope

- add one closed connector descriptor and capability result contract;
- adapt injected, legacy EIP-1193 and WalletConnect paths to the same SPI;
- normalize connect, accounts, CAIP-2/CAIP-10 chain/account identity, chain
  switching, message and EIP-712 signing, lifecycle subscriptions and errors;
- probe capabilities without treating unknown support as permission;
- retain only Base Sepolia and X Layer Testnet as enabled profiles;
- invalidate captured connector context on provider, account, chain or
  disconnect changes;
- remove generic raw transaction submission from application and mobile
  connector surfaces;
- expose `submitPreparedExecution` as a fail-closed port until EXEC-002 exists;
- add injected/remote conformance, capability downgrade and invalidation tests.

## Non-goals

- no delegated grant, SpendPolicy change or authorization decision;
- no transaction simulation or preflight receipt;
- no wallet/chain/vendor enablement beyond the two current Testnets;
- no contract, migration, credential, external call, transaction or funds
  authority;
- no change to canonical Credit, Obligation, Ledger or Evidence semantics.

## Files likely to modify

- `apps/web/src/evm-wallet-connector.js`
- `apps/web/src/wallet-provider-registry.js`
- `apps/web/src/mobile-wallet-connector.js`
- `apps/web/src/app.js`
- `apps/web/src/wallet-sign-out.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `schemas/v2/evm-wallet-connector-*.schema.json`
- focused browser tests and this issue's audit Evidence.

## Acceptance criteria

1. All discovered injected and remote providers yield the same frozen SPI.
2. Provider selection remains explicit and non-authorizing.
3. Accounts and chains are normalized to CAIP-10 and CAIP-2 on the approved
   registry only.
4. Capability results are closed; absent, malformed or rejected probes remain
   non-permissive.
5. Account, chain, provider and disconnect changes advance a context epoch and
   make captured work stale.
6. Neither connector nor application code exposes raw `eth_sendTransaction`.
7. `submitPreparedExecution` always rejects with a stable EXEC-002-required
   result and never calls a provider.
8. Existing wallet discovery, authentication and sign-out behavior remains
   usable through the normalized SPI.

## Test command

```bash
node --test \
  apps/web/test/evm-wallet-connector.test.js \
  apps/web/test/wallet-provider-registry.test.js \
  apps/web/test/mobile-wallet-connector.test.js \
  apps/web/test/wallet-sign-out.test.js
pnpm run check:web-bundle
```

## Security checklist

- [x] Unknown capability never becomes supported or authorizing.
- [x] Raw provider request and arbitrary calldata do not escape the adapter.
- [x] Chain switching accepts only current registry profiles.
- [x] Event payloads are bounded and stale work is invalidated.
- [x] WalletConnect storage stays memory-only.
- [x] No credential, signature, account address or session is persisted.

## Permission boundary

The Founder approved this bounded local connector implementation. EXEC-001/002,
provider adapters, deployment, external signing, Testnet write, production and
funds movement remain separately reviewed and disabled.

## Migration impact

None.

## Rollback plan

Restore the prior registry/mobile/app adapter files and remove the new
connector schemas/tests. No server, database, chain or economic state is
created by this issue.

## Completion Evidence

See `docs/codex/audits/EVM-WALLET-001/audit.md` for changed-file proof,
conformance results, raw-send absence proof and the exact remaining EXEC-002
gate.
