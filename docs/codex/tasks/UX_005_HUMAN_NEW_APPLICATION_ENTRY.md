# UX-005: Restore the Human new-application entry

Status: Completed

## Context

After authenticated workspace recovery loads a previous Human Obligation, the
Home action labelled `Start Human application` opens the Credit page in
position mode and focuses the old Obligation. The application form, evaluation,
and `Start another application` control are hidden, so the borrower cannot
discoverably create a new request.

This is a UI state-routing defect. The Human application, Decision, Offer,
Obligation, execution, repayment, and Evidence operations still exist, but the
primary Human entry does not switch from the recovered position to a new
application.

## Scope

- Make `Human borrowing` / `Start Human application` open a fresh Human
  application when a prior Obligation is loaded.
- Keep the prior Obligation durable and available through Obligations,
  Repay & Settle, Evidence, and a visible return-to-current-credit action.
- Expose a prominent `Start a new Human loan` action when the Credit page is
  showing a completed or current recovered position.
- Preserve the existing Human Subject while requiring a fresh scoped Consent
  for each new Credit Intent.
- Add automated and browser coverage for the recovered fully-repaid state.
- Update the Human user manual only where the entry behavior changes.

## Non-goals

- No Agent UI, Agent workflow, Mandate, credential, API, or runtime change.
- No protocol-kernel, Offer, Obligation, Ledger, repayment, Evidence, or risk
  policy change.
- No real funds, Testnet transaction, new signer, KYC vendor, deployment, or
  production permission.
- No deletion or mutation of the prior durable Obligation.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/codex/audits/UX-005/`

## Acceptance criteria

1. With a recovered Human Obligation, clicking `Start Human application`
   displays the request form and `Request & evaluate credit`.
2. The prior Obligation remains loaded and is not deleted or mutated.
3. A visible `Start a new Human loan` action is available when reviewing the
   recovered position.
4. Starting another request preserves the Human Subject, clears the prior
   Consent from the new application, and requires `Create scoped Consent`
   before evaluation.
5. The user can return to the current credit position.
6. Human request → evaluation → Offer remains browser-operable after the
   transition.
7. Agent source behavior and contracts are unchanged.
8. The local no-real-funds and offchain/Testnet truth boundaries remain
   explicit.

## Test commands

```bash
node --test apps/web/test/*.test.js
pnpm test
pnpm run local:up
pnpm run local:status
git diff --check
```

## Security checklist

- [x] Existing Obligation remains durable and owner-bound.
- [x] New application cannot reuse the prior Consent.
- [x] Raw KYC/PII remains absent from the browser.
- [x] Exact Offer acknowledgement and account confirmation remain.
- [x] No Agent authority or behavior changes.
- [x] No chain, deployment, or real-funds claim expands.

## Completion evidence

- Browser audit: `docs/codex/audits/UX-005/README.md`
- Before screenshot:
  `docs/codex/audits/UX-005/01-before-human-entry-hidden.jpg`
- Recovered-position screenshot:
  `docs/codex/audits/UX-005/02-after-recovered-position-has-new-loan-action.jpg`
- New-application screenshot:
  `docs/codex/audits/UX-005/03-after-home-opens-new-human-application.jpg`
- `node --test apps/web/test/*.test.js`: 109 passed
- `pnpm test`: 681 passed
- Local stack: PostgreSQL, pilot, and worker healthy
