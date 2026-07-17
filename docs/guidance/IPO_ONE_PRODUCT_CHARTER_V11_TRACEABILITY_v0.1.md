# IPO.ONE Product Charter v1.1 Traceability and Commercialization Gap v0.1

Version: v0.1
Date: 2026-07-16
Status: Current local implementation evidence and permission-gated delivery map

## Executive Conclusion

IPO.ONE has moved beyond a narrative whitepaper and beyond a single static
demo: the repository now contains a ratified Product Charter v1.1, durable
Tenant identity/authorization foundations, Human Consent and synthetic identity
references, one shared Human/Agent Credit Intent and deterministic
Decision/Offer path, Principal-controlled sandbox Mandate activation, named
authenticated Human HTTP and Agent stdio MCP Host compositions, executable
cross-entry Offer economic parity, a formal dual-mode UI shell, and
provider-neutral multi-chain finality conformance.

It now contains a **complete operable local no-real-funds borrowing lifecycle**
for design-partner evaluation: durable Human and Agent Subject/authority,
Credit Intent, deterministic Decision/Offer, exact acceptance, one shared
`obligation.v2`, signed nonwithdrawable execution, balanced Ledger posting,
repayment, DPD/default/cure and simulated resolution. The Human path is usable
through the authenticated loopback UI; the Agent path is usable through the
local SDK and the exact eleven-tool authenticated local-stdio MCP registry,
including exact owned Obligation/Evidence reads and bounded Offer acceptance,
execution, and repayment. Both entry modes also produce a closed dual-test-profile portability receipt
that binds the actual Obligation, repayment, and Ledger references without an
RPC, key, contract, deployment, or live testnet claim. CHAIN-001B additionally
proves read-only live RPC observation and implements the bounded emitter, key,
indexer, and durable store path; its two signed testnet runs await faucet-only
gas. Production IdP, remote transport, Provider, real collection, and
production chain composition remain open. PROVIDER-001A now also proves an
independent, signed, loopback-only Provider boundary with exact replay and
crash recovery; it does not enable a public/remote Provider or move value.
WEB-008 now replaces the authenticated DEMO risk projection with a formal
private Risk Operations control plane over the existing PII-free aggregate
portfolio read and protective-only Agent Subject freeze. It does not add a
permission or update the hosted public release.
WEB-009 now replaces the Human Offer's demo-style reason summary with one
fail-closed Decision Passport: plain-language explanations and the exact
`risk_decision_passport.v1` proof are rendered from the same validated result
returned to Agent workflows before Offer acceptance.
WEB-010 now replaces the authenticated Payments summary with one formal
Servicing Case over the exact shared `obligation.v2`: trusted-time DPD stage,
past-due components, schedule, bounded synthetic repayment, returned cure
action, and owner Evidence are usable without adding a servicing operation or
presenting Human state as Agent state.
`SERVICING-002B` now implements the first private, read-only Servicing
Operations queue over that same durable projection. It uses a separate
recent-MFA Risk/Operations permission, bounded closed filters and opaque keyset
pagination, exposes no PII or disposition control, and remains sandbox-only.
Its contract, authorization, SQL mapping, UI source and non-listener security
tests pass locally; PostgreSQL RLS execution and browser/loopback capture remain
release-gate retests because the current Codex environment cannot allocate the
temporary PostgreSQL shared-memory slot or listen on `127.0.0.1`.

It is **not ready for real-value commercialization**. Capital, legal roles,
jurisdiction, production identity/KYC, pricing, custody/rails, servicing, loss
allocation, production chain/infrastructure, independent security review, and
named launch approval remain open human decisions.

Percent-complete is deliberately not reported: protocol code, a usable pilot,
and a regulated real-value product have different denominators. The gates below
show what is actually evidenced.

## Status Legend

- **Verified local** — implemented and backed by current repository tests or
  captured QA Evidence.
- **Partial** — useful implementation exists but does not meet the Charter gate.
- **Specified / approval required** — issue, ADR, or security boundary exists;
  the required permission or policy has not been granted.
- **Open human decision** — cannot be safely inferred or implemented from the
  current Charter.

## Canonical Lifecycle Traceability

| Charter stage | Current state | Evidence | Gap / next gate |
| --- | --- | --- | --- |
| Subject | Verified local for sandbox Agent activation | Durable Agent/Human Subject and Principal projections; one-use CAIP-10 challenge/proof, cross-Subject and cross-chain replay rejection, hash-only AccountBinding, and atomic pending-to-active transition | Production identity assurance, credential provisioning, and real-chain assurance remain open |
| Authority | Verified local for sandbox activation and lifecycle | Durable Human Consent; durable Agent Mandate; Principal-only exact-hash activation; revocation/read controls; active Mandate scope is rechecked for acceptance, execution, and repayment | Production roles, credentials, limits, and real-value permissions remain open |
| Credit Intent | Verified local | `credit_intent.v1`, `pilotRequestCredit`, Human/Agent parity, owner read, durable projection | External production transport remains disabled |
| Decision | Verified local | `credit.evaluate.self`, `pilotEvaluateCreditApplication`, dual-authority `risk_decision.v3`, immutable `risk_feature_snapshot.v1` and `risk_decision_passport.v1`, finalized source Evidence lineage, Tenant-bound risk-state attestation, exact `credit-application-rules.v1` policy hash and owner resource; same Human/Agent economic input returns the same approved amount, price, policy hash and feature-set version | Synthetic/private-pilot Evidence proves provenance only. Production underwriting policy, risk limits/pricing, evidence providers, adverse-action/legal handling, model validation, overrides, KYC/identity and deployment remain named human decisions |
| Offer | Verified local | Deterministic offered `credit_offer.v1`, exact terms hash, zero-fee sandbox schedule, owner application read; `dual_native_offer_economics.v1` compares policy hash/feature-set identity, APR, fee, schedule offsets, disclosures and safety flags across Human HTTP and Agent MCP | Real underwriting policy and production offer authority remain open |
| Acceptance | Verified local | Exact Offer/terms/acknowledgement hashes, owned Consent or active Mandate scope, atomic acceptance and Evidence, idempotent replay | Production legal acceptance and real-value authority remain open |
| Obligation | Verified local | Shared dual-authority `obligation.v2`, normalized deterministic schedule, Human/Agent parity, authorization resource and Evidence; `SERVICING-002A` adds one exact owner-authorized, bounded, PII-free current-state read shared by Human and Agent | Production legal contract form, capital, and external servicing remain open |
| Execution | Verified local no-funds | Signed local sandbox Rail receipt, balanced principal Ledger posting, non-redeemable and nonwithdrawable execution; a separate signed loopback Provider process proves delivery/acknowledgement/callback transport without applying funds to the current Obligation | Public/remote Provider execution, custody, and real-value execution remain prohibited |
| Payment / repayment | Verified local no-funds | Shared partial/full synthetic repayment, deterministic fee/interest/principal allocation, balanced Ledger and exact replay | Real collection rails, bank/custody integration, and production reconciliation remain open |
| Performance | Verified local shared state | Durable balances, repayment events, trusted-clock DPD/default/cure classification, servicing Evidence and reconciliation | Calibrated real repayment history, privacy-safe borrower reporting, and production scoring remain open |
| Servicing | Verified local no-funds kernel; private queue implemented with runtime-gate retest pending | One shared DPD/default/cure truth plus dual-controlled restructure, repurchase, and write-off simulations; WEB-010 renders a fail-closed Human Servicing Case; `SERVICING-002A` re-authorizes and hydrates its exact durable Obligation; `SERVICING-002B` adds a bounded read-only PII-free Risk/Operations queue over adverse sandbox Obligations without granting disposition authority | Re-run the queue PostgreSQL RLS and browser/loopback gates in a listener-capable environment; protected scheduler ownership, notices, collections, legal policy, and production approvals remain open |
| Evidence | Verified local for Auditor and exact owner/controller | Durable Event/Evidence/outbox/projection/replay/reconciliation plus bounded recent-MFA Auditor timeline, Human Obligation panel, typed Agent SDK and local MCP owned read; one closed hash-only paginated response | Production retention/export, notification, external Evidence storage and public access remain approval-gated |

## Product Surface Traceability

| Surface | Current state | Evidence | Gap / next gate |
| --- | --- | --- | --- |
| Human UI | Verified local through the complete no-funds lifecycle, Decision Passport, reload-safe Servicing Case, Agent Mandate activation, Principal-to-Agent handoff, and private risk controls; queue source implemented | Aave-inspired formal Human/Agent shell; named `createTenantPilotHost` loopback composition; CSRF-enforcing Subject/Consent/identity -> Intent -> Decision/Offer -> acceptance -> shared Obligation -> signed execution/Ledger -> sequenced repayment path; WEB-009 presents six ordered plain-language reasons plus exact proof lineage before acceptance; WEB-010 and `SERVICING-002A` restore exact durable borrower servicing truth after reload; `SERVICING-002B` adds a private Risk/Operations queue with desktop table/mobile cards, closed stage filters and no executable dispositions; Principal Agent Subject -> Draft -> exact-hash Activation workbench; credential-free handoff; exact PII-free portfolio query and protective-only Agent Subject freeze | Re-run queue desktop/mobile browser capture in a listener-capable environment; production HTTPS OIDC/IdP, remote/public Tenant access, production identity/KYC and real-value lending remain disabled |
| Responsive/accessibility QA | Verified local for the authenticated shell through `SERVICING-002A`; queue static gate passed | Desktop plus 834x1194, 390x844 and 360x732 captures; Aave/IPO.ONE same-view comparison; no horizontal overflow; mobile focus/Escape checks; 44px primary touch targets; WEB-003 current-run audit proves the Human application heading clears the sticky header at 390x844; WEB-008 adds a dimensionally verified mobile risk state; WEB-009 adds desktop/mobile Decision Passport proof interaction; WEB-010 adds active/cured Servicing Case captures; `SERVICING-002A` adds desktop and 390x844 reload/manual-restore states, `scrollWidth === innerWidth === 390`, 44px load/repayment actions and zero browser diagnostics; `SERVICING-002B` static UI/CSS coverage verifies the queue states and responsive card rules | Capture and inspect the queue in a listener-capable environment, then repeat assistive-technology/live-region checks; screenshots/DOM checks do not constitute full WCAG certification |
| Agent API contract | Verified local through Decision Passport, exact current Obligation read, owned Evidence, repayment and portability | Closed 34-operation private catalog, JSON Schemas, fixtures and stable errors; UI separates retained public test fixtures, private Tenant operations and eleven local MCP tools; `pilotReadServicingQueue` is explicitly excluded from Agent MCP, while `pilotReadOwnObligation` / `ipo_one_read_obligation`, `pilotPostSandboxRepayment` and `pilotReadOwnObligationEvidence` retain the owner-bound shared servicing path; Human session state remains hidden in Agent mode; the three Provider operations remain absent from Agent MCP; handoff/capability manifests and lifecycle SDK clients retain closed replay-safe receipts | Remote/public transport, production credentials/deployment and real funds remain unavailable |
| Provider sandbox UI | Verified local capability status | The authenticated Payments surface reports signed delivery, exact acknowledgement, verified callback, replay and reconciliation capability while explicitly stating that the current Obligation has no Provider execution | Live per-delivery Provider operations UI, public/remote integration, production KYP/SLA and funds require separate approval |
| Authenticated HTTP | Verified local adapter, embedding composition, and commercial Human access transport | Separate loopback-only `apps/tenant-api`; closed `createTenantPilotHost` wires Human session/Agent workload resolver, trusted Network Context, CSRF bootstrap and fixed UI module graph; `createHumanAccessRouteHandler` composes truthful options, provider-bound OIDC initiation/callback, same-origin one-use SIWE challenge/verify, and CSRF-protected logout with Secure host-only cookies; transport and adversarial tests keep public authentication disabled | Approved IdP credentials, durable Credential/session/transaction stores, protected HTTPS deployment and independent review remain uncomposed; public/remote remains disabled |
| Agent MCP | Verified locally through exact owned Obligation/Evidence reads and the no-funds lifecycle | The fixed eleven-tool registry provides application/Offer, CAIP-10 proof/binding, exact owned Obligation, owned Evidence, Offer acceptance, sandbox execution and synthetic repayment; `createAgentPilotHost` composes fresh Host-owned authentication, trusted Network Context, exact handoff Subject binding and actual local stdio | Production credential/deployment, remote/public MCP, withdrawals and real funds remain unavailable |
| Risk operations | Private servicing queue implemented; full runtime verification and broader commercial operations remain partial | `WEB-008` composes the recent-MFA Tenant-risk read and reason-coded protective freeze; `OPS-001B/001C` persist bounded operational signals; WEB-010 plus `SERVICING-002A` expose exact durable borrower repayment/cure state; `SERVICING-002B` adds a separate recent-MFA, read-only, PII-free adverse Obligation queue for Risk/Operations and keeps restructure, repurchase and write-off non-executable behind dual control | Re-run queue PostgreSQL RLS and desktop/mobile Host tests; protected scheduling, acknowledgement/resolution permissions, approved SLO/cap/stop-loss thresholds, notification recipients, named incident/on-call ownership, unfreeze/limit dual control, production identities and deployment remain open |

## Architecture and Reliability Traceability

| Gate | Current state | Evidence | Gap / next gate |
| --- | --- | --- | --- |
| Tenant isolation | Verified local for implemented private operations | PostgreSQL RLS, exact-resource ownership, replay, restart and rollback tests | Repeat for every new operation and transport |
| Idempotency / atomicity | Verified local for implemented private operations | Command replay and one Event/Evidence/outbox/projection/Ledger/admission transaction pattern now include activation, acceptance, execution, repayment, servicing, Provider acknowledgement and signed Provider callback inbox processing | Repeat for future production Provider, Evidence export, and production operations |
| Ledger | Verified local no-funds | Balanced principal/interest/fee receivable, sandbox clearing, repayment allocation, trial balance, restart reconciliation and write-off postings | Production chart of accounts, custody/bank reconciliation, and finance sign-off remain open |
| Multi-chain portability | Local synthetic conformance and bounded live observation verified; signed runs pending faucet gas | Base Sepolia and X Layer profiles share one adapter; lifecycle receipts bind actual Obligation, repayment and Ledger references; canonical Payment is chain-neutral; fixed public RPC observers, immutable one-event emitter, ephemeral-key lifecycle, durable Tenant-RLS observation/outbox/reconciliation and incident runbook are implemented; a captured artifact proves correct-chain read-only access to both profiles | Complete one deploy/emission/retirement receipt and verified key destruction per test chain; production chain, HSM, contracts, providers, finality policy and capital remain separate approvals |
| Provider boundary | Verified local no-funds | Approved exact Provider-read, Provider-acknowledgement and restricted callback-inbox permissions; fixed loopback-only process, Ed25519 delivery/callback binding, AccessGrant scoping, bounded retry/circuit, durable RLS inbox, exact replay, before/after-commit recovery and reconciliation | Public/remote Provider, production credentials/KYP/SLA, operations ownership, custody, capital and funds require separate named approvals |
| Threat model | Verified locally for the Provider sandbox boundary | Public sandbox, permission-boundary, testnet, and signed Provider sandbox threat models exist with automated adversarial coverage | Independent review and deployment-specific assessment remain mandatory before external exposure |
| Test runtime | Verified target-runtime snapshot | Node 24.18.0 / pnpm 11.1.3 gate passes through `.node-version` and `.nvmrc`; full check 301/301, OPS module 13/13, fresh PostgreSQL 17 61/61 with exact-owner and non-owner/RLS coverage, security 21/21, Human/Agent transport 37/37, Provider 5/5, chain live/conformance/reorg 9/9 + 6/6 + 5/5, 46 schemas and 23 migration pairs all pass | Re-run the same target-runtime matrix after each approved implementation; globally changing an arbitrary developer shell is not required or claimed |

## No-Funds Design-Partner Critical Path

The shortest safe path is sequential because each stage consumes the previous
stage's exact durable output:

1. **Completed locally:** `CREDIT-001D` — deterministic Decision and Offer,
   including machine-enforced same-input Human/Agent economic parity.
2. **Completed locally:** `MANDATE-001A` — Human Principal activation of Agent
   authority without Agent self-escalation.
3. **Completed locally:** `TRANSPORT-001` — loopback authenticated Human API
   adapter and four-tool local stdio Agent MCP adapter; the draft application
   handoff now reaches one durable sandbox Offer through a named authenticated
   Agent Host while the active runtime handoff remains unable to start a new
   application.
4. **Completed locally:** `IDENTITY-001` — Human-created exact binding
   challenge, bound-Agent CAIP-10 proof, and atomic verified Subject activation.
5. **Completed locally:** `CREDIT-001E` — exact Offer acceptance and shared
   `obligation.v2`.
6. **Completed locally:** `CREDIT-001F` — non-redeemable sandbox execution,
   balanced accounting, interest/fee allocation, and repayment.
7. **Completed locally:** `SERVICING-001` — DPD, default, cure, restructure,
   repurchase, and write-off over the shared state truth.
8. **Completed locally:** `WEB-005` and `TRANSPORT-001H` provide Human UI and
   Agent SDK paths through acceptance -> shared Obligation -> execution/Ledger
   -> repayment, with schema-validated lifecycle receipts and dual-native
   economic parity; MCP permissions remain unchanged.
9. **Completed locally:** `CHAIN-001C` binds either lifecycle receipt to Base
   Sepolia and X Layer synthetic finality/reorg/replay conformance without a
   network, key, contract, deployment, or live-testnet claim.
10. **Completed locally:** `TRANSPORT-001I` makes that exact local path
    machine-readable and visible in Agent Runtime without adding a tool,
    endpoint, permission, credential, network call, or funds authority.
11. **Completed locally:** `EVIDENCE-001B` adds exact owner/controller
    self-service Evidence to the Human UI, Agent SDK and local MCP without
    payload, export, cross-Tenant or funds authority.
12. **Completed locally:** `TRANSPORT-002` expands the fixed local registry to
    ten tools with the three approved economic lifecycle commands over the same
    authenticated Gateway.
13. **In progress:** `CHAIN-001B` has completed read-only dual-chain access and
    all local emitter/key/indexer/durable-store controls; two signed runs wait
    only for official faucet gas.
14. **Completed locally:** `PROVIDER-001A` activates the three exact permissions
    for Provider intent read, Provider acknowledgement, and signed callback
    inbox processing through a separate fixed loopback process. Public/remote
    Provider transport and real value remain unapproved.
15. **Completed locally:** `WEB-008` exposes the existing aggregate Tenant-risk
    read and protective Agent Subject freeze as a formal private operational UI,
    while quarantining the historical DEMO Admin Dashboard.
16. **Completed locally:** `OPS-001B` defines the closed no-funds event-to-alert
    contract, deterministic replay-safe aggregation, seven manual incident/
    servicing runbooks, and fail-closed drift checks without notification,
    automatic action, release, or funds authority.
17. **Completed locally:** `OPS-001C` persists Tenant-RLS alert state, immutable
    occurrences and exact-release Human/Agent lifecycle results atomically with
    Event/Evidence/Outbox; it does not schedule, notify, acknowledge, or resolve.
18. **Completed locally:** `WEB-009` productizes the existing
    `risk_decision_passport.v1` in the Human Offer review and names the same
    receipt in Agent Runtime without adding a decision, authority, operation,
    endpoint, tool, credential or funds capability.
19. **Completed locally:** `WEB-010` productizes the existing shared servicing
    kernel as a Human Servicing Case and an Agent workflow discovery entry. It
    reuses repayment and owned Evidence, fails closed on Obligation/action
    drift, and adds no operation, permission, clock control or disposition.
20. **Completed locally:** `SERVICING-002A` adds one exact, owner-authorized
    `obligation.v2` read shared by Human HTTP and Agent SDK/MCP. The browser
    retains only the opaque ID, re-authorizes after reload and continues the
    no-funds repayment path from durable server truth; no list, search, PII,
    operator scope, funds or disposition authority was added.
21. **Implemented locally; release-gate retest pending:** `SERVICING-002B`
    adds a separate recent-MFA Risk/Operations query and Aave-inspired private
    work queue over adverse sandbox Obligations. It is bounded, PII-free,
    read-only, excluded from Agent MCP and carries no disposition or funds
    authority. Contract, unit, SQL-boundary, security and static UI gates pass;
    PostgreSQL RLS execution plus browser/loopback capture must be rerun when
    the execution environment supports PostgreSQL shared memory and local
    listeners.
22. Complete the remaining live dual-testnet receipts, configure and exercise
    named private-pilot operational ownership, then run the public beta
    readiness and closed design-partner pilot gates. Production Provider,
    capital, custody, legal and real-value gates stay independent.

No later step should be represented as complete because its UI has been drawn
or its in-process demo exists. Completion requires the durable kernel,
authorization, accounting, Evidence, reconciliation, and cross-entry tests.

## Real-Value Commercialization Gaps

These are not engineering defaults and remain named human decisions:

| Decision domain | Required outcome before real value |
| --- | --- |
| Product/legal role | Lender/originator/servicer responsibilities, agreements, jurisdictions, disclosures and complaint ownership |
| Capital and loss | Named capital source, facility terms, concentration, first-loss/loss allocation, stop-loss and wind-down |
| Credit/pricing | Approved real policy, limits, APR/fees, adverse-action process, fairness/model governance and override controls |
| Identity/compliance | Production KYC/KYB/KYP vendors, sanctions/AML, privacy basis, retention/deletion, data-subject process |
| Money/custody | Production rail, custody, reconciliation ownership, safeguarding, withdrawals, settlement and incident recovery |
| Servicing | Payment collection, delinquency/default notices, hardship, restructure, bureau/reporting, vendor and legal escalation |
| Chain/infrastructure | Production chain, contracts, keys/HSM, RPC/indexer, finality, monitoring, deployment, rollback and disaster recovery |
| Security/operations | Independent security assessment, pen test, secrets, SLOs, on-call, incident exercises, dual control and audit access |
| Go-to-market | Design partners, support model, pricing validation, analytics, feedback loop, launch owner and explicit go/no-go approval |

## Current Approval Queue

The owner approved and local implementation completed `IDENTITY-001`,
`CREDIT-001E/F`, `SERVICING-001`, `MANDATE-001A`, `TRANSPORT-001`,
`EVIDENCE-001B`, and `TRANSPORT-002`. `CHAIN-001B` is also approved: its local
control plane and two-chain read-only live proof are complete, while two
faucet-funded deploy/emission/retirement receipts remain operationally open.
`PROVIDER-001A` is approved and locally implemented: `pilotReadProviderIntent`,
`pilotAcknowledgeProviderIntent`, and restricted `workerProcessInbox` for
`provider_sandbox_callback.v1` are active only in the closed local boundary.
The next permission-expanding packages still require independent approval:

- public or remote Provider transport, production Provider identity/KYP,
  credentials, SLA, settlement account and operational ownership;
- production identity, collections, capital, custody, real funds, mainnet, and
  public/private production deployment packages.

Approvals are independent: approval of one package does not imply approval of
later funds, permissions, pricing, transport, chain, deployment, or production
changes.

## Evidence Index

- Product authority: `IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- Delivery sequence: `IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- Durable shared Intent: `CREDIT_001C_SHARED_CREDIT_INTENT_GATEWAY.md`
- Decision/Offer implementation authority: `CREDIT_001D_DETERMINISTIC_DECISION_OFFER.md`
- Mandate activation implementation authority: `MANDATE_001A_SANDBOX_ACTIVATION.md`
- Agent account proof/Subject activation implementation:
  `IDENTITY_001_DURABLE_AGENT_ACCOUNT_BINDING.md`
- Acceptance/Obligation implementation: `CREDIT_001E_OFFER_ACCEPTANCE_OBLIGATION.md`
- Execution/repayment implementation: `CREDIT_001F_SANDBOX_EXECUTION_REPAYMENT.md`
- Servicing implementation: `SERVICING_001_SHARED_SANDBOX_SERVICING.md`
- Transport implementation authority: `TRANSPORT_001_AUTHENTICATED_HTTP_MCP_ADAPTER.md`
- Human Workflow Receipt: `HUMAN_001D_HUMAN_CREDIT_OFFER_WORKFLOW_RECEIPT.md`
- Human local Host composition:
  `TRANSPORT_001F_AUTHENTICATED_HUMAN_PILOT_HOST.md`
- Agent local Host composition:
  `TRANSPORT_001G_AUTHENTICATED_AGENT_PILOT_HOST.md`
- Dual-native Offer economic parity:
  `CONFORMANCE_001_DUAL_NATIVE_OFFER_PARITY.md`
- Shared Obligation portability receipt:
  `CHAIN_001C_SHARED_OBLIGATION_PORTABILITY_RECEIPT.md`
- Agent pilot capability manifest and Runtime workflow map:
  `TRANSPORT_001I_AGENT_PILOT_CAPABILITY_MANIFEST.md`
- Provider sandbox implementation authority:
  `PROVIDER_001A_SIGNED_PROVIDER_SANDBOX_PROPOSAL.md`
- Provider sandbox accepted architecture:
  `../architecture/ADR-032-signed-provider-sandbox-boundary-proposal.md`
- Provider sandbox threat model:
  `../security/IPO_ONE_PROVIDER_SANDBOX_THREAT_MODEL_v0.1.md`
- Private Risk Operations implementation:
  `WEB_008_PRIVATE_RISK_OPERATIONS_CONTROL_PLANE.md`
- Private Risk Operations QA:
  `../codex/audits/WEB_008_PRIVATE_RISK_OPERATIONS_CONTROL_PLANE/audit.md`
- UI specification: `IPO_ONE_DUAL_NATIVE_UX_SPEC_v0.1.md`
- UI QA: repository root `design-qa.md` and `artifacts/ui/`
