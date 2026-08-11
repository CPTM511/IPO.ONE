# AECL-PHASE5-CONFORMANCE Audit — Multi-Provider Reference Closure

Date: 2026-08-10

Issue: `AECL-PHASE5-CONFORMANCE`

Phase: 5 — Reference Provider Breadth and Conformance

Verdict: `VERIFIED_SANDBOX — MULTI-PROVIDER REFERENCE CONFORMANCE CLOSED`

## Outcome

Phase 5 closes with five materially different wallet/provider architecture
references on the unchanged Agentic Wallet Provider SPI:

- MetaMask browser Advanced Permissions;
- OKX wallet/CLI/MCP/TEE claims;
- Safe institutional multisig smart accounts;
- Circle developer-controlled MPC/managed wallets; and
- Base Account smart accounts with native Spend Permissions.

Circle and Base are disabled local reference adapters. They reuse canonical
grant, authorization, target-policy, preflight, decision and Evidence
boundaries. No provider-specific operation, transport business logic,
persistence table or canonical aggregate was added.

## Circle reference boundary

- Short-lived observations contain only capability statuses and configuration
  hashes from local synthetic fixtures.
- A prepared managed execution is bound to one current descriptor,
  capabilities snapshot, prepared execution and canonical preflight.
- Supported clean input reaches only `STEP_UP`; canonical denial and
  unsupported capability deny; unknown capability fails before request or
  quarantines.
- Credential material, encrypted credential payload, raw signature and raw
  provider response retention are false.
- Managed API, MPC signing, custody activation and transaction submission are
  disabled.

## Base Account reference boundary

- Only the existing Base Sepolia execution profile is admitted by this
  Base-native reference; X Layer and all other chain claims fail closed.
- Asset and target references are deterministically derived from the
  canonical permission projection.
- Allowance cannot exceed the smallest canonical per-transaction, rolling
  24-hour, aggregate or Obligation limit.
- The reference period is exactly 24 hours, validity is contained inside the
  canonical window and arbitrary `extraData` is denied.
- Auto Spend Permissions, silent spend, Sub Account creation,
  `wallet_sendCalls`, `eth_sendTransaction`, activation and submission are all
  false even when a vendor reports those capabilities.

## Common conformance proof

The final Evidence builder accepts exactly the five reviewed adapter IDs and
verifies each actual descriptor and capability contract. It derives, rather
than trusts, the following closure assertions:

- every descriptor implements the same nine-operation SPI;
- every reference adapter is static, sandbox-only and independently disabled;
- unknown/unsupported capability is non-permissive;
- external permissions can only narrow canonical authority;
- provider-specific facts normalize to hash-bound receipts;
- no adapter retains raw secrets or creates a second authorization/economic
  Kernel; and
- a future provider requires adapter plus conformance work, not Kernel change.

The validator rejects a missing, extra or duplicate provider, provider-family
or architecture drift, enabled external calls, widened permission flags,
retained secrets, Kernel changes or production/funds authority.

## Verification

- Focused Phase 5 conformance: PASS `8/8`.
- Complete agentic-execution module: PASS `59/59`.
- Complete repository unit suite: PASS `888/888`.
- Tenant/OpenAPI/SDK/MCP transport parity: PASS `74/74`.
- Fresh isolated PostgreSQL regression: PASS `85/85`.
- Closed JSON Schemas: PASS `136/136`.
- Ordered migration pairs: PASS `60/60`.
- Source lint: PASS, `658` JavaScript modules; boundary lint PASS.
- Typecheck: PASS, 3 export surfaces and 72 runtime exports.
- `git diff --check`: PASS.

The first transport run was sandbox-restricted from binding loopback sockets
and failed `EPERM`; the unchanged suite passed `74/74` when allowed to bind
temporary local ports. PostgreSQL initially hit the host's SHM segment-count
limit. Read-only IPC inspection identified one unattached segment created by
the failed Phase 5 `initdb`; only that task-owned orphan was removed. A new
isolated cluster then passed `85/85` and was stopped after verification.

## Schemas and fixture

- `circle_managed_wallet_capability_observation.v1`
- `circle_managed_execution_projection.v1`
- `base_account_capability_observation.v1`
- `base_spend_permission_projection.v1`
- `aecl_phase5_multi_provider_conformance_evidence.v1`
- `phase5_reference_provider_conformance_fixture.v1`

## External references reviewed

- Circle signing and authorization models:
  `https://developers.circle.com/wallets/signing-and-authorization-models`
- Circle developer-controlled credential boundary:
  `https://developers.circle.com/wallets/dev-controlled/entity-secret-management`
- Base Account Spend Permissions:
  `https://docs.base.org/base-account/improve-ux/spend-permissions`
- Base Account Sub Accounts:
  `https://docs.base.org/base-account/improve-ux/sub-accounts`

These references informed adapter capability and threat boundaries only. No
vendor documentation claim is treated as runtime Evidence.

## Evidence

`artifacts/sandbox/aecl-phase5-multi-provider-conformance-20260810.json`

Conformance Evidence hash:
`0xcaf68c28c83a941a2781f16cd0ef72c74da447f3ee84cc78896d3fef92630d9e`

## Residual gates

Any live Circle/Base/Safe discovery, account or wallet creation, external
credential, permission activation, signature, RPC/API call, contract,
Testnet/mainnet transaction, deployment, custody, production or real value
requires a new named issue and explicit human review. Safe follow-on work is
deferred until an actual pilot need or separately reviewed safety gap exists.

## Rollback

Remove the Circle/Base exports, their four schemas, the final conformance
module/schema/fixture/test, this audit/ADR checkpoint and sandbox Evidence.
No migration, protocol operation or canonical aggregate rollback is required.
