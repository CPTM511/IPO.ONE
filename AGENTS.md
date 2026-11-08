# IPO.ONE Project Guidance

## Current authority and task scope

Use this checkout's `docs/PRODUCT_CONSTITUTION.md` for product purpose, enduring
invariants, authority and completion principles. Use
`docs/governance/CURRENT_AUTHORIZATION_REGISTER.md` for stable requirement IDs,
current profiles, financial restrictions and retained decision references.
Do not import another checkout's permissions or infer activation from code.

For implementation and user-facing work, apply relevant sections of
`docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.1.md`
and the accepted ADRs, security invariants, contracts and acceptance criteria
needed by the task. `docs/guidance/CODEX_GUIDANCE_INDEX.md` routes by topic.
Read relevant sources once and reuse them until their version or evidence changes.
Historical build plans and audits do not force current work to restart foundations.

Explicit current Founder instructions govern their stated scope. Keep material
product/risk/permission decisions in their owning versioned source before the
affected operation or release. An existing valid scoped grant remains authority;
do not ask again merely because a task resumes. Never broaden its target,
budget, data, validity or effects, revive expiry, reuse a one-use grant, or turn
local approval into deployment approval.

Use `.agents/skills/ipo-one-guidance-gate/SKILL.md` when phase/authority routing
is needed. Keep detailed product knowledge in canonical project documents.

## Product and implementation invariants

- Agent-first commercial entry; Human and Agent remain first-class interfaces
  over one shared obligation, Ledger, risk, Event, Evidence, servicing and
  reconciliation kernel. Profiles and adapters cannot fork economic truth.
- Preserve `Identity + Payment + Obligation`, accountable Principals, current
  Consent/Mandate, exact accepted terms and independently enforced server policy.
- Agents may invoke authorized versioned operations. Model output cannot create
  permission, make the active credit decision, expand limits or bypass checks.
- Private state is authenticated, Tenant/object-authorized and durable. Browser
  state, fixtures and static catalogs are not canonical product truth.
- Keep sensitive data, keys, credentials and full private histories off public
  or onchain surfaces. Preserve least privilege and governed privileged roles.
- Preserve exact server-resolved intents, atomic persistence, idempotency,
  reconciliation, bounded risk, pause/freeze and protected recovery.
- Distinguish chain digest, transaction, observation, finality and reconciliation.
  Never reclassify synthetic or historical records as current user transactions.
- Current no-real-funds, exact testnet, M2/M3, Provider, signer, custody and L4/L5
  constraints remain in the authorization register and executable launch policy.
  This guidance does not activate a profile or authorize spend/deployment.

## Proportionate work and permission

Continue from the current task and existing implementation. Each task needs a
clear scope, delivery target, acceptance and evidence; reuse an adequate user
request/issue rather than duplicating a template. For material architecture,
data, financial, permission or production changes, record relevant security,
negative/recovery tests, migration, rollback and authority in a versioned issue.
Routine reversible work can use a concise task/result record.

Complete necessary authorized fixes and dependent changes. Review tasks can
finish with findings; a repair task needs its fix and verification at the agreed
target. Record unrelated defects/opportunities without silently extending the
task into new features, deployment or continuous background work.

New/expanded contracts, funds/custody/signing, risk/pricing, permissions,
privacy/KYC, external credentials, material dependency/service trust boundaries,
recurring spend and operations outside an approved deployment/execution envelope
require applicable named human review. Reuse valid authority for work already
inside such an envelope and meet every condition before execution.

## Truthful completion and product usability

Match the verdict to the agreed document/local/test/deployed target using
Constitution section 5. A local or document target does not require deployment.
An agreed deployed target cannot be marked complete with only local evidence.
If required verification for the target is unavailable, report
`BLOCKED — NOT COMPLETE`; if acceptance demonstrably fails, report
`FAIL — NOT COMPLETE`.

For deployed user-facing acceptance, establish CODE, RUNTIME, DEPLOYED,
REACHABLE and VERIFIED against the actual deployed source/configuration:

- Human actions use visible, understandable controls; internal functions,
  hidden DOM, raw-ID entry and developer tools do not count as the journey.
- Agent actions use equivalent authorized versioned API/MCP semantics and
  queryable receipts. Supported role/journey scope must be explicit.
- Every role-allowed view has a visible entry. Advanced grouping cannot orphan
  a capability; relevant disabled features explain the reason and recovery.
- Navigation labels such as View, Open, Continue and Next do not conceal a
  mutation. Protected actions disclose the relevant effect and terms.
- Final acceptance uses deployed services and durable persistence, with visible
  Human clicks and affected Agent checks. Critical state survives applicable
  refresh, re-login, restart/replay, duplicates and database recovery.
- Merges, Vercel Ready, screenshots, local tests and historical testnet records
  alone do not prove production usability.

Select validation for affected behavior and mandatory gates. Reuse valid checks
when dependencies are unchanged; do not weaken checks to obtain a PASS. Do not
replace an unmet product target with a lower implementation checkpoint.

## Experience handoff and UI baseline

For runtime product iterations, provide a clickable experience URL. Keep the
authorized local runtime available through the requested Founder review; use
the hosted URL after an authorized deployment. Documents and static artifacts
do not require a fabricated runtime URL or deployment.

For all user-facing development, follow
`docs/guidance/IPO_ONE_CURRENT_UI_BASELINE.md` and run `pnpm check:ui-baseline`.
Use WEB-027 Precision Terminal and subsequent approved fixes. Do not build on
old UI branches. Verify actual served assets and affected screens, including
access dialogs, saved themes and narrow viewports, at the requested target.
