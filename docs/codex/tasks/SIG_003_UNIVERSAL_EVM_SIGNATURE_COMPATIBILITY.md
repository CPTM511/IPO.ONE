# SIG-003 — Universal EVM Signature Compatibility

Status: IMPLEMENTED / REVIEW READY — Founder authorized on 2026-08-07

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Context

EIP-712 EOA and ERC-1271 verification already exist, but Agent MCP still
requires 65 bytes, TypeScript/result contracts name only EOA in places, durable
Agent binding constraints admit only EOA, and ERC-6492 is absent.

## Scope

- retain current EIP-712 EOA and ERC-1271 read-only behavior;
- add bounded ERC-6492 detection, canonical wrapper decoding and a
  vendor-neutral read-only offchain verification port;
- preserve the ERC-6492-required ordering before ERC-1271 and EOA checks;
- add one closed signature classification/result vocabulary with exact
  `eoa`, `erc1271` or `erc6492` receipt type;
- align Tenant Protocol, OpenAPI-derived schema, TypeScript declarations, SDK
  and Agent MCP on 65–4096-byte closed hex signatures;
- allow the three exact EIP-712 verification methods in durable Agent proof
  attempts and AccountBindings through one reversible migration;
- retain hash-only durable truth and finality eligibility;
- add positive and negative EOA/ERC-1271/ERC-6492 and transport-parity tests.

## Non-goals

- no smart-account deployment or factory transaction;
- no default external validator bytecode, RPC or vendor adapter;
- no wallet permission or connector submission;
- no credential, signer custody, Testnet write, deployment or funds authority;
- no weakening of malformed, oversized, finality or one-use challenge checks.

## Files likely to modify

- `modules/chain-adapter/src/erc1271-signature-verifier.js`
- `modules/chain-adapter/src/evm-account-proof-adapter.js`
- `modules/authentication/src/human-wallet-bff.js`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `schemas/v2/wallet-signature-verification.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- `packages/api-contract/index.d.ts`
- one reversible SQL migration and focused tests/audit Evidence.

## Acceptance criteria

1. Receipts identify `eoa`, `erc1271` or `erc6492` exactly.
2. ERC-6492 magic suffix is checked first and the canonical
   `(address,bytes,bytes)` wrapper is bounded and decoded fail-closed.
3. Counterfactual verification performs no transaction or deployment and is
   unavailable unless a reviewed read-only offchain verifier port is supplied.
4. EOA, ERC-1271 and ERC-6492 work through the same Agent account-proof
   request/result boundary; MCP accepts the same 65–4096-byte range.
5. Malformed, oversized, unsupported, wrong-magic and ineligible-finality cases
   fail closed.
6. Durable Evidence contains signature hashes and exact method/type only, never
   the raw signature.
7. Database constraints accept only the three approved EIP-712 methods and the
   down migration refuses unsafe rollback when non-EOA rows exist.

## Test command

```bash
node --test \
  modules/chain-adapter/test/erc1271-signature-verifier.test.js \
  modules/chain-adapter/test/evm-account-proof.test.js \
  modules/authentication/test/human-wallet-bff.test.js \
  apps/agent-mcp/test/agent-mcp.test.mjs
pnpm run check:schemas
pnpm run typecheck
pnpm run check:tenant-protocol
```

## Security checklist

- [x] Signature length and ABI dynamic-field bounds are enforced before calls.
- [x] ERC-6492 is verified before ERC-1271/EOA fallback.
- [x] No raw signature is returned or persisted.
- [x] Only read-only validation ports are callable.
- [x] Inclusion-only evidence cannot authorize authentication.
- [x] Unsupported validator configuration fails closed.

## Permission boundary

The Founder approved this bounded local compatibility implementation. Contract
deployment, factory execution, external validator selection, credentials,
Testnet write, production and funds movement remain separately reviewed.

## Migration impact

One migration widens two existing allowlists from only `eip712_eoa_v1` to the
closed set `eip712_eoa_v1`, `eip1271_eip712_v1`, and
`eip6492_eip712_v1`. It adds no column and preserves immutable ownership/RLS.

## Rollback plan

The down migration first refuses rollback if a non-EOA proof attempt or v2
AccountBinding exists, then restores the EOA-only constraints. Code rollback
removes ERC-6492 and restores upper-interface schemas.

## Completion Evidence

See `docs/codex/audits/SIG-003/audit.md` for conformance,
schema/type/migration and raw-signature non-persistence proof.
