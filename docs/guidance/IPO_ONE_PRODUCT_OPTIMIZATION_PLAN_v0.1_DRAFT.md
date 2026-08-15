# IPO.ONE Product Optimization Plan v0.1

**Version:** v0.1 Draft
**Date:** 2026-07-30
**Status:** Superseded by `IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md`
**Decision effect:** None
**Implementation authority:** None

The Founder approved the direction and recommended defaults in this draft on
2026-07-30. The shorter v1.0 measure is the active development reference.

This document assumes that “IPO.com” in the Founder discussion refers to
IPO.ONE.

## 1. Purpose and authority

This plan proposes how to turn the current locally proven Human/Agent credit
kernel into a coherent, commercially testable credit marketplace without
changing the canonical Product Charter.

It is a review document. It does not approve:

- production or testnet writes beyond an already approved issue;
- contracts, real funds, capital, pricing, loss limits, or custody;
- production KYC, PII processing, Human lending, or collections;
- cloud deployment, credentials, remote participant access, or mainnet;
- a new score, model, or automatic credit authority.

Every implementation item must later receive an issue containing context,
scope, non-goals, likely files, acceptance criteria, test commands, and a
security checklist.

## 2. Executive recommendation

### 2.1 Product position

Optimize IPO.ONE around this definition:

> **IPO.ONE is a verifiable credit marketplace and obligation infrastructure
> for Human and Agent borrowers.**

IPO.ONE should help a Capital Partner answer four questions:

1. Who or what is requesting credit, and who is accountable?
2. What verified performance and repayment Evidence exists?
3. What exact terms and permitted use is the Capital Partner willing to offer?
4. Did the resulting obligation perform, and can that outcome be independently
   verified?

IPO.ONE should not initially claim to be a universal credit bureau, a
balance-sheet lender, an unrestricted DeFi liquidity pool, or an autonomous
black-box underwriter.

### 2.2 One kernel, three commercial product families

| Product family | Primary user | Primary job | Shared-kernel output |
| --- | --- | --- | --- |
| Credit | Human borrower; Agent plus accountable Principal | Request, review, accept, draw, repay, remediate | Credit Intent, Offer, Obligation, Payment, Performance, Evidence |
| Capital Partners | Invited lender, originator, or approved capital operator | Review permissioned evidence, author terms, monitor exposure and outcomes | Capital Policy, lender-authored Offer, Facility, servicing and portfolio Evidence |
| Trading Capital | Human/Agent trader with bounded authority | Use an approved Facility at an allowlisted venue under explicit risk limits | Order Intent, execution, settlement, repayment, performance Evidence |

Trading Capital is a purpose-specific Facility profile. It must not create a
separate identity, obligation, ledger, repayment, risk, or Evidence kernel.

### 2.3 Credit Passport definition

The Credit Passport should become a permissioned, evidence-resolvable
underwriting packet rather than a form for manually entering internal IDs or a
single universal score.

It should contain:

- Subject, Principal, authority, and credential status;
- third-party KYC/KYB/KYP attestation references;
- completed and active Obligations;
- repayment, delinquency, restructure, default, write-off, and recovery history;
- verified income, task, provider, or trading-performance factors;
- concentration, volatility, intervention, and adverse-state factors;
- provenance, observation time, policy/model version, finality, and revocation;
- lender-private notes or decisions in a separate permission boundary.

An optional summary tier may improve usability, but it must not silently become
portable decision authority. The factor passport, outcome history, and exact
Evidence remain primary.

## 3. Current baseline

The current repository guidance and checkpoints support the following planning
baseline. It must be re-verified against the exact candidate commit before
implementation begins.

### 3.1 Existing strengths to preserve

- One PostgreSQL-backed Human/Agent obligation kernel exists locally.
- Human and Agent can reach Offer, Obligation, repayment, servicing, and
  Evidence through the same canonical lifecycle.
- Human wallet/account proof and Agent Principal/Mandate/account proof have
  bounded local implementations.
- Durable idempotency, ledger, event, outbox, reconciliation, pause/freeze, and
  recovery foundations exist.
- Base Sepolia Evidence anchoring has a bounded, hash-only Registry boundary.
- Trading Capital already contains synthetic Facility, matching, execution,
  settlement, risk, unknown-result, and reconciliation concepts.
- The commercial shell now presents Credit, Trading Capital, Capital Partners,
  Repay & Settle, and Credit Passport as product families.
- `TRANSPORT-003` defines a local, protected remote Agent HTTPS contract and
  conformance client; deployment and participant access remain disabled.

### 3.2 Main gaps

| Gap | Current truth | Required optimization |
| --- | --- | --- |
| Capital Partner workflow | Visible invitation-only preview; no capital action | Add a synthetic, permissioned bilateral Offer and portfolio vertical slice |
| Credit Passport usability | Powerful Evidence model, but current owner/verifier flow exposes protocol IDs and technical concepts | Present factors, outcomes, permissions, and resolvable receipts in plain commercial language |
| Hosted product | Durable private kernel is local; public Vercel surface is synthetic/process-local | Deploy one invite-only, durable, no-funds closed pilot after separate approval |
| Agent remote use | Contract and conformance client exist locally | Activate protected HTTPS only with reviewed credentials, secrets, ingress, and operations |
| Evidence trust UX | Hash anchors exist | Make every receipt disclose record type, chain, transaction, finality, indexer, and reconciliation state |
| Credit learning | Evidence-derived deterministic policy and shadow concepts exist | Add versioned outcome labels, offline challenger evaluation, drift and promotion governance |
| Real economic proof | Synthetic lifecycle and bounded testnet anchoring exist | Prove bilateral offer, acceptance, purpose-bound test-asset draw, repayment, and reconciliation |
| Real value | Explicitly disabled | Prepare a decision package only after no-funds and testnet gates pass |

## 4. Product experience direction

### 4.1 Entry architecture

The signed-out product should answer “what can I do here?” before presenting
protocol detail.

Recommended entry choices:

1. **Borrow as a Human**
2. **Connect an Agent**
3. **Provide or Manage Capital**
4. **Build with the API**

After authentication, the workspace switch may still distinguish Human and
Agent interaction modes, but role-specific next actions should take priority
over internal lifecycle objects.

### 4.2 Borrower journey

```text
Verify identity/authority
  -> Request credit
  -> Review evidence used
  -> Compare received Offers
  -> Accept exact terms
  -> Activate purpose-bound Facility
  -> Use funds only as permitted
  -> Track schedule
  -> Repay or request remediation
  -> Receive updated Credit Passport
```

The borrower should not need to type or discover Subject, Actor, Intent,
Artifact, or Evidence IDs. Those identifiers remain available in an advanced
receipt view.

### 4.3 Capital Partner journey

```text
Accept invitation
  -> Verify organization and authorized operator
  -> Define capital/risk policy
  -> Review borrower-authorized Credit Passport
  -> Create an exact Offer
  -> Receive borrower acceptance
  -> Activate/fund a bounded Facility
  -> Monitor exposure and schedule
  -> Reconcile repayments and adverse states
  -> Review portfolio outcome Evidence
```

The Capital Partner, not IPO.ONE's generic score, owns the economic decision.
IPO.ONE owns the integrity, versioning, permissions, state, ledger,
reconciliation, and Evidence of that decision.

### 4.4 Trading Capital journey

Trading Capital should begin only after a Facility is approved:

```text
Approved Credit Offer
  -> Trading Facility
  -> venue/account/signer binding
  -> limits and stop conditions
  -> Order Intent
  -> allowlisted execution
  -> fills/funding/PnL reconciliation
  -> captured revenue or repayment
  -> Facility settlement
  -> trading and credit outcome Evidence
```

The screen should visually distinguish:

- credit approval;
- available Facility capacity;
- venue margin or collateral;
- current market exposure;
- amount due to the Capital Partner; and
- realized, finalized, and reconciled performance.

### 4.5 Evidence receipt standard

Every displayed hash should be one of the following explicit types:

- canonical record hash;
- Evidence payload hash;
- transaction hash;
- onchain anchor identifier;
- event/log identifier;
- policy or model hash;
- reconciliation receipt hash.

Each receipt view should show:

- human-readable event name;
- actor and authority class;
- related Obligation or Facility;
- chain and contract where applicable;
- transaction link where applicable;
- submitted, included, finalized, indexed, and reconciled timestamps;
- failure, retry, replacement, or revocation state;
- privacy-safe disclosure boundary.

The interface must never present an Evidence payload hash as though it were a
chain transaction.

## 5. Optimization principles

1. **Finish role journeys before adding product families.**
2. **Keep Human and Agent economically and semantically equivalent.**
3. **Let lenders author Offers; let IPO.ONE verify the process.**
4. **Use purpose-bound Facilities before unrestricted wallet liquidity.**
5. **Make every trust claim resolvable to Evidence.**
6. **Prefer factor history to a universal score.**
7. **Keep probabilistic models out of active capital authority until validated.**
8. **Separate deployed, testnet-verified, hosted, and real-value status.**
9. **Keep KYC/PII offchain and permissioned.**
10. **Do not activate value before operational recovery and loss ownership are
    explicit.**

## 6. Six-stage delivery plan

Durations are planning ranges, not commitments. Each stage ends with a review
gate.

### Stage 0 — Freeze and truth baseline

**Indicative duration:** 2-4 engineering days
**Risk:** Low
**Authority added:** None

Work:

- select one exact clean candidate commit;
- run the repository, PostgreSQL, Human, Agent, wallet, restart, Evidence anchor,
  and reconciliation gates;
- produce one capability truth matrix using:
  `designed / implemented / locally verified / testnet verified / hosted /
  real-value active`;
- record current migrations, OpenAPI versions, test seeds, chain Registry,
  configuration hashes, and expected database summary;
- preserve the current commercial UI and protocol behavior.

Exit:

- one reproducible release receipt covers Human and Agent;
- no unexplained failure, orphan anchor, duplicate economic effect, or migration
  drift remains;
- remaining P0/P1/P2 items have named disposition.

### Stage 1 — Product clarity and Credit Passport

**Indicative duration:** 1-2 weeks
**Risk:** Low to medium
**Authority added:** None

Work:

- simplify signed-out entry and onboarding by role;
- remove redundant calls to action and contradictory signed-out copy;
- make one primary next action visible in each authenticated workspace;
- redesign Credit Passport around factors, outcomes, permissions, and receipts;
- add a resolvable Evidence/transaction detail component;
- preserve advanced protocol details behind progressive disclosure;
- verify desktop, mobile, keyboard, focus, zoom, contrast, and screen-reader
  semantics.

Exit:

- a new Human, Agent operator, and Capital Partner can each explain their next
  action without protocol assistance;
- no form requires copying an internal ID available to the server;
- every visible hash has an explicit type and resolution path;
- no invented balance, score, Evidence, or capital claim appears.

### Stage 2 — Synthetic Capital Partner vertical slice

**Indicative duration:** 2-3 weeks
**Risk:** Medium
**Authority added:** Synthetic/no-funds only

Work:

- define an invited Capital Partner organization, operator membership, and
  least-privilege permission model;
- create a permission grant allowing a borrower to disclose a bounded Credit
  Passport to one Capital Partner;
- add lender-private policy and underwriting workspace;
- add lender-authored Offer terms:
  limit, rate/fee, tenor, schedule, permitted purpose, per-draw cap, expiry,
  conditions, and undrawn-revocation rule;
- add exact borrower/Principal review and acceptance;
- activate a synthetic Facility using the existing shared Obligation, Ledger,
  servicing, Event, Evidence, and reconciliation kernel;
- add Capital Partner exposure, repayment, delinquency, and outcome portfolio.

Exit:

- one Human and one Agent can each receive and accept a Capital Partner-authored
  Offer;
- the two entry modes converge on the same versioned Facility and servicing
  rules;
- a Capital Partner cannot read another Tenant or ungranted passport;
- Offer replacement, expiry, withdrawal, rejection, duplicate acceptance, and
  revocation tests fail safely;
- there is still no deposit, withdrawal, custody, or real capital.

### Stage 3 — Hosted invited no-funds pilot

**Indicative duration:** 1-2 weeks after deployment approval
**Risk:** Medium to high
**Authority added:** Remote invited users; no real funds

Work:

- deploy the reviewed Web, private API, PostgreSQL, and worker release;
- activate approved Human authentication and separately revocable Agent
  workload credentials;
- activate the reviewed `TRANSPORT-003` HTTPS contract without broadening its
  operation catalog;
- configure secrets, rate limits, logs, alerts, backup/restore, migration,
  rollback, and incident ownership;
- pre-provision a small design-partner cohort;
- collect categorical usability and lifecycle feedback without unnecessary
  sensitive data.

Recommended cohort:

- 2-3 internal Human users;
- 3-5 design partners, including at least one candidate Capital Partner;
- 5-10 separately credentialed Agents with different risk/retry profiles.

Exit:

- invited users finish Human, Agent, and Capital Partner flows without database
  intervention;
- redeploy, restart, backup/restore, credential revocation, pause, incident, and
  rollback drills pass;
- no cross-Tenant disclosure, duplicate value state, or open P0/P1 security
  finding remains.

### Stage 4 — Testnet bilateral credit and permitted-use proof

**Indicative duration:** 2-4 weeks after separate contract/signer approval
**Risk:** High
**Authority added:** Test assets and bounded signed testnet actions only

Split this stage into two independent gates.

#### Stage 4A — Base Sepolia bilateral lifecycle

- Capital Partner signs or authorizes a test-asset Offer;
- Human/Agent accepts exact terms with the appropriate account/credential;
- a purpose-bound test-asset Facility is activated;
- draw, execution, repayment, close/default, and credit-record updates produce
  exact Evidence anchors;
- contract events, PostgreSQL state, Ledger, and Evidence reconcile after
  restart and replay.

#### Stage 4B — Hyperliquid Testnet use case

- one named testnet account structure and restricted signer;
- allowlisted order/cancel/reduce-only/flatten actions;
- hard notional, position, loss, rate, staleness, and price-deviation limits;
- live fill/funding/position reconciliation;
- repayment and Facility settlement from finalized testnet outcomes;
- the trading challenger remains non-authorizing.

Exit:

- every required economic and credit Evidence record has a reconciled testnet
  anchor;
- Human actions have exact review/confirmation;
- Agent actions have one-use credential, active Mandate, and limit recheck;
- unknown outcomes block risk-increasing retries until reconciled;
- there is no mainnet, real funds, withdrawal, or external transfer authority.

### Stage 5 — Controlled real-value Agent pilot decision

**Indicative duration:** Governance-dependent
**Risk:** Critical
**Authority added:** None until final go/no-go

Prepare, but do not activate, a decision package covering:

- legal entities, roles, jurisdiction, and agreements;
- Capital Partner, beneficial owner, source of funds, amount, term, and loss
  bearer;
- production chain, asset, Provider/venue, custody, accounts, contracts, and
  settlement;
- KYP/KYB/KYC, privacy, complaints, sanctions, servicing, recovery, and
  accounting;
- exact pricing, limits, first-loss, waterfall, stop-loss, pause, signer, and
  incident rules;
- independent security and value-path review;
- support, SLA, billing, tax, and portfolio reporting.

Recommended first activation shape, if later approved:

- Agent credit first; Human remains no-funds/private pilot;
- one capital source;
- one asset;
- one venue or provider category;
- 10-20 approved Agents;
- purpose-bound use and no arbitrary withdrawal;
- deterministic active policy;
- shadow learning only;
- hard per-Facility, Agent, Capital Partner, Tenant, provider, chain, and global
  caps.

## 7. Credit learning and model optimization

### 7.1 Active policy

During Stages 0-4, the active authority should remain a reviewed deterministic
policy using versioned, point-in-time features and explicit reason codes.

### 7.2 Shadow challenger

The challenger may recommend:

- eligibility category;
- maximum suggested exposure;
- suggested rate/fee band;
- tenor and repayment-frequency band;
- required purpose restrictions;
- monitoring or intervention level.

It may not directly:

- increase a limit;
- reduce a price;
- activate or fund a Facility;
- remove a stop condition;
- execute a transaction;
- overwrite historical Decisions.

### 7.3 Initial feature families

- identity, authority, and credential stability;
- finalized obligation and repayment history;
- DPD, cure, restructure, write-off, and recovery;
- verified revenue and cashflow continuity;
- allowed-use execution quality;
- counterparty and provider concentration;
- trading drawdown, leverage, volatility, intervention, and reconciliation;
- disputed, revoked, stale, missing, or low-confidence Evidence;
- Capital Partner-specific policy factors.

### 7.4 Model evaluation

Evaluate by cohort and observation time:

- repayment and automated-capture rate;
- DPD transition and cure rate;
- gross and net loss;
- utilization and repeat use;
- false approval and false rejection;
- calibration by suggested limit/rate band;
- concentration and correlated loss;
- feature drift, policy drift, and data-quality failure;
- Human/Agent parity where economic facts are equivalent.

Any promotion requires a versioned review, backtest, challenger comparison,
reason-code review, override policy, rollback plan, and named Risk/Founder
approval.

## 8. Proposed issue sequence

The following IDs are placeholders for review. Approval of this document does
not automatically authorize them.

| Order | Proposed issue | Outcome | Depends on |
| --- | --- | --- | --- |
| 1 | `RC-002 CURRENT PRODUCT TRUTH BASELINE` | Exact clean release and capability truth matrix | Current local stack |
| 2 | `PRODUCT-002 ROLE-BASED PRODUCT JOURNEYS` | Borrower, Agent, Capital Partner, Developer entry architecture | RC-002 |
| 3 | `PASSPORT-002 EVIDENCE-BASED CREDIT PASSPORT` | Factor/outcome passport without universal score | RC-002 |
| 4 | `EVIDENCE-002 RESOLVABLE RECEIPT EXPERIENCE` | Typed hash, chain, finality, indexer, reconciliation view | RC-002 |
| 5 | `CAPITAL-001 CAPITAL PARTNER IDENTITY AND AUTHORIZATION` | Invited organization/operator and disclosure grants | PRODUCT-002 |
| 6 | `CAPITAL-002 PERMISSIONED UNDERWRITING PACKET` | Borrower-authorized Passport read and lender-private policy | CAPITAL-001, PASSPORT-002 |
| 7 | `OFFER-002 LENDER-AUTHORED BILATERAL OFFER` | Exact lender terms and borrower/Principal acceptance | CAPITAL-002 |
| 8 | `FACILITY-002 SYNTHETIC BILATERAL FACILITY` | Shared Obligation/Ledger/servicing lifecycle | OFFER-002 |
| 9 | `CAPITAL-003 CAPITAL PORTFOLIO AND OUTCOMES` | Exposure, repayment, adverse state, Evidence reporting | FACILITY-002 |
| 10 | `PILOT-008 HOSTED THREE-SIDED CLOSED PILOT` | Durable hosted Borrower/Agent/Capital Partner product | Stage 2 gate and deployment approval |
| 11 | `RISK-002B SHADOW CREDIT RECOMMENDATION` | Versioned offline challenger and outcome evaluation | PASSPORT-002, realized synthetic/testnet outcomes |
| 12 | `TESTNET-002 BILATERAL CREDIT LIFECYCLE` | Test-asset offer/draw/repay/anchor/reconcile | Separate contract/signer approval |
| 13 | `HYPERLIQUID-001 LIVE TESTNET FACILITY USE` | Restricted signed venue use and settlement Evidence | TESTNET-002 and separate signer approval |
| 14 | `REALVALUE-002 CONTROLLED AGENT PILOT DECISION PACKAGE` | Complete go/no-go record; no activation by default | All prior gates |

## 9. Success measures

### Product and usability

- at least 80% of invited participants complete their primary lifecycle without
  operator database intervention;
- median time to identify the next required action is under one minute during
  moderated pilot testing;
- fewer than 10% of support requests concern internal IDs, hash meaning, or
  lifecycle-state interpretation;
- every denied or blocked action has a plain-language explanation and canonical
  reason code.

### Protocol and reliability

- 100% of economic mutations are idempotent, ledger-balanced, event-linked, and
  reconciled;
- 100% of required Evidence anchors resolve to the exact payload and finality
  state;
- zero cross-Tenant or unauthorized Credit Passport disclosures;
- zero unexplained obligation, ledger, venue, or Evidence divergence.

### Credit and risk

- report repayment, DPD, cure, loss, utilization, and concentration without
  silently excluding adverse cases;
- deterministic policy and challenger predictions are both preserved
  point-in-time;
- no shadow recommendation changes active authority;
- every Facility has an explicit loss owner and stop rule before real value.

### Commercial validation

- at least one Capital Partner can independently author terms using the
  permissioned packet;
- at least three Agent operators can integrate without bespoke protocol changes;
- at least one purpose-bound provider/venue use case completes the testnet
  lifecycle;
- pricing discussions identify who pays and for which verified service before
  production activation.

## 10. Founder review decisions

The following decisions should be reviewed now because they shape Stage 1 and
Stage 2 but do not activate funds.

| Decision | Recommended default | Alternatives |
| --- | --- | --- |
| Core category | Verifiable credit marketplace and obligation infrastructure | Agent lending protocol; credit bureau; lender |
| First Capital Partner function | Direct bilateral Offer author | Pooled allocator; passive LP; platform-authored Offer |
| First production-limited borrower | Agent plus accountable Principal | Human borrower; mixed cohort |
| First use of proceeds | Purpose-bound provider/venue Facility | Unrestricted wallet credit |
| Credit Passport | Factor and outcome record with optional summary category | One universal 300-850 score |
| Decision authority | Capital Partner policy plus hard IPO.ONE controls | Platform model sets all terms |
| Learning mode | Shadow challenger with versioned human promotion | Online self-authorizing model |
| First hosted pilot | Synthetic/no-funds, invite-only, three-sided | Public self-service; immediate real value |
| First economic proof | Base Sepolia bilateral lifecycle, then Hyperliquid Testnet | Mainnet; multiple venues at once |
| Capital expansion | Named private pilot capital after approval | Public LP/vault |

## 11. Recommended approval boundary

If the Founder agrees with the overall direction, approve only:

1. Stage 0 truth baseline;
2. detailed design and issue drafting for Stage 1;
3. architecture and product specification for the synthetic Stage 2 Capital
   Partner workflow.

Do not yet approve hosted deployment, new credentials, testnet contracts or
signers, real capital, pricing, KYC vendors, custody, or real-value activation.

This keeps the next work concrete and reversible while producing the missing
commercial proof: a Capital Partner can review verified evidence, author exact
terms, receive Human/Agent acceptance, and observe the resulting obligation and
repayment outcome through IPO.ONE.
