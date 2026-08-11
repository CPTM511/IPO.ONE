# EVM-WALLET-001 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED / REVIEW READY`

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Outcome

The browser now consumes injected EIP-6963, legacy EIP-1193 and WalletConnect
providers through one frozen, vendor-neutral connector SPI. The SPI normalizes
CAIP-2/CAIP-10 identity, chain switching, capability discovery, message/EIP-712
signing and lifecycle invalidation without exposing a raw provider request
surface.

Only Base Sepolia (`eip155:84532`) and X Layer Testnet (`eip155:1952`) are in
the connector registry. Both remain sandbox-only with execution disabled.

## Changed implementation surfaces

- `apps/web/src/evm-wallet-connector.js`
- `apps/web/src/wallet-provider-registry.js`
- `apps/web/src/mobile-wallet-connector.js`
- `apps/web/src/app.js`
- `apps/web/src/wallet-sign-out.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `schemas/v2/evm-wallet-connector-descriptor.schema.json`
- `schemas/v2/evm-wallet-capabilities.schema.json`
- focused tests under `apps/web/test/`

## Security and permission Evidence

- Capability states are the closed set `supported`, `unsupported`, `unknown`;
  unknown is never permission.
- Account, chain, provider and disconnect changes advance the context epoch and
  invalidate captured work.
- Application and connector sources contain no `eth_sendTransaction` call.
- `submitPreparedExecution` returns
  `prepared_execution_contract_unavailable` before any provider call.
- Arbitrary calldata, raw provider access, persistence, external calls,
  production enablement and funds authority are absent.
- WalletConnect approved methods no longer include raw transaction submission;
  memory-only session storage remains required.

## Verification Evidence

- Full repository test suite: `742/742` passed.
- Web bundle integrity: `1` external module, `30` authored modules and `851`
  unique IDs passed.
- Schema validation: `87` contracts passed.
- Real-browser local check at `http://127.0.0.1:3000/`: page loaded with
  meaningful content, no framework error overlay, no console errors, `Sign in`
  rendered, and `Credit` navigation changed the primary heading correctly.
- Direct local resource check returned the authored
  `/evm-wallet-connector.js` module successfully.
- `git diff --check` is part of the final handoff gate.

The repository-wide `pnpm check` remains blocked by the pre-existing sealed
M1-A-1 snapshot branch mismatch: the current branch is
`codex/m1-b-deployable-sandbox`, while the sealed snapshot names
`codex/checkpoint-20260727-pre-strategy`. Runtime, lint, type, schema, protocol,
migration and focused tests passed before that release-evidence gate.

## Remaining gate

This issue does not authorize EXEC-001 or EXEC-002. A prepared-execution
contract, policy evaluation, simulation, submission, Testnet write, signer,
deployment and funds movement require their own reviewed issues.

## Rollback

Remove the connector and its schemas/tests, then restore the registry, mobile,
application, sign-out and web-asset adapters. No database, chain or economic
state was created.
