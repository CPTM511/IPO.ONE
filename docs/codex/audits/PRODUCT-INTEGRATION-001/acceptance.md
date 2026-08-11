# PRODUCT-INTEGRATION-001 Acceptance Evidence

Date: 2026-08-11

Local implementation verdict: `PASS — L0_LOCAL_NO_FUNDS`

Founder signed-browser acceptance: `PENDING — WALLET REQUIRED`

Release verdict: `BLOCKED — NOT RELEASED`

This report accepts the Founder-approved native AECL product integration in the
loopback-only IPO.ONE product. It does not approve deployment, production,
external credentials or signers, custody, mainnet, real value or funds
movement.

## Approved contracts delivered

| Founder decision | Canonical implementation | Acceptance result |
| --- | --- | --- |
| Human/dual-native AccountBinding | Product Constitution v1.1 `DEC-AECL-INTEGRATION-001`; one challenge/proof/read/revoke lifecycle for an already authenticated Human or Agent Subject | PASS. A proof creates no login, Tenant, Actor, Role, Subject, Mandate, credit or execution authority. The existing Agent-onboarding binding remains a distinct lifecycle. |
| TransferIntent exact resolver | Provider/Venue registry plus canonical TransferIntent, approved SpendRequest, settlement, active AccountBinding, grant and target policy | PASS. The server derives target, value, calldata, ExpectedEffects and simulation context. Raw client payloads and missing, ambiguous, stale or inconsistent mappings deny. |
| Gateway-owned atomic AECL persistence | One serializable Tenant Command Gateway plan and `AGENTIC_EXECUTION_RECORD` projection owner | PASS. Reservation, grant, prepared execution, simulation, preflight, Event, Evidence, outbox and durable response commit or roll back together. A second repository commit is not used. |

## Native product flow

The existing authenticated product shell now owns the flow:

```text
IPO.ONE authentication
-> existing Human / Agent workspace
-> connect execution account
-> select approved Testnet profile
-> prove AccountBinding
-> read server-derived capacity
-> derive and activate bounded grant
-> resolve exact TransferIntent
-> prepare + simulate + preflight
-> ALLOW / STEP_UP / DENY / QUARANTINE
-> submission disabled in L0
-> queryable Activity / Evidence
```

`Wallet & Permissions` is an existing product destination, not a new app. It
labels login, connected execution account, AccountBinding and execution
authority as four separate states. Disconnecting an execution account clears
the local execution context and does not revoke the durable binding. An OIDC or
other non-SIWE session remains active; a session originally authenticated by
the exact wallet continues to follow the pre-existing SIWE context-invalidation
rule. Revocation is an explicit server mutation.

The browser can provide only the canonical intent reference. It cannot author
limits, authority, target, calldata, ExpectedEffects, Provider payloads or
balances. Submission remains visibly unavailable and invokes no external
wallet or Venue adapter.

## Persistence and migration

Migration `0061_execution_account_bindings` adds Tenant-scoped challenge and
proof-attempt records and upgrades the shared AccountBinding projection without
reinterpreting login state. The migration was corrected for an existing
migration-60 database: the owner transaction temporarily removes forced RLS
and disables only the exact Tenant/binding guards needed for the v2-to-v3
backfill, then restores every trigger and forced-RLS boundary before commit.
Rollback restores the same protection.

The private-pilot and production bootstrap role definitions grant the Gateway
application role access to the new binding and AECL projection tables. All are
still protected by Tenant context, forced RLS and database guards.

Fresh PostgreSQL 17 acceptance proves one Gateway-owned commit, injected-final-
write rollback, idempotent replay, restart recovery, RLS isolation, immutable
Evidence and reconciliation. No external transaction or fund state exists to
recover.

## Provider and network status

| Provider family | Current product truth | Production status |
| --- | --- | --- |
| Generic injected EVM / EIP-6963 | Local connection and capability discovery; exact preparation only; submission disabled | `PRODUCTION_BLOCKED` |
| WalletConnect-compatible | Fixed-version, memory-only connector boundary; no production Project ID/configuration | `PRODUCTION_BLOCKED` |
| MetaMask | Reference conformance only; permission/sign/send paths disabled | `DISABLED` |
| OKX | Reference conformance only; wallet/CLI/MCP/TEE execution disabled | `DISABLED` |
| Safe | Reference conformance only; module/signature/submission authority disabled | `DISABLED` |
| Circle | Managed-wallet reference only; no credential, MPC or API execution | `DISABLED` |
| Base Account | Base Sepolia Spend Permission reference only; silent spend/send disabled | `DISABLED` |
| HyperCore Venue | Local durable read/preparation boundaries; activation, signing and Exchange submission closed | `PRODUCTION_BLOCKED` |

Only reversible Testnet profiles `eip155:84532` and `eip155:1952` are approved
for this local product. They are not mainnet or production network approvals.

## Verification

| Gate | Result |
| --- | --- |
| Complete unit suite | PASS `899/899` |
| Fresh PostgreSQL 17 suite | PASS `85/85` |
| Transport suite | PASS `75/75` |
| Security suite | PASS `33/33` |
| Product separation static UI test | PASS `17/17` file suite |
| JSON Schemas | PASS `136` contracts |
| Ordered migrations | PASS `61` up/down pairs |
| OpenAPI | PASS `21` paths / `21` operations |
| Tenant Protocol | PASS `98` operations |
| Product traceability | PASS `98/98` bound operations |
| Type declarations | PASS `3` package surfaces / `72` runtime exports |
| Source and boundary lint | PASS `667` JavaScript modules |
| Rebuilt loopback stack acceptance | PASS: PostgreSQL 17, 61 migrations, four workspaces, worker, reconciliation, Evidence anchors and empty outbox |
| `git diff --check` | PASS |

The aggregate `pnpm run check` passes runtime, lint, types, schemas, OpenAPI,
migrations, deploy/local safety contracts and the exact 44-requirement
Constitution gate. It then stops at the intentionally immutable M1-A.1
pre-seal snapshot because that historical artifact binds branch
`codex/checkpoint-20260727-pre-strategy` while the current branch is
`codex/m1-b-deployable-sandbox`. The sealed artifact was not rewritten to
manufacture a green result.

## Real-browser Evidence

A headed real browser loaded the loopback Borrower product, opened the existing
sign-in flow and rendered the separate Testnet selection and explicit
`Authentication is not credit authority` boundary with no console error or
warning. Its only application request before authentication was the loopback
authentication-options read. Screenshot:

`output/playwright/product-integration-001/.playwright-cli/page-2026-08-11T03-11-40-504Z.png`

The automation environment had neither the invited private key nor a wallet
extension, so no synthetic signature was substituted and no browser claim is
made for a completed signed AccountBinding. Domain, Gateway and PostgreSQL
tests prove that signed boundary; acceptance criterion 12 remains a Founder
browser check rather than an automated pass. Founder review can use the live
URLs below.

## Founder review URLs

- Borrower execution surface: `http://127.0.0.1:8787/#wallet-permissions`
- Principal / Agent authority: `http://127.0.0.1:8788/#wallet-permissions`
- Risk Operations: `http://127.0.0.1:8789/#risk`
- Capital Partner: `http://127.0.0.1:8790/#capital-partners`

All four `/tenant/v1/healthz` endpoints returned `ready` after the final
rebuild. The stack is intentionally left running for Founder review.

## Remaining release blockers

Product Constitution v1.1 still does not approve `L5_PRODUCTION`. Launch policy,
deployment identity, remote access, Provider/Venue credentials, signer and
custody authority, production networks/contracts, numerical risk limits and
real-value funds movement all require separate named approvals and live
post-deployment acceptance. Therefore this task has a completed local product
integration but no release/build ID, deployment ID, production activation or
real-value execution claim.

## Rollback

Disable the local wallet execution application composition, restore the
unavailable application default, remove the Wallet & Permissions execution
controls, and apply the guarded migration down only after confirming no later
binding or execution record depends on migration 0061. Because submission is
disabled, no wallet, Venue, chain or funds state needs external unwind.
