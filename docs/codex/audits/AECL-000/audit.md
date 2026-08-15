# AECL-000 Completion Audit

Date: 2026-08-07

Status: `ACCEPTED_WITH_PREEXISTING_RELEASE_GATE_BLOCKER`

Delivery claim: architecture, current-code audit, traceability and next-issue
definition only

## Outcome

AECL-000 produced a proposed architecture freeze without changing runtime
behavior. ADR-038 places a vendor-neutral Agentic Execution Compatibility Layer
between the existing Tenant Gateway/Kernel and three external execution SPIs.
It keeps canonical economic authority in Mandate, SpendPolicy, accepted
Offer/Obligation/Facility, CreditLine capacity, risk policy, Ledger and
Evidence.

The current-code matrix contains 54 material rows:

| Status | Count |
| --- | ---: |
| `ALREADY_IMPLEMENTED` | 15 |
| `PARTIALLY_IMPLEMENTED` | 16 |
| `ABSENT` | 20 |
| `CONFLICTS` | 3 |

The three executable conflicts are:

1. the WalletConnect facade accepts caller-supplied zero-value transaction
   target/calldata instead of only an IPO.ONE prepared execution;
2. the Agent MCP account-proof tool requires an exact 65-byte signature even
   though the Tenant boundary and ERC-1271 verifier accept bounded contract
   signatures; and
3. the current zero-native-value wallet scope does not evaluate selector,
   allowance, code/proxy identity or asset effects and therefore cannot satisfy
   the new safety rule.

No conflict was modified in this architecture-only issue.

## Files added

- `docs/codex/tasks/AECL_000_AGENTIC_EXECUTION_COMPATIBILITY_ADR.md`
- `docs/codex/audits/AECL-000/pre-change-mapping.md`
- `docs/codex/audits/AECL-000/traceability.md`
- `docs/codex/audits/AECL-000/audit.md`
- `docs/architecture/ADR-038-agentic-execution-compatibility-layer.md`

No application, package, module, schema, migration, contract, configuration,
dependency, generated bundle or deployment file was added or modified by
AECL-000.

## Architecture decisions delivered

- Kernel, Ledger and Evidence remain canonical; AECL is projection, preflight
  and external-execution control only.
- EVM Wallet Connector, Delegated Agentic Wallet Provider and Venue Execution
  are independent SPIs.
- `DelegatedWalletGrant` and `ExecutionTargetPolicy` are bounded execution
  projections, not new credit authority.
- `TransactionPreflightReceipt` and `WalletExecutionReceipt` are immutable
  normalized Evidence.
- every execution requires current authority, atomic pending-exposure
  reservation, exact payload, fresh simulation/preflight, exact approval
  binding where applicable, finality/result observation and reconciliation;
- execution decision is exactly `ALLOW | STEP_UP | DENY | QUARANTINE` and is
  separate from Tenant AuthZ;
- raw wallet/venue transports remain internal adapter mechanisms, not
  authorization or Agent application interfaces;
- unknown capability, state or outcome never widens authority or triggers a
  blind retry;
- chain compatibility never enables a chain;
- HyperCore remains a Venue Adapter and HyperEVM remains a separately enabled
  EVM chain profile;
- Hyperliquid master/subaccount identity remains distinct from API-wallet
  signing identity, and a retired delegate address cannot be reused;
- all Human Web, Tenant Protocol, SDK, MCP/A2A and worker paths reuse one
  authenticated business protocol.

## Unresolved decisions

ADR-038 records the exact unresolved set. The highest-risk items are:

- exact grant/target/preflight/execution schemas and migrations;
- `STEP_UP` approval roles, lifetime and dual-control policy;
- EVM simulation and effect-extraction provider;
- code/proxy/selector/allowance policy;
- the detailed EIP-5792, ERC-7715/7710, EIP-7702, ERC-4337 and ERC-6492 support
  profile;
- pending-exposure dimensions and numeric limits;
- global/adapter/chain/grant control permissions;
- Evidence-anchor migration to the prepared-execution boundary;
- every vendor adapter;
- Hyperliquid delegate, signer, custody, endpoint, account, market, numeric
  limit and Testnet-write decision;
- HyperEVM enablement, production dependencies, credentials, deployment,
  mainnet, capital and real value.

These remain separately reviewed and fail closed.

## Verification evidence

Runtime:

- Node.js: `v26.5.0`;
- pnpm: `11.1.3`.

Focused documentation checks:

- all five required AECL-000 files: PASS;
- one unique `ADR-038` heading: PASS;
- 54 matrix rows using the four required statuses: PASS;
- Product Constitution, ADR and follow-up issue traceability presence: PASS;
- trailing-whitespace scan across all five files: PASS;
- AECL-owned Git status contains only new files under `docs/`: PASS.

Repository checks:

- `pnpm test`: PASS, 728 passed, 0 failed;
- `pnpm run check:product-traceability`: PASS, 13 destinations, 67 actions,
  77 bound operations;
- `pnpm run check:web-bundle`: PASS, 1 external module, 29 authored modules,
  851 unique IDs;
- `pnpm run check:deploy`: PASS;
- `pnpm run check:launch-policy`: PASS;
- `pnpm run check:realvalue-decision-package`: PASS, launch remains
  `REJECT_LOCKED`;
- `pnpm run check:realvalue-offline-review-contract`: PASS;
- `pnpm run check:approval-policy`: PASS;
- `pnpm run check:abuse-policy`: PASS;
- `pnpm run check:operations-policy`: PASS;
- `pnpm run check:tenant-protocol`: PASS, 77 operations;
- `pnpm run check:agent-https-transport`: PASS.

Full repository gate:

- `pnpm check`: FAIL at the pre-existing branch-bound
  `check:m1-a-1-snapshot` gate after runtime, source/boundary lint, types,
  schemas, OpenAPI, 53 migration pairs, deployment topology, provider
  selection, closed-pilot operations, local-stack and M1 requirement Evidence
  all passed;
- current branch is `codex/m1-b-deployable-sandbox`, while the pre-existing
  untracked `deploy/local/m1-a-1-candidate-snapshot.v1.json` binds
  `codex/checkpoint-20260727-pre-strategy`;
- `pnpm run check:local-rc` independently fails on the same branch mismatch
  against the pre-existing sealed `deploy/local/release-candidate.v2.json`;
- AECL-000 does not own either artifact and did not rewrite or reseal them.

This is a release-evidence blocker, not an AECL runtime regression. The full
gate is not reported green.

## Security and permission evidence

- no dependency or lockfile changed;
- no secret, key, credential, signature, raw address, KYC/PII or sensitive
  strategy payload was added;
- no contract, network call, signer, wallet permission, venue action, chain
  profile, migration, risk limit or funds path changed;
- existing local Hyperliquid execution remains simulation-only and
  network-disabled;
- existing real-value package remains `REJECT_LOCKED`;
- ADR-038 was accepted by the Founder on 2026-08-07 with bounded runtime
  authority for `EVM-WALLET-001` and `SIG-003` only; all later execution,
  vendor, deployment and funds gates remain closed.

## Migration and rollback

Migration impact: none.

Rollback removes only the five AECL-000 documentation artifacts. It has no
runtime, data, chain, contract, wallet, venue or Evidence effect.

## Proposed next work

After explicit architecture review, the exact next candidates are:

1. `EVM-WALLET-001` — common injected/WalletConnect connector SPI, normalized
   capabilities, change invalidation and removal of generic raw-send exposure;
2. `SIG-003` — EIP-712/1271/6492 verification parity across Tenant Protocol,
   TypeScript SDK and MCP without deployment or signing authority.

Both issues were explicitly authorized by the Founder on 2026-08-07. EXEC,
vendor and Hyperliquid execution phases remain later stop-gated work.
