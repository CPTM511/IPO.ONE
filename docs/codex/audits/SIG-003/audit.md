# SIG-003 Completion Evidence

Date: 2026-08-07

Status: `IMPLEMENTED / REVIEW READY`

Delivery mode: `L0_LOCAL_NO_FUNDS`

## Outcome

Universal EVM signature verification now classifies exact `eoa`, `erc1271` or
`erc6492` results through one closed receipt vocabulary. ERC-6492 detection and
canonical `(address,bytes,bytes)` wrapper decoding run before ERC-1271 and EOA
fallback, with a 4096-byte total signature ceiling and bounded non-empty ABI
fields.

Counterfactual verification is unavailable unless a reviewed read-only
offchain verifier port is injected. The port performs one revalidated
`eth_call`; it never sends a transaction, persists a deployment or selects a
default vendor/validator.

## Changed implementation surfaces

- `modules/chain-adapter/src/erc1271-signature-verifier.js`
- `modules/chain-adapter/src/evm-account-proof-adapter.js`
- `modules/authentication/src/human-wallet-bff.js`
- `apps/agent-mcp/src/agent-mcp-adapter.js`
- `schemas/v2/wallet-signature-verification.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- `packages/api-contract/index.d.ts`
- `db/migrations/0054_universal_evm_signature_methods.up.sql`
- `db/migrations/0054_universal_evm_signature_methods.down.sql`
- focused chain-adapter, authentication, MCP and PostgreSQL tests

## Security and persistence Evidence

- Magic-suffix detection is first; malformed, oversized, nested, non-canonical
  or empty-field wrappers fail closed without EOA/ERC-1271 fallback.
- Missing verifier configuration fails with
  `erc6492_verifier_unavailable`.
- Finality eligibility and block revalidation remain mandatory.
- Durable receipts store the signature hash and exact method/type only;
  `rawSignaturePersisted` remains `false` and the raw signature is omitted.
- Agent MCP now accepts the same closed 65–4096-byte signature range.
- Migration 0054 widens only two existing allowlists to the three approved
  EIP-712 methods. Its down migration refuses rollback while non-EOA rows exist.

## Verification Evidence

- Full repository test suite: `742/742` passed, including positive/negative
  EOA, ERC-1271 and ERC-6492 cases and migration source checks.
- PostgreSQL suite: `83/83` passed against a temporary local cluster, including
  all `54` up/down migration pairs. The cluster was stopped after verification.
- Schema validation: `87` contracts passed.
- Type-contract check: `3` package export surfaces and `68` runtime value
  exports passed.
- Tenant Protocol check: `77` operations, `97` request fixtures, `85` result
  fixtures, `8` handoff fixtures and all invalid mutations passed.
- Migration ordering check: `54` ordered up/down pairs passed.

The repository-wide `pnpm check` remains blocked by the same pre-existing
sealed M1-A-1 snapshot branch mismatch documented in the EVM-WALLET-001 audit;
it is not a signature-runtime regression.

## Remaining gate

No ERC-6492 verifier bytecode, vendor, RPC, factory action, smart-account
deployment, external credential, Testnet write, production or funds authority
was selected or enabled. Each remains subject to separate human review.

## Rollback

Run the down migration only after it proves no non-EOA durable rows exist, then
restore the verifier, proof adapter, authentication, MCP, schemas and type
surface. No chain state was created.
