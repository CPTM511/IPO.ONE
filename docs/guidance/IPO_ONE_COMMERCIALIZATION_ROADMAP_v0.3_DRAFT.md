# IPO.ONE Commercialization Roadmap v0.3 (Draft)

Version: v0.3 Draft
Date: 2026-07-14
Status: Non-canonical proposal for Founder/CTO/Product/Risk/Security/Legal review

This document reconciles the Product Charter v1.0, MVP Build Spec v0.1,
Architecture Review v0.2, and the implementation checkpoint after DATA-001 /
EVENT-001. It does not approve production funds, contracts, permissions,
compliance processing, deployment, or Human credit.

## 1. Executive Decision

The public interactive MVP is complete as a product demonstration. The
canonical production-limited MVP is not yet launch-ready.

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
| FR-001 Subject Registry | Agent/Human/Org/Originator enums; Agent and prototype Human creation; normalized Subject/Principal repository; local Tenant/RLS/AuthN/AuthZ foundations | The local durable Gateway composes Human-controlled Agent Subject creation and bounded Agent self-read; the public demo remains process-local and production identity provisioning is absent | DATA-003, HUMAN-001 |
| FR-002 Principal Binding | Principal is separate and required by Agent flows; local capability/object authorization binds Actor, Tenant, client, and resource | The local durable Gateway derives and reuses a Developer Principal and binds Human controller to Agent Subject; signed account ownership proof remains absent | AUTH-002 |
| FR-003 Multi-chain Account Binding | CAIP-2/10 validation and bindings | Identifier-ready; signatures, nonce persistence, and cross-chain replay rejection are not production-grade | AUTH-002, CHAIN-001 |
| FR-004 Agent Lockbox | Local Lockbox and balanced ledger repayment path; durable normalized Lockbox/Ledger projections | Repository and reconciliation foundation is complete; default sandbox is still process-local and no custody exists | DATA-003, CUSTODY-001 |
| FR-005 Spend Policy | Provider/category/amount checks, live Mandate recheck, durable policy/request/reservation projections, and atomic economic/resource admission | The authenticated Gateway foundation exists locally, but SpendPolicy and spend handlers, calibrated production caps, and production enforcement remain | DATA-003, CONTRACT-001 |
| FR-006 Obligation Registry | Obligation lifecycle, required references, immutable snapshots, drift detection and repair Evidence | Durable repository foundation is complete; canonical authorization/funding state machine still needs ADR and command-gateway composition | ARCH-002, DATA-003 |
| FR-007 Repayment Router | Partial/full repayment, utilization release, Evidence; durable Ledger/Obligation/Repayment repositories and reconciliation | Persistence controls are proven in isolation; the public API still uses the process-local demo orchestrator | DATA-003, AUTH-002 |
| FR-008 Risk Engine v0 | Deterministic reason-coded local decision | Demo inputs are partly synthetic; point-in-time evidence features and policy registry remain | RISK-002 |
| FR-009 Admin Console | Exposure/freeze path, local Human/workload AuthN, deny-by-default Tenant/object AuthZ, exact-command durable dual control, protective-only break glass, and privileged admission limits | The local Gateway composes Agent Subject creation, draft Mandate create/read/revoke, and Agent self-read; administrative handlers, production identity/quota providers and roles, and named break-glass activation remain | DATA-003, OPS-001 |
| FR-010 Human Prototype | Prototype Human Subject and reserved DPD/restructure states | Consent, KYC/VC reference contract, Originator, and loan-tape simulator are not implemented | HUMAN-001 |
| FR-011 Event Indexer | Rail event replay, multi-event PostgreSQL runtime, materialized core projections and deterministic reconciliation | Local database replay/reconciliation foundation is complete; no chain indexer, finality/reorg invalidation, or multi-chain exposure service | INDEXER-001 |
| FR-012 Provider Sandbox | Local allowlist, sandbox Rail, deterministic settlement | No signed remote webhook, provider auth, conformance service, or SLA telemetry | PROVIDER-001 |
| OpenAPI and SDK | OpenAPI 3.1.2 for all 21 routes; stable Problem Details/request IDs; optional coarse retry class; zero-dependency JavaScript SDK with declarations | API-001 is complete for the demo surface; the durable Gateway is a separate local protocol and is not a public route, while authenticated runtime schema enforcement and compatibility policy remain | DATA-003 |
| Transactional event runtime | Batch command/event/Evidence/outbox plus normalized core and approval projections, immutable snapshots, approval/execution linkage, reconciliation and approval-gated repair crash-tested on PostgreSQL | The local Gateway composes Agent Subject and draft Mandate create/revoke writes plus integrity-checked reads over this runtime; the remaining Lockbox lifecycle and default public API remain process-local | DATA-003 |
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
Gateway with one serializable authority and commit boundary. Human and Agent
clients share a closed protocol for Human-controlled Agent Subject creation,
Human-only unsigned draft Mandate creation, integrity-checked owner read,
terminal reason-coded draft revocation, and bounded Agent self-read. Exact
replay after authorization-resource closure, row-locked authorization facts,
Event/Evidence/outbox/projection/audit atomicity, nonce/revocation serialization,
and domain-anchored Agent Subject/Mandate caps are PostgreSQL-tested. This is not
a public route, signed authority, or
production deployment; the Lockbox lifecycle and operational handlers remain.

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
and Agent self-read behind a separate local authenticated Gateway; the remaining
Lockbox lifecycle is not composed. No production database, customer data,
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
boundary. All 29 current authenticated Tenant operations are classified once.
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
2. `SECURITY-001` (approved for local non-funds implementation): `TENANT-001`,
   `AUTHN-001`, `AUTHZ-001`, `APPROVAL-001`, and `ABUSE-001` are complete locally.
3. `DATA-003` (foundation, DATA-003A, and DATA-003B complete locally; remaining
   composition in progress): the shared Human/Agent transaction boundary now
   covers Agent Subject creation, unsigned draft Mandate create/read/revoke,
   and Agent self-read while preserving the anonymous public sandbox boundary.
4. `DATA-002` (complete locally): durable Subject, Principal, Mandate, SpendPolicy, Obligation,
   Lockbox, Ledger, RiskDecision, and Admin repositories using the event/outbox
   transaction model.
5. `RECON-001` (complete locally): materialized projections, ledger/event/state reconciliation,
   replay jobs, discrepancy Evidence, operator runbook.
6. `AUTH-002`: signed Mandate activation/account challenge, nonce persistence,
   expiry, active-Mandate suspension/revocation, key rotation, replay tests.
7. `PROVIDER-001`: out-of-process provider sandbox, signed webhooks, inbox
   dedupe, retries, circuit breaker, conformance fixtures.
8. `RISK-002`: versioned evidence-derived features and point-in-time policy
   decisions; demo score remains educational only.
9. `HUMAN-001`: non-production Consent/KYC-reference/Originator/loan-tape
   simulator with an enforced no-funds boundary.
10. `OPS-001`: extend the deployed uptime and service alerts with named
   recipients, SLO reporting, scheduled full-lifecycle synthetic checks,
   incident/replay/key-rotation ownership, and protected release evidence.

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
