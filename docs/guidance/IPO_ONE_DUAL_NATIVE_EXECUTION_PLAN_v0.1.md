# IPO.ONE Dual-Native Execution Plan v0.1

Version: v0.1
Date: 2026-07-14
Status: Active implementation sequence derived from Product Charter v1.1

## Outcome

Deliver a design-partner-grade no-real-funds product in which a Human and an
Agent can each create accountable identity, request credit, accept a versioned
offer, create and execute an obligation, repay it, and retrieve performance
Evidence through one durable protocol kernel.

## Delivery Model

The work proceeds as small issue-sized vertical increments. Every increment
must leave the repository green and must not claim real-value authority.

| Order | Issue | Product outcome |
| --- | --- | --- |
| 1 | `PRODUCT-001` | Ratify Product Charter v1.1, dual-native scope, and test-chain profiles |
| 2 | `CREDIT-001` | Compose the shared no-funds Credit Intent -> Offer -> Obligation -> Repayment lifecycle in the durable Gateway |
| 3 | `HUMAN-001` | Add Human Subject, Consent, mock KYC/VC reference, and Human servicing states over the shared lifecycle |
| 4 | `WEB-002` | Ship the selected Human/Agent product shell and guided borrowing journey over the real no-funds API |
| 5 | `TRANSPORT-001` | Add reviewed loopback authenticated HTTP plus a local stdio Agent MCP adapter; keep public/remote/production transport behind later approval |
| 6 | `CHAIN-001` | Prove receipt, finality, reorg, and Evidence portability on Base Sepolia and X Layer Testnet |
| 7 | `PROVIDER-001A` | Completed locally: exact Provider-read/acknowledgement and restricted callback-inbox permissions, fixed loopback process, signatures, durable inbox, replay/crash recovery and conformance tests. Public/remote Provider and funds remain separate gates. |
| 8 | `PILOT-001` | Run a closed design-partner pilot gate with telemetry, incident ownership, privacy, legal, and risk approvals |

`CREDIT-001` and `HUMAN-001` share schemas and kernel primitives but may be
implemented in small sequential pull requests. `WEB-002` cannot be declared
complete until both Human and Agent flows call the same application protocol.
The authenticated shell now reaches deterministic Offer and eligible Agent
Mandate activation, but a Human-created Agent remains `pending` until the
separately proposed `IDENTITY-001` account-proof transition is approved.

## UX Information Architecture

The product has four top-level destinations:

1. **Home / Portfolio** — available credit, outstanding obligations, next
   payment, performance, risk posture, and recent Evidence.
2. **Borrow** — identity/authority, intent, decision, offer review, acceptance,
   execution, and confirmation.
3. **Activity / Evidence** — payments, servicing state, receipts, reason codes,
   and portable Evidence envelopes.
4. **Developers / Agents** — capability catalog, credentials, SDK/MCP setup,
   idempotency, webhooks, and conformance status.

Risk Operations remains a permissioned workspace, not the default borrower
home. Human and Agent entry selectors change presentation and authentication,
not protocol truth.

## First Test-Chain Decision

Base Sepolia is the default execution profile because its official tooling,
public RPC documentation, wallet support, faucets, and EVM developer path make
it the lowest-friction place to prove contract receipts and finality. X Layer
Testnet is the mandatory second conformance profile because it provides a
distinct EVM chain under a different operator and proves adapter portability.

No production code may assume either RPC is suitable for production. RPC URLs,
explorers, confirmation policies, chain caps, and adapter capabilities are
configuration. The protocol kernel receives normalized finality and Evidence,
never provider-specific response shapes.

## Definition of Design-Partner Ready

- Human and Agent end-to-end lifecycle tests pass from separate entry modes.
- A new user can understand what is simulated and what is legally real.
- Every user-visible amount reconciles to the ledger and canonical obligation.
- Every mutation is idempotent, authorized, bounded, auditable, and recoverable.
- Consent/Mandate and identity references are revocable and privacy-safe.
- Mobile and desktop core journeys pass accessibility and visual QA.
- API/SDK examples are executable; Agent discovery exposes capability maturity.
- Test-chain Evidence can be invalidated and replayed across reorg scenarios.
- No private data or real value can enter the public sandbox path.

## Open Human Decisions

Capital source, pricing, pilot jurisdictions, lending/origination roles,
compliance vendors, KYC/KYP providers, custody, production chain, production
RPC/indexer, real credit policy, loss allocation, servicing partners, and launch
permissions remain unapproved.

Local non-funds transport was approved and implemented on 2026-07-15 under
`TRANSPORT_001_AUTHENTICATED_HTTP_MCP_ADAPTER.md`. It remains loopback/local
only and grants no public, remote, deployment, production credential, or funds
authority.

The local Human embedding path now uses the closed
`createTenantPilotHost(...)` composition. It wires the existing Gateway, Human
BFF verifier, Agent workload verifier, trusted Network Context, per-session
CSRF bootstrap, and complete fixed UI module graph while locking the listener
to the approved loopback development profile. HTTPS OIDC login/callback
routing, production IdP configuration, TLS/proxy/deployment, and remote access
remain separate human decisions.

The Agent SDK requirement is now implemented through
`IpoOneAgentMcpClient`: the package owns the same four-step local MCP workflow
used by the App, derives Mandate authority from the handoff, and returns the
closed Decision/Offer receipt. SDK/App/browser registry parity is CI-enforced;
this creates no remote transport or later lifecycle authority. The separate
`IpoOneAgentSandboxObligationClient` now composes the already-approved private
Tenant operations for exact Offer acceptance, shared `obligation.v2`, signed
no-funds execution/accounting, and synthetic repayment. It requires an active
handoff with all three Mandate capabilities and returns a closed immutable
receipt; it publishes no additional MCP tool.

The local Agent embedding path now uses the closed
`createAgentPilotHost(...)` composition. It constructs the existing
`AgentTenantCommandClient` and Subject/Mandate-pinned MCP Host, requires fresh
Host-owned authentication and trusted Network Context for every protocol
command, and rejects any Actor that is not the exact Agent Subject in the
handoff before Gateway execution. It accepts no token, Context, Tenant, Actor,
endpoint, or secret and creates no remote transport or later lifecycle
authority.

The Human HTTP composition now has an equivalent closed
`human_credit_offer_workflow_receipt.v1`. The browser performs the exact
self-read -> Intent -> application read -> evaluation sequence under one
correlation ID, fails closed on Consent/identity/economic drift, and exposes a
copy-safe Receipt without session, CSRF, credential, or funds authority. Human
and Agent receipts retain their distinct Consent/HTTP and Mandate/MCP entry
evidence while sharing canonical Intent, Decision, and Offer shapes.

That convergence is now executable rather than shape-only. The closed
`assertDualNativeCreditOfferParity(...)` gate validates both Receipts and
compares identical request economics, policy outcome, Offer terms, schedule
offsets, and no-funds flags while excluding identity, authority, transport,
reason-code, hash, and absolute-time differences. Golden fixtures fail
`check:tenant-protocol` on drift, and PostgreSQL proves the same 12,000-minor,
60-day, two-installment request returns the same 900 bps zero-fee outcome from
Human Consent and Agent Mandate entry.

Release evidence now has the same deterministic boundary. `OPS-003` makes the
repository-wide gate verify the actual Node 24.18.0 and pnpm 11.1.3 processes,
keeps `.node-version`, `.nvmrc`, package engines, CI, and deployment assertions
in sync, and rejects warning-only evidence from unsupported Node releases. This
is an operational conformance control and grants no new product permission.

## Permission-Gated Shared Lifecycle Increments

The remaining `CREDIT-001` work is decomposed so an approval never implicitly
grants a later economic or authority boundary:

| Order | Issue | Approval boundary | Status |
| --- | --- | --- | --- |
| 1 | `CREDIT-001D` | Self-evaluation, dual-authority Decision, deterministic Offer policy | Approved and implemented locally |
| 2 | `MANDATE-001A` | Human Principal-controlled Agent Mandate activation and explicit sandbox scopes | Approved and implemented locally |
| 3 | `IDENTITY-001` | Human-owned binding challenge, bound-Agent CAIP-10 proof, atomic verified Subject activation | Awaiting separate approval |
| 4 | `CREDIT-001E` | Exact Offer acceptance and shared non-executed `obligation.v2` | Awaiting separate approval |
| 5 | `CREDIT-001F` | Non-redeemable sandbox execution, deterministic accounting, shared repayment | Awaiting separate approval |
| 6 | `SERVICING-001` | Worker-derived DPD/cure and dual-controlled sandbox resolutions | Awaiting separate approval |

Current implementation evidence, the complete gap matrix, and the real-value
commercialization decisions are maintained in
`IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`.
