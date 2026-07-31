# UX-005 Human new-application entry audit

Date: 2026-07-31

Scope: authenticated Human no-funds borrowing only. Agent flows, protocol
contracts, Testnet anchoring, production deployment, and real funds were not
changed.

## Finding

The Home action labelled `Start Human application` navigated to the Human Credit
view but did not change the restored workspace from its prior Obligation into a
new-application state. Because the application form and the former restart
button were both hidden in position mode, a fully repaid borrower could see the
old lifecycle but could not discoverably apply again.

## Repair

- `Start Human application` now enters the existing new-application state when
  any prior Human Obligation is restored.
- The recovered position exposes a visible `Start a new Human loan` action in
  the application header.
- A new application preserves the opaque Human Subject, clears the old Consent,
  and requires a fresh scoped Consent before evaluation.
- The prior Obligation remains durable and appears in the owner-authorized
  Obligations list; the new request becomes the current position only after its
  own Offer is accepted.

## Browser verification

1. **Healthy** — created a Human Subject and scoped Consent.
2. **Healthy** — requested and evaluated $120 / 60 days / 2 installments.
3. **Healthy** — acknowledged the exact Offer and created the sandbox
   Obligation with the account confirmation.
4. **Healthy** — executed the no-funds Obligation.
5. **Healthy** — posted a $120 early repayment and reached `Fully Repaid`.
6. **Healthy** — confirmed `Start a new Human loan` is visible on the recovered
   completed position.
7. **Healthy** — returned Home and clicked `Human borrowing`; the new request
   form opened with `Request & evaluate credit` visible and disabled until a
   fresh Consent was created.
8. **Healthy** — created the fresh Consent and received a new explainable Offer.
9. **Healthy** — opened Obligations and confirmed the prior owner-bound
   Obligation reference and zero balance remained available.

## Visual evidence

- `01-before-human-entry-hidden.jpg` — reproduced the old completed position
  with no reachable application action.
- `02-after-recovered-position-has-new-loan-action.jpg` — repaired completed
  position with the visible restart action.
- `03-after-home-opens-new-human-application.jpg` — second Human application
  evaluated to a fresh Offer.

## Automated verification

- `node --check apps/web/src/app.js`
- `node --test apps/web/test/*.test.js` — 109 passed
- `pnpm test` — 681 passed
- `pnpm run local:up` — healthy
- `pnpm run local:status` — PostgreSQL, pilot, and worker healthy
- `git diff --check`

## Evidence limits

This audit proves browser operability against the local authenticated no-funds
QA host and the rebuilt local stack. It does not prove a Base Sepolia
transaction, production identity, real capital movement, production
deployment, or Agent behavior.
