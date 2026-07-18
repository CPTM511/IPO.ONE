# IPO.ONE Commercialization Roadmap v0.3 (Draft)

Version: v0.3 Draft
Date: 2026-07-17
Status: Non-canonical proposal for Founder/CTO/Product/Risk/Security/Legal review

This document reconciles the Product Charter v1.0, MVP Build Spec v0.1,
Architecture Review v0.2, and the implementation checkpoint after DATA-001 /
EVENT-001. It does not approve production funds, contracts, permissions,
compliance processing, deployment, or Human credit.

## 1. Executive Decision

The earlier public interactive MVP is retained as test and educational
infrastructure, not product truth. Wherever it conflicts with Product Charter
v1.1 or approved commercialization requirements, the newer requirements take
precedence. The canonical production-limited MVP is not yet launch-ready.

The next version should be:

> **V0.3 Pilot-Ready Control Plane: a secure, typed, durable integration and
> operations surface for Agent Developers and allowlisted Providers.**

Do not jump directly to broad lending, public liquidity, Human credit, token
governance, or a production contract. First turn the working Agent Lockbox
primitive into a product that a developer can integrate, a provider can test,
a risk operator can control, and an auditor can reconstruct.

## 2. Initial Commercial Product

### Primary ICP

Agent Developers and Operators whose Agents have observable revenue and need
purpose-limited working capital for API, model, data, compute, RPC, and workflow
providers.

### First Three Product Surfaces

1. **Developer Control Plane**: Agent/Principal registration, Mandate, spend
   policy, credit decision, obligation, Lockbox, repayment history, Evidence,
   API/SDK, and webhooks.
2. **Provider Integration**: allowlisting, quote/spend/settlement contract,
   signed webhook sandbox, provider exposure, and reconciliation status.
3. **Risk Operations**: tenant-scoped exposure, caps, alerts, freeze/pause,
   reason-coded decisions, audit, replay, and incident controls.

### What IPO.ONE Sells First

- Verifiable Agent obligation and repayment infrastructure.
- Purpose-limited provider spend and cashflow routing.
- Repayment/settlement Evidence and operational controls.
- Developer and provider integration, not an ungrounded universal score.

Early pricing should test a platform/API fee plus successful routing or provider
volume fee. It should not depend on high consumer APR, token issuance, or TVL.

## 3. Implementation Truth and Requirement Traceability

| Canonical requirement | Current evidence | Current truth | Required next issue |
| --- | --- | --- | --- |
| FR-001 Subject Registry | Agent/Human/Org/Originator enums; Agent and prototype Human creation; normalized Subject/Principal repository; local Tenant/RLS/AuthN/AuthZ foundations | The local durable Gateway composes Human-controlled Agent Subject creation, bounded Agent self-read, and Risk/Operations protective suspension; the public demo remains process-local and production identity provisioning is absent | DATA-003, HUMAN-001 |
| FR-002 Principal Binding | Principal is separate and required by Agent flows; local capability/object authorization binds Actor, Tenant, client, and resource | The local durable Gateway derives and reuses a Developer Principal and binds Human controller to Agent Subject; signed account ownership proof remains absent | AUTH-002 |
| FR-003 Multi-chain Account Binding | CAIP-2/10 validation; one-use durable Agent challenge/proof; cross-Subject and cross-chain replay rejection; hash-only verified binding and atomic Agent activation | Complete for the local sandbox; production wallet assurance, credential/key lifecycle, real-chain proof and provider policy remain open | AUTH-002, CHAIN-001B |
| FR-004 Agent Lockbox | Local Lockbox and balanced ledger repayment path; durable normalized Lockbox/Ledger projections | Repository and reconciliation foundation is complete; default sandbox is still process-local and no custody exists | DATA-003, CUSTODY-001 |
| FR-005 Spend Policy | Provider/category/amount checks, live Mandate recheck, durable policy/request/reservation projections, and atomic economic/resource admission | The authenticated Gateway foundation exists locally, but SpendPolicy and spend handlers, calibrated production caps, and production enforcement remain | DATA-003, CONTRACT-001 |
| FR-006 Obligation Registry | Shared Human/Agent `obligation.v2`, exact Offer acceptance, deterministic schedule, immutable snapshots, servicing/disposition state, drift detection and repair Evidence; `SERVICING-002A` adds exact owner current-state read and `SERVICING-002B` adds a separate read-only PII-free adverse-case queue | Complete for the private no-funds kernel and reload-safe Human/Agent exact read. Queue contract, authorization, SQL mapping, PostgreSQL RLS and private browser path are verified. Production contract form, capital/funding state and external servicing remain open | Legal/capital approval; production servicing package |
| FR-007 Repayment Router | Shared partial/full synthetic repayment, deterministic fee/interest/principal allocation, balanced Ledger, utilization release, Evidence and reconciliation; `WEB-010` renders the exact active/cured Servicing Case and `SERVICING-002A` restores it after reload from authenticated server truth | Complete for the private no-funds kernel and reload-safe Human case path; Agent Runtime exposes the same exact Obligation, repayment and owned-Evidence route. Real collection rails, custody/bank reconciliation and production permissions remain open | PROVIDER-001 production package; custody/collections approval |
| FR-008 Risk Engine v0 | Shared `risk_decision.v3` with server-derived point-in-time feature snapshot, finalized source Evidence lineage, exact risk-state attestation, checked-in policy hash, reason lineage, immutable Decision Passport and Human/Agent policy/economic parity | Complete for the local no-funds kernel under `RISK-002A`; `WEB-009` renders the same validated `risk_decision_passport.v1` as Human explanation plus copy-safe proof before acceptance and explicitly names it in Agent Runtime. Synthetic/private-pilot Evidence proves provenance, not production creditworthiness. The educational score remains non-authoritative | RISK-002B production policy registry, real evidence providers, legal/adverse-action, model validation and named risk approval |
| FR-009 Admin Console | Formal private `WEB-008` Risk Operations UI over the recent-MFA PII-free Tenant portfolio read and protective freeze; exact-command durable dual control; `OPS-001B/001C` alert/runbook contracts; WEB-010 + `SERVICING-002A` borrower-facing servicing; `SERVICING-002B` private Risk/Operations work queue; `PILOT-005/006` lifecycle and experience truth | The authenticated product hides legacy DEMO risk truth and renders authoritative aggregates. The exact Servicing Case survives reload. The queue is separately authorized, read-only, PII-free and non-authorizing. Risk can now verify lifecycle conversion and immutable categorical Human/Agent feedback through recent-MFA aggregate-only reads; PostgreSQL and private browser paths pass. Protected scheduling, acknowledgement/resolution permissions, numeric SLO/cap/stop-loss monitoring, unfreeze/limit dual control, named recipients/owners, production identities/roles and deployment remain | OPS-001D and named operational ownership |
| FR-010 Human Prototype | Prototype Human Subject and reserved DPD/restructure states | Consent, KYC/VC reference contract, Originator, and loan-tape simulator are not implemented | HUMAN-001 |
| FR-011 Event Indexer | Rail event replay, multi-event PostgreSQL runtime, materialized core projections and reconciliation; provider-neutral synthetic chain indexer plus bounded live-testnet observer, durable Tenant-RLS store, outbox and replay reconciliation | CHAIN-001A/001C local portability and CHAIN-001B dual-chain read-only live access are verified; immutable one-event emitter and ephemeral-key controls are implemented; two signed deploy/emission/retirement receipts await faucet-only gas; no production finality or mainnet approval exists | Complete CHAIN-001B signed receipts; INDEXER-001 production design |
| FR-012 Provider Sandbox | Approved exact Provider-read, Provider-acknowledgement and restricted callback-inbox permissions; fixed loopback process; Ed25519 delivery/callback binding; durable RLS delivery/ack/inbox projections; replay, crash, retry, circuit and reconciliation tests | Complete for a separate-process local no-funds conformance boundary. Public/remote Provider, production credentials/KYP/SLA, settlement accounts, custody and funds remain disabled | Production Provider package requires separate named approval |
| OpenAPI and SDK | OpenAPI 3.1.2 for all 21 retained public test routes; stable Problem Details/request IDs; closed 38-operation private Tenant contracts; one-command PostgreSQL private composition for role-separated Human Borrower, Principal Controller and Risk/Operations workspaces; exact eleven-tool local Agent MCP registry with durable Subject-to-Actor binding, exact owned Obligation/Evidence reads and the bounded lifecycle; the servicing queue, workspace recovery, Pilot Health, Pilot Feedback aggregate and three Provider operations remain excluded from MCP; Agent lifecycle/portability receipts, typed privacy-safe Agent feedback client and responsive Runtime map; strict `private_pilot_tenant_profile.v1` provisioning binds opaque design-partner Tenant/Actor identifiers, RLS resources and unlinkable per-Tenant Agent accounts without configurable permissions | Complete and operable for local no-funds Human/Agent/Provider evaluation. A clean-database browser run reaches Offer, shared Obligation, signed sandbox execution, full repayment and reload-safe state. Human and Principal loopback workspaces recover active owned resources from authenticated PostgreSQL truth after browser storage loss; Human borrowers can select multiple exact positions and start another application without losing the current one. Human and Agent pilots can submit immutable closed categorical feedback, while Risk/Operations can measure aggregate entry, lifecycle conversion, positions, full repayment and feedback without identifiers, free text, PII or trackers. Repeatable synthetic-only Tenant provisioning is locally available; remote/public private transport, production identity, withdrawals and real funds remain disabled | Production transport/identity approval; complete CHAIN-001B receipts |
| Transactional event runtime | Batch command/event/Evidence/outbox plus normalized core and approval projections, immutable snapshots, approval/execution linkage, reconciliation and approval-gated repair crash-tested on PostgreSQL | The local Gateway composes Agent Subject create/freeze and draft Mandate create/revoke writes plus integrity-checked reads over this runtime; the remaining Lockbox lifecycle and default public API remain process-local | DATA-003 |
| Public sandbox hosting | Fail-closed runtime, immutable image, load-balancer-only Cloud Run, managed TLS, Cloud Armor, monitoring, and GoDaddy root-A cutover | Public no-funds sandbox is live at `https://ipo.one`; protected-environment evidence, alert recipients, incident ownership, and independent review remain | OPS-001A, OPS-002 |
| Release governance | Versioned public/closed/real-value profiles, canonical evidence contract, exact release identity, approval age/expiry, complete gate set, protected-environment reference | Public sandbox evidence is executable; closed private and real-value profiles are policy-locked pending gateway composition, production quota/edge selection, and named approvals | OPS-002, DATA-003 |

This matrix is the implementation source of truth. “Public MVP complete” means
the interactive demonstration is complete; it must not be used as evidence
that the canonical Launch Checklist has passed.

### V0.3 Implementation Checkpoint (updated 2026-07-14)

`API-001` is complete for the local sandbox surface. The repository verifies all
21 OpenAPI operations, stable Problem Details and request correlation, SDK
route parity, live adversarial HTTP behavior, and real PostgreSQL recovery. The
live SDK/API smoke completes settlement and full repayment without real funds.

`SECURITY-001` SEC-D01 through SEC-D09 are approved for local non-funds
implementation. `TENANT-001`, `AUTHN-001`, and `AUTHZ-001` now provide forced
RLS, provider-neutral Human/workload identity, and deny-by-default
capability/object authorization locally. They are not exposed by the public
sandbox. Human IdP selection, production credentials/roles, private data,
deployment activation, and real value remain separate gates.

`ABUSE-001` now adds a closed `abuse_001.v1` policy over every authenticated
operation, exact SEC-D08 defaults, trusted Actor/client/Tenant/network/account
derivation, resource-blind denial, atomic in-memory and PostgreSQL stores,
restart leases, persistent-resource rollback/retention, idempotent replay
disposition, forced RLS, bounded coarse retry metadata, and low-cardinality
telemetry. It is a local boundary only and is not exposed by `ipo.one`.

`DATA-003` now provides a separate local PostgreSQL-backed Tenant Command
Gateway with one serializable authority and commit boundary. Human, Operator,
and Agent clients share a closed protocol for Human-controlled Agent Subject creation,
Human-only unsigned draft Mandate creation, integrity-checked owner read,
terminal reason-coded draft revocation, bounded Agent self-read, and a
strong-MFA Risk/Operations protective Subject freeze. Exact
replay after authorization-resource closure, row-locked authorization facts,
Event/Evidence/outbox/projection/audit atomicity, nonce/revocation serialization,
domain-anchored Agent Subject/Mandate caps, freeze replay, and concurrent
single-transition enforcement are PostgreSQL-tested. This is not
a public route, signed authority, or
production deployment; the Lockbox lifecycle, unfreeze/limit, and remaining
operational handlers remain.

`API-002` now freezes that local seven-operation application protocol as closed
JSON Schema 2020-12 requests, results, and a machine-readable catalog, with
transport-neutral fixtures and TypeScript discriminated unions. Runtime
requests fail before authentication/admission/object work, handler results fail
before commit, and the request schema version is bound to command identity.
Catalog/handler/AuthZ/ABUSE policy drift and accidental public-server exposure
are CI failures. Only local in-process non-funds use is enabled; production
identity and authenticated HTTP/MCP/A2A transports remain separate gates.

### V0.3 Dual-Native Credit and Evidence Checkpoint (updated 2026-07-16)

The later `IDENTITY-001`, `CREDIT-001E/F`, `SERVICING-001`, and
`EVIDENCE-001A` work supersedes the earlier seven-operation checkpoint above.
The local/private Tenant protocol now contains 35 closed non-funds operations
over one Human/Agent kernel. It includes CAIP-10 Agent account proof and active
binding, deterministic Offer acceptance and one shared Obligation, signed
non-redeemable sandbox execution, balanced Ledger posting, repayment, trusted
UTC DPD/default/cure derivation, and dual-controlled restructure, repurchase,
and write-off simulations. All commit Event, Evidence, outbox, projections,
authorization state, admission state, and replay identity through the same
PostgreSQL transaction and remain reconciliable after restart.

`pilotReadEvidence` now makes immutable Obligation Evidence operable through
the existing recent-MFA Auditor permission. Offer acceptance atomically
registers the Evidence timeline authorization resource, and the response is
bounded, cursor-paginated, and excludes payloads, references, actor data,
idempotency and correlation identifiers, raw KYC/PII, and credentials.
`EVIDENCE-001B` now reuses that query for exact Human/Agent owner or Human
controller access through the Obligation UI, typed SDK, and local MCP tool.
Auditor authority remains separate; export, PII, cross-Tenant and funds
authority remain denied.

`WEB-004` now composes that exact Auditor query into the authenticated Human
Host as a formal Obligation Evidence workspace. It supports bounded ID input,
page size, opaque server cursor pagination, aggregate/version/finality/time
inspection, and Evidence-hash copy. The public sandbox hides the workspace
without a valid private CSRF bootstrap, while denied and unavailable resources
share one non-enumerating UI state. The later EVIDENCE-001B panel reuses the
same presentation contract for owner/controller self-service.

`TRANSPORT-001H` now productizes the approved Agent economic path as one local
SDK workflow over the authenticated Tenant protocol. An active Agent handoff
with the exact Offer-acceptance, sandbox-execution, and repayment Mandate
capabilities can accept an Offer into the shared `obligation.v2`, execute it
through the signed non-redeemable sandbox rail, post a synthetic repayment,
and receive one immutable versioned receipt containing the final Obligation,
Ledger transaction reference, execution receipt, and repayment. The separately
approved `TRANSPORT-002` increment now publishes those same three operations
through the authenticated local stdio Host; it adds no remote endpoint,
credential input, withdrawal, production execution, or funds authority.

`WEB-005` now closes the matching Human borrower path in the authenticated
loopback workbench. A Human can create/load Subject and scoped Consent, request
and review a deterministic Offer, acknowledge exact terms, create the same
shared `obligation.v2`, execute through the signed non-withdrawable sandbox
rail, and post sequenced synthetic repayments. The UI exposes schedule,
outstanding, repayment allocation, servicing and DPD state in a responsive
cross-column Obligation panel and copies one closed lifecycle receipt. A
dual-native parity gate removes entry-specific identity and transport evidence
and proves matching Obligation, execution, Ledger-facing, repayment, and
servicing economics. This is a fully operable no-real-funds Human pilot, not a
production Human loan or public Tenant endpoint.

`WEB-009` now replaces the remaining demo-style Human decision summary with a
formal Decision Passport product surface. Before Offer acceptance, the Human
sees six ordered plain-language reasons, canonical reason codes, policy and
feature-set versions, trusted evaluation time, five finalized Evidence sources,
aggregate versions and copy-safe proof hashes. Native proof inspection copies
the exact bounded `risk_decision_passport.v1` already validated by the workflow
receipt, while Agent Runtime names that same receipt from the existing
evaluation workflow. Malformed provenance or unsafe authority flags fail closed
and keep acceptance disabled. This does not add a policy, data source, score,
operation, tool, permission, production authority or funds capability.

`WEB-010` now replaces the authenticated Payments summary with a formal
dual-native Servicing Case workspace. Human mode validates one exact
`obligation.v2`, renders trusted-time stage, DPD, past-due principal/interest/
fees, schedule and cure conditions, posts only through the existing sequenced
`pilotPostSandboxRepayment`, then trusts only the exact returned Obligation and
servicing action before claiming cure. Owner Evidence navigation returns the
same immutable timeline. Agent mode identifies the existing repayment and
owned-Evidence workflow without relabelling the Human session case. Borrower
clock control and privileged restructure/repurchase/write-off remain absent.

`PILOT-003/004` now make that Human product continuous across browser sessions
and multiple positions. One bounded Actor-bound recovery query returns only
active opaque resource references; the Human Payments workspace renders those
Obligations as a stable `My positions` selector and hydrates a selection through
the existing exact owner read. An accepted Offer exposes a fresh-application
action without discarding the selected position or reusing prior workflow
state. A real PostgreSQL/browser run created two distinct Obligations, switched
their exact `$120` and `$80` servicing views, then restored both after all
browser storage was cleared. No list/search endpoint, batch economics, new
permission, remote transport, public exposure, or funds authority was added.

`PILOT-005/006` close the first private design-partner learning loop without
introducing surveillance or underwriting drift. Recent-MFA Risk/Operations
reads aggregate durable lifecycle facts and immutable Human/Agent categorical
feedback. Submission is exact-Subject, idempotent, Tenant-RLS isolated and
Event/Evidence linked; there is no comment field, identifier-bearing result,
third-party analytics, scoring input, public endpoint, or funds effect. The
private browser path verifies 3 applications across both entry modes and one
completed Human feedback signal, and sequentializes same-portfolio aggregate
reads to preserve the Gateway's transactional audit semantics.

`WEB-008` now closes the first formal private Risk Operations UI slice. The
authenticated Host queries one exact `risk_portfolio` through the existing
recent-MFA `pilotReadTenantRisk` operation and renders bounded PII-free
Subject, CreditLine, Obligation, and per-asset aggregates. Risk/Operations can
submit the existing protective-only `pilotFreezeSubject` command only with an
exact Subject, approved reason code, and explicit acknowledgement. Denied and
unavailable resources share one non-enumerating state, while the historical
DEMO reset, Admin Dashboard, plugin/rail fixtures, and object inspector are
hidden from private product truth. No new permission, unfreeze, limit increase,
funds, public route, remote transport, or hosted deployment is implied.

`CHAIN-001C` now binds either closed Human or Agent lifecycle receipt to the
same Base Sepolia and X Layer Testnet CHAIN-001A adapter suite. The resulting
`sandbox_obligation_portability_receipt.v1` preserves the actual Obligation,
repayment, principal Ledger and repayment Ledger references, requires one
chain-neutral canonical Payment/kernel hash, and retains profile-specific
synthetic Finality Proof and Evidence hashes. Reorg, replacement, replay,
failover and cap checks run locally; no RPC, network, credential, key, signer,
contract, deployment, live testnet transaction or production funds are used.
It closes local portability traceability, not CHAIN-001B.

`CHAIN-001B` is now separately approved. Fixed public endpoints on both chains
have passed correct-chain read-only observation, and the immutable one-event
emitter, ephemeral key lifecycle, zero-value/gas/count/balance caps, durable
Tenant-RLS observation store, outbox, reconciliation, emergency retirement and
incident runbook are implemented. The two live emitter receipts remain open
until official faucet gas is available; no production or real-value authority
is implied.

`TRANSPORT-001I` now makes the approved Agent pilot path discoverable without
expanding it. One closed `agent_pilot_capability_manifest.v1` derives exact
Offer, sandbox Obligation/repayment, and local portability readiness from the
validated waiting, draft, or active Handoff. Its original six-tool registry is
historical; EVIDENCE-001B and TRANSPORT-002 pinned registry v2 with ten tools,
and `SERVICING-002A` adds the exact owned Obligation read as the eleventh tool,
alongside owned Evidence and the three bounded economic lifecycle tools. These
drive the responsive Agent Runtime workflow map and complete SDK example.
The packet is immutable metadata with no credential, endpoint, live-chain
execution, withdrawal, production funds, or funds authority. CHAIN-001B is
separately governed by its approved testnet runbook.

`IDENTITY-002` removes the final circular prerequisite in the private Agent
product. The Principal now downloads a closed five-minute EIP-712 challenge;
the local test-only Agent bootstrap signer verifies account, chain, shape,
expiry, and typed-data hash before submitting proof through the bound Agent
client. It never prints or transports a private key or signature. Draft and
active Agent handoff manifests are downloaded separately from the descriptive
capability packet, and pnpm argument-separator handling is verified. A clean
PostgreSQL/browser/MCP run completed active CAIP-10 binding, draft application
authority, deterministic 9,000-minor-unit Offer, Principal activation, exact
acceptance, shared Obligation, signed non-withdrawable execution, full synthetic
repayment, current servicing state, and eleven finalized owned Evidence items.
This is local/test-chain and no-real-funds only.

This checkpoint does not authorize a public/private production Tenant
endpoint, a servicing scheduler, real
collections, production KYC, external Provider execution, capital, custody,
mainnet assets, withdrawals, or real funds. Those remain commercialization and
named human-approval gates rather than implementation assumptions.

### V0.3 Hosting Checkpoint (updated 2026-07-13)

`OPS-001A` is complete for the approved public no-real-funds sandbox. The exact
green release is deployed in dedicated GCP project
`ipo-one-public-sandbox-cptm511`, region `asia-southeast1`, behind a global
HTTPS load balancer, active Google-managed certificate, minimum TLS 1.2, and
Cloud Armor. Cloud Run is load-balancer-only, its default URL is disabled, and
the zero-role runtime uses a digest-pinned non-root image. GoDaddy remains
authoritative and only the root A value changed; unrelated DNS and mail records
were preserved. Multi-region readiness monitoring and core service alerts are
enabled, and both SDK and responsive Human UI lifecycle checks passed.

The hosted surface remains an anonymous, process-local, synthetic-data sandbox.
It does not add AuthN, a durable customer command path, private data, external
Provider execution, KYC/KYP, real credit, custody, or funds. The protected
environment approval reference, named notification recipients, incident and
takedown owners, formal retention review, and independent security review
remain launch-governance gates. See
`docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`.

### V0.3 Data and Reconciliation Checkpoint (2026-07-12)

`DATA-002` and the local `RECON-001` foundation are complete at the repository
layer. One serializable unit of work can now commit an ordered multi-aggregate
event set, Evidence, compatibility events, outbox messages, idempotent response,
normalized core projections, immutable projection snapshots, and projection
registry hashes. Principal, Subject, account binding, Mandate reservation and
release, Provider, SpendPolicy/Request, Lockbox, Ledger, Obligation/Repayment,
CreditLine, RiskDecision, and AdminAction projections are restart-readable.

Reconciliation checks event companions, stream heads, command links and
response hashes, projection/snapshot/registry equality, Ledger integrity,
Lockbox balance, Mandate utilization, Obligation arithmetic, repayment totals,
and Agent credit exposure. Discrepancies emit Evidence; repair is dry-run by
default and requires an explicit actor, reason, and idempotency key before a new
repair event/snapshot can be appended. Real PostgreSQL tests prove rollback
after projection writes, restart replay, concurrent writer exclusion, drift
detection, and idempotent repair.

This does not make the public API durable or pilot-authorized. `DATA-003` now
composes only Agent Subject creation, unsigned draft Mandate create/read/revoke,
Agent self-read, and protective Subject freeze behind a separate local
authenticated Gateway; the remaining Lockbox lifecycle is not composed. No
production database, customer data,
scheduled repair, backup/DR, or real-value path is enabled.

### V0.3 Approval Control Checkpoint (2026-07-14)

`APPROVAL-001` is implemented and verified as a local non-funds boundary.
Authorization creates a server-branded exact-command preparation; durable
proposals accept exactly one Risk and one Operations approval, reject the
proposer/command Actor, record Credential/Membership/MFA evidence, and reload
and revalidate both approvers before authorization and mutation. A
serializable command commits one business outcome together with execution,
proposal transition, Events, Evidence, outbox, snapshots, and registry hashes.
Stable idempotency produces one response across distinct current short-lived
authorization decisions for the same command.

The separate break-glass state machine is disabled by default, limited to five
fixed protective actions, requires two configured hardware-key custodians,
binds exact resources, expires without refresh, and requires review within 24
hours. PostgreSQL migration 0006 applies forced RLS and immutable/guarded
records to all six approval/break-glass projections; reconciliation verifies
their linkage. Real PostgreSQL tests cover restart, concurrency, RLS,
append-only enforcement, declaration through review, and clean reconciliation.

This checkpoint does not name or activate production operators or custodians,
deliver notifications, expose Tenant routes, approve a Human IdP, enable
private data, or grant cloud, Provider, KYC/KYP, custody, or fund authority.

### V0.3 Resource Admission Checkpoint (2026-07-14)

`ABUSE-001` is implemented and verified for the approved local non-funds
boundary. All 38 current authenticated Tenant operations are classified once.
The policy preserves 30/minute discovery, 600/3,000 reads, 120/600 mutations,
30/minute economic and privileged paths, 10 attempts/10 minutes credentials,
and 6/minute batch defaults, with explicit client, network, operation, service,
concurrency, byte, count, queue, time, retry, and cost ceilings.

Admission accepts no resource ID and occurs before object resolution. Tenant,
Actor, and client derive only from Authentication Context; network/account
references must be server-created and pre-hashed. Stable Problem Details expose
only `manual`, `short`, or `long`. Multi-instance PostgreSQL tests prove atomic
concurrency, restart-retained rates, idempotent economic replay, resource
rollback, migration reversal, and forced-RLS coverage.

This checkpoint does not select a production distributed/global store, tune
edge limits, cancel arbitrary work, or wire Tenant routes. `DATA-003` now
composes admission, authorization, completed response replay, business mutation,
and retained resource accounting for Agent Subject and draft Mandate
create/read/revoke; all remaining operations and production deployment require
separate review.

### V0.3 Launch Governance Checkpoint (2026-07-12)

`OPS-002` adds a versioned launch policy and strict canonical evidence
contract. Verification rejects duplicate-key ambiguity, placeholders, stale or
expired approval, wrong owner, missing/extra/duplicate gate, mutable image,
wrong release SHA, unsafe evidence URL, capability escalation, and any attempt
to use a policy-locked profile. A protected-environment approval reference is
mandatory, and the committed pending template is continuously proven invalid.

This is a necessary governance control, not an approval system. It performs no
cloud, DNS, identity, private-data, Provider, KYC/KYP, or fund operation. The
closed non-funds and controlled Agent credit profiles can be unlocked only by
reviewed policy changes after their implementation and human gates are proven.

## 4. Staged Delivery Plan

### V0.3: Pilot-Ready Control Plane

Goal: make one Agent/provider workflow safely integrable and operational in a
non-funds sandbox.

1. `API-001` (complete locally): OpenAPI, stable errors/request IDs, typed SDK,
   contract tests.
2. `API-002` (complete locally): closed durable Tenant request/result/catalog
   schemas, TypeScript unions, conformance fixtures, runtime enforcement, and
   compatibility/drift policy for seven reviewed non-funds operations; no
   authenticated network endpoint.
3. `SECURITY-001` (approved for local non-funds implementation): `TENANT-001`,
   `AUTHN-001`, `AUTHZ-001`, `APPROVAL-001`, and `ABUSE-001` are complete locally.
4. `DATA-003` (foundation, DATA-003A, DATA-003B, DATA-003C, and DATA-003D complete locally;
   remaining composition in progress): the shared Human/Operator/Agent
   transaction boundary now covers Agent Subject creation, unsigned draft
   Mandate create/read/revoke, Agent self-read, and one-way protective Subject
   freeze plus a recent-MFA, aggregate Risk/Auditor Tenant portfolio read while
   preserving the anonymous public sandbox boundary. `WEB-008` composes those
   two risk operations into the private UI and isolates all DEMO risk state.
   `SERVICING-002B` adds the first separately authorized read-only PII-free
   adverse-case queue; its PostgreSQL/browser runtime gate remains pending the
   execution environment. Entity drill-down, executable servicing actions,
   alert acknowledgement/resolution, exports, cap/stop-loss monitoring,
   incident ownership, and production operations remain separate work.
5. `DATA-002` (complete locally): durable Subject, Principal, Mandate, SpendPolicy, Obligation,
   Lockbox, Ledger, RiskDecision, and Admin repositories using the event/outbox
   transaction model.
6. `RECON-001` (complete locally): materialized projections, ledger/event/state reconciliation,
   replay jobs, discrepancy Evidence, operator runbook.
7. `AUTH-002`: signed Mandate activation/account challenge, nonce persistence,
   expiry, active-Mandate suspension/revocation, key rotation, replay tests.
8. `PROVIDER-001A` (complete locally): out-of-process fixed-loopback Provider
   sandbox, signed delivery/callback, exact Provider AccessGrant, durable inbox
   dedupe, bounded retries, circuit breaker, restart/crash recovery,
   conformance fixtures, and reconciliation. This is not a public webhook,
   production Provider, or funds path.
9. `RISK-002A` (complete locally): `risk_decision.v3` freezes one versioned
   evidence-derived feature snapshot, finalized source Event/Evidence lineage,
   Tenant-bound risk-state query hash, exact checked-in policy hash, and
   reason-coded Decision Passport in the existing immutable transaction path.
   Human/Agent parity checks the same policy and feature-set identity. Continue
   as `RISK-002B` only after named review of production policy, evidence
   providers, risk limits/pricing, adverse-action/legal handling, model
   validation, override governance, identity/KYC and deployment. The demo score
   remains educational only. `WEB-009` completes the corresponding commercial
   presentation slice by rendering that exact passport in Human Offer review
   and identifying the same receipt for Agent integrations, with fail-closed
   acceptance and no authority expansion.
   `WEB-010` completes the borrower-facing Servicing Case presentation over the
   same approved kernel and names the existing Agent repayment/Evidence path.
   `SERVICING-002A` completes exact-owner durable reload hydration for Human and
   Agent without list, search, PII or funds authority. `SERVICING-002B`
   implements a separate recent-MFA Risk/Operations read-only queue over the
   same projection; it adds no disposition or Agent authority and requires a
   listener-capable PostgreSQL/browser environment for the remaining runtime
   retest.
10. `HUMAN-001`: non-production Consent/KYC-reference/Originator/loan-tape
   simulator with an enforced no-funds boundary.
11. `OPS-001C` (local persistence/check foundation complete): seven
   authoritative event-presence signals map into closed, PII-free alert state
   with immutable source occurrences, exact replay, Tenant RLS and
   Event/Evidence/Outbox linkage. The callable exact-release dual-native check
   requires Human and Agent Offer/Obligation parity plus clean reconciliation.
   Extend this with separately approved named recipients/owners, protected
   scheduling, acknowledgement/resolution operations, SLO reporting,
   incident/replay/key-rotation ownership, exercises, notification delivery,
   and protected release evidence before a closed pilot is operational.

Exit gate:

- Every API is versioned, validated, tenant-scoped, authorized, rate-limited,
  and observable.
- Every value/risk state change is durable, event-linked, and reconcilable.
- Provider sandbox retries and webhook replays cannot duplicate economic state.
- No P0/P1 security finding; no raw PII; no real funds.
- Ten to twenty internal Agent/provider sandbox flows complete without
  unexplained state or ledger divergence.

### V0.4: Testnet Enforcement

Requires explicit human approval of contracts, permissions, and fund paths.

- Minimal Subject/AccountBinding/SpendPolicy/Obligation/Lockbox enforcement.
- One testnet adapter, one test asset, hard global/provider/subject/chain caps.
- Indexer finality/reorg handling and full contract/database reconciliation.
- Foundry unit/fuzz/invariant tests, static analysis, independent review.

Exit gate: no arbitrary withdrawal, no unapproved recipient, no negative
outstanding, and no unreconciled contract/database event.

### V1: Controlled Agent Credit Network Pilot

Requires signed provider, capital, risk, security, legal, and incident plans.

- One production chain, one asset, founder/grant/strategic pilot capital only.
- Ten to twenty internal Agents before any 50-100 Agent expansion.
- Deterministic policy is decision authority; learned model remains shadow.
- Hard per-Agent, provider, chain, tenant, and global exposure caps.
- Commercial SDK, provider dashboard, usage metering, billing, support, SLA,
  signed terms, and data-processing inventory.

Scale only if Product Charter metrics hold: capture ratio above 90%, automated
repayment above 95%, allowlisted spend at 100%, gross loss below 3%, and repeat
use above 40%. These are pilot hypotheses, not guarantees.

### V2 and Beyond

Human production credit begins only through one licensed Originator, one
jurisdiction, one asset, first-loss, daily loan tape, stop-loss, dispute,
repurchase, write-off, and external legal/compliance/security review. Credit
Passport, multi-attester verification, capital routing, and institutional pools
follow real repayment/default Evidence; they do not precede it.

## 5. Commercial Launch Gates

| Gate | Evidence required | Approval owner |
| --- | --- | --- |
| Product | Signed ICP, provider use case, no-go boundaries, pricing experiment | Founder/Product |
| API/SDK | Versioned contract, compatibility policy, examples, conformance and E2E | Engineering/DevRel |
| Data | Durable state, migrations, backup/restore drill, replay and reconciliation proof | Backend/DevOps |
| Security | Threat model, AuthN/RBAC/tenant tests, dependency scan, secrets/PII review | Security/CTO |
| Risk | Caps, stop conditions, evidence features, adverse outcomes, loss owner | Risk/Founder |
| Provider | Signed integration, webhook security, SLA, reconciliation, incident contacts | Partnerships/Ops |
| Funds | Custody/legal structure, chain/asset/capital source, multisig/pause, audit | Founder/Legal/Security |
| Operations | Metrics, alerts, on-call, incident/rollback/key rotation, support workflow | Ops/CTO |
| Commercial | Terms, privacy, DPA, billing/tax/accounting, customer support | Legal/Finance/Product |

## 6. Founder Decisions Required Before V0.4 or V1

1. First 10-20 Agent operators and their measurable revenue source.
2. First three candidate API/compute/model/data providers.
3. First production chain and stable asset; architecture remains multi-chain.
4. Capital source, total pilot cap, per-Agent cap, and explicit loss bearer.
5. Wallet/auth approach: external wallet, embedded wallet, organization SSO, or
   a bounded combination.
6. Legal operator, pilot jurisdiction, provider terms, privacy/data roles, and
   whether any activity constitutes regulated credit or custody.
7. Pricing experiment and which party pays: developer, provider, capital
   source, or a combination.

## 7. Architecture Rules That Prevent Commercial Technical Debt

- Protocol objects and Evidence schemas remain vendor-neutral and versioned.
- x402, bank, card, stablecoin, on/off-ramp, KYC, and KYP are adapters, not
  canonical identity or obligation models.
- No production API without object-level authorization, tenant isolation,
  bounded resource use, inventory, and audit.
- No model or score can bypass hard policy, caps, compliance, or loss ownership.
- No positive feature without signed/verified Evidence and point-in-time
  lineage.
- No state mutation without one transaction containing idempotency, event,
  Evidence, outbox, and version checks.
- No value path without double-entry accounting and independent reconciliation.
- No production Human flow without licensed Originator and external review.
- No token or permissionless capital before PMF, loss data, and operational
  security.

## 8. External Standards Calibration

- OpenAPI currently publishes 3.2.0 and 3.1.2. API-001 deliberately uses 3.1.2
  for broad tooling compatibility while retaining JSON Schema 2020-12.
- RFC 9457 is the standards-track Problem Details format used for stable API
  errors.
- CAIP-2 and CAIP-10 remain final chain/account identifier standards.
- Coinbase x402 currently documents HTTP-native human/Agent payments,
  CAIP-2 identifiers, multi-network support, SDKs, facilitator settlement, and
  extensions. IPO.ONE should integrate it as a replaceable Rail/Provider
  adapter and add credit, Mandate, Obligation, and repayment Evidence above it.
- OWASP API Security Top 10 2023 explicitly covers object/function-level
  authorization, authentication, resource consumption, sensitive business
  flows, inventory, and unsafe upstream API consumption. These controls are
  V0.3 launch gates, not documentation-only concerns.

Primary references:

- https://spec.openapis.org/oas/
- https://www.rfc-editor.org/rfc/rfc9457.html
- https://standards.chainagnostic.org/CAIPs/caip-2
- https://standards.chainagnostic.org/CAIPs/caip-10
- https://docs.cdp.coinbase.com/x402/welcome
- https://owasp.org/API-Security/editions/2023/en/0x03-introduction/
