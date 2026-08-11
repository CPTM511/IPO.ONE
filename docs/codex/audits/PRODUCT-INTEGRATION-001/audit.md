# PRODUCT-INTEGRATION-001 Founder Release Audit

Date: 2026-08-11

Top-level verdict at audit time: `BLOCKED — NOT RELEASED`

Resumption: on 2026-08-11 the Founder approved PI-001, PI-002 and PI-003 for
`L0_LOCAL_NO_FUNDS` implementation. The approval is incorporated as
`DEC-AECL-INTEGRATION-001` in Product Constitution v1.1 and ADR-038. This audit
remains the immutable pre-approval finding; completion and release Evidence
will be recorded in a separate acceptance report.

Delivery profile reviewed: `L0_LOCAL_NO_FUNDS`

## Outcome

AECL cannot be truthfully composed into the authenticated IPO.ONE Human and
Agent product without first resolving three missing canonical application
contracts. This is the exact stop condition in sections 16 and 27 of the
Founder task: completing the requested flow now would require inventing new
AccountBinding semantics, new execution-intent resolution semantics, or a new
transaction boundary.

No wallet/provider transaction, UserOperation, Hyperliquid Exchange action,
external signature, credential use, deployment, production activation, chain
write, capital action or funds movement occurred. No updated product was
released.

## Product

The existing product remains one authenticated IPO.ONE shell with shared Human
and Agent credit state. The current working tree contains the AECL domain,
provider SPI, reference adapters, EVM connector, signature verification,
PostgreSQL repositories, Tenant Protocol operations, SDK and local MCP parity.
Those parts are not equivalent to a native product flow.

The private runtime still defaults wallet execution to
`createUnavailableWalletExecutionApplication()`, whose stable error is
`wallet_execution_application_not_composed`. The private local runtime composes
the bounded Venue application, but the production runtime composes neither the
wallet nor Venue execution application.

## Authentication boundary

The existing authentication implementation was not changed.

- Human authentication remains OIDC or the already canonical, pre-provisioned
  SIWE credential flow.
- Agent authentication remains the workload authentication boundary.
- Wallet connection did not gain the ability to create or replace Tenant,
  Actor, Role, Subject, Principal or workspace state.
- No execution signer was accepted as an Agent workload identity.

The current browser wallet surface is still primarily authentication/session
state. It has not been relabelled as a native execution-account flow because
that would claim an AccountBinding capability the durable Human product does
not have.

## Exact canonical contradictions

### PI-001 — no Human execution AccountBinding command

The only durable `account_binding.v2` creation path is
`pilotSubmitAgentAccountProof`. It requires an exact pending Agent Subject,
consumes an Agent challenge, creates the binding, and activates that Agent
Subject. There is no reviewed Tenant operation that binds an execution account
to an already authenticated Human Subject without changing identity state.

Reusing the Agent handler for Human execution would change Subject and
AccountBinding semantics. Treating the Human SIWE credential as an execution
binding would merge Login/Auth and AccountBinding, directly violating the
task.

Required decision: approve a Human/dual-native execution AccountBinding
lifecycle, including exact controller, challenge, proof, account-purpose,
multi-account, read, revoke, recovery and non-authentication semantics.

### PI-002 — no canonical TransferIntent-to-exact-execution resolver

`walletPrepareExecution` correctly accepts only `transferIntentId`; callers
cannot provide raw calldata. The current `transfer_intent.v2` is a high-level
money-transfer contract. The durable Provider delivery intentionally exposes a
redacted amount/asset/purpose view. Neither contract contains or resolves:

- target policy and exact target address;
- function selector and calldata;
- expected native/token/allowance deltas;
- code/proxy snapshot; or
- simulation input and step-up material.

`constructPreparedExecution()` requires those exact facts, but current
non-test source has no resolver that derives them from a TransferIntent. Any
application composition would therefore have to accept browser/Agent-authored
calldata, invent a deterministic mapping, or silently use a fixture. All three
would change canonical Execution Intent / SpendPolicy meaning or bypass AECL.

Required decision: approve one versioned, provider/venue-specific resolver
contract from canonical intent plus server registry state to exact payload,
ExpectedEffects and target policy, with ambiguous or unsupported cases denied.

### PI-003 — no reviewed atomic Gateway plan for AECL repositories

Tenant Command Gateway commands commit one authorization-revalidated plan,
events and projection writes in a serializable transaction. The existing AECL
PostgreSQL repositories append their own commands and projections. No wallet
execution application currently converts grant, reservation, prepared
execution, simulation and preflight state into the Gateway plan contract.

Committing those repositories beside the Gateway would create a second
transaction and permit authority/Evidence drift. Adding arbitrary callback or
transport-specific commit behavior would redesign the Gateway. Duplicating the
AECL tables inside CoreProjectionType without a reviewed ownership decision
would create two persistence authorities.

Required decision: approve the single atomic ownership model: either reviewed
CoreProjection write types and planners, or a reviewed in-transaction AECL
repository port used by the Gateway. Two commits are not acceptable.

### PI-004 — product prerequisites are not authorable end-to-end

`prepareDelegatedWalletGrant()` correctly requires current Mandate,
SpendPolicy, CreditLine, executed Obligation, AccountBinding, target policy and
fresh AuthZ. The active Tenant product has no reviewed command that authors the
exact execution SpendPolicy/target-policy set for this flow. It also has no
normal Human execution AccountBinding path described above.

The correct behavior today is zero capacity and fail closed. A browser must not
manufacture capacity, select another Subject's policy, or silently seed a
fixture.

## Wallet, network and Venue activation status

| Family | Local implementation truth | Production activation |
| --- | --- | --- |
| Generic injected EVM / EIP-6963 | Connection and capability discovery exist; AECL submission is disabled | `PRODUCTION_BLOCKED` |
| WalletConnect-compatible | Fixed memory-only connector boundary exists; no production Project ID/configuration was supplied | `PRODUCTION_BLOCKED` |
| MetaMask | Reference adapter conforms; external permission/sign/send calls are disabled | `DISABLED` |
| OKX | Reference adapter conforms; wallet/CLI/MCP/TEE execution is disabled | `DISABLED` |
| Safe | Reference adapter conforms; module/signature/submission authority is disabled | `DISABLED` |
| Circle | Local managed-wallet reference conforms; credential/MPC/API execution is disabled | `DISABLED` |
| Base Account | Local Spend Permission reference conforms on Base Sepolia only; silent spend/send is disabled | `DISABLED` |
| HyperCore Venue | Durable local binding read and delegate preparation exist; activation, signing and Exchange submission remain closed | `PRODUCTION_BLOCKED` |

Enabled EVM execution profiles remain only the reversible Testnet identifiers
`eip155:84532` and `eip155:1952`. They are not production networks. HyperCore
remains a Venue/account domain, not an EVM chain or wallet login.

## Safe changes completed

Independent, non-authorizing regressions were repaired:

1. Product traceability now binds all eight existing Venue operations to the
   same Tenant Gateway, AuthZ, admission, persistence, SDK and MCP sources.
2. The traceability schema admits the canonical `venue*` operation namespace.
3. The Wallet & Permissions destination records the distinct, fail-closed
   Venue lifecycle without calling HyperCore an EVM wallet.
4. The security contract now expects the truthful
   `agenticWalletPreflightEnabled=true` and
   `walletSubmissionEnabled=false` flags.
5. Static asset path security now proves allowlisted `asset.file` resolution
   and rejects request/pathname-controlled filesystem reads.

These changes grant no new runtime capability and do not claim native AECL
product integration.

## Verification

| Gate | Result |
| --- | --- |
| AECL domain/provider conformance | PASS `59/59` |
| Wallet API/SDK/MCP focused parity | PASS `16/16` |
| Human AuthN and wallet lifecycle regression | PASS `54/54` after loopback-only rerun |
| Complete unit suite | PASS `888/888` |
| Complete transport suite | PASS `74/74` |
| Complete security suite | PASS `33/33` |
| Fresh isolated PostgreSQL 17 suite | PASS `85/85` |
| JSON Schemas | PASS `136` contracts |
| Ordered migrations | PASS `60` up/down pairs |
| OpenAPI | PASS `21` paths / `21` operations |
| Tenant Protocol | PASS `94` operations |
| Product traceability | PASS `94` bound operations |
| Type declarations | PASS `3` package surfaces / `72` runtime exports |
| Source and boundary lint | PASS `658` JavaScript modules |
| `git diff --check` | PASS |

The aggregate `pnpm run check` passes every gate through M1 requirement
Evidence and then stops at the existing sealed candidate assertion:

```text
sealed snapshot branch: codex/checkpoint-20260727-pre-strategy
current branch:         codex/m1-b-deployable-sandbox
```

The sealed snapshot was not edited to manufacture a pass.

## Deployment and product experience

No updated deployment exists. There is no release/build ID or deployment ID
for PRODUCT-INTEGRATION-001.

The existing local stack remains running and all four loopback health endpoints
return `ready`:

- Borrower: `http://127.0.0.1:8787/#human`
- Principal / Agent Authority: `http://127.0.0.1:8788/#human`
- Risk Operations: `http://127.0.0.1:8789/#risk`
- Capital Partner: `http://127.0.0.1:8790/#capital-partners`

It is not a PRODUCT-INTEGRATION-001 candidate. Local acceptance reports the
running database at migration `53` while the working tree defines `60`. The
stack was not rebuilt from a dirty, canonically blocked working tree merely to
make it look current.

The checked-in release identity remains HEAD `dfba8d7` on a dirty working tree.
No commit, tag, candidate seal, deployment or production configuration was
created.

## Product Constitution and production gates

Product Constitution v1.0 still marks `L5_PRODUCTION` not approved and
`L4_CONTROLLED_REAL_VALUE` disabled. Provider credentials, signer/custody,
production networks, contracts, risk limits, real value, deployment and funds
movement each require named approval and evidence. The task's
`EXECUTION AUTHORIZED` status does not silently revise those higher-authority
states.

## Rollback

No economic or runtime state requires rollback. To revert this audit-only
closure, remove the Venue traceability bindings/action, restore the narrower
traceability operation pattern and security expectations, and remove this task
record. Do not delete or rewrite the pre-existing AECL/HyperCore working-tree
changes.

## Verdict

`BLOCKED — NOT RELEASED`

Release can resume only after the three canonical decisions above are approved
and implemented, a clean candidate is built, the local migration/runtime drift
is closed, the sealed release gate passes intentionally, and an approved
deployed environment passes post-deployment acceptance.
