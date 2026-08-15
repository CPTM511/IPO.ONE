# IPO.ONE Product Engineering and Experience Standard v1.0

Version: v1.0  
Date: 2026-07-31  
Status: Founder-directed active subordinate development standard  
Applies to: L0 local integration and synthetic/no-real-funds product work  
Authority: Product Constitution v1.0, Product Charter v1.1, MVP Build Spec v0.1, Product Optimization Measure v1.0  

## 1. Purpose

This standard converts the approved product direction into mandatory,
testable engineering and product-experience rules.

The target product is:

> A concise, understandable and highly automated credit product in which the
> system prepares and verifies work, Human or Principal users make only
> necessary decisions, and every manual or automated action remains
> inspectable, explainable and auditable.

This standard is binding for new local no-funds implementation work. It does
not authorize cloud deployment, external credentials, production KYC, new
contracts or signers, risk-policy changes, custody, mainnet, real capital or
funds movement.

## 2. Normative language

- MUST and MUST NOT are release-blocking requirements.
- SHOULD and SHOULD NOT require a written exception in the active issue.
- MAY is optional and cannot override a MUST.
- A claim is accepted only when supported by current executable Evidence.

### 2.1 Adoption and baseline

This standard applies immediately to every behavior and boundary changed by an
active Issue. Existing product-wide gaps are not silently grandfathered and
MUST be recorded in the ordered program, but they do not make a narrowly
scoped integrity checkpoint impossible.

- A changed surface MUST satisfy every applicable MUST in this standard.
- An untouched known gap MUST NOT be worsened, hidden or reported as complete.
- A local candidate may be sealed only as an exact integrity checkpoint for
  the Issues it contains.
- RELEASE-001 MUST NOT claim full product-experience compliance, public-beta
  readiness, hosted readiness or a higher delivery level.
- Full compliance may be claimed only at a named milestone after every
  applicable product-wide gap is closed with current Evidence.

## 3. Product and protocol invariants

Every issue and implementation MUST preserve all of the following:

1. Human and Agent use one shared Obligation, Ledger, servicing, Event,
   Evidence and reconciliation kernel.
2. Human and Agent may have different authentication and presentation, but
   they MUST converge before deterministic policy and economic state changes.
3. Capital Partners own bilateral economic Offer decisions. IPO.ONE owns
   permission, integrity, versioning, servicing and Evidence.
4. Trading Capital is a purpose-bound Facility profile over the shared kernel,
   not a separate credit system.
5. Active credit policy remains deterministic and explainable. Any learning
   model remains versioned, shadow-only and non-authorizing.
6. Synthetic balances, test assets and no-funds operations MUST never be
   presented as real credit, real repayment or withdrawable value.
7. Raw KYC, PII, credentials, private keys, raw signatures and lender-private
   policy MUST remain outside public surfaces, logs, test artifacts and model
   prompts.
8. No arbitrary withdrawal, unrestricted external transfer, public LP/vault,
   token/DAO or black-box universal score may be introduced.
9. Every state-changing operation MUST be idempotent or explicitly
   non-retryable, reason-coded and evidenced.
10. Designed, implemented, locally verified, testnet verified, hosted and
    real-value active MUST be reported as separate states.

## 4. Product experience standard

### 4.1 The three-question rule

Every authenticated primary surface MUST answer:

1. What is my current state?
2. What is the one next action that needs me?
3. What just happened, and can I inspect the result?

A primary surface that cannot answer these questions is not complete.

### 4.2 Role home and navigation

The default information architecture SHOULD be:

| Role | Primary navigation |
| --- | --- |
| Human | Next / My Credit / Activity / Settings |
| Agent | Tasks / Mandate / Activity / Integration |
| Capital Partner | Inbox / Portfolio / Activity / Settings |
| Provider | Assignments / Activity / Settings |
| Risk and Operations | Queue / Alerts / Activity / Controls |

Rules:

- Each page MUST have no more than one visually dominant primary action.
- Role navigation SHOULD contain no more than four primary destinations.
- Unavailable or unbound product families MUST NOT occupy the main navigation.
- A single bound resource SHOULD open automatically.
- Multiple bound resources MUST use an authorization-filtered picker.
- Empty states MUST explain the safe next action and MUST NOT expose a raw
  technical form by default.

### 4.3 No hidden side effects

- Labels such as View, Open, Continue, Back and Next MUST NOT trigger an
  economic, authority or lifecycle mutation.
- A mutation label MUST name the object and effect, for example:
  Accept Offer and create Sandbox Obligation.
- Before a protected action, the confirmation MUST show the amount, asset,
  terms, target, authority, funds mode and resulting state that matter to the
  user.
- Internal resource IDs may appear only in an expandable technical receipt.
- Confirmation text MUST NOT require a normal user to understand or manually
  compare raw hashes.

### 4.4 Progressive disclosure

The default view MUST present:

- plain-language state;
- the exact economic or authority terms relevant to the decision;
- deterministic reasons;
- the next action; and
- a concise result.

The advanced view MAY present:

- resource IDs;
- operation names;
- schema and policy versions;
- request, correlation and idempotency IDs;
- record and Evidence hashes;
- chain, finality, indexer and reconciliation details.

Advanced details MUST remain available; they MUST NOT be deleted merely to
simplify the page.

### 4.5 Safe defaults

- A default MUST minimize irreversible effect and user loss.
- A scheduled repayment MUST default to the next unpaid installment.
- An adverse servicing repayment MUST default to the exact past-due cure
  amount.
- Full payoff MUST be a separate, explicit choice backed by a current payoff
  quote before it is introduced.
- Increasing limits, duration, purpose, Provider access or external authority
  MUST never be the default.
- A stale, unknown, denied or unreconciled state MUST default to no new risk.

### 4.6 Accessibility

Every changed primary flow MUST pass:

- complete keyboard operation;
- visible focus and correct focus return after dialogs;
- semantic labels and status announcements;
- 200 percent zoom without lost actions or horizontal task flow;
- readable contrast for text, metadata and status;
- reduced-motion behavior where motion exists; and
- no reliance on color alone.

Accessibility MUST be verified through behavior, not source inspection alone.

## 5. Automation and intelligence standard

### 5.1 Automation levels

| Level | Meaning | Default |
| --- | --- | --- |
| A0 Observe | Read authorized state without mutation | Automatic |
| A1 Prepare | Discover, prefill, validate and recommend | Automatic |
| A2 Durable internal work | Idempotent outbox, callback, Evidence, expiry and reconciliation | Automatic |
| A3 Mandate-bound work | Execute only inside exact active authority and limits | Automatic only when explicitly granted |
| A4 Protected decision | Consent, Mandate, Offer, repayment, freeze or dual-control disposition | Explicit Human or approved dual control |

### 5.2 Automation that SHOULD be default

- restore the authenticated workspace from server truth;
- discover Actor-bound resources and the next action;
- prefill known values and validate closed schemas;
- run deterministic evaluation after an authorized Credit Intent;
- route Passport, Intent, Offer and assignment summaries to bound recipients;
- refresh expiry, replacement, revocation and reconciliation state;
- run idempotent outbox, callback, Evidence indexing and materialization;
- classify failures, surface unknown outcomes and apply safe retry policy;
- generate alerts and hold new risk on hard-integrity failure; and
- verify report and Evidence hashes before download or presentation.

### 5.3 Automation that requires explicit authority

- creating, activating, changing, pausing or revoking Consent or Mandate;
- choosing a Credit Passport recipient and disclosure scope;
- authoring, replacing, withdrawing or accepting an Offer;
- Human execution and repayment;
- Agent Offer acceptance unless the exact active Mandate explicitly grants
  acceptance within the Offer economic bounds;
- freeze, restructure, repurchase, write-off, unfreeze or break-glass;
- increasing any limit, duration, purpose, Provider or target; and
- any external signature, real-value operation or production permission.

### 5.4 Prohibited intelligence

An AI or probabilistic model MUST NOT:

- approve or reject active credit;
- call a state-changing protocol operation directly;
- expand authority, limits, pricing or permitted targets;
- read raw KYC/PII or credentials;
- promote itself or change the active policy; or
- hide the deterministic reasons or source Evidence.

Advisory intelligence MUST remain optional. The product MUST remain fully
operable when it is disabled or unavailable.

## 6. Automation audit contract

Every automated stateful run MUST have a durable, queryable record or an
equivalent projection over canonical Event/Evidence and job state.

The record MUST include:

- trigger and job type;
- Human or service actor;
- Tenant and privacy-safe resource references;
- policy, Mandate, model and configuration version where applicable;
- observation time and input hashes;
- previous and new aggregate version;
- operation, request, correlation and idempotency identity;
- reason codes;
- Event, Evidence, outbox and external receipt references;
- scheduled, running, succeeded, failed, unknown or dead-letter state;
- retry count, next retry and lease ownership;
- finality and reconciliation state; and
- whether the run can be cancelled, compensated or requires review.

Presentation:

- Human users receive a plain-language Activity entry.
- Agents receive the same fact as a structured receipt.
- Risk and Operations may inspect the authorized technical detail.

An unknown external outcome MUST be reconciled before any retry that could
duplicate economic state.

## 7. Architecture and code-efficiency standard

### 7.1 Required architecture

Implementation MUST continue to use:

- role-specific Human Web and Agent API/SDK/MCP adapters;
- one versioned Tenant application protocol;
- one authenticated Tenant command/query gateway;
- one shared domain kernel;
- PostgreSQL canonical truth with RLS, Event/Evidence and outbox/inbox;
- one protected, lease-safe worker for local background work; and
- sandbox/testnet adapters behind explicit feature and permission gates.

### 7.2 Prohibited duplication

An implementation MUST NOT add:

- a second Human or Agent business kernel;
- a browser-owned canonical workflow receipt;
- a second Ledger, Event, Evidence or reconciliation truth;
- a new generic workflow engine when a derived next-action view is sufficient;
- a new queue or cache when PostgreSQL outbox and leases satisfy the current
  local requirement; or
- a new service, framework or production dependency without an approved ADR
  and active issue justification.

### 7.3 Frontend boundaries

- Browser state is a cache and presentation aid, never authorization or
  canonical product truth.
- New domain behavior MUST NOT be added directly to the existing app.js
  monolith when it can live in a focused feature or presentation module.
- A touched monolithic file SHOULD have non-positive net growth unless the
  active issue documents why growth is temporarily necessary.
- A new hand-written feature module SHOULD remain below 500 lines. A larger
  module requires a split rationale in the issue.
- Rendering, network transport, domain presentation and receipt verification
  SHOULD remain separate.
- Business validation MUST be shared through the protocol/domain layer rather
  than copied into each role UI.

### 7.4 Dependency and infrastructure discipline

- No new production dependency may be added without human approval.
- Native platform and existing repository capabilities SHOULD be preferred.
- Redis, Kafka, Kubernetes, a data warehouse, a second database and
  microservices are outside L0 unless current Evidence proves a need.
- Generated files, vendored bundles and lockfiles MUST be reproducible and
  separately identified.
- A refactor MUST preserve behavior through tests before it changes behavior.

## 8. Security and privacy standard

Every request path MUST preserve:

1. closed protocol parsing and validation before trusted processing;
2. authentication from the server boundary, not caller-supplied context;
3. object and capability authorization;
4. Tenant and Actor binding;
5. admission, rate and resource bounds;
6. current version, expiry, revocation and state checks;
7. idempotency and concurrency control;
8. atomic state, Event, Evidence and outbox persistence;
9. non-enumerating denial; and
10. redacted errors and logs.

Additional rules:

- A deep link is a locator, not bearer authority.
- An Inbox returns only Actor-bound locator and minimal summary data.
- Detail reads and commands MUST re-run domain authorization.
- Protective automation may hold or reduce new risk; it MUST NOT gain inverse
  authority to unfreeze, increase limits or rewrite economic outcomes.
- Configuration or checked-in control text MUST NOT be displayed as live
  operational success.

## 9. Testing and release evidence

### 9.1 Required test layers

Each issue MUST select the relevant layers and explain any omission:

- pure unit and presentation tests;
- protocol/schema conformance;
- authorization and security tests;
- PostgreSQL/RLS integration;
- idempotency, concurrency and restart/replay;
- Worker lease, retry, unknown and dead-letter behavior;
- real-browser happy, rejection and recovery paths;
- keyboard, focus, zoom and responsive verification; and
- full repository/release gates when preparing a candidate.

Source assertions and screenshots alone MUST NOT be used to claim that a
business flow works.

### 9.2 User-facing acceptance

A browser feature is complete only when:

- a user can discover it without a copied internal ID;
- the enabled control calls the real authenticated operation;
- pending, success, rejected, failed and unknown states are understandable;
- refresh, re-login and restart restore the correct next action;
- the resulting Event/Evidence is queryable; and
- critical error and accessibility paths pass.

### 9.3 Release claims

- A dirty worktree is not a sealed release candidate.
- Release evidence MUST bind the exact commit, migrations, contracts,
  configuration and test results.
- A manifest MUST NOT be updated merely to silence drift.
- A candidate with a failing security or integrity gate is NO-GO.

## 10. Mandatory issue contract

No implementation may start without an active versioned issue document under
docs/codex/tasks.

Every issue MUST contain:

- Context and current baseline;
- Scope;
- Non-goals;
- likely files;
- Given/When/Then acceptance criteria;
- exact test commands;
- security checklist;
- permission boundary;
- data and migration impact;
- rollback plan;
- required Evidence;
- dependency and sequencing notes; and
- status with completion evidence.

An issue MUST be rejected as not ready if it:

- combines unrelated product, protocol and deployment work;
- cannot state what is intentionally unchanged;
- introduces a new dependency without approval;
- lacks a negative or fail-closed acceptance path; or
- requires permission not granted by the active issue.

## 11. Definition of Ready

Before editing code:

- current guidance and AGENTS.md have been checked;
- the exact branch and material drift are recorded;
- the issue contract is complete;
- permission-expanding work has named human review;
- likely files and overlap with existing work are known;
- the smallest complete vertical slice is selected; and
- tests can fail before implementation or otherwise prove the defect.

## 12. Definition of Done

An issue is done only when:

- all acceptance criteria pass;
- changed behavior has positive, negative and recovery coverage;
- no protocol or authorization semantics changed unintentionally;
- state changes have Event/Evidence and idempotency where applicable;
- real-browser verification exists for user-facing behavior;
- accessibility checks for the changed path pass;
- no raw PII, secrets or credentials were introduced;
- relevant targeted and aggregate tests pass;
- git diff --check passes;
- documentation and current user copy match behavior;
- remaining risks and separate approval gates are recorded; and
- the issue document contains completion Evidence.

## 13. Review and permission gates

The following always require a separately named human review before
implementation or activation:

- contracts or contract deployment;
- funds movement, custody or external signing;
- risk limits, pricing, policy promotion or adverse disposition authority;
- authentication, authorization or permission expansion;
- privacy, retention, KYC/KYB/KYP or raw sensitive data;
- production dependencies, infrastructure or deployment;
- mainnet or a new chain/venue execution profile; and
- real-value capital, legal role or operating responsibility.

Documentation, read-only diagnosis, presentation-only copy, safe defaults that
do not change accounting, and tests may proceed inside a scoped issue.

## 14. Ordered development program

Work MUST proceed in this order unless the exception process in Section 15 is
used:

| Order | Issue | Outcome |
| ---: | --- | --- |
| 1 | GATE-001 | Restore the request-validation security invariant and record candidate truth |
| 2 | UX-SAFE-001 | Make Agent workspace navigation mutation-free |
| 3 | UX-SAFE-002 | Use the next payable installment as the safe repayment default |
| 4 | TRUST-002 | Make the latest authorized Evidence immediately visible |
| 5 | RELEASE-001 | Seal the exact accepted P0 slice as a local integrity checkpoint only |
| 6 | AUTHORITY-001 | Add visible pause/revoke only after permission review |
| 7 | WORKSPACE-001 | Durable Role Home, My Work and server-derived next action |
| 8 | WEB-024 | Feature-slice the product shell without framework replacement |
| 9 | TRUST-001 | Unified Activity and receipt inspection |
| 10 | MARKET-002 | Guided Passport, Partner Offer and borrower handoff |
| 11 | OPS-006 | Queryable, lease-safe local automation runtime |
| 12 | RISK-004 | Guided servicing, alert and dual-control queue |
| 13 | POLICY-002 | Consolidate active and shadow policy boundaries |
| 14 | ASSIST-001 | Optional permissioned advisory intelligence |

Only the active issue may change code. Later issues may be documented, but MUST
NOT be partially implemented opportunistically.

## 15. Exception and change control

An exception MUST:

- name the exact rule;
- explain why compliance is impossible or harmful;
- identify added risk and compensating controls;
- state an expiry or removal issue;
- receive the same review required by the affected boundary; and
- be recorded in the active issue and an ADR when architectural.

Convenience, schedule pressure and existing technical debt are not sufficient
reasons for an exception.

Changes to this standard require a new version. Historical versions remain
unchanged.

## 16. Initial measurable acceptance targets

- Zero manual internal ID/hash/version entry in normal role journeys.
- One primary action per primary surface.
- No more than four primary destinations per role.
- Human no-funds lifecycle requires no more than five deliberate decisions.
- Principal Agent authorization requires no more than three deliberate
  decisions.
- An active, exact Agent Mandate can start an in-scope workflow with one
  goal-level invocation and visible step receipts.
- Every mutation and automated run is queryable through Activity.
- Storage clear, new tab, re-login and local restart restore the same next
  action without duplicate state.
- Unknown outcomes and integrity discrepancies block new risk.
- Human Web and Agent interfaces report the same canonical lifecycle facts.

## 17. Decision record

Approved by the Founder direction on 2026-07-31:

- make simplicity, clarity, usability, automation and auditability mandatory;
- preserve safety, shared-kernel and no-funds constraints;
- prefer the smallest architecture and code path that satisfies current gates;
- begin ordered issue-based development after this standard is checked in.

Still separately gated:

- permission and risk-control changes;
- deployment or remote access;
- external credentials, signers, contracts or providers;
- KYC/privacy boundary changes;
- testnet writes beyond existing approved runbooks; and
- any real-value operation.
