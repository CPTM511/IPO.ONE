# UX-006 Gate 2 — Navigation, Session Exit, and Recovery

Status: Complete locally
Phase: Product Optimization Phase 1 / `L0_LOCAL_NO_FUNDS`
Branch: `codex/m1-b-deployable-sandbox`
Baseline: current Gate 1 closeout candidate
Code owner for this increment: this issue only

## Context

Gate 2 covers regressions that make a working product feel broken: browser Back
leaves the workspace, document anchors are interpreted as product routes,
sign-out immediately reopens sign-in, and a valid pre-login destination is
lost. These are presentation and navigation defects; they are not permission
or lifecycle changes.

## Scope

- Use `pushState` for deliberate product navigation and `replaceState` only for
  boot canonicalization, aliases, invalid/cross-role destinations, sign-out,
  and one-shot post-login restoration.
- Preserve native document anchors such as `#mainContent`; Back/Forward and
  valid deep-link reload must restore the exact role-authorized view.
- Sign out to a closed signed-out landing with the dialog closed and focus on
  Sign in. Reopening authentication always requires a new user action.
- Store at most one short-lived, presentation-only pre-login view intent;
  consume it once after server workspace verification and reject expired,
  malformed, or cross-role values.
- Keep signed-out navigation minimal and authenticated primary navigation at
  four or fewer role-relevant destinations.

## Non-goals

- No AuthN/AuthZ, capability, role, credential, protocol, database, risk,
  funds, signer, chain, deployment, or production change.
- Browser history and intent never grant resource or workspace authority.

## Likely files

- `apps/web/src/workspace-navigation.js`
- `apps/web/src/workspace-surface-access.js`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- focused Web, access-route, and transport tests
- UX-006 audit and user documentation

## Acceptance criteria

1. Home → Credit → Obligations creates three product history entries; Back and
   Forward traverse them without leaving the product or dispatching a mutation.
2. Valid deep links survive reload. Aliases, invalid hashes, and cross-role
   hashes are replaced with the role default and do not add a history loop.
3. Skip to workspace retains `#mainContent` and focuses the main landmark
   without changing the active product view.
4. Sign-out clears private/transient state, closes the dialog, replaces the URL
   with the signed-out role default, and focuses a visible Sign in action.
5. OIDC and wallet sign-in preserve one valid view for no more than ten minutes;
   it is consumed once only after the authenticated workspace agrees. Invalid,
   expired, malformed, and cross-role intents are discarded.
6. 1440/720/390, keyboard, 200%-equivalent layout, reduced motion, overflow,
   console, navigation-request and mutation inventories pass in real browsers.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/workspace-navigation.test.js apps/web/test/workspace-surface-access.test.js apps/web/test/static-ui.test.js
pnpm run test:transport
pnpm run test:security
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

## Security checklist

- [x] History and intent are presentation-only and role-canonicalized.
- [x] Sign-out clears private browser state before rendering the public landing.
- [x] No navigation, Back, Forward, anchor, or Retry dispatches an economic mutation.
- [x] No automatic login-dialog loop remains.
- [x] No permission, durable data, migration, deployment, signer, chain, or funds change exists.

## Permission boundary

Local synthetic/no-funds presentation only. Server authorization remains the
sole authority.

## Migration impact

None.

## Rollback plan

Revert the bounded navigation, session-exit, intent, tests, and documentation
hunks. No durable rollback is required.

## Completion evidence

Complete locally on the current uncommitted synthetic/no-funds candidate.

- Deliberate product navigation uses browser history: Home → Credit →
  Obligations, Back to Credit and Home, and Forward to Credit all restore the
  exact authorized view without a mutation.
- Invalid `#bogus` canonicalizes by replacement to `#overview`. The native
  `#mainContent` skip link preserves the active product view and focuses the
  main landmark instead of entering product routing.
- Sign-out clears private state, replaces the URL with `#overview`, leaves the
  access dialog closed, focuses `#signedOutPrivacyAction`, hides the interaction
  mode switch, and leaves only Home in visible primary navigation. A new user
  action is required to reopen authentication.
- One short-lived presentation intent restored `#obligations` only after the
  test OIDC session recovered the matching authenticated workspace. The login
  audit was logout → login start → login complete, followed only by Tenant
  reads. Pure tests cover malformed, expired and cross-role rejection and
  one-shot consumption.
- Final browser evidence and screenshots are recorded in
  `output/playwright/ux-006-gate2/README.md`; all recorded final sessions had
  zero console errors/warnings.

Current verification:

- `node --check apps/web/src/app.js`: PASS.
- `node --test apps/web/test/*.test.js`: PASS, 178/178, including focused
  navigation, surface-access and static control contracts.
- `pnpm run test:transport`: PASS, 79/79.
- `pnpm run test:security`: PASS, 34/34.
- `pnpm run check:web-bundle`: PASS, 37 authored modules and 904 unique IDs.
- `pnpm run lint` and `pnpm run typecheck`: PASS.
- `pnpm test`: PASS, 961/961.
- `git diff --check`: PASS after the final shared-tree edits.

Evidence limits:

- Gate 2 is closed only for the current local candidate and reviewed changed
  navigation/session states. It is not a production, deployment, hosted-pilot,
  testnet or real-value claim.
- Browser history and post-login intent remain presentation state only; server
  workspace authorization is still required before restoration.
- The standard persistent compose stack was rebuilt from the current source;
  PostgreSQL, Pilot and Worker are healthy, and `pnpm run local:acceptance`
  passes with all 61 migrations and four role workspaces. The existing
  database records and volume were not rewritten or reset.
