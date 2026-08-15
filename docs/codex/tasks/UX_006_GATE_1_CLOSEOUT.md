# UX-006 Gate 1 Closeout — Simple, Operable Role Journeys

Status: Complete locally
Phase: Product Optimization Phase 1 / `L0_LOCAL_NO_FUNDS`
Branch: `codex/m1-b-deployable-sandbox`
Baseline: `65f999c0882ebd16486324509e0eb342a116cb19`
Code owner for this increment: this issue only

## Context

Gates 1.1–1.3c closed authentication truth, permanent pseudo-controls, and the
Principal, Risk, and Capital Partner locator slices. Gate 1 is not complete:
signed-out and role navigation remain broad, the normal reference-Agent path
still exposes terminal handoffs and repeated checks, account-binding polling
fails silently, the current Human browser host cannot start, and several
normal role controls still ask for internal references. These are
UX006-P1-003 through UX006-P1-007 and Gate 1 plan items 6–8.

The Founder requested one closeout increment rather than further issue
fragmentation. This issue therefore owns the remaining local synthetic/no-funds
Gate 1 usability surface while preserving all existing authority boundaries.

## Scope

1. Signed-out navigation exposes Home, plain product explanation, and one
   dominant Sign in action. Once authenticated, each workspace exposes no more
   than four primary destinations and preserves an allowed pre-login intent.
2. The local credential-isolated reference Agent runs application and active
   Mandate lifecycle work behind one explicit browser next action. Production
   Principal browsers remain read-only; CLI, JSON, IDs, and operation names are
   confined to collapsed Developer details.
3. Remove silent five-minute account-binding polling. Account binding is read
   only after one explicit user-triggered Refresh, with a visible success or
   retryable failure result and no timer, background loop, or duplicate read.
4. Restore the Human browser fixture and maintain executable Human,
   Principal/Agent, Risk, and Capital Partner scenario hosts.
5. Remove editable internal Subject, Consent, Obligation, and protective-action
   locators from normal role tasks. Use existing authenticated resume/queue
   truth, a labeled authorized selection, or move explicitly technical reads
   behind collapsed disclosure. Economic and authority mutations remain
   deliberate and exact.
6. Expand current role control evidence so every visible control in the touched
   states has a handler, an enabled or explicitly bounded prerequisite state,
   and one understandable result. Capital Partner Offer/withdrawal and Risk
   protective suspension must be exercised only in synthetic fixtures.

## Non-goals

- No new capability, role, credential, recipient directory, production
  identity, permission, risk rule, lending policy, or funds authority.
- No real funds, custody, signer, KYC/PII, chain write, testnet/mainnet
  transaction, deployment, promotion, release reseal, or hosted-availability
  claim.
- No database schema, seed, or migration. Existing authenticated server truth
  and existing reference-Agent routes are reused.
- No enabling of public pools, deposits, allocation, arbitrary withdrawal,
  production pricing, settlement, or wallet submission.

## Likely files

- `apps/web/src/workspace-surface-access.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/workspace-surface-access.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/manual-primary-actions.v1.json`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- existing Principal/Risk/Capital Partner browser fixtures
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`

## Acceptance criteria

1. Signed-out primary navigation has one public Home destination and one
   viewport-visible, keyboard-reachable Sign in CTA. Valid private intent is
   retained in memory and restored only after exact workspace authorization.
2. Borrower and Controller navigation expose at most four role-relevant primary
   destinations; Risk and Capital Partner expose only their exact workspace.
   Hidden destinations are not tabbable, while allowed contextual links still
   work without advertising cross-role surfaces.
3. A local Principal can create/recover authority, run the registered reference
   Agent application, activate the exact Mandate, and start the complete
   sandbox Agent lifecycle without terminal, copied locator, JSON download, or
   repeated manual checks. No more than three deliberate Principal decisions
   are required after the assigned Agent is recovered.
4. Production-like Principal mode never invokes local reference-Agent routes.
   Duplicate, stale, unknown, rejected, reload, re-login, and restart cases
   remain fail closed and queryable.
5. Account-binding recovery visibly reports success or a retryable failure.
   Each Refresh sends one read; there is no timer to survive navigation,
   sign-out, Subject change, expiry, or a transport failure.
6. Human Subject/Consent and owned Obligation references are recovered from
   authenticated server truth and are not editable in normal UI. Risk freeze
   uses an explicit authorized queue-case selection; technical Passport/report
   verification fields remain collapsed and are not normal-journey inputs.
7. All four role fixtures start cleanly. Their touched-state control inventory
   contains no visible permanently disabled button, no anonymous actionable
   control, and no control without one handler/result contract.
8. Current real-browser evidence covers happy, rejected/failure, recovery,
   duplicate, reload, re-login, and restart at 1440/720/390; keyboard, focus,
   200%-equivalent layout, contrast, reduced motion, overflow, console, and
   request/mutation inventory are recorded.
9. Completion remains local synthetic/no-funds. Production and the standard
   compose deployment are unchanged.

## Test commands

```sh
node --check apps/web/src/app.js
node --check apps/web/test/support/human-lifecycle-browser-host.mjs
node --test \
  apps/web/test/workspace-surface-access.test.js \
  apps/web/test/static-ui.test.js \
  apps/web/test/agent-lifecycle-next-action.test.js
pnpm run test:transport
pnpm run test:security
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

## Security checklist

- [x] Existing Gateway authorization and exact-resource reauthorization remain authoritative.
- [x] Local reference-Agent credentials never enter the browser.
- [x] Production-like browser paths cannot invoke local reference-Agent routes.
- [x] Browser state and pre-login intent never become authorization truth.
- [x] Risk protective suspension retains explicit case, reason, acknowledgement, recent MFA, and exact server revalidation.
- [x] No hidden mutation, duplicate dispatch, stale repaint, silent loop, funds, signer, permission, migration, or deployment change exists.
- [x] Current browser request inventories distinguish reads from mutations and prove the reviewed negative states fail closed.

## Permission boundary

This increment is authorized only for the current local synthetic/no-funds
experience. It reuses existing operations and credentials; it does not grant a
new permission or production/real-value authority.

## Migration impact

None.

## Rollback plan

Revert the bounded presentation, reference-Agent orchestration, fixture/tests,
and documentation hunks. No durable schema or business-data rollback is
required.

## Completion evidence

Complete locally on the current uncommitted synthetic/no-funds candidate.

- Signed-out navigation is reduced to Home plus explicit access. Authenticated
  Borrower and Controller workspaces expose at most four primary destinations;
  Risk and Capital Partner expose only their exact workspace. Hidden navigation
  is not keyboard reachable.
- The local reference Agent completed application, exact Principal activation,
  and the complete sandbox runtime lifecycle through goal-level browser
  actions. The final state was `Fully Repaid`; CLI, JSON, operation names and
  locators remain available only under Developer/Technical disclosure.
- Account-binding background polling was removed. Refresh is explicit and
  bounded to one read with a visible result; no timer or retry loop remains.
- Human Subject/Consent and owned Obligation references recover from
  authenticated truth. Risk protective suspension starts from a labelled
  authorized Queue-case selection and retains explicit reason,
  acknowledgement, recent MFA and server reauthorization.
- The Human fixture starts and reaches its completed lifecycle state. Current
  Capital Partner evidence authors and withdraws one exact synthetic Offer (4
  reads, 2 deliberate mutations); current Risk evidence selects and freezes one
  synthetic Queue case (7 reads, 1 deliberate protective mutation). Both are
  explicitly no-funds fixtures, not production behavior.
- Final browser evidence and screenshots are recorded in
  `output/playwright/ux-006-gate1-closeout/README.md`. Existing current-candidate
  Gate 1.1–1.3c artifacts retain the negative, recovery, re-login, viewport,
  keyboard, contrast and reduced-motion evidence for their touched states.

Current verification:

- `node --check apps/web/src/app.js`: PASS.
- `node --test apps/web/test/*.test.js`: PASS, 178/178.
- `pnpm run test:transport`: PASS, 79/79.
- `pnpm run test:security`: PASS, 34/34.
- `pnpm run check:web-bundle`: PASS, 37 authored modules and 904 unique IDs.
- `pnpm run lint` and `pnpm run typecheck`: PASS.
- `pnpm test`: PASS, 961/961.
- `git diff --check`: PASS after the final shared-tree edits.

Evidence limits:

- This closes Gate 1 only for the current local candidate and the exact changed
  states. It does not assert deployment, hosted-pilot, production, testnet or
  real-value readiness.
- The standard persistent compose stack was rebuilt from the current source
  after adding one exact whitespace-only checksum compatibility edge for
  migration 0054. PostgreSQL, Pilot and Worker are healthy, and
  `pnpm run local:acceptance` passes with all 61 migrations and four role
  workspaces. The existing database records and volume were not rewritten or
  reset.
- No production runtime, role/capability grant, policy, signer, chain or funds
  path was modified by this closeout.
