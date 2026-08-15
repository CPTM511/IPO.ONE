# UX-006 Gate 1.3a: Principal Agent resource recovery

Status: Complete locally

Date: 2026-08-12

Baseline commit: `65f999c0882ebd16486324509e0eb342a116cb19`

Branch: `codex/m1-b-deployable-sandbox`

Phase: Product Optimization Phase 1 / `L0_LOCAL_NO_FUNDS`

Requirements: `REQ-ID-002`, `REQ-ID-005`, `REQ-UX-005`

## Context

UX006-P1-004 confirms that the normal Principal Agent-authority journey asks a
user to type an Agent actor ID, Subject ID and Mandate ID, then click `Load exact
Mandate`. The authenticated `pilotReadWorkspaceResume` response already returns
the Principal's bounded controlled-Agent actor IDs and exact active Subject and
Mandate authorization references. The browser also already reauthorizes and
hydrates the selected Mandate and AccountBinding.

Gate 1.2 is complete locally. This is the next issue-sized UX-006 increment and
the sole owner of this presentation/recovery slice. WEB-020 and WEB-023 remain
sealed historical inputs; this issue changes neither their Principal boundary
nor their Agent proof and two-stage Mandate semantics. RELEASE-001 and M1-A.1
remain blocked umbrella/release work and do not own this increment.

## Scope

- Derive one fail-closed Principal Agent selection from exact authenticated
  workspace-resume server truth.
- For exactly one controlled Agent and at most one bound Subject/Mandate, keep
  the locators in internal transient state, automatically load the exact
  Mandate and AccountBinding, and expose only human-readable state and next
  actions.
- Remove normal-user actor/Subject/Mandate ID inputs and the manual `Load exact
  Mandate` control.
- Place identifiers and hashes behind an explicit Technical details disclosure.
- When no Agent is assigned, show a truthful non-interactive invitation/admin
  state. When more than one Agent/resource or an incomplete page is returned,
  fail closed and explain that an authorized picker is required; never choose
  the first resource or fall back to browser storage/hardcoded IDs.
- Keep create-Subject, account proof, Draft Mandate, exact activation and Agent
  workspace actions unchanged after the exact server selection is established.

## Non-goals

- No multi-Agent picker, Agent creation/invitation, actor binding change,
  resource enumeration, Risk locator, Capital Partner profile/Passport inbox,
  protocol/schema/database/migration change or new operation.
- No permission, role, capability, authentication, credential, Agent proof,
  Mandate scope, activation, credit, risk, execution, chain, signer, deployment
  or funds change.
- No browser storage, HTML meta, URL or fixture value may become canonical
  actor/Subject/Mandate truth.
- No redesign of the remaining Agent terminal handoff or broader role IA.
- The current resume response provides controlled Agent actors and
  Principal-controller resources as separately authorized sets. Browser
  mutations refresh that truth and existing Gateway authorization remains
  authoritative, but this slice does not add or claim an actor-to-resource
  association contract. Such a contract is future protocol/permission
  hardening, not implicit scope for this UX slice.

## Likely files

- `apps/web/src/principal-agent-workspace-selection.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/principal-agent-workspace-selection.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`
- this issue

## Acceptance criteria

- Exactly one controlled Agent with one Subject and zero/one Mandate restores
  automatically after refresh, new tab, re-login and local restart; the browser
  performs only the existing bounded resume/Mandate/AccountBinding reads.
- The normal Principal UI contains no editable or visible actor ID, Subject ID,
  Mandate ID, hash or version prerequisite and no `Load exact Mandate` button.
- Creating a Subject or Draft Mandate uses only the exact current server-derived
  actor/Subject selection; the response becomes the current transient locator
  and is rederived from server truth after refresh.
- Zero Agent, multiple Agents, multiple Subject/Mandate references, `hasMore`,
  malformed, duplicate or mismatched truth fails closed with zero mutation and
  no first-item selection, browser-cache fallback or hardcoded Agent identity.
- Technical identifiers/hashes remain queryable only inside a collapsed details
  disclosure and never become a user input.
- Existing Principal-only preflight, account proof, continuation activation
  guard, no-funds boundary and adjacent real controls do not regress.
- Desktop, 390px, 200%-equivalent, keyboard, focus, refresh, console and request
  evidence prove one normal single-Agent flow and safe zero/multiple states.

## Exact test commands

```sh
node --check apps/web/src/app.js
node --test \
  apps/web/test/principal-agent-workspace-selection.test.js \
  apps/web/test/static-ui.test.js \
  apps/web/test/principal-workspace-access.test.js \
  modules/tenant-command-gateway/test/workspace-resume-handlers.test.js
pnpm run test:transport
pnpm run test:security
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

## Security checklist

- [x] Selection derives only from exact authenticated server resume truth.
- [x] Ambiguous, incomplete, duplicate and malformed selections fail closed.
- [x] Browser storage, DOM defaults, URLs and fixtures grant no locator truth.
- [x] Existing Principal/Agent authorization and proof boundaries are unchanged.
- [x] No operation, capability, permission, credential or dependency is added.
- [x] No deployment, chain, signer, capital, withdrawal or funds path changes.

## Permission boundary

Founder approval to continue ordered UX-006 remediation authorizes this local
presentation and existing-query composition only. Risk/Capital Partner locator
operations, multi-Agent selection, identity provisioning and any permission or
protocol change require separate human review.

## Data and migration impact

None.

## Rollback plan

Revert only the focused selection helper, browser composition, semantic HTML/CSS,
asset allowlist, focused tests and user/audit copy. No durable state or migration
rollback is required.

## Completion Evidence

Complete locally on 2026-08-12 against uncommitted current source based on
`65f999c0882ebd16486324509e0eb342a116cb19` on
`codex/m1-b-deployable-sandbox`. Nothing was staged, committed, deployed or
promoted, and production remains unchanged.

Implementation evidence:

- A strict selection helper accepts only exact authenticated
  `principal_controller` resume truth. Zero Agent is empty only when Agent
  resources and continuation receipts are also empty; duplicate, multiple,
  malformed, incomplete, contradictory or extra truth is ambiguous and fails
  closed.
- Actor, Subject and Mandate inputs plus `Load exact Mandate` were removed from
  the normal Principal flow. Identifiers and receipts remain queryable only in
  a collapsed Technical details disclosure.
- Each touched Agent-authority mutation first refreshes workspace resume and
  exact-compares the transient actor, Subject and Mandate selection. A changed
  selection synchronously clears browser-held challenge, binding, Mandate,
  Offer, Obligation, repayment and Evidence state before mutation dispatch.
- Lifecycle sections progressively disclose only the current stage. The
  selected single-Agent application state exposes one primary action and no
  visible disabled or duplicate handoff button.
- The new browser module is served by the fixed Tenant asset graph on all four
  local role origins.

Executable verification on Node `v26.5.0` and pnpm `11.1.3`:

- `node --check apps/web/src/app.js`: PASS.
- Focused selection, static UI, Principal access and workspace-resume handler
  suite: 32/32 PASS.
- `pnpm run test:transport`: 79/79 PASS.
- `pnpm run test:security`: 33/33 PASS. A preceding concurrent orchestration
  attempt hit only the security fixture's server-readiness timeout; the exact
  issue command was rerun alone and passed with no failed assertion.
- `pnpm run check:web-bundle`: PASS; 1 external module, 34 authored modules and
  896 unique IDs.
- `pnpm run lint`: PASS; 679 JavaScript modules parsed and boundary lint passed.
- `pnpm run typecheck`: PASS; 3 package surfaces and 72 runtime exports.
- `pnpm test`: 929/929 PASS.
- `git diff --check`: PASS.

Real-browser evidence is in
`output/playwright/ux-006-gate1-3a/`: 12 final single/empty/multiple/has-more
screenshots at 1440, 720 and 390 CSS pixels, two fresh-sign-in contrast
screenshots, `README.md`, and `browser-audit.txt`.

- Fresh single assignment performed only resume, Mandate and AccountBinding
  reads: 3 reads, 0 mutations and 0 reference-Agent routes. Hard reload reached
  6 reads total with the same zero-mutation result.
- Empty, multiple and incomplete-page states each remained non-interactive with
  2 resume reads, zero authority inputs/buttons, zero mutations and no
  first-item fallback.
- A dynamic single-to-multiple change immediately before activation performed
  one fresh resume read, cleared the acknowledgement and old workflow, and
  ended at 8 cumulative reads with 0 mutations.
- A fixture-only sign-out and OIDC sign-in ceremony purged four deliberately
  poisoned browser locator values, re-established the same Principal session,
  and recovered only through resume, Mandate and AccountBinding reads. It ended
  at 6 cumulative reads, 0 Tenant mutations, 0 reference-Agent routes, and no
  locator-cache restoration. No external identity provider was contacted.
- All tested consoles reported 0 errors and 0 warnings; keyboard disclosure,
  focus, 1440/720/390 layout and horizontal overflow checks passed. The minimum
  measured contrast was 6.69:1. At 1440 and 390, reduced-motion matched and the
  touched nodes used 0.01ms transition/animation duration with automatic
  scrolling.

Clickable current-source review surfaces remain available at
`http://127.0.0.1:8787/#overview`,
`http://127.0.0.1:8788/#request-credit`,
`http://127.0.0.1:8789/#risk-operations`, and
`http://127.0.0.1:8790/#capital-partners`; every root and the new selection
module returned HTTP 200 at closure.

Permission and evidence limits: the resume response still exposes controlled
Agent actors and controller resources as separately authorized sets. This
slice relies on current server truth plus existing Gateway authorization and
does not add a direct actor-to-resource association contract. Multi-Agent
selection, that association hardening, Risk portfolio/queue discovery and
Capital Partner profile/Passport discovery remain separate permission/protocol
reviews. There is no schema, database, migration, API operation, role,
capability, credential, dependency, chain, signer, funds or deployment change.
