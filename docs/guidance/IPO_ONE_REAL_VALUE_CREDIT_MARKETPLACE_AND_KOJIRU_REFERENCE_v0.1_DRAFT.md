# IPO.ONE Real-Value Credit Marketplace and Kojiru Reference

**Version:** v0.1 Draft
**Date:** 2026-07-30
**Status:** Non-canonical discussion and competitive-reference note
**Decision effect:** None. This document records ideas for later review; it does
not approve production funds, contracts, pricing, risk rules, KYC processing,
deployment, or changes to the canonical Product Charter.

## 1. Purpose

This note preserves two related discussion threads:

1. a possible first real-value MVP for IPO.ONE; and
2. product lessons from the public Kojiru Agent Credit materials.

The Product Charter v1.1 and approved implementation guidance remain
authoritative. Any controlled-real-value pilot still requires the named legal,
capital, compliance, custody, servicing, risk, security, privacy, and
deployment approvals defined elsewhere in the repository.

## 2. Preserved discussion: possible first real-value MVP

### 2.1 Product role

IPO.ONE may begin as a credit marketplace and verifiable obligation
infrastructure rather than as the balance-sheet lender.

- Human and Agent are parallel users of one shared obligation kernel.
- A Capital Partner evaluates a borrower and independently decides whether to
  offer capital, at what limit, price, tenor, repayment schedule, and permitted
  purpose.
- IPO.ONE standardizes identity and Principal binding, consent or mandate,
  application data, lender offers, obligations, servicing events, repayments,
  adverse states, and Evidence.
- IPO.ONE may later produce risk recommendations, but a platform-generated
  number should not silently become the lender's decision or the canonical
  truth.
- Each lender may apply a different policy to the same verified borrower
  record.

### 2.2 Identity and privacy

- Human KYC should be performed by an approved third party.
- Agent identity must be bound to an accountable Principal or operator and to
  revocable authority.
- Raw KYC, PII, credentials, private trading data, and lender-private policy
  remain encrypted and offchain by default.
- The chain should receive hashes, attestations, state transitions, and
  settlement evidence sufficient to verify provenance and integrity without
  publishing sensitive content.

### 2.3 Credit record

The initial defensible asset is not a universal score. It is a versioned,
auditable Credit Passport containing:

- verified identity and Principal binding;
- lender-independent application facts and third-party attestations;
- accepted offers and finalized obligations;
- utilization, repayment, delinquency, restructure, write-off, and recovery
  outcomes;
- permitted-use execution and income or settlement evidence where applicable;
- data provenance, finality, revocation state, and model or policy version.

Repayment outcomes can gradually support a proprietary underwriting system.
Early platform recommendations should run in shadow mode and be compared with
actual lender decisions and realized losses before they are allowed to
authorize capital.

### 2.4 Commercial sequence

1. Freeze the currently proven Human and Agent synthetic/testnet lifecycle as a
   reproducible release candidate.
2. Add invited Capital Partners and borrower onboarding in a closed,
   no-real-funds or testnet pilot.
3. Introduce lender-authored Offers and explicit borrower acceptance over the
   shared obligation kernel.
4. After all real-value gates are approved, run a tightly capped, purpose-bound
   real-value pilot.
5. Accumulate repayment and adverse-outcome data before promoting a proprietary
   risk recommendation into a capital-authorizing control.
6. Add Trading Capital, including Hyperliquid, as one permitted-use Facility
   profile rather than as a separate credit system.

### 2.5 Explicit non-decisions

This discussion does not decide:

- that IPO.ONE will act as lender, broker, arranger, servicer, custodian, or
  investment platform in any jurisdiction;
- that Capital Partners may access raw KYC or unrestricted borrower data;
- that Human loans, public LP pools, unrestricted withdrawals, or production
  Agent autonomy are approved;
- pricing, loss allocation, reserve design, collections, recourse, or
  bankruptcy treatment;
- which onchain records have legal effect;
- any mainnet deployment or movement of real funds.

## 3. Kojiru public-material review

### 3.1 Research scope and source hierarchy

Reviewed on 2026-07-30:

- product website and Agent Credit dashboard;
- Litepaper v2.0 and Agent Credit Whitepaper v2.0;
- About, Compliance, Terms, On-Chain Receipts, Developer, and API pages;
- public Python package metadata;
- public search results for team, company, investors, and financing.

Token economics were intentionally excluded from the product recommendation,
except where token staking materially changes the proposed credit or
enforcement model.

This is a public-source product review, not a smart-contract audit, legal due
diligence report, lender verification, or financing confirmation.

### 3.2 Product thesis

Kojiru presents a concise Agent-credit loop:

1. register an onchain Agent identity;
2. construct an Agent Credit Score from verified behavior;
3. allow a lender to extend a bilateral credit line to a selected Agent;
4. draw only into an isolated, per-task escrow;
5. have an evaluator verify the outcome;
6. settle or default the task;
7. record repayment and outcome evidence;
8. update the Agent's reputation and future credit access.

Its strongest product idea is the combination of a lender-selected bilateral
line and purpose-bound per-task escrow. This explains who bears the credit
decision, limits the blast radius of each draw, and turns task outcomes into
repeatable credit evidence.

### 3.3 Public product surfaces

The public dashboard is organized around:

- Agent Registry;
- Credit Marketplace;
- Escrow;
- Evaluators;
- Revenue and Artifacts;
- Knowledge Graph;
- Institutional access;
- Cross-chain attestations;
- Credit Position records;
- Repayment and Alerts;
- SDK examples.

The lender form is especially clear: select an Agent, set a total limit,
service fee, per-task draw cap, and revocation rights over undrawn exposure.
The escrow form then asks for counterparties, amount, deadline, and task
description.

The Developer surface offers an API, Python SDK positioning, and examples for
common Agent frameworks. The On-Chain Receipts surface separates contract
addresses, test transitions, and explorer links, which is a useful trust and
debugging pattern.

### 3.4 What appears deployed versus what appears operational

Kojiru's own whitepaper contains an unusually useful status qualification:

- some token and staking contracts are source-verified on Base mainnet;
- several mainnet contracts are deployed but dormant;
- selected ACS Hook and Oracle behavior was being baked on Base Sepolia;
- scoring, evaluator records, marketplace screens, escrow accounting,
  repayment, and liquidation were described as Kojiru-hosted offchain
  orchestration;
- identity binding and bonded evaluator enforcement were still roadmap items;
- third-party formal verification was described as not yet commissioned.

The public dashboard observed during this review showed no registered Agents,
no credit lines, no credit draws, and no active escrows. Therefore the public
evidence supports the existence of a substantial product prototype and some
deployed/tested contracts, but does not independently establish an active,
real-money Agent credit market with realized repayment history.

### 3.5 Important inconsistencies

| Topic | Public inconsistency | Evaluation implication |
|---|---|---|
| Scoring method | Pages variously describe EWMA, a weighted six-factor formula, a Bayesian expression, and four input axes. | No single public canonical scoring specification is yet clear. |
| Score tiers | Litepaper, whitepaper, and dashboard display different tier boundaries, limits, rates, or fees. | A lender cannot yet reproduce one stable pricing table from public materials. |
| Product status | Roadmaps and marketing use “live” or “completed,” while the status note classifies core marketplace operations as hosted offchain and the dashboard has no activity. | “Deployed,” “available in UI,” and “economically active” must be treated as separate claims. |
| Formal verification | Founder marketing posts claim completed formal verification, while the whitepaper says a third-party engagement has not been commissioned. | Assurance claims require direct reports and exact contract/version linkage. |
| Pools versus bilateral lines | The strongest UI describes direct lender-to-Agent lines, but parts of the paper and API still use pooled-capital, utilization, insurance-fund, and proportional-recovery concepts. | The capital model is not yet consistently expressed. |
| Artifacts | Some developer language presents IPFS-backed artifacts as available, while the About/Compliance material describes backend-generated placeholders and content-addressed storage as roadmap. | A displayed hash is not automatically a content-addressed or onchain proof. |
| API scope and security declaration | The public OpenAPI surface is very broad and many operations do not declare security schemes. | This is a documentation and attack-surface warning, not proof that runtime writes are unauthenticated. |

### 3.6 Team and company disclosure

The public Terms identify **Kojiru Technologies, Inc.** and use Delaware law.
The Terms and Contact surfaces provide company email addresses. Public LinkedIn
posts identify Wayne Faulkner as Kojiru's founder, but the product website does
not currently provide a conventional team page, named leadership biographies,
board, advisers, or verifiable operating-team roster.

The statement that the company is remote-first with a team across multiple
countries was not accompanied by named members during this review. Team
transparency should therefore be considered limited until independently
verified.

### 3.7 Financing disclosure

No independently verifiable funding announcement, named investor, financing
round, accelerator portfolio entry, or institutional capital commitment was
found in the reviewed official materials and public searches.

This does **not** prove that Kojiru has not raised capital. It only means the
financing status appears private, bootstrapped, undisclosed, or otherwise
unverified from the currently available public sources. Product badges,
ecosystem references, and partnership application pages should not be treated
as proof of investment or a signed lending-capital commitment.

## 4. What IPO.ONE should learn from Kojiru

### 4.1 Product patterns worth adapting

1. **One-sentence credit loop.** Identity to bilateral line to bounded use to
   verified outcome to repayment is commercially understandable.
2. **Lender-controlled Offer construction.** Limit, price, tenor, purpose cap,
   and undrawn revocation belong in a professional Capital Partner workspace.
3. **Per-purpose isolation.** Each draw should be attached to a Facility,
   provider, task, or trading mandate instead of becoming unrestricted wallet
   cash by default.
4. **Separate actor workspaces.** Borrower, Agent operator, Capital Partner,
   evaluator, developer, and compliance users need different views over the
   same kernel.
5. **Receipts as a product surface.** Users should see whether an item is an
   offchain record, pending anchor, finalized transaction, indexed event, or
   reconciled Evidence—not merely a hexadecimal hash.
6. **Developer-first onboarding.** A short, versioned API flow and framework
   examples can make Agent access feel like a product rather than an internal
   test harness.
7. **Deterministic controls around probabilistic systems.** An LLM may explain
   or summarize but should not silently set limits, rates, freezes, or losses.
8. **Longitudinal outcome graph.** Tasks, economic outcomes, counterparties,
   obligations, and repayments can form a useful credit-history graph if every
   edge has provenance and permission boundaries.

### 4.2 Patterns IPO.ONE should not copy

1. A single FICO-like 300–850 score as the primary or portable truth.
2. Token holdings or staking demand as a substitute for repayment capacity.
3. An “autonomous Agent borrower” model without an accountable Principal,
   authority limits, and revocation.
4. One very broad API combining unrelated human lending, governance, token,
   prediction, business-finance, and Agent-credit operations.
5. Product copy that collapses “designed,” “implemented,” “deployed,”
   “testnet-verified,” and “used with real capital” into one status.
6. Evidence hashes that cannot be resolved to a canonical payload, anchor,
   transaction, finality state, and reconciliation result.
7. Raw KYC or sensitive behavioral data onchain.
8. A platform score that predetermines every lender's price and credit limit.

## 5. Suggested IPO.ONE product synthesis

The most useful synthesis is not to clone Kojiru's score or token model. It is
to combine its bilateral-credit UX with IPO.ONE's shared obligation and
Evidence kernel:

```text
Human or Agent + accountable Principal
    -> third-party identity/KYC/authority attestations
    -> Credit Intent
    -> versioned Credit Passport
    -> Capital Partner review and lender-authored Offer
    -> exact borrower/Principal acceptance
    -> purpose-bound Facility or escrow
    -> permitted execution
    -> repayment/default/recovery
    -> finalized Evidence
    -> updated longitudinal credit record
    -> lender-specific next Offer
```

For the first controlled-real-value design, the Capital Partner—not a universal
platform score—should decide the limit, rate, and tenor. IPO.ONE can provide:

- a standardized, permissioned underwriting packet;
- explicit factor provenance and adverse reason codes;
- one obligation and servicing state machine for Human and Agent;
- lender policy versioning and decision receipts;
- exact onchain/offchain Evidence status;
- outcome data suitable for later shadow-model training and validation.

Trading Capital can then reuse the same flow with additional purpose controls:
venue allowlist, per-action cap, aggregate cap, stop-loss, pause/freeze,
settlement routing, income attribution, and provider reconciliation.

## 6. Overall assessment

Kojiru is a strong **product-concept and interaction-design reference** for
Agent credit. Its clearest differentiators are bilateral lender selection,
per-task escrow, machine-readable enforcement, and a developer-facing story.
Those are highly relevant to IPO.ONE.

It is not yet a reliable benchmark for production maturity, underwriting
validity, market liquidity, realized losses, or institutional adoption based
on the public evidence reviewed. The most important lesson is therefore dual:
copy the clarity of the intended user journey, while being more rigorous than
Kojiru about status labels, identity accountability, evidence resolvability,
API scope, model versioning, and the separation between lender judgment and
platform infrastructure.

## 7. Public references

- Product: <https://kojiru.com/>
- Litepaper: <https://kojiru.com/litepaper>
- Agent Credit Whitepaper v2.0:
  <https://kojiru.com/kojiru-agent-credit-whitepaper.md>
- Agent Credit dashboard: <https://kojiru.com/agent-credit>
- On-Chain Receipts: <https://kojiru.com/on-chain-receipts>
- Compliance: <https://kojiru.com/compliance>
- About: <https://kojiru.com/about>
- Terms: <https://kojiru.com/terms>
- Developer Hub: <https://kojiru.com/developers>
- Public API docs: <https://api.kojiru.com/docs>
- Python package: <https://pypi.org/project/kojiru/>
- Public founder statement:
  <https://www.linkedin.com/posts/nownodesio_bittensor-activity-7467878238082691074-73DC>
