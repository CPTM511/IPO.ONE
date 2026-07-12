# IPO.ONE Commercialization Roadmap v0.3 (Draft)

Version: v0.3 Draft
Date: 2026-07-11
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
| FR-001 Subject Registry | Agent/Human/Org/Originator enums; Agent and prototype Human creation; normalized Subject/Principal repository | Durable repository foundation is complete; public demo composition remains process-local and has no tenant controls | DATA-003, SECURITY-001 |
| FR-002 Principal Binding | Principal is separate and required by Agent flows | Local responsibility binding works; no authenticated ownership proof | SECURITY-001, AUTH-002 |
| FR-003 Multi-chain Account Binding | CAIP-2/10 validation and bindings | Identifier-ready; signatures, nonce persistence, and cross-chain replay rejection are not production-grade | AUTH-002, CHAIN-001 |
| FR-004 Agent Lockbox | Local Lockbox and balanced ledger repayment path; durable normalized Lockbox/Ledger projections | Repository and reconciliation foundation is complete; default sandbox is still process-local and no custody exists | DATA-003, CUSTODY-001 |
| FR-005 Spend Policy | Provider/category/amount checks, live Mandate recheck, durable policy/request/reservation projections | Persistence foundation is complete; tenant/provider caps and production enforcement remain | DATA-003, SECURITY-001, CONTRACT-001 |
| FR-006 Obligation Registry | Obligation lifecycle, required references, immutable snapshots, drift detection and repair Evidence | Durable repository foundation is complete; canonical authorization/funding state machine still needs ADR and command-gateway composition | ARCH-002, DATA-003 |
| FR-007 Repayment Router | Partial/full repayment, utilization release, Evidence; durable Ledger/Obligation/Repayment repositories and reconciliation | Persistence controls are proven in isolation; the public API still uses the process-local demo orchestrator | DATA-003, AUTH-002 |
| FR-008 Risk Engine v0 | Deterministic reason-coded local decision | Demo inputs are partly synthetic; point-in-time evidence features and policy registry remain | RISK-002 |
| FR-009 Admin Console | Exposure and freeze path with audit events | No AuthN, tenant isolation, RBAC, dual control, or break-glass policy | SECURITY-001 |
| FR-010 Human Prototype | Prototype Human Subject and reserved DPD/restructure states | Consent, KYC/VC reference contract, Originator, and loan-tape simulator are not implemented | HUMAN-001 |
| FR-011 Event Indexer | Rail event replay, multi-event PostgreSQL runtime, materialized core projections and deterministic reconciliation | Local database replay/reconciliation foundation is complete; no chain indexer, finality/reorg invalidation, or multi-chain exposure service | INDEXER-001 |
| FR-012 Provider Sandbox | Local allowlist, sandbox Rail, deterministic settlement | No signed remote webhook, provider auth, conformance service, or SLA telemetry | PROVIDER-001 |
| OpenAPI and SDK | OpenAPI 3.1.2 for all 21 routes; stable Problem Details/request IDs; zero-dependency JavaScript SDK with declarations | API-001 is complete for the demo surface; runtime schema enforcement, compatibility policy, AuthN, and durable application command gateway remain | SECURITY-001, DATA-003 |
| Transactional event runtime | Batch command/event/Evidence/outbox plus normalized core projections, immutable snapshots, reconciliation and approval-gated repair crash-tested on PostgreSQL | Repository foundation is complete for Rail and core entities; default API composition remains process-local pending tenant/auth decisions | DATA-003, SECURITY-001 |
| Public sandbox hosting | Fail-closed production config, Host/HTTPS boundary, discovery, pinned non-root container, Cloud Run template | Repository baseline complete; cloud edge, CI release evidence, monitoring, and DNS cutover remain | OPS-001A |
| Release governance | Versioned public/closed/real-value profiles, canonical evidence contract, exact release identity, approval age/expiry, complete gate set, protected-environment reference | Public sandbox evidence is executable; closed private and real-value profiles are policy-locked pending implementation and named approvals | OPS-002, SECURITY-001 |

This matrix is the implementation source of truth. “Public MVP complete” means
the interactive demonstration is complete; it must not be used as evidence
that the canonical Launch Checklist has passed.

### V0.3 Implementation Checkpoint (2026-07-11)

`API-001` is complete for the local sandbox surface. The repository now verifies
21/21 OpenAPI operations, stable Problem Details and request correlation, SDK
route parity, 87 database-free tests, 8 adversarial HTTP tests, and 12 PostgreSQL integration subtests. The
live SDK/API smoke completes settlement and full repayment without real funds.

`SECURITY-001` is prepared as a design gate and is not yet authorized for
implementation. No production AuthN, tenant, RBAC, rate-limit, credential, or
permission claim has been added.

### V0.3 Hosting Checkpoint (2026-07-12)

`OPS-001A` is complete at the repository level. Production startup now fails
closed unless the no-real-funds public sandbox, HTTPS origin, trusted proxy,
HSTS, release, Host allowlist, and security contact are explicit. The proposed
image is digest-pinned and non-root; CI is configured to run it read-only with
capabilities removed. The application publishes liveness, readiness, security,
and Human/Agent discovery endpoints and emits bounded structured logs.

This is not hosted-release evidence. GCP project/region/IAM, Artifact Registry,
load balancer, Cloud Armor, certificate, monitoring, incident ownership,
GoDaddy DNS, and post-cutover verification still require named human approval.
No AuthN, durable customer state, private data, or real funds are enabled.

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

This does not make the public API durable or pilot-authorized. `DATA-003` must
compose this repository behind an authenticated tenant command gateway after
`SECURITY-001` decisions. No production database, customer data, scheduled
repair, backup/DR, or real-value path is enabled.

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
2. `SECURITY-001`: approve the decision pack, then implement `TENANT-001`,
   `AUTHN-001`, `AUTHZ-001`, `APPROVAL-001`, and `ABUSE-001` as separate changes.
3. `DATA-002` (complete locally): durable Subject, Principal, Mandate, SpendPolicy, Obligation,
   Lockbox, Ledger, RiskDecision, and Admin repositories using the event/outbox
   transaction model.
4. `RECON-001` (complete locally): materialized projections, ledger/event/state reconciliation,
   replay jobs, discrepancy Evidence, operator runbook.
5. `AUTH-002`: signed Mandate/account challenge, nonce persistence, expiry,
   revocation, key rotation, replay tests.
6. `PROVIDER-001`: out-of-process provider sandbox, signed webhooks, inbox
   dedupe, retries, circuit breaker, conformance fixtures.
7. `RISK-002`: versioned evidence-derived features and point-in-time policy
   decisions; demo score remains educational only.
8. `HUMAN-001`: non-production Consent/KYC-reference/Originator/loan-tape
   simulator with an enforced no-funds boundary.
9. `OPS-001`: metrics, SLOs, alerts, dependency inventory, threat model,
   incident/replay/key-rotation runbooks, launch evidence automation.

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
