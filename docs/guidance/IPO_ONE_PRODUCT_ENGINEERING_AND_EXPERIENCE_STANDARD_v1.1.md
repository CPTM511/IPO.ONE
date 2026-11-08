# IPO.ONE Product Engineering and Experience Standard v1.1

Version: v1.1
Date: 2026-11-07 (Asia/Shanghai)
Status: Founder-approved subordinate implementation and acceptance standard
Applies to: changed product behavior at its explicitly authorized delivery target
Authority: Product Constitution v2.0 and Current Authorization Register
Supersedes: v1.0 for current work; the original v1.0 remains unchanged as history.

## 1. Purpose

This standard converts the approved product direction into mandatory,
testable engineering and product-experience rules.

The target product is:

> A concise, understandable and highly automated credit product in which the
> system prepares and verifies work, Human or Principal users make only
> necessary decisions, and every manual or automated action remains
> inspectable, explainable and auditable.

This standard governs how authorized work is implemented and verified. The
[Constitution](../PRODUCT_CONSTITUTION.md) and
[Current Authorization Register](../governance/CURRENT_AUTHORIZATION_REGISTER.md)
govern permission and current profiles. This standard does not activate a
profile, spend, deploy, provision a credential or authorize financial operations.

## 2. Normative language

- MUST and MUST NOT are acceptance requirements where applicable to the changed
  behavior and agreed delivery target. Release requirements apply to releases.
- SHOULD and SHOULD NOT permit a concise, reasoned implementation choice in the
  task; they do not create a new approval gate by themselves.
- MAY is optional and cannot override a MUST or permission boundary.
- A claim is accepted only at the boundary supported by its actual evidence.

### 2.1 Adoption and baseline

Changed behavior MUST satisfy applicable controls. Untouched known gaps MUST
NOT be worsened, hidden or reported as complete. Record material discovered
risks with affected scope and ownership; an unrelated defect does not turn a
review or local task into an open-ended product repair/release.

Select a complete useful slice and its target: document review, local
verification, test-environment acceptance or deployed user acceptance. Reuse
valid evidence when relevant code, configuration and dependencies are unchanged.
A narrow checkpoint cannot claim full-product readiness. Existing agreed
release gates cannot be downgraded or bypassed to obtain a PASS.

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
5. Active credit policy remains deterministic, versioned and explainable.
   Learning remains shadow-only and non-authorizing under the current register.
   Agent operation requests MUST be independently authorized by the server.
6. Synthetic balances, test assets and no-funds operations MUST never be
   presented as real credit, real repayment or withdrawable value.
7. Raw KYC, PII, credentials, private keys, raw signatures and lender-private
   policy MUST remain outside public surfaces, logs, test artifacts and model
   prompts.
8. No arbitrary withdrawal, unrestricted external transfer, public real-value
   LP/vault, token/DAO or black-box universal score may be introduced. Exact
   authorized test-asset pool behavior follows the current register and policy.
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

Follow the [current UI baseline](IPO_ONE_CURRENT_UI_BASELINE.md) and its approved
route/capability matrix. The navigation examples and four-destination target in
v1.0 are historical design guidance; they do not override the current baseline.

- Each primary surface SHOULD have one visually dominant next action.
- Navigation MUST reflect the authenticated role and server-authorized state.
- Every role-allowed capability MUST have a visible reachable entry point;
  advanced grouping MUST NOT orphan a view.
- Relevant disabled/unconfigured capabilities MUST explain the reason and
  recovery condition. Do not claim them live or silently remove an expected path.
- A single bound resource SHOULD open automatically where it avoids an extra
  decision; multiple resources use an authorization-filtered picker.
- Empty states MUST explain the safe next action without raw internal-ID forms.
- Agent-first sequencing MUST explicitly identify supported roles/journeys and
  preserve the shared protocol and already committed Human lifecycle.

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
| A4 Protected decision | Consent, Mandate, Offer, repayment, freeze or dual-control disposition | Explicit applicable authority; required independent Human/MFA/dual control cannot be bypassed |

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

A valid existing grant may satisfy the required authority. Do not ask again
merely because a task resumes. An action delegated under an exact active
Mandate remains subject to every server policy check. Required independent
approvers, MFA, one-use limits and non-delegable decisions remain mandatory.

- creating, activating, changing, pausing or revoking Consent or Mandate;
- choosing a Credit Passport recipient and disclosure scope;
- authoring, replacing, withdrawing or accepting an Offer;
- Human execution and repayment;
- Agent Offer acceptance unless the exact active Mandate explicitly grants
  acceptance within the Offer economic bounds;
- freeze, restructure, repurchase, write-off, unfreeze or break-glass;
- increasing any limit, duration, purpose, Provider or target; and
- any external signature, real-value operation or production permission.

### 5.4 Intelligence and execution boundary

An Agent or model MAY prepare and invoke an authorized versioned API/MCP
operation. Invocation supplies a request, never trusted identity, permission or
economic truth. The server MUST authenticate, authorize and validate the exact
terms, current Mandate, caps, state, idempotency and reconciliation before a
mutation. Calling an operation and deciding its authority are distinct.

An AI or probabilistic model MUST NOT:

- approve or reject active credit on the authority of model output;
- bypass the command gateway or independent deterministic policy checks;
- expand authority, limits, pricing or permitted targets;
- read raw KYC/PII or credentials;
- promote itself or change the active policy; or
- hide deterministic reasons or source Evidence.

No model-generated target, calldata, expected effect, invoice or usage count may
replace an exact server-resolved intent or authenticated usage Evidence.
Advisory intelligence MUST remain optional, and core authorized product paths
MUST remain operable when it is disabled or unavailable.

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

Continue from the current accepted implementation:

- role-specific Human Web and Agent API/SDK/MCP adapters;
- one versioned Tenant application protocol and authenticated command gateway;
- one shared domain kernel and canonical persistence authority;
- RLS, atomic Event/Evidence and outbox/inbox persistence;
- lease-safe, idempotent workers where background work is required; and
- Provider/chain/venue adapters behind exact policy and permission boundaries.

The current PostgreSQL/Vercel/Neon composition and accepted identity model are
recorded in the authorization register and owning ADRs/deployment specifications.
Those remain the reviewed operating baseline. A future architecture change needs
the applicable ADR and authority review; the product principle does not freeze
a provider name permanently into the Constitution.

### 7.2 Prohibited duplication

An implementation MUST NOT add a parallel Human/Agent kernel, Ledger, Event,
Evidence or reconciliation truth, or a browser-owned canonical receipt.
Prefer existing capabilities. New services, frameworks, queues or caches need a
specific unmet requirement, a smallest sufficient design, and the applicable
cost, security, data-flow and architecture review. Extra abstraction or a new
workflow engine without a concrete need is not justified.

### 7.3 Frontend boundaries

- Browser state is a cache and presentation aid, never authorization or
  canonical product truth.
- New domain behavior MUST NOT be added directly to the existing app.js
  monolith when it can live in a focused feature or presentation module.
- Split by responsibility and testability when needed; file-line targets alone
  MUST NOT force unrelated refactoring or justify leaving a workflow incomplete.
- Keep transport, presentation and domain boundaries clear, with the smallest
  complete implementation appropriate to the affected behavior.
- Rendering, network transport, domain presentation and receipt verification
  SHOULD remain separate.
- Business validation MUST be shared through the protocol/domain layer rather
  than copied into each role UI.

### 7.4 Dependency and infrastructure discipline

- Prefer native platform and existing repository capabilities.
- Routine library maintenance inside approved license, supply-chain, cost,
  runtime and data-flow boundaries may proceed within the task's authority.
- A new trust boundary, service/billing commitment, datastore, identity provider,
  production infrastructure or materially different dependency risk requires
  applicable named human review before installation/activation at that boundary.
- Generated files, vendored bundles and lockfiles MUST be reproducible and
  separately identified.
- Refactors MUST preserve established behavior and receive appropriate checks;
  they are not a reason to expand an unrelated task.

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

### 9.1 Select checks for affected behavior

Select layers that address concrete affected behavior and required gates:

- unit/presentation and protocol/schema conformance;
- authentication, object/Tenant authorization and security;
- PostgreSQL/RLS, atomicity, concurrency and migration compatibility;
- idempotency, worker retry/unknown outcomes, restart and replay;
- real-browser happy, denial and recovery journeys;
- keyboard, focus, contrast, zoom and narrow viewports for changed UI; and
- full repository/release checks when the applicable release requires them.

A concise verification record is sufficient. Do not enumerate obviously
irrelevant layers or rerun unchanged checks without a dependency change,
failure or unresolved risk. Security/correctness gates applicable to the target
remain mandatory. No weakened assertion, fabricated time, mock substitution or
maturity relabelling may make an acceptance gate pass.

### 9.2 User-facing acceptance

At the requested local/test/deployed runtime, the changed journey MUST:

- be discoverable through visible controls without copied internal IDs;
- call the actual authorized operation for its explicitly stated mode;
- explain pending, success, rejected, failed and unknown states;
- recover critical state after applicable refresh, re-login and restart;
- expose queryable Event/Evidence for mutations; and
- pass affected error, accessibility and recovery checks.

For a deployed-acceptance target, bind CODE, RUNTIME, DEPLOYED, REACHABLE and
VERIFIED to the actual deployed source/configuration. Use visible Human clicks
and equivalent authenticated Agent checks with deployed services and durable
persistence. A passing source assertion, screenshot, mock or local flow alone
cannot prove this target. Deliberately local and prototype results MUST state
their boundary and MUST NOT be presented as deployed capability.

### 9.3 Release claims

- A dirty worktree is not a sealed release candidate.
- Release evidence MUST bind the exact commit, migrations, contracts,
  configuration and test results.
- A historical manifest MUST NOT be rebound to new content merely to silence
  drift. Pin historical evidence to its original source and separately validate
  compatibility with the current registry.
- A candidate with a failing applicable security/integrity gate is NO-GO.
- A document/local target does not require deployment; an agreed deployed target
  remains incomplete until its required deployed checks pass.

## 10. Task contract proportional to impact

Every task needs a clear goal, scope, delivery target and acceptance evidence.
Reuse the current user request, issue or versioned task record; do not duplicate
an adequate contract solely to satisfy a template. Link the source if needed.

For routine reversible documentation, presentation, diagnosis, tests or a
low-impact repair, a concise context/scope, verification and result is enough.
Use a versioned issue record when work changes architecture, durable data,
authority, financial behavior, production configuration or spans handoffs.
That record adds the relevant non-goals/files, negative/recovery acceptance,
security and permission boundary, migration/dependencies, rollback and evidence.
Mark truly inapplicable items briefly rather than manufacturing procedures.

A task is not ready when a material acceptance condition or required authority
is missing. Continue independent preparation; ask a focused question only for
the material ambiguity or missing grant. Do not split a necessary root-cause fix
from its dependent changes merely to keep an issue artificially small.

## 11. Definition of Ready

Before changing affected behavior:

- resolve relevant current guidance, implementation and task acceptance;
- protect existing work and identify actual file overlap;
- confirm the target environment and valid authority for its effects;
- select a complete useful slice and risk-appropriate checks; and
- record migration/rollback or architecture decisions where they apply.

Existing evidence may be reused at its valid boundary. No repeat reading,
new document, exhaustive baseline or approval ceremony is required when the
same information and authority remain current and sufficient.

## 12. Definition of Done

Complete the agreed delivery target and all its applicable acceptance criteria.
Verification must cover the affected positive, negative and recovery behavior,
with authorization, accounting, persistence, receipts and accessibility checks
where relevant. Documentation/user copy must match behavior, and the scoped
diff must pass whitespace checks. Record material limitations and unresolved
higher-stage work without claiming those stages complete.

Use the target-specific verdicts in Constitution section 5. Document review,
local verification and test-environment acceptance may pass independently when
those were the requested targets. Missing required evidence for the actual
target remains `BLOCKED — NOT COMPLETE`; a known acceptance failure remains
`FAIL — NOT COMPLETE`.

A requested repair includes its smallest correct fix, necessary regression
protection and retest at the agreed target. A review task can conclude with
findings. Newly found unrelated defects are recorded with impact and ownership;
they do not automatically authorize a release or endless scope expansion.
Required release blockers in the agreed scope cannot be deferred to claim PASS.
For runtime product handoff, provide the applicable clickable experience URL
and retain an authorized local runtime through the requested Founder review.

## 13. Review and permission gates

| Impact | Required handling |
| --- | --- |
| Routine reversible work inside the active scope | Proceed autonomously, verify affected behavior and record the result |
| Deployment, rollback or repeated operation explicitly included in an existing approved envelope | Reuse the valid grant; verify exact target, allowed effects, time/budget, current policy and required gates |
| New/expanded authority, financial exposure, contract, custody, signer or external credential | Named human review and explicit bounded approval before the affected action |
| Risk/pricing policy, adverse disposition, authentication/authorization or privacy/retention/KYC boundary changes | Named human review for the changed boundary; existing MFA/independent approvers remain required |
| New production service/dependency trust boundary, recurring spend, datastore, identity provider, mainnet or execution profile | Applicable architecture/security and owner approval before commitment or activation |

An existing grant remains usable only within its exact scope and validity.
Do not repeat a permission question solely because work resumes or uses another
tool. Conditional release is still conditional; one-use/exact-run grants cannot
be reused, and expired/revoked grants cannot be revived by a document edit.
If scope changes or authority is unclear, isolate that effect and continue
unaffected work. Never infer deployment from local approval, spending from
research approval, or financial authority from wallet/network access.
The current register and executable policy control exact operating permissions.

## 14. Development sequencing

Continue from the current approved task and implementation. Choose order by
real dependencies, current risks and the selected user outcome. The fixed
GATE-001 through ASSIST-001 sequence in v1.0 is historical and does not force
current work to repeat foundations or wait behind already superseded tasks.

Keep one coherent task scope; include necessary dependent fixes and regression
protection. Record additional opportunities without starting unrelated features,
future phases or background work automatically.

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

## 16. Usability invariants and measurable targets

Required outcomes include no normal internal-ID/hash/version entry, visible
role-allowed paths, understandable mutations, queryable automated receipts,
server-derived workspace recovery, bounded unknown outcomes, and Human/Agent
agreement on canonical lifecycle facts.

Measure unnecessary decisions, completion/recovery success and support burden
for the selected journey. v1.0's four-destination, five-Human-decision and
three-Principal-decision counts are initial benchmarks, not universal release
gates or permission to hide necessary decisions. The current UI baseline and
explicit task acceptance control the layout and required verification.
An exact active Agent Mandate should support goal-level invocation with
inspectable step receipts, subject to all server authorization checks.

## 17. Decision record and supersession

Founder agreement on 2026-11-07 approves this v1.1 revision alongside Constitution
v2.0 under [GOVERNANCE-002](../codex/tasks/GOVERNANCE_002_CONSTITUTION_V2.md).

The v1.0 source remains preserved. This version replaces its L0-only applicability,
blanket AI invocation ban, repeated-approval interpretation, uniform issue-file
paperwork, fixed task sequence/navigation targets and deployment-only completion
interpretation. It preserves applicable product, security, accounting, privacy,
exact-intent, automation-audit, accessibility and deployed-acceptance controls.
Current financial/profile constraints belong to the authorization register.

No runtime policy, financial permission, service, data boundary, credential,
contract, signer or deployment is activated by this standard.
