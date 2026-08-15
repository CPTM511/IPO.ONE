# IPO.ONE Product Charter v1.1

Version: v1.1
Date: 2026-07-14
Status: Canonical product and governance direction, ratified by Founder
Source archive: `IPO_ONE_Product_Charter_v1.1_Founding_Edition.docx`
Source SHA-256: `5128cb049041aa38f8f0d6af75f638798735bd013c844c5a947042dfd7b3e5fc`

## 1. Authority and Supersession

This document upgrades the IPO.ONE Official Whitepaper Founding Edition into
the canonical Product Charter. It is not only external narrative. It governs
product scope, protocol boundaries, implementation sequencing, product
interfaces, pilot definitions, and commercialization gates.

Product Description and PRD v1.0 remains a historical source. Product Charter
v1.1 supersedes it wherever the documents conflict. The MVP Build Spec v0.1
continues to govern engineering discipline, issue structure, architecture
defaults, and review gates, as amended by this Charter.

The Founding Edition DOCX is preserved unchanged as the source archive. This
Markdown Charter records the binding interpretation and the decisions ratified
after the implementation and commercialization gap review.

## 2. Product Thesis

IPO.ONE is a machine-readable credit obligation protocol layer, not a single
lending application.

The product primitive is:

> `Identity + Payment + Obligation`

The protocol converts accountable identity, scoped authority, payment events,
and agreed credit terms into versioned obligations with deterministic state,
auditable servicing, and verifiable performance Evidence.

The product architecture is:

> **Single Kernel, Dual Entry**

Human users and Agents interact through different interfaces and authorization
methods, but they share the same canonical objects, state machines, policy
engine, ledger, event stream, Evidence model, risk controls, and reconciliation
rules.

## 3. Canonical Product Decisions in v1.1

### 3.1 Human and Agent are parallel first-class product modes

- Agent Pilot and Human Pilot are developed in parallel.
- Agent implementation may be delivered first when it reduces dependency risk.
- Human work must not remain a schema-only promise: the no-real-funds product
  must support a complete, operable Human borrowing and repayment lifecycle.
- No separate Human ledger, Human obligation state machine, or Human risk truth
  may be introduced.

### 3.2 Formal UI is part of the product

IPO.ONE must provide a production-quality product interface rather than only a
technical console or demo page.

The Human surface must make identity, available credit, terms, repayment,
performance, risk, and next actions understandable without protocol expertise.
The Agent surface must expose the same capabilities through versioned OpenAPI,
SDK, and MCP/A2A-compatible contracts with stable errors and Evidence.

Aave is a benchmark for clear position hierarchy, borrowing steps, health/risk
visibility, and transaction review. Goldfinch is a benchmark for credit-facility
terms, borrower-specific obligations, repayment schedules, due diligence, and
offchain/onchain evidence. IPO.ONE must not copy their branding, assets, or
economic model.

Commercial product requirements supersede historical demo behavior whenever
they conflict. Demo-only routes, synthetic fixtures, and process-local state may
remain only as clearly labelled test or public-sandbox infrastructure; they
must not supply authenticated product truth, silently replace an approved
private workflow, or determine the default Human or Agent experience.

### 3.3 Functional before funded

The first commercialization product may contain no real lender capital, but its
approved sandbox and private pilot modes must behave as a complete product:

1. create and bind a Human or Agent Subject;
2. record Consent or Mandate and accountable Principal;
3. submit a Credit Intent;
4. return an explainable decision and versioned Credit Offer;
5. accept terms and create an Obligation;
6. execute through a sandbox rail or allowlisted provider;
7. service principal, interest, fees, and scheduled payments;
8. model DPD, default, cure, restructure, repurchase, and write-off;
9. reconcile ledger, events, and projections; and
10. expose portable Evidence to users, Agents, operators, and auditors.

Synthetic balances, sandbox receipts, and mock KYC/VC references must be
explicit. The interface must never imply that demo funds are withdrawable or
that a sandbox score is an approved real-world credit decision.

### 3.4 Multi-chain is an adapter boundary

Chain-specific code must remain behind versioned adapters. Canonical Subject,
Account Binding, Obligation, Payment, and Evidence identifiers remain portable
using CAIP-2, CAIP-10, chain-agnostic obligation IDs, explicit finality state,
and reorg-safe event indexing.

The initial test profiles are:

| Purpose | Network | CAIP-2 | Role |
| --- | --- | --- | --- |
| Primary execution test | Base Sepolia | `eip155:84532` | First smart-contract, receipt, finality, and indexer integration |
| Portability conformance | X Layer Testnet | `eip155:1952` | Prove that no Base-specific assumption enters the kernel |

These profiles are reversible engineering choices. They do not approve a
mainnet, custody provider, token, capital source, or production fund movement.

## 4. Canonical Shared Lifecycle

The first shared application lifecycle is:

`Subject -> Authority -> Credit Intent -> Decision -> Offer -> Obligation -> Execution -> Payment -> Performance -> Evidence`

Human entry uses Consent, KYC/VC references, Human authentication, and
human-readable disclosures. Agent entry uses Principal binding, Mandate,
workload authentication, CAIP-10 account proof, and machine-readable policy.
Both entries converge before deterministic credit policy and remain on the
same lifecycle thereafter.

## 5. Product Surfaces

### Human product

- Portfolio and available-credit home.
- Guided application and terms review.
- Consent, identity-reference, and disclosure controls.
- Borrow, repay, schedule, performance, and support/remediation views.
- Plain-language explanation paired with canonical reason codes.

### Agent product

- Capability discovery and versioned operation catalog.
- OpenAPI and typed SDK as the minimum public contract.
- MCP/A2A-compatible authenticated adapter after security review.
- Idempotent commands, stable Problem Details, webhooks, event subscriptions,
  and Evidence retrieval.
- No hidden action that exists only in the Human UI.

### Operator and risk product

- Tenant exposure, per-chain exposure, caps, and stop-loss posture.
- Freeze/pause and dual-control actions.
- Reconciliation, replay, discrepancy Evidence, and incident controls.
- Human and Agent portfolios on one risk truth with privacy-safe drill-down.

## 6. Pilot Boundaries

### Public no-real-funds sandbox

May use synthetic Subjects, balances, decisions, rails, repayment receipts,
and KYC/VC references. It may demonstrate the complete lifecycle but cannot
process raw PII, represent an actual loan, or create redeemable value.

### Private Human pilot

May become operational only after named Legal, Compliance, Privacy, Security,
Risk, Servicing, and Product approvals. Raw KYC/PII remains encrypted offchain
under least privilege; onchain state receives only hashes, attestations, and
revocable references.

### Controlled Agent credit pilot

Agent Lockbox remains the first real-value candidate because purpose-limited
provider spend and captured revenue can bound use of proceeds and repayment.
It requires named capital, custody/rail, Provider, Risk, Security, Legal, and
Operations approval before activation.

## 7. Commercialization Definition

IPO.ONE is product-ready for a design-partner no-funds pilot only when:

- a Human and an Agent can each complete the shared lifecycle;
- the UI is responsive, accessible, understandable, and not demo-only;
- the Agent API contract has conformance fixtures and integration guidance;
- durable Tenant identity and authorization protect all private operations;
- ledger, event, projection, and Evidence reconciliation pass restart tests;
- Provider and sandbox rail integrations are out-of-process and signed;
- finality and reorg behavior are proven on both test profiles;
- risk controls, alerts, freeze/pause, limits, and incident ownership exist;
- privacy, retention, and data-subject boundaries are documented; and
- product analytics and design-partner feedback can be measured without
  collecting unnecessary sensitive data.

Real-value commercialization additionally requires capital, pricing, legal
role mapping, compliance, custody, servicing, loss allocation, production
infrastructure, independent security review, and named launch approval.

## 8. Explicit Non-Goals Before Real Repayment Evidence

- Public LP vaults or unrestricted withdrawals.
- Token issuance or DAO governance.
- Black-box universal credit scoring.
- Unbounded Human cash lending.
- Raw PII or KYC documents onchain.
- Mainnet deployment presented as product validation.
- A chain-specific fork of the protocol kernel.

## 9. Human Review Gates

The following changes always require named human review: contracts, funds
movement, custody, risk limits, pricing, permissions, production identity,
privacy boundaries, KYC/KYP providers, production dependencies, chain/mainnet
selection, capital providers, legal agreements, and deployment changes.

## 10. Versioning and Decision Discipline

Product decisions should update this Charter or a versioned subordinate PRD,
ADR, roadmap, or issue. Implementation must remain issue-based with context,
scope, non-goals, likely files, acceptance criteria, test commands, and a
security checklist.

No implementation checkpoint may be relabelled as commercial readiness unless
the applicable Charter gates have verifiable Evidence.
