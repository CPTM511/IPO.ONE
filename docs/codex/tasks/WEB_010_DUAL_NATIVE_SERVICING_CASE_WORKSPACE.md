# WEB-010: Dual-native Servicing Case workspace

Status: Completed locally on 2026-07-17 within Product Charter v1.1 and the approved
SERVICING-001 no-real-funds kernel. Commercial product requirements supersede
the older Payments summary and legacy DEMO servicing panel where they conflict.

## Context

The shared kernel already derives trusted-time DPD/default state, applies cure
inside the existing repayment transaction, and preserves dual-controlled
restructure, repurchase, and write-off Evidence. The authenticated Payments UI
shows only four totals and a schedule. A Human cannot see the active servicing
stage, past-due amount, cure condition, policy clock, schedule version, or the
boundary between self-service repayment and privileged disposition. Agent
Runtime likewise does not identify the existing repayment plus owned-Evidence
path as the machine servicing entry.

The product needs a formal case experience over the existing Obligation truth,
not a second UI state machine and not a new servicing permission.

## Scope

- Add a closed presentation module for an already schema-validated
  `obligation.v2` servicing state.
- Replace the authenticated Payments summary with an Aave-inspired Servicing
  Case workspace: exact Obligation, lifecycle/classification, DPD, outstanding,
  past-due amount, next due, schedule version, trusted evaluation time, stage
  ladder, schedule, cure plan, and latest repayment-derived servicing action.
- Let the authenticated Human post a bounded synthetic cure payment from the
  case workspace through the existing `pilotPostSandboxRepayment` operation.
- Keep the original Human Obligation repayment control in sync with the case
  input and result; no duplicate ledger or servicing command may exist.
- Link the case to the existing owner Evidence timeline.
- In Agent mode, identify the existing local repayment workflow and owned
  Evidence tool as the same servicing path without presenting Human state as an
  Agent-owned case.
- Present restructure, repurchase, and write-off as Operations + Risk
  dual-control boundaries only; do not expose an executable privileged action.
- Reuse the existing graphite/white/lavender product system and icon sprite,
  then verify desktop and 390px states in the real browser.

## Non-goals

- No new Tenant operation, route, SDK method, MCP tool, capability, permission,
  approval artifact workflow, system-worker trigger, schedule write, policy,
  reason code, database projection, or protocol state.
- No borrower- or Agent-controlled clock, DPD, classification, cure flag,
  restructure, repurchase, write-off, default, or Evidence field.
- No collections, notices, bureau reporting, hardship intake, legal/default
  action, external servicer, production accounting, real payment, custody,
  withdrawal, capital, or funds movement.
- No raw KYC/PII, account, credential, signature, approval identity, or provider
  payload.

## Likely files

- `apps/web/src/servicing-case-presentation.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/servicing-case-presentation.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`
- `docs/codex/audits/WEB_010_DUAL_NATIVE_SERVICING_CASE_WORKSPACE/`
- `design-qa.md`

## Acceptance criteria

- [x] A valid Human `obligation.v2` produces one read-only Servicing Case from
  the canonical lifecycle/classification pair and no UI-owned status.
- [x] The case shows the exact DPD stage, past-due amount, outstanding amount,
  next due, schedule sequence, trusted servicing time, policy, owner, and
  schedule rows without using browser time as servicing authority.
- [x] Unknown status/classification pairs, invalid policy/safety flags, malformed
  installments, inconsistent oldest-unpaid references, and unsafe times fail
  closed instead of presenting an actionable case.
- [x] The Human cure action calls only `pilotPostSandboxRepayment`, uses the
  existing workflow correlation/idempotency sequence, and re-renders the exact
  returned Obligation and servicing action.
- [x] Cure guidance is derived from past-due installment components and never
  claims cure before the returned state says `cured` or current-performing.
- [x] Agent mode points to the existing repayment SDK/MCP workflow and owned
  Evidence contract without displaying a Human-owned live case.
- [x] Privileged dispositions are visibly dual-controlled and non-executable in
  this workspace.
- [x] Evidence navigation, empty/active/delinquent/cured states, focus, loading,
  disabled and success states remain usable at desktop and 390px.
- [x] Desktop/mobile browser evidence has no horizontal overflow or console
  diagnostics, and Product Design QA passes against the selected Aave sources.

## Test commands

```sh
node --check apps/web/src/servicing-case-presentation.js
node --check apps/web/src/app.js
node --test apps/web/test/servicing-case-presentation.test.js apps/web/test/static-ui.test.js
pnpm run check:tenant-protocol
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security checklist

- [x] All presentation values come from the already validated Obligation and
  latest exact repayment result; API-controlled text uses DOM-safe construction.
- [x] The case never accepts a caller status, DPD, due amount, Evidence hash,
  policy, servicing owner, schedule version, or privileged reason.
- [x] Human/Agent mode switching cannot relabel a Human Obligation as Agent
  state or broaden an Agent Mandate.
- [x] Repayment remains bounded, synthetic, idempotent, and nonwithdrawable.
- [x] `sandboxOnly=true`, `productionFundsMoved=false`, trusted UTC, zero
  penalties, and Operations + Risk disposition boundaries remain visible.
