# AECL-PHASE5-CONFORMANCE — Multi-Provider Reference Conformance Closure

Status: `COMPLETE — VERIFIED_SANDBOX / L0_LOCAL_NO_FUNDS`

Date: 2026-08-10

## Context

Phases 1–4 established the AECL architecture, universal EVM and signature
compatibility, delegated execution, mandatory preflight/simulation, the
Agentic Wallet Provider SPI, transport parity, and a bounded external
Hyperliquid Testnet proof. Phase 5 is therefore a provider-breadth and
conformance phase, not a repetition of that lifecycle for every provider.

`SAFE-AGENT-001` is complete and sufficient as the institutional smart-account
reference. No follow-on Safe issue is implied. This consolidated issue adds the
remaining two materially different reference architectures:

- Circle developer-controlled MPC/managed wallets; and
- Base Account smart accounts and native Spend Permissions.

It then closes Phase 5 by proving MetaMask, OKX, Safe, Circle and Base Account
can project through one stable SPI and canonical authorization/preflight
contract without Kernel change.

## Scope

- Add disabled local Circle and Base Account reference adapters through the
  existing `AgenticWalletProvider` SPI.
- Normalize short-lived, hash-only provider capability observations.
- Circle: project one canonical prepared execution into a non-executable
  managed-wallet review receipt that requires custody/credential review and
  never accepts an API key, entity secret, ciphertext, raw signature or raw
  provider response.
- Base Account: project one canonical external wallet permission into a
  non-executable Spend Permission receipt; allowance, period, start/end,
  chain, asset and target scope can only narrow canonical authority.
- Explicitly disable Base Auto Spend Permissions, silent spend, Sub Account
  creation, `eth_sendTransaction`, `wallet_sendCalls` and provider adjustment.
- Produce one closed multi-provider conformance Evidence record proving the
  current reference adapters are independently disabled, fail closed on
  unsupported capability, normalize provider-specific security receipts, and
  create no second authorization or economic kernel.
- Add closed schemas, one consolidated fixture/test suite, completion audit,
  ADR checkpoint and safe Evidence artifact.

## Non-goals and permission boundary

- No Circle account/wallet set, API key, entity secret, ciphertext, MPC node,
  REST/SDK call, signing request, transaction, webhook or custody activation.
- No Base Account connection, passkey, Sub Account, Spend Permission request,
  paymaster, bundler, CDP wallet, wallet RPC, contract call or transaction.
- No Safe follow-on implementation or Testnet work.
- No provider-specific Tenant Protocol, OpenAPI, SDK or MCP operation.
- No change to canonical Credit, Obligation, Mandate, SpendPolicy, Facility,
  Ledger, risk, Event, Evidence or reconciliation semantics.
- No new dependency, database migration, chain profile, code-hash policy,
  external credential, deployment, mainnet, real value, transfer, withdrawal,
  custody or production authority.

## Likely files

- `modules/agentic-execution/src/circle-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/base-account-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/phase5-multi-provider-conformance.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/phase5-multi-provider-conformance.test.js`
- `modules/agentic-execution/test/fixtures/phase5-reference-provider-conformance.v1.json`
- five new closed schemas under `schemas/v2/`
- `docs/codex/audits/AECL-PHASE5-CONFORMANCE/audit.md`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`
- one safe sandbox Evidence artifact

## Acceptance criteria

1. Circle and Base descriptors satisfy the unchanged nine-operation SPI.
2. Both adapters are disabled, static, sandbox-only and grant no external,
   transaction, production or funds authority.
3. Circle's managed-wallet projection binds canonical prepared execution and
   preflight; unsupported or unknown MPC/credential/signing facts fail closed.
4. Circle outputs never contain an API key, entity secret, ciphertext, raw
   signature, wallet address or provider response.
5. Base Spend Permission scope cannot exceed the canonical external permission
   projection's chain, asset, target, per-transaction, rolling, aggregate,
   Obligation or expiry limits.
6. Base recurring allowance uses a bounded 24-hour period, forbids arbitrary
   `extraData`, disables auto-spend/silent spend, and requires `STEP_UP`.
7. Unknown capability, chain/context drift, stale observation, provider
   adjustment or widened permission fails closed.
8. MetaMask, OKX, Safe, Circle and Base each produce one current reference
   receipt hash and one disabled descriptor/capability binding.
9. Final conformance Evidence proves common AECL semantics are provider-neutral,
   external permissions narrow only, adapters are independently replaceable,
   provider data normalizes to common Evidence, and no adapter creates a second
   authorization/economic kernel.
10. Adding a future compliant provider requires adapter/conformance additions
    only; the conformance validator rejects any claimed Kernel change.
11. Existing full unit, transport, PostgreSQL, schema, migration, lint and type
    gates remain green.

## Test commands

```sh
node --test modules/agentic-execution/test/phase5-multi-provider-conformance.test.js
node --test modules/agentic-execution/test/*.test.js
pnpm test
pnpm run test:transport
pnpm run test:postgres
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:migrations
git diff --check
```

## Security checklist

- [x] Provider capability `unknown` is non-permissive.
- [x] Circle managed custody never becomes canonical authorization.
- [x] Entity secret/API key/ciphertext material is rejected or absent.
- [x] Base permission amounts and dates are exact canonical narrowings.
- [x] Base Auto Spend Permissions and silent execution are disabled.
- [x] Raw calldata/signature/provider response is not retained.
- [x] Canonical preflight, decision and Evidence remain mandatory.
- [x] Every adapter has an independent disabled descriptor/kill switch.
- [x] No provider-specific business logic enters the Kernel or transports.
- [x] Production, custody, mainnet, deployment and funds authority are false.

## Migration and transport impact

None. The adapters add no table and no operation. Existing OpenAPI, SDK and MCP
parity remains unchanged because every provider uses the same canonical wallet
operations.

## Rollback

Remove the two new adapter exports, multi-provider conformance module, five
schemas, fixture/test, audit/ADR checkpoint and sandbox Evidence. Preserve Safe
and all Phase 1–4 Evidence. No database or canonical aggregate rollback is
required.

## Completion Evidence

Completion is `VERIFIED_SANDBOX` Phase 5 reference breadth. It is not a Circle,
Base or Safe Testnet proof; provider activation; custody; hosting; production;
mainnet; or real-value authority.

Implemented Evidence:

- Circle and Base adapters implement the unchanged nine-operation SPI and are
  disabled, static, sandbox-only references.
- The Circle projection binds one canonical prepared execution/preflight and
  can reach only `STEP_UP`, `DENY` or `QUARANTINE`; it accepts no credential
  material and grants no external/submission/custody authority.
- The Base projection compares one native Spend Permission against the
  canonical external permission projection and denies chain, scope, binding,
  amount, period, validity or `extraData` widening. Auto-spend, silent spend,
  Sub Account creation and transaction RPCs remain disabled.
- One five-provider closure proves MetaMask, OKX, Safe, Circle and Base share
  the same stable SPI without canonical Kernel or transport change.
- Focused Phase 5 tests passed `8/8`; all agentic-execution tests `59/59`;
  repository unit tests `888/888`; transport parity `74/74`; fresh isolated
  PostgreSQL `85/85`; schemas `136/136`; migrations `60/60`; lint, typecheck
  and `git diff --check` passed.
- Hash-bound Evidence:
  `artifacts/sandbox/aecl-phase5-multi-provider-conformance-20260810.json`.

Official capability references reviewed:

- `https://developers.circle.com/wallets/signing-and-authorization-models`
- `https://developers.circle.com/wallets/dev-controlled/entity-secret-management`
- `https://docs.base.org/base-account/improve-ux/spend-permissions`
- `https://docs.base.org/base-account/improve-ux/sub-accounts`
