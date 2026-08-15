# WEB-016 — Authenticated lifecycle synchronization

## Context

The closed-pilot Human repayment command correctly persists the Obligation,
repayment, servicing action, and Evidence. Three browser synchronization gaps
make that valid server state appear broken:

- a repayment-origin `advance` servicing action is rejected by the browser even
  though the shared domain emits it for a non-adverse transition such as
  `active -> fully_repaid`;
- the Credit Track Record Evidence action navigates to the correct panel but
  does not perform the authorized owner Evidence read;
- Agent AccountBinding proof is performed out of browser, as intended, but the
  Principal workspace requires a manual refresh and starts with a placeholder
  account that is not the registered local Agent account.

## Scope

- Accept the exact domain-valid source/action pairs for trusted-time and
  repayment-driven servicing advances, while continuing to reject balance or
  source drift.
- Refresh owned redacted Evidence after repayment and when the Human opens the
  Credit Track Record Evidence action.
- Publish only the registered local Agent public address into the local
  closed-pilot shell and remove the misleading placeholder address.
- Poll the read-only AccountBinding operation for a bounded period after a
  one-use challenge is created, then update the Principal workspace when the
  registered Agent Host submits proof.
- Make executed and fully repaid lifecycle labels unambiguous.

## Non-goals

- No real funds, withdrawable balance, production chain, or public LP behavior.
- No browser signing or custody of an Agent private key.
- No automatic Mandate creation or activation.
- No new Principal, Agent, risk, or servicing authority.
- No production credential or production runtime configuration.

## Likely files

- `apps/web/src/servicing-case-presentation.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/src/tenant-pilot-host.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- focused Web and transport tests

## Acceptance criteria

- A fully repaid Obligation carrying a repayment-origin `advance` action renders
  as a verified Servicing Case.
- Repayment-origin actions without positive repayment/balance progress and
  trusted-time advances that mutate balances fail closed.
- Posting repayment refreshes the current Obligation and owned Evidence.
- Opening verified Credit Track Record Evidence performs the owner-authorized
  Evidence read without a second click.
- The local closed-pilot Agent account field contains the registered public
  address, never a private key or signature.
- AccountBinding proof completion becomes visible without a manual refresh,
  while proof creation and Mandate activation remain explicit operations.
- Existing Human, Agent, wallet, and transport tests remain green.

## Test command

```sh
pnpm test
```

Focused checks:

```sh
node --test apps/web/test/servicing-case-presentation.test.js
node --test apps/web/test/static-ui.test.js
node --test apps/tenant-api/test/transport-conformance.test.mjs
node --test apps/private-pilot/test/private-pilot-foundation.test.js
```

## Security checklist

- [ ] The browser receives only an EVM public address.
- [ ] Agent proof remains sender-controlled and out of the Human browser.
- [ ] Polling is read-only, bounded, non-overlapping, and stops on subject/input
      change, success, expiry, page exit, or unavailable authentication.
- [ ] Evidence remains owner/controller-authorized and redacted.
- [ ] Servicing presentation remains fail-closed on source, lifecycle, schedule,
      balance, policy, and no-funds drift.
- [ ] No production funds move and no production authority is added.
