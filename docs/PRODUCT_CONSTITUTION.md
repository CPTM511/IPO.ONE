# IPO.ONE Product Constitution

Version: v2.0

Effective date: 2026-11-07 (Asia/Shanghai)

Status: Founder-approved governance revision

Decision owner: IPO.ONE Founder / Product / Governance

Supersedes: v1.7 according to section 9; historical decisions and operational
permissions are preserved except for the explicit governance changes below.

## 1. Product purpose and direction

IPO.ONE is the credit and obligation protocol layer for the Agentic Economy.
Its economic thesis is **Performance → Evidence → Credit → Capital**: attributable
performance can inform context-specific underwriting and future access to
capital. This is a product thesis, not evidence of demand, funding or returns.
The product primitive remains `Identity + Payment + Obligation`.

Commercial entry is Agent-first. Human and Agent remain first-class interfaces
over one shared kernel. Human/Principal authorization, oversight and the approved
Human lifecycle must be operable; shared protocol parity does not require every
new profile or experiment to ship every role surface in the same iteration.
Each release states the roles and journeys it supports. An already committed
Human journey cannot be silently removed or relabelled as a future promise.

Trading Capital and Metered Machine-Service Credit are reference Facility
profiles. Neither defines the whole protocol or warrants a separate kernel.
The strategic source is [Whitepaper Founding Edition III](WHITEPAPER.md).
Its horizon examples do not activate a product or financial permission.

## 2. Authority and document responsibilities

This Constitution governs enduring product principles, authority, and conflict
resolution. It delegates changeable capability and phase details to the
[Current Authorization Register](governance/CURRENT_AUTHORIZATION_REGISTER.md).
Read the sources relevant to the task; old build plans are not a mandatory
reading sequence or a reason to restart completed foundations.

| Source | Governs |
| --- | --- |
| This Constitution | Product purpose, kernel invariants, decision ownership, authorization and truthful acceptance principles |
| Current Authorization Register | Stable requirement IDs, exact approved/gated profiles, current financial boundaries and links to decisions |
| Accepted ADRs and security invariants | Architecture, threat controls and exact accepted semantics; they do not grant activation by themselves |
| Product Charter v1.1 and approved product measures | Retained product/lifecycle detail where not explicitly superseded here or in the register |
| Product Engineering and Experience Standard v1.1 and current UI baseline | Implementation, usability, risk-proportionate verification and handoff |
| Protocol contracts and executable launch/approval policy | Machine-enforced constraints and release gates; policy must implement approved authority and cannot expand it |
| Task/issue records and dated acceptance Evidence | Authorized work scope, delivery target, results, unresolved risks and exact verification boundary |

Explicit current Founder instructions govern their stated task scope. Record
material product, risk or permission decisions in their owning versioned source
before the affected operation or release. Existing explicit grants remain valid
within their exact scope and conditions; they do not need repeated confirmation.
Ambiguous statements, inferred enthusiasm, file names, draft roadmaps, tests and
implementation presence cannot create authority.

A later approved decision supersedes an earlier one only to its stated extent.
Resolve meaningful conflicts with a named decision; keep unaffected work moving.
Fail closed at the affected authority or risk boundary, without treating every
unrelated read, diagnosis or safe repair as prohibited.

## 3. Enduring product and safety invariants

1. **One kernel.** Human and Agent share Subject, Principal/authority, Intent,
   Decision, Offer, Obligation, Facility, Ledger, servicing, Event, Evidence,
   Credit State, risk and reconciliation. Adapters and profiles cannot create
   parallel economic truth.
2. **Accountability and exact terms.** Every economic action has an accountable
   Principal and current Consent/Mandate. Capital Partners own bilateral Offer
   economics. Execution must bind accepted terms and current authority; history,
   recommendations and administrative convenience cannot silently increase a
   limit or broaden purpose, duration, target or disclosure.
3. **Independent authorization.** Agents may propose and invoke versioned
   operations. The authenticated server independently validates identity,
   Mandate, accepted terms, deterministic policy, caps and current state before
   execution. Probabilistic model output cannot create authority, approve or
   reject active credit, bypass controls, or promote its own policy/model.
4. **Accounting integrity.** One canonical double-entry Ledger, explicit state
   machines, atomic state/Event/Evidence/outbox persistence, idempotency and
   reconciliation preserve economic truth. An external success response or
   balance is not a canonical settlement receipt.
5. **Bounded risk and recovery.** Stale, unknown, unauthorized, revoked,
   ambiguous or unreconciled state cannot authorize new exposure or unsafe
   release. Preserve authorized observation, repayment and remediation paths
   where their own checks pass. Caps, pause/freeze, incident ownership and
   protected recovery remain explicit and enforceable.
6. **Privacy and least privilege.** Tenant/object authorization is enforced at
   the server. Raw KYC/PII, keys, credentials, raw signatures, private policy and
   full sensitive histories stay off public/onchain surfaces. Encrypted offchain
   references and scoped attestations/disclosures are the default. Ordinary
   self-service cannot grant privileged roles.
7. **Portable, attributable evidence.** Preserve source, time, version,
   finality, corrections, revocation and reconciliation. Distinguish a digest,
   transaction, observation and finalized economic outcome. Credit State may
   inform a new explainable Offer; it is not universal lending authority.
8. **Adapter boundaries.** Identity, wallets, chains, payments, Providers,
   venues and capital facilities remain replaceable adapters using CAIP-2,
   CAIP-10 and chain-agnostic obligation IDs as applicable. Multi-chain readiness
   does not require simultaneous deployment on every chain.
9. **No hidden financial authority.** Custody, signing, capital provision,
   withdrawal, release and loss responsibility are distinct and explicit.
   Governed LP withdrawal of a valid claim differs from arbitrary borrower or
   Agent withdrawal. Exact allowed behavior belongs to the authorized profile.
10. **Usable and truthful interfaces.** Normal Human journeys use visible,
    understandable controls without internal-ID/hash entry. Agent operations
    expose equivalent authorized protocol semantics and queryable receipts.
    Browser state, fixtures and static catalogs never replace server truth.
    Navigation cannot hide mutations or orphan a role-allowed capability.

Accepted CreditLine, Lockbox, exact-intent/Gateway persistence, delegated venue
and pool/kernel ownership decisions remain binding through the register's
[decision references](governance/CURRENT_AUTHORIZATION_REGISTER.md#7-retained-decisions-and-historical-status).
No principle here activates a currently gated profile.

## 4. Authorization proportional to effect

Research, documentation, read-only diagnosis and necessary reversible work
inside an authorized task may proceed autonomously. Use the existing issue or
concise task record; do not create duplicate approval paperwork for routine work.

A valid scoped grant may cover repeated implementation, verification, deployment
or rollback only when those operations are actually included. Check target,
allowed effects, environment, budget, data, expiry/revocation and release
conditions. Keep one-use grants one-use; keep exact-run grants exact-run.
A conditional release approval is reusable evidence of authority, not a waiver
of the conditions. Do not reinterpret a task's local authorization as hosting.

Named human review remains necessary for new or expanded financial authority,
capital/loss responsibility, contracts, custody/signers, external credentials,
privacy/data-flow boundaries, authorization, risk/pricing policy, new recurring
cost/service commitments, and activation outside an existing approved deployment
or execution envelope. Routine implementation and library maintenance within
approved cost, license, dependency and data-flow boundaries do not inherently
require a fresh approval. The engineering standard defines the impact tiers.

Current exact operating permissions and prohibitions reside in the register and
executable policy. This revision does not activate real funds, mainnet economic
execution, an external Provider, a new test profile or a new privileged identity.

## 5. Delivery targets and truthful completion

Agree the intended outcome: document/decision review, local implementation,
test-environment acceptance, or deployed user acceptance. Complete all required
work for that target. Do not lower an agreed target to avoid a failing check.

Report approval, code, runtime, deployment, reachability, verification and
real-value activation separately. CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED remain
the evidence dimensions for a deployed feature; they are not a demand to deploy
a document, research result or deliberately local prototype.

A deployed user-facing capability requires exact source/configuration binding,
visible Human journeys and equivalent authorized Agent checks using deployed
services and durable persistence. Critical refresh, re-login, restart/replay,
negative authorization and recovery checks apply to the affected behavior.
Vercel Ready, a merge, historical transactions or passing local tests alone
cannot establish deployed usability.

Use `PASS — DOCUMENT REVIEWED`, `PASS — LOCAL VERIFIED`,
`PASS — TEST ENVIRONMENT VERIFIED`, or `PASS — DEPLOYED AND USER-VERIFIED`
only for the corresponding agreed target with its required evidence.
If a required part of that target cannot be verified, use
`BLOCKED — NOT COMPLETE`; demonstrated unmet acceptance is `FAIL — NOT COMPLETE`.
Name any narrower completed stage without presenting it as product completion.

A repair task includes the smallest correct fix, appropriate regression
protection and verification at its requested delivery target. A review task may
finish with findings. Newly discovered unrelated defects enter the task/backlog
with impact and ownership; they do not automatically authorize deployment or
unbounded expansion. Release-blocking defects in the agreed scope must be fixed
and retested before release.

## 6. User value and commercial evidence

Each development phase or proposed external experiment identifies:

- the primary user, accountable Principal and concrete job;
- the useful end-to-end outcome and selected Facility/profile, if any;
- who supplies resources/capital, pays, bears losses and operates support;
- the smallest decisive validation, acceptance evidence and stopping condition;
- cost, recurring support burden and material dependencies/unknowns.

Distinguish observed facts, counterparty claims, assumptions and unknowns.
Keep product usability, observed repeat use, payment/renewal, unit economics and
capital commitment as separate evidence. Tests, market activity, simulated
returns and available budgets establish none of those commercial outcomes.
Do not manufacture targets or measured results where none exist.

Select a narrow commercial entry without turning every horizon example into
an active product. Experiments, outreach, publication, spend and data collection
remain subject to their applicable authorization; this section grants none.

## 7. Maintainable governance

Keep one owning source for each decision. The Constitution holds enduring
principles; the register holds current scope; accepted ADRs/contracts and
operating policy hold implementation and activation detail. Date readiness and
incident records rather than freezing current implementation verdicts here.
Old evidence remains useful within its unchanged tested boundary, not as proof
of present availability.

Keep stable requirement IDs. A changed meaning needs an explicit crosswalk;
never silently recycle IDs. A new version names its owner, effective date,
supersession, authority impact and migration. Preserve history, current user
changes and recoverability. Do not rewrite old evidence hashes/classifications
merely to make a current gate pass.

## 8. Current operating boundary

The product remains under the existing no-real-funds and separately bounded
live-testnet authorizations in the register. Production hosting of a no-funds
Beta is distinct from production real-value finance. No current deployment,
readiness, customer payment or capital acceptance is certified by this revision.

L4 controlled real value remains disabled; L5 production real-value operation
remains unapproved. Changing either requires an explicit Founder decision and
Constitution revision with the complete applicable legal, capital, custody,
risk, security, loss, servicing and operational decision package.

## 9. v1.7 to v2.0 supersession and provenance

Founder agreement on 2026-11-07 ratifies this governance revision through
[GOVERNANCE-002](codex/tasks/GOVERNANCE_002_CONSTITUTION_V2.md).
The exact incoming v1.7 is preserved in the
[v1.7 archive](governance/history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md).

| v1.7 material | v2.0 disposition |
| --- | --- |
| Sections 1–2 purpose/hierarchy | Replaced by sections 1–2 here; explicit Founder grants govern their task scope and are durably recorded |
| Section 3 invariants | Enduring protections retained and consolidated in section 3; stage/profile constants moved to the register |
| Sections 4–6 modes, statuses, registry and FR crosswalk | Moved to the register without dropping or reusing any of the 56 requirement IDs |
| Section 7 named semantic decisions | Incorporated through the register and exact archive references; current scoped profile restrictions retained |
| Section 8 non-goals/review gates | Current prohibitions retained in the register; section 4 replaces repeated-approval interpretation with valid scoped grants |
| Section 9 issue/evidence discipline | Sections 4–7 and engineering standard v1.1 replace uniform paperwork and deployment-only completion with impact/target-specific requirements |
| Section 10 audit/readiness disposition | Retained as dated history in the archive; it does not certify or block an unrelated current task by itself |

The engineering standard's former ban on any AI state-changing invocation is
superseded by section 3.3: invoking an operation is distinct from creating
permission. Human review and server enforcement remain required at their
applicable boundaries. The historical L0 task sequence and initial navigation
examples no longer govern current sequencing or override the current UI baseline.

No launch-policy flags, profile addresses, approval artifacts, financial limits,
credentials, database state or deployment are changed by this revision.
