# SAFE-AGENT-001 Audit — Institutional Smart Account Reference Adapter

Date: 2026-08-10

Issue: `SAFE-AGENT-001`

Phase: 5 — Additional Providers

Verdict: `VERIFIED_SANDBOX — DISABLED REFERENCE ADAPTER`

## Outcome

Phase 5 has started with a Safe/institutional smart-account reference adapter
behind the existing Agentic Wallet Provider SPI. It adds no provider-specific
Credit, Obligation, Mandate, Ledger or transport business logic.

The adapter normalizes only short-lived, hash-only synthetic facts for the two
already reviewed Testnet profiles. A clean module-free `CALL` projection can
reach only `STEP_UP`. Unsupported required capability and canonical preflight
denial fail closed; unknown capability, enabled modules or Safe configuration
drift quarantine the work. `DELEGATECALL` is denied.

The reference provider descriptor is disabled and
`externalCallsEnabled=false`. No Safe account, Transaction Service, Protocol
Kit, RPC, contract, signature, module, guard, fallback handler, relayer,
bundler, Testnet or mainnet operation was invoked.

## Reuse and non-redundancy

- Phase 1 EIP-712/ERC-1271/ERC-6492 compatibility remains canonical.
- Phase 2 grant, target policy, preflight, simulation, effects and decisions
  remain canonical.
- The existing nine wallet operations remain unchanged across Tenant Protocol,
  OpenAPI, SDK and MCP; no transport-specific Safe operation was added.
- No persistence or migration was added.
- Traceability remains mapped to `REQ-ID-004`, `REQ-EXEC-001`,
  `REQ-EXEC-004` and `REQ-RISK-002`; no Constitution capability changed.

## Security Evidence

- Descriptor, capability, chain, context epoch, request, preflight, Safe
  configuration and projection hashes are exact.
- Capability observations expire within five minutes and unknown never widens
  authority.
- Module presence quarantines because Safe Modules can execute outside the
  ordinary owner-signature path.
- Owner set, threshold, nonce, implementation, singleton, module set, guard or
  fallback-handler drift changes the configuration hash and quarantines.
- The independent verifier rejects a rehashed decision/reason mismatch.
- Output records retain no raw account/owner address, calldata, signature,
  credential or provider response.
- Official Safe transaction hash computation, signature collection,
  Transaction Service use and submission are all false.

## Verification

- Focused Safe adapter: PASS `9/9`.
- Complete agentic-execution module: PASS `51/51`.
- Complete repository unit suite: PASS `880/880`.
- Tenant/OpenAPI/SDK/MCP transport parity: PASS `74/74`.
- Fresh isolated PostgreSQL regression: PASS `85/85`.
- Closed JSON Schemas: PASS `131/131`.
- Ordered migration pairs: PASS `60/60`.
- Source lint: PASS, 654 JavaScript modules; boundary lint PASS.
- Typecheck: PASS, 3 export surfaces and 72 runtime exports.
- `git diff --check`: PASS.

The first PostgreSQL attempt reused an old multi-database test cluster and
failed `2BP01` while deleting a global test role referenced by another
database. A fresh isolated cluster removed that environmental coupling and the
unchanged code passed `85/85`.

## Schemas and fixture

- `safe_agentic_wallet_capability_observation.v1`
- `safe_transaction_projection.v1`
- `safe_account_configuration_comparison.v1`
- `safe_agentic_wallet_conformance_fixture.v1`

## External references reviewed

- Safe Smart Account signatures:
  `https://docs.safe.global/advanced/smart-account-signatures`
- Safe Smart Account concepts:
  `https://docs.safe.global/advanced/smart-account-concepts`
- Safe Modules:
  `https://docs.safe.global/advanced/smart-account-modules`

These references informed the adapter threat boundary only. No vendor claim is
treated as runtime Evidence.

## Evidence

`artifacts/sandbox/safe-agent-001-conformance-20260810.json`

## Residual gates

Any live Safe configuration read, code-hash allowlist, external credential,
Transaction Service, Protocol Kit, signature collection, contract/module/guard
change, Testnet transaction, deployment, production, mainnet, custody or real
value requires a new named issue and explicit human review.

## Rollback

Remove the adapter export, three Safe schemas, conformance fixture, focused
tests, task/audit checkpoint and sandbox Evidence. No migration or canonical
aggregate rollback is required.
