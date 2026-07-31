# WEB-023: Agent two-stage application and runtime handoff journey

Status: Implemented, locally verified, and sealed in LOCAL-RC-002

## Context

The authenticated Agent protocol intentionally separates credit into two
authority stages:

1. a Draft Mandate creates an `application_ready` handoff for Credit Intent,
   application reads, deterministic evaluation, and the Offer workflow receipt;
2. the Human Principal activates that exact Mandate, creating a `ready` runtime
   handoff for exact Offer acceptance, Obligation creation, no-funds execution,
   repayment, and Evidence.

The current browser presentation blurs those stages. In particular, it can tell
the user to activate first and then let the Agent request and evaluate credit,
even though new applications are Draft-only. That makes a correct server-side
permission boundary look like a broken Agent workflow.

## Scope

- Present the Draft application handoff as an explicit step before activation.
- Explain that the Agent application must return an Offer workflow receipt
  before the Principal activates the exact Mandate.
- Present activation as unlocking acceptance and runtime operations for an
  existing Offer, not as creating or evaluating a new application.
- Make Agent Credit readiness and calls to action phase-specific.
- Provide a clear recovery instruction when a Mandate was activated before its
  application workflow ran: create a new Draft application Mandate.
- Keep the exact Agent API tool registry visible while labelling each tool by
  its actual application/runtime availability.

## Non-goals

- No browser impersonation of the Agent.
- No browser-held Agent credential, key, signature, or automatic Agent call.
- No browser claim that it independently verified an Agent workflow receipt.
- No protocol, authorization, obligation, ledger, servicing, Evidence, policy,
  risk, pricing, or limit change.
- No real funds, withdrawal, provider execution, chain write, signer, contract,
  deployment, KYC, mainnet, or production permission.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.1_DRAFT.md`
- `docs/codex/tasks/WEB_022_AGENT_POST_ACTIVATION_CREDIT_AND_MONITORING.md`

## Acceptance criteria

- [x] Draft Mandate UI exposes a distinct `Open application handoff` action.
- [x] Application copy names Request, Decision, Offer, and the returned receipt.
- [x] Activation copy states that it unlocks an existing Offer's runtime path.
- [x] Active runtime UI never says the Agent can start a new Credit Intent.
- [x] Active-without-Obligation UI explains how to recover if application was
      skipped.
- [x] Runtime handoff identifies application tools as Draft-only and runtime
      tools as ready.
- [x] Existing Human and Agent protocol permissions remain unchanged.
- [x] Static, web-bundle, repository, and local acceptance checks pass.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/*.test.js
pnpm run check:web-bundle
pnpm test
pnpm run local:up
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] The UI does not infer authority from mode, copy, or downloaded metadata.
- [x] Application calls remain Draft Mandate and Agent-authenticated only.
- [x] Acceptance, execution, repayment, and Evidence remain Active Mandate and
      Agent-authenticated where required.
- [x] Principal activation remains an explicit exact-hash confirmation.
- [x] The browser receives no Agent credential, private key, or signature.
- [x] No funds, chain write, signer, deployment, or production permission is
      introduced.

## Verification

- Web tests: 103 passed.
- Repository tests: 669 passed.
- Web bundle integrity: passed with 826 unique DOM IDs.
- Local stack: healthy on `127.0.0.1` ports 8787–8790 with PostgreSQL 17,
  48 migrations, worker, durable Agent proof, reconciliation, and complete
  one-to-one Evidence anchor coverage.
- Local acceptance: passed.
- Browser smoke: the rebuilt 8788 workspace loaded without console errors and
  exposed the exact `Open application handoff`, `Open runtime handoff`, and
  phase-specific activation copy. Authenticated state transition capture still
  requires a fresh user wallet signature.
