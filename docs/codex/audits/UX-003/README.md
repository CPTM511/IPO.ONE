# UX-003 Browser Operability Audit

Date: 2026-07-31

## Scope

This audit verifies the two questions that were not discoverable in the prior
product UI:

1. Where a Human starts borrowing and runs credit evaluation.
2. How an Agent turns an approved Offer into an Obligation, executes an approved
   use, repays, and reads Evidence.

The audit is limited to the local no-real-funds product. It does not assert live
funds, production deployment, or a new Base Sepolia transaction.

## Verified browser journeys

### Human

1. Authenticated Home exposes `Start Human application`.
2. The action opens `Credit` / `Human Workspace`.
3. `Create Human Subject` and `Create scoped Consent` unlock
   `Request & evaluate credit`.
4. Evaluation returns an Approved Decision, a $120.00 Offer, 9% annual rate,
   exact Offer/terms hashes, reason codes, and Decision Passport.
5. Exact Offer acknowledgement unlocks `Confirm & create sandbox Obligation`.
6. `Confirm with account` creates one $120.00 sandbox Obligation and schedule.

### Agent

1. `Run Agent application online` returns the Decision and $100.00 Offer.
2. The Principal reviews and activates the exact Mandate.
3. `Create Agent Obligation` creates one pending-execution Obligation.
4. `Execute approved use` records a non-withdrawable $100.00 sandbox use.
5. `Repay Agent obligation` posts $100.00 and leaves $0.00 principal.
6. `Verify Agent Evidence` reaches `Lifecycle verified` with one verified event.

Each Agent action is a separate visible button and only becomes enabled after
the preceding durable state exists.

## Screenshot evidence

- `02-agent-obligation-ready.png`: exact Offer ready; only Obligation creation
  is enabled.
- `03-agent-approved-use.png`: approved use executed; early repayment enabled.
- `04-agent-lifecycle-verified.png`: fully repaid and Evidence verified.
- `05-human-home-shortcut.png`: Human and Agent borrowing shortcuts on Home.
- `06-human-evaluation-ready.png`: Human credit form and enabled evaluation.
- `07-human-evaluation-result.png`: deterministic Decision and exact Offer.

`01-agent-application-ready.png` is an intermediate pre-activation capture and
is retained for traceability.

## Safety observations

- Every page retains the no-funds boundary.
- Agent use is described as Mandate-approved and non-withdrawable.
- The browser receives sanitized receipts, not an Agent credential.
- Human Offer acceptance still requires exact acknowledgement and a second
  account confirmation.
- The local Human fixture correctly states that no chain transaction is
  configured; hashes are not presented as BaseScan transactions.

## Result

Pass for local browser discoverability and action sequencing. This is an
unsealed successor to `LOCAL-RC-002`; the sealed manifest was not changed.
