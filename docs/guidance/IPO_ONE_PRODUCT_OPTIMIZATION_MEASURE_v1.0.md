# IPO.ONE Product Optimization Measure v1.0

**Version:** v1.0
**Date:** 2026-07-30
**Status:** Founder approved — active near-term development reference
**Authority:** Subordinate to Product Charter v1.1
**Supersedes:** `IPO_ONE_PRODUCT_OPTIMIZATION_PLAN_v0.1_DRAFT.md`

## 1. Objective

Turn the current locally proven Human/Agent credit lifecycle into a concise,
usable credit marketplace that can support a closed pilot, testnet proof, and
later controlled real value.

The product position is:

> **IPO.ONE is a verifiable credit marketplace and obligation infrastructure
> for Human and Agent borrowers.**

IPO.ONE records and verifies identity, authority, Offers, Obligations,
execution, repayments, adverse outcomes, and Evidence. Capital Partners decide
whether to lend and set their own limit, price, term, repayment structure, and
permitted use.

This measure approves the product direction and its use as a development
reference. It does not by itself approve cloud deployment, external
credentials, new contracts or signers, KYC vendors, real capital, custody,
mainnet, or production funds movement.

## 2. Product structure

IPO.ONE keeps one shared protocol kernel and three product families.

### Credit

For Human borrowers and Agents with an accountable Principal.

Functions:

- verify identity, account, authority, Consent, or Mandate;
- submit a Credit Intent;
- receive and compare Capital Partner Offers;
- review and accept exact terms;
- activate and use a permitted Facility;
- view schedule, repay, cure, or enter remediation;
- accumulate a verifiable credit record.

### Capital Partners

For invited lenders, originators, or approved capital operators.

Functions:

- verify organization and authorized operator;
- receive a borrower-authorized Credit Passport;
- apply a private underwriting policy;
- create, replace, expire, withdraw, or revoke an Offer;
- set limit, rate/fee, term, schedule, purpose, per-draw cap, and conditions;
- monitor exposure, utilization, repayments, delinquency, and outcomes;
- retrieve portfolio and Evidence reports.

Capital Partners own the economic credit decision. IPO.ONE owns the integrity,
permissions, versioning, ledger, servicing state, reconciliation, and Evidence
of that decision.

### Trading Capital

For an approved Human or Agent using a purpose-bound Facility.

Functions:

- bind an approved venue, account, and restricted signer;
- enforce position, notional, loss, rate, staleness, and action limits;
- record Order Intents, fills, funding, income, and settlement;
- support pause, reduce-only, flatten, reconciliation, and close;
- route repayment and produce trading-performance Evidence.

Trading Capital reuses the same Identity, Offer, Obligation, Facility, Ledger,
Payment, servicing, risk, and Evidence kernel. It is not a separate lending
system.

## 3. Credit Passport

Credit Passport is a permissioned underwriting record, not a universal score.

It presents:

- Subject and accountable Principal;
- authority and credential status;
- KYC/KYB/KYP attestation references;
- active and completed Obligations;
- repayment, delinquency, cure, restructure, default, write-off, and recovery;
- verified income, task, provider, or trading-performance factors;
- concentration, volatility, intervention, and adverse factors;
- Evidence provenance, observation time, finality, revocation, policy version,
  and model version.

Raw KYC, PII, credentials, lender-private policy, and sensitive behavioral data
remain offchain and least-privilege. Onchain records contain only the necessary
hashes, attestations, state transitions, and settlement Evidence.

An optional summary category may aid reading, but it cannot replace the factor
record or authorize capital for every lender.

## 4. Required end-to-end product flow

The next product version must make this flow usable for both Human and Agent:

```text
Identity and authority
  -> Credit Intent
  -> authorized Credit Passport
  -> Capital Partner review
  -> lender-authored Offer
  -> exact borrower or Principal acceptance
  -> purpose-bound Facility
  -> permitted execution
  -> repayment, cure, or adverse outcome
  -> finalized and reconciled Evidence
  -> updated longitudinal credit record
```

Human and Agent may use different authentication and presentation, but they
must converge on the same Offer, Obligation, Ledger, servicing, risk, Event,
Evidence, and reconciliation rules.

## 5. Implementation plan

### Phase 1 — Stabilize and simplify

Goal: preserve current functionality and make the existing product easy to
understand.

Deliver:

- freeze one reproducible local release candidate;
- verify PostgreSQL persistence, idempotency, restart, reconciliation,
  pause/freeze, wallet sign-out/sign-in, Agent credentials, and Evidence anchors;
- simplify signed-out entry into Human, Agent, Capital Partner, and Developer
  paths;
- give every authenticated workspace one primary next action;
- remove redundant copy, duplicate actions, and user-facing internal-ID entry;
- rebuild Credit Passport around factors, outcomes, permissions, and receipts;
- give every hash an explicit type, chain/finality status, transaction link
  where applicable, and reconciliation state.

Complete when:

- current Human and Agent functions remain unchanged and pass regression;
- users can identify their next action without protocol knowledge;
- no displayed hash can be mistaken for a transaction hash;
- no synthetic balance, score, Evidence, or capital claim is presented as real.

### Phase 2 — Complete the synthetic bilateral marketplace

Goal: make Borrower, Agent, and Capital Partner a functioning three-sided
no-funds product.

Deliver:

- invited Capital Partner organization, operator, role, and authorization;
- borrower-controlled Credit Passport disclosure to one Capital Partner;
- permissioned underwriting packet and lender-private policy boundary;
- Capital Partner-authored Offer with exact economic and purpose terms;
- Human/Agent acceptance, rejection, expiry, replacement, and withdrawal;
- synthetic purpose-bound Facility using the shared kernel;
- Capital Partner portfolio for exposure, repayment, delinquency, and outcomes.

Complete when:

- one Human and one Agent can each receive and accept a Capital Partner Offer;
- duplicate or stale acceptance cannot create a second Facility;
- ungranted or cross-Tenant Credit Passport access fails closed;
- both paths produce the same canonical servicing and Evidence result;
- no deposit, withdrawal, custody, or real funds capability exists.

### Phase 3 — Closed pilot and testnet proof

Goal: prove that real invited users and Agents can use the complete product and
that the economic path reconciles on testnet.

Deliver in two separately approved gates:

1. Hosted no-funds pilot:
   - reviewed Web, private API, PostgreSQL, and worker deployment;
   - Human authentication and revocable Agent workload credentials;
   - protected Agent HTTPS using the existing `TRANSPORT-003` contract;
   - secrets, backups, restore, alerts, rate limits, rollback, and incident owner;
   - a small Human, Agent, and Capital Partner design-partner cohort.
2. Testnet execution:
   - Base Sepolia test-asset Offer, Facility, draw, repayment, close/default,
     Evidence anchoring, indexing, and reconciliation;
   - Hyperliquid Testnet restricted execution only after its separate signer and
     risk approval;
   - exact Human confirmation and one-use Agent credential/Mandate recheck;
   - unknown outcomes block new risk until reconciliation completes.

Complete when:

- invited users finish the lifecycle without database intervention;
- redeploy, restart, restore, revocation, pause, and incident drills pass;
- all economic records reconcile across contract/venue, Ledger, Obligation, and
  Evidence;
- no open P0/P1 security issue or unexplained state divergence remains;
- mainnet, real funds, arbitrary withdrawal, and external transfer remain off.

### Phase 4 — Controlled real-value preparation and learning

Goal: prepare a bounded Agent-credit pilot without allowing the model or this
plan to activate funds automatically.

Deliver:

- one complete go/no-go package covering capital, loss bearer, legal roles,
  jurisdiction, custody, asset, chain, Provider/venue, pricing, limits,
  servicing, recovery, privacy, security, operations, and accounting;
- one deterministic active credit policy with explicit reason codes;
- one shadow challenger using versioned, point-in-time outcome features;
- reports for repayment, DPD, cure, loss, utilization, concentration,
  calibration, false approval/rejection, and drift;
- versioned model promotion, rollback, and named human approval procedure.

If separately approved, the first real-value shape is:

- Agent plus accountable Principal;
- one capital source, one asset, and one provider/venue;
- 10-20 approved Agents;
- purpose-bound use and no arbitrary withdrawal;
- deterministic active policy and shadow learning;
- hard Facility, Agent, Capital Partner, Tenant, provider, chain, and global caps.

Real Human cash lending, public LP/vaults, tokens/DAO, unrestricted liquidity,
multi-venue expansion, and automatic model promotion remain outside this plan.

## 6. Non-redundancy rules

All future implementation must follow these rules:

1. One Human/Agent obligation kernel; no separate product truth.
2. One canonical Offer and Facility model for Credit and Trading Capital.
3. One Ledger, servicing state machine, Event stream, Evidence model, and
   reconciliation path.
4. One reusable receipt component for record hashes, chain transactions,
   finality, and reconciliation.
5. Role-specific views may differ, but must not duplicate business logic.
6. Internal IDs are advanced details, not normal user inputs.
7. A new page or API operation must support a primary user journey, a required
   risk control, or an audit obligation; otherwise it should not be added.
8. Demo fixtures and browser state never replace authenticated server truth.
9. Probabilistic models never bypass hard policy, permissions, caps, or human
   promotion.
10. “Designed,” “implemented,” “locally verified,” “testnet verified,”
    “hosted,” and “real-value active” are always reported separately.

## 7. Overall acceptance

This optimization measure is complete only when:

- Human and Agent can complete the same credit lifecycle;
- an invited Capital Partner can review authorized Evidence and author an Offer;
- exact acceptance creates one purpose-bound Facility;
- execution, repayment, adverse outcomes, and credit updates are durable;
- all required Evidence is typed, resolvable, finalized, and reconciled;
- Capital Partner and borrower private data remain permissioned;
- the product survives restart, replay, timeout, unknown outcome, revocation,
  pause, restore, and retry tests;
- the UI, OpenAPI, SDK, and Agent transport expose the same product capability;
- no redundant kernel, unsupported score, fake chain claim, or hidden authority
  is introduced.

## 8. Development use

The next implementation work should follow the four phases in order. Each phase
may be delivered through a small number of complete vertical-slice issues
rather than many disconnected micro-tasks.

Begin with:

1. Phase 1 release truth and product simplification;
2. Phase 2 Capital Partner identity, authorized Passport, bilateral Offer, and
   synthetic Facility as one coordinated vertical slice.

Prepared implementation work packages:

- `docs/codex/tasks/OPTIMIZATION_001_PHASE_1_STABILIZE_AND_SIMPLIFY.md`
- `docs/codex/tasks/CAPITAL_001_SYNTHETIC_BILATERAL_MARKETPLACE.md`

Phase 3 deployment and testnet gates and Phase 4 real-value activation remain
separately reviewed actions.
