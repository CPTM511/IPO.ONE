# FINAL-CREDIT-LOOP-001 / PR 1 — UX_REACHABILITY_001

Status: In progress

## Context and current baseline

The M1-B hosted no-funds release at accepted SHA
`74ac425dad33bf667ee2550e33e36220dcfed402` authorizes Borrower access to
Repay & Settle, Credit Passport, and Credit Track Record, but the workspace
application hides their navigation controls because they are not primary
destinations. `More tools` cannot override the HTML `hidden` state. Existing
tests constrain primary navigation to four items but do not prove that every
allowed destination has a visible entry point.

This issue implements PR 1 from the Founder-directed FINAL-CREDIT-LOOP-001
repair pack. It is an L0/L1 synthetic, no-real-funds product-usability repair.

## Scope

- Replace independent navigation arrays with one manifest that defines role
  authorization, primary/advanced placement, label, and capability state.
- Keep `allowed` authorization separate from placement.
- Restore visible click entry points for Repay & Settle, Credit Passport, and
  Credit Track Record.
- Preserve a visible reason and recovery condition for unavailable capability
  states.
- Add automated invariants and real click-path coverage for every role-allowed
  destination and mandatory Human/Agent parity entry.
- Merge the FINAL-CREDIT-LOOP AGENTS.md guardrail.

## Non-goals

- No protocol, Offer, Obligation, repayment, Ledger, or credit-policy change.
- No CreditState schema or migration; that belongs to PR 2.
- No contract, signer, chain write, real funds, mainnet, custody, withdrawal,
  external Provider, or production permission.
- No visual redesign or unrelated dependency/module change.

## Likely files

- `AGENTS.md`
- `apps/web/src/workspace-surface-access.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/test/workspace-surface-access.test.js`
- `apps/web/test/static-ui.test.js`
- focused browser support/tests under `apps/web/test/`

## Acceptance criteria

1. Given any supported workspace role, when access policy is resolved, then
   every destination has exactly one allowed/primary/advanced placement truth.
2. Given an allowed advanced view, when the workspace renders, then a visible
   click control reaches it without hash editing or internal functions.
3. Given Repay & Settle, Credit Passport, or Credit Track Record is allowed,
   when a Borrower opens normal navigation, then each is discoverable and
   reachable by visible controls.
4. Given a capability is disabled or unconfigured, when its entry renders,
   then the reason and recovery condition remain visible.
5. Given a mandatory Human action, when parity is checked, then a corresponding
   versioned Agent API/MCP operation is registered.
6. Given no wallet, no role, or a valid role, when Sign in is opened, then the
   state is explicit and fail-closed.

## Test commands

```sh
node --test apps/web/test/workspace-surface-access.test.js apps/web/test/workspace-navigation.test.js apps/web/test/static-ui.test.js
pnpm run check:web-bundle
pnpm run test:transport
pnpm run check
git diff --check
```

Real-browser preview acceptance must click every allowed destination and record
the deployed SHA; direct hashes and internal view functions are prohibited.

## Security checklist

- [ ] Authorization remains deny-by-default and role-bound.
- [ ] Navigation placement cannot grant a capability.
- [ ] No raw PII, KYC, credential, signature, or secret is added.
- [ ] No economic mutation is hidden behind a generic navigation label.
- [ ] No funds, signer, contract, risk, or permission authority is added.
- [ ] Unavailable states are explicit and non-fabricated.

## Permission boundary

Founder authorization in FINAL-CREDIT-LOOP-001 covers the scoped no-funds code,
test, documentation, preview deployment, and target-sandbox deployment work.
It does not cover real funds, mainnet, custody, arbitrary spend, signer
authority, destructive data changes, or material product expansion.

## Data and migration impact

None. PR 1 changes presentation policy and tests only.

## Rollback plan

Revert the PR 1 commit and restore the previously recorded M1-B deployment.
No database rollback is required.

## Required Evidence

- Before/after manifest and visible-control inventory.
- Local targeted and aggregate test results.
- Preview deployment ID, exact SHA, URL, and click-path results.
- Console/network error record and accessibility checks.
- Rollback deployment identity.

## Dependencies and sequencing

This is stage 1 of 3. PR 2 may begin only after this stage is committed,
preview-deployed, and verified to the maximum available authority. PR 3 remains
truthful-chain-status work and may not provision or reuse an unapproved signer.

## Completion Evidence

Pending implementation and deployed preview verification.
