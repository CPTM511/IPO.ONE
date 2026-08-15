# UX-006 Gate 1.1: Authentication availability truth

Status: Complete locally

Date: 2026-08-12

Baseline commit: `65f999c0882ebd16486324509e0eb342a116cb19`

Branch: `codex/m1-b-deployable-sandbox`

Phase: Product Optimization Phase 1 / `L0_LOCAL_NO_FUNDS`

Requirements: `REQ-UX-005`, `REQ-PILOT-002` (named support channel remains gated)

## Context and current baseline

UX006-P1-001 confirms that the signed-out browser advertises authentication
methods that the current host or browser cannot use. The current production
and local closed-pilot options return no OIDC providers and wallet
authentication enabled, but the dialog still renders Google, email, wallet,
and network buttons. In a fresh browser with no compatible wallet, all four
controls are disabled with no reachable enabled state.

The server contract already returns the canonical availability facts through
`GET /auth/v1/options`. The browser wallet registry already provides the
current client-side Provider truth. This issue composes those two existing
facts into a truthful presentation; it does not change authentication or
authorization semantics.

The signed-out privacy card already owns a real `openAccess` handler, but its
primary `Sign in` action is permanently hidden. An authentication-options
failure also loses its error/request identity, leaves no manual retry, and can
retain previously advertised methods.

Gate 0.1 and Gate 0.2 are complete locally. The worktree remains intentionally
dirty with their reviewed changes and unrelated user artifacts. The existing
Capital Network and Risk browser-host modifications are user-owned and remain
outside this issue.

For Product Engineering Standard section 14, this document is the only active
implementation issue for the files and behavior below. `WEB-002` remains a
parent backlog, `WEB-013` remains historical implementation context, and
`RELEASE-001` remains blocked pending an exact accepted candidate; none owns
this increment.

## Scope

- Derive authentication presentation from both current server options and the
  current browser wallet registry.
- Render only exact server-advertised OIDC methods, using one generic safe
  handler for configured provider identifiers.
- Render wallet sign-in only when the server enables it and the browser has an
  explicitly selected compatible Provider.
- Replace wallet prerequisites with actionable Provider selection or bounded
  wallet rediscovery, never a permanently disabled sign-in button.
- Reveal network selection only after a compatible wallet is selected.
- Make the signed-out privacy-card `Sign in` action the dominant first-screen
  action while retaining the compact top-bar entry.
- Fail closed when authentication options cannot be read: clear stale methods,
  present one user-triggered retry, preserve no automatic retry loop, and keep
  any already server-verified workspace session authoritative.
- Provide a privacy-safe access diagnostic that can be copied and sent through
  the user's existing invitation channel. It may contain only bounded host,
  workspace, availability, error, request and observation metadata.
- Preserve authenticated Continue, explicit Sign out, wallet invalidation,
  focus trapping, and server-derived workspace recovery.

## Non-goals

- No IdP, wallet SDK, external support service, credential, invitation,
  registration, account-recovery or production configuration change.
- No new authentication, authorization, role, capability, resource or funds
  authority.
- No fabricated `support@ipo.one`, ordinary-support URL, or reuse of the
  security-vulnerability contact as login support. A named operated support
  channel remains an explicit `REQ-PILOT-002` / L2 gate.
- No change to cookies, CSRF, SIWE, OIDC, session, Principal, Consent, Mandate,
  Offer, Obligation, risk, pricing or accounting semantics.
- No database, migration, seed, protocol, deployment, remote-access, chain,
  signer, custody, Provider execution or funds movement change.
- No remediation of the separate permanent pseudo-buttons, Agent CLI journey,
  navigation/back behavior, sign-out landing, or polling findings. They remain
  ordered after this issue.

## Likely files

- `apps/web/src/authentication-availability-presentation.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/src/wallet-provider-registry.js`
- `apps/web/test/authentication-availability-presentation.test.js`
- `apps/web/test/wallet-provider-registry.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/authentication-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`

## Acceptance criteria

### Available-method truth

- Given options checking, no authentication method or network action is
  presented as usable before the check completes.
- Given `oidcProviders=[]`, Google and email are absent from the rendered and
  accessible UI.
- Given one configured OIDC provider, exactly one enabled OIDC action is
  rendered and it uses the existing same-origin login route.
- Given an unknown but server-validated provider identifier, the browser
  either renders one generic safe action through the existing route or fails
  closed; it never invents success or provider capability.
- Given wallet authentication disabled, wallet Provider, sign-in and network
  controls are absent.
- Given wallet authentication enabled with no browser Provider, there is no
  disabled wallet or network button; the user sees plain guidance and one
  enabled bounded `Check for wallets again` action.
- Given one or more discovered Providers with none selected, only the enabled
  Provider choices are shown. Selecting one reveals the wallet sign-in and
  approved-network choices.
- Outside a visibly pending request, every visible button in the changed
  authentication surface is enabled and has one real outcome.

### Failure and recovery

- Given options previously succeeded and a later check fails, previously
  advertised OIDC and wallet methods are cleared before rendering the failure.
- Given options 5xx/offline, one enabled `Check sign-in again` action is shown;
  one click produces one request, concurrent clicks are coalesced, and no
  timer, reload or dialog loop triggers another request.
- Given a failed check followed by a successful retry, the exact new methods
  render and the protected workspace probe is run once against the new truth.
- Given repeated failure, the stable recovery state remains actionable and
  exposes the bounded error code/request ID when available.
- The copied access diagnostic contains no cookie, bearer token, CSRF token,
  wallet address, email, signature, credential, Subject, Mandate or other
  private resource identifier.

### First screen and accessibility

- Given a signed-out user after the initial options check, one dominant card
  `Sign in` action is visible in the first viewport and opens the access dialog.
- The dialog's first useful method/recovery control is keyboard reachable;
  Escape closes it and restores focus to the invoking Sign in action.
- The changed flow works at desktop, 390px mobile and 200 percent zoom with no
  horizontal task-flow overflow, missing control or console error.
- Refresh preserves server-derived availability and does not use browser
  storage as authentication or authority truth.

## Exact test commands

```sh
node --check apps/web/src/app.js
node --test \
  apps/web/test/authentication-availability-presentation.test.js \
  apps/web/test/wallet-provider-registry.test.js \
  apps/web/test/wallet-sign-out.test.js \
  apps/web/test/static-ui.test.js
pnpm run test:transport
pnpm run test:security
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

Real-browser Evidence must cover fresh no-wallet options, injected EIP-6963
Provider selection, options 5xx followed by one successful retry, OIDC-only,
reload, keyboard/focus return, desktop, 390px mobile, 200 percent zoom, and
console/request inspection.

The existing `wallet-provider-browser-host.mjs` and
`wallet-provider-browser-init.js` are verification-only fixtures for the
injected EIP-6963 case; this issue does not own or change them.

## Security checklist

- [x] Server options and current Provider discovery are the only availability
  inputs; browser state creates no authentication or authority truth.
- [x] Missing, unknown, stale and failed availability states fail closed.
- [x] Retry is user-triggered, single-flight, read-only and non-authorizing.
- [x] Dynamic provider labels use text nodes and provider IDs remain
  URL-encoded on the existing same-origin route.
- [x] Diagnostics are bounded, redacted and contain no credentials, PII,
  account address or private resource identity.
- [x] Authentication remains explicitly separate from credit, Mandate, chain
  and funds authority.
- [x] No external dependency, script, analytics, support service or credential
  was added.

## Permission boundary

Founder approval to continue the UX-006 ordered remediation authorizes this
L0 local no-funds presentation, read-only retry, test-fixture and documentation
slice. It does not authorize an IdP or wallet provider, authentication or
authorization expansion, a named support operator, deployment, remote access,
production data, signer, custody, chain write, mainnet or funds movement.

## Data and migration impact

None. No schema, migration, seed, durable authentication record, session record
or business state changes.

## Rollback plan

Revert only the focused presentation module, access HTML/CSS/app composition,
wallet rediscovery method, fixed asset allowlist, focused tests and user copy.
No database or authentication data rollback is required. The existing server
options, session and wallet-invalidation contracts remain unchanged.

## Required completion Evidence

- Focused presentation, wallet registry and static UI test counts.
- Transport, security, bundle, lint, typecheck and aggregate repository result.
- Real-browser screenshots and request/control inventories for the four named
  availability/recovery states.
- Keyboard, focus-return, 390px, 200 percent zoom, overflow and console results.
- A working clickable local product URL kept available for Founder review.
- Explicit record that ordinary named support remains a separate L2 gate.

## Completion Evidence

Completed locally on 2026-08-12 against baseline
`65f999c0882ebd16486324509e0eb342a116cb19` plus the reviewed, uncommitted Gate
0 changes. Production was not deployed or modified.

- Focused authentication, wallet registry, wallet sign-out, wallet-authority
  and static UI suites: **40/40 passed**. This includes stale-options clearing,
  exact OIDC rendering, no-provider recovery, same-idempotency invalidation
  retry, and a receiving cross-tab state that cannot advertise an inoperative
  retry.
- Transport: **79/79 passed**. Security: **33/33 passed**. Web bundle integrity
  passed with 1 external module, 33 authored modules and 891 unique IDs. Source
  lint, boundary lint, contract typecheck and `git diff --check` passed.
- Aggregate repository regression after the final cross-tab correction:
  **924/924 passed**.
- Real-browser evidence is in
  `output/playwright/ux-006-gate1-1/`. Fresh no-wallet, Google-only, initial
  503 followed by one user retry, and three injected EIP-6963 Providers were
  tested. In the failure fixture, options requests moved from 1 to 2 and
  remained 2 after waiting; no automatic third request occurred.
- At 1440px, 390px, and a 720px narrow viewport representing 200 percent zoom,
  the changed dialog had no horizontal task-flow overflow and no visible
  non-pending disabled control. The clean browser and injected-wallet consoles
  had 0 errors and 0 warnings; the failure fixture recorded only the expected
  first 503.
- Tab and Shift+Tab remain inside the access dialog; Escape closes it and
  restores focus to `signedOutPrivacyAction`. The dominant CTA contrast was
  measured at **17.62:1** and the reduced-motion profile reduces animation and
  transition durations to `0.01ms`.
- Current-source, isolated no-funds review links remain available:
  `http://127.0.0.1:8787/#overview`,
  `http://127.0.0.1:8788/#request-credit`,
  `http://127.0.0.1:8789/#risk-operations`, and
  `http://127.0.0.1:8790/#capital-partners`.
- The copied and visibly selectable diagnostic is only a handoff through the
  original invitation channel. A named ordinary access-support service remains
  an unresolved `REQ-PILOT-002` L2 gate; the security disclosure contact was
  not repurposed.
