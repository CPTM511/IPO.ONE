# WEB-017 — Human Decision completion and explicit sign-out

Status: Verified locally

## Context

Two browser defects interrupt the L0 Human product:

- starting another request preserves the prior scoped Consent, so an unchanged
  request is correctly rejected by the protocol as an equivalent Credit Intent
  before deterministic evaluation runs; and
- local pre-provisioned sessions are authenticated but hide Sign out because
  the UI incorrectly equates logout availability with an enabled external
  identity provider.

## Scope

- Require a fresh scoped Consent when a user starts another Human request.
- Translate a residual equivalent-Intent rejection into an actionable,
  non-enumerating message.
- Keep the existing four-step Human flow:
  self preflight, Credit Intent, application read, deterministic evaluation.
- Present Sign out directly in the top bar and inside the access dialog for
  every authenticated session.
- Add a CSRF- and Origin-bound local logout response that clears the exact
  host-only session cookie.
- Keep local signed-out state closed until the user explicitly reloads to
  provision a fresh synthetic local session.
- End the account session and release the selected wallet connection when the
  Provider supports disconnect or account-permission revocation.
- Clear authentication-scoped memory, opaque local/session storage references,
  CSRF and local account bootstrap metadata, form values, generated views, and
  request logs before presenting the signed-out state.
- Hide every authenticated product view behind a neutral privacy shield after
  logout or a material wallet-context change.
- Reject an authenticated response that completes after the browser privacy
  epoch has been invalidated.

## Non-goals

- No Credit Intent hash, ID, Consent, Decision, Offer, or Obligation semantic
  changes.
- No automatic Consent, application, evaluation, Offer acceptance, or funds
  action.
- No new identity provider, credential, role, capability, or remote access.
- No production deployment, testnet write, or real funds.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/app.js`
- `apps/web/test/static-ui.test.js`
- `apps/private-pilot/src/local-authentication-options.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- `apps/private-pilot/test/private-pilot-foundation.test.js`

## Acceptance criteria

- Starting another Human request preserves the current Obligation but clears
  the prior Consent and requires a fresh scoped Consent.
- Creating that Consent and submitting the request produces committed
  `pilotReadHumanSelf`, `pilotRequestCredit`,
  `pilotReadCreditApplication`, and `pilotEvaluateCreditApplication` receipts
  and renders the explainable Decision and Offer.
- A residual duplicate submission explains that a fresh scoped Consent is
  required without revealing another Actor or Tenant resource.
- Every authenticated local or production-capable session shows Sign out in
  both the top bar and access dialog.
- Local Sign out requires the exact cookie, Origin, and CSRF token, clears the
  host-only cookie, and blocks product operations until explicit reload.
- Sign out disconnects a memory-only WalletConnect Provider or requests exact
  `eth_accounts` permission revocation from an injected Provider; unsupported
  wallets still lose every IPO.ONE-held account and selection reference.
- No Subject, Consent, Agent, wallet address, Credit Intent, Decision, Offer,
  Obligation, Evidence, Risk, report, request ID, hash, amount, or lifecycle
  value remains visible after logout.
- Late authenticated responses cannot repopulate the signed-out workspace.
- Existing Human, Agent, transport, security, and repository checks pass.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
node --test apps/web/test/wallet-sign-out.test.js
node --test apps/private-pilot/test/private-pilot-foundation.test.js
pnpm run test:security
pnpm run test:transport
pnpm run check
pnpm run local:up
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] Logout is same-origin, CSRF-bound, cookie-clearing, and non-idempotency
  expanding.
- [x] Signed-out UI immediately closes authenticated product actions.
- [x] Account and wallet state are released together without treating wallet
  disconnect support as funds authority.
- [x] Authentication-scoped browser memory, DOM views, storage references, and
  bootstrap metadata are cleared before signed-out rendering.
- [x] No browser token, private key, raw signature, KYC/PII, or resource lookup
  is introduced.
- [x] Duplicate Credit Intents remain rejected by the canonical protocol.
- [x] Consent and Offer acceptance remain explicit Human actions.
- [x] No permissions, funds, risk, chain, or deployment boundary changes.

## Verification evidence

- Focused UI tests: 7 passed.
- Wallet-release tests: 3 passed.
- Private-pilot foundation tests: 11 passed.
- Security tests: 33 passed.
- Transport tests: 52 passed.
- Full repository check: 579 passed, 0 failed.
- Local stack acceptance passed with PostgreSQL 17, 39 migrations, three
  authenticated workspaces, healthy worker heartbeat, reconciliation, and an
  empty pending outbox.
- Browser regression at `http://127.0.0.1:8787` confirmed:
  - authenticated Human sessions show top-bar and access-dialog Sign out;
  - local Sign out clears the session and closes authenticated operations;
  - starting another Human request requires a fresh scoped Consent;
  - the resulting $120 / 60-day / 2-installment request renders an Approved
    9% Offer and committed receipts through
    `pilotEvaluateCreditApplication`;
  - Sign out removes the Human Subject, Consent, Agent Subject, Obligation,
    lifecycle values, wallet display, CSRF token, local Agent bootstrap
    metadata, and every authenticated product view;
  - signed-out storage inspection returned no Human Subject, Human Consent,
    Agent Subject, or Obligation value, and no authenticated view remained
    visible;
  - browser console: 0 errors, 0 warnings.
