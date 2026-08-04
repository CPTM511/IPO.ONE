# UX-SAFE-002 — Safe repayment default

Status: Completed locally  
Started: 2026-07-31  
Baseline commit: 4b0e41dde352283e0d27228d51d1fb99f04c97a8  
Depends on: UX-SAFE-001 completed  
Phase: Product Optimization Phase 1 / L0 local integration

## Context

At the recorded baseline, the servicing workspace displayed the next
installment but recommended total outstanding whenever the Obligation was not
past due. For the standard fixture, total outstanding was 9000 minor units
while the next partially unpaid installment was 3000.

The confirmation step reduces accidental submission, but an unsafe default can
still cause a user to repay more than the visible next amount.

## Scope

- For current or cured servicing, default to the first unpaid installment's
  remaining principal, interest and fee.
- For adverse servicing, continue to default to the complete exact past-due
  cure amount.
- For a fully repaid Obligation, return zero and keep repayment unavailable.
- Add presentation tests for current partial installment, delinquent cure,
  cured next installment and fully repaid state.
- Verify that the Human repayment form receives the new safe default without
  changing the deterministic repayment waterfall.

## Non-goals

- No payoff-quote operation or full-payoff product flow.
- No Ledger, waterfall, schedule, DPD or servicing-policy change.
- No amount cap, pricing, interest or fee change.
- No migration, API, Schema, role or permission change.
- No real funds, external payment rail or deployment.

## Likely files

- apps/web/src/servicing-case-presentation.js
- apps/web/test/servicing-case-presentation.test.js
- existing Human lifecycle browser host for verification only

## Acceptance criteria

1. Given a current Obligation with total outstanding 9000 and next installment
   outstanding 3000, when the servicing presentation is created, then
   suggestedPaymentMinor is 3000.
2. Given multiple past-due installments, when a cure is available, then the
   suggestion equals the complete pastDueMinor.
3. Given a cured Obligation with one future unpaid installment, when the
   presentation is created, then the suggestion equals that installment's
   remaining amount.
4. Given a fully repaid Obligation, when the presentation is created, then the
   suggestion is zero and repaymentAvailable is false.
5. Given a user is actively editing repayment amount, when the UI re-renders,
   then the current focus guard continues to prevent overwriting the input.
6. The submitted amount remains server-validated and allocation remains fee,
   interest, then principal.

## Test commands

node --test apps/web/test/servicing-case-presentation.test.js

node --test apps/web/test/*.test.js

pnpm run check:web-bundle

git diff --check

Real browser:

- create a 120.00 two-installment Human Obligation;
- verify next payment is 60.00 and default repayment is 60.00;
- verify the user can deliberately edit the amount;
- submit the exact 60.00 synthetic repayment;
- verify outstanding becomes 60.00 and Evidence remains queryable.

## Test-layer selection

Selected: pure presentation tests for current, multiple-past-due, cured and
terminal states; full Web and repository tests; real-browser repayment,
keyboard focus and 200-percent-equivalent responsive reflow. PostgreSQL/RLS,
Worker and protocol migration tests are omitted because the changed value is a
presentation default; server validation, accounting and persistence are
unchanged and remain covered by aggregate regression tests.

## Security checklist

- [x] Default minimizes unintended economic effect.
- [x] Server remains authoritative for amount and repayment allocation.
- [x] Past-due cure remains exact and complete.
- [x] No Ledger or accounting rule changes.
- [x] No permission, external rail or real-funds path is added.
- [x] No raw PII, credential or signature is introduced.

## Permission boundary

Presentation-only default. Existing Human repayment authority, confirmation,
server validation and accounting behavior are unchanged.

## Data and migration impact

No migration or durable-state change.

## Rollback plan

Revert the presentation calculation and its tests. No durable data rollback is
required.

## Required Evidence

- Unit tests proving all four repayment states.
- Full Web test result.
- Browser capture showing next installment and matching default amount.
- Receipt showing the exact submitted amount and remaining outstanding.

## Completion Evidence

Completed on 2026-07-31:

- servicing presentation tests: 6/6 passed, covering current, multiple
  past-due, cured and fully repaid states;
- full Web tests: 111/111 passed;
- real browser created and executed a 120.00 two-installment Human sandbox
  Obligation;
- the two visible installments were 60.00 each and the repayment input
  defaulted to 60.00, not the 120.00 total outstanding;
- the explicit confirmation summarized a 60.00 synthetic repayment;
- after submission, the first installment was Paid, the second remained
  Scheduled, Total repaid was 60.00 and Outstanding was 60.00;
- the remaining next-installment default stayed 60.00;
- keyboard input changed the default to 50.00; an owner-authorized Evidence
  refresh re-rendered the workspace while the input retained focus, and both
  synchronized repayment inputs remained 50.00;
- in a 600 CSS-pixel layout viewport with device scale factor 2, equivalent to
  the 1200-pixel baseline at 200 percent zoom, `clientWidth` and `scrollWidth`
  both remained 600; the focused 50.00 input and the complete repayment button
  were visible with no horizontal task flow;
- the durable Evidence timeline remained owner-queryable, while the separate
  latest-event visibility gap is assigned to TRUST-002;
- captures:
  `output/playwright/ux-safe-002-next-installment-default.png` and
  `output/playwright/ux-safe-002-after-single-installment.png`, plus
  `output/playwright/ux-safe-002-reflow-200-equivalent-focus.png`.

Decision: the repayment default now minimizes accidental effect without
changing server validation, the deterministic waterfall or repayment
authority.
