# UX-006 Gate 1.2: Permanent pseudo-button control semantics

Status: Complete locally

Date: 2026-08-12

Baseline commit: `65f999c0882ebd16486324509e0eb342a116cb19`

Branch: `codex/m1-b-deployable-sandbox`

Phase: Product Optimization Phase 1 / `L0_LOCAL_NO_FUNDS`

Requirements: `REQ-UX-005`, `REQ-CREDIT-006`, `REQ-CREDIT-008`,
`REQ-EXEC-004`, `REQ-PAY-004`, `REQ-TRADE-002`, `REQ-TRADE-003`

## Context

UX006-P1-002 confirms ten static `<button disabled>` elements with no ID,
handler, or possible enable transition. They present permanently unavailable
capital, settlement, withdrawal, pricing and transaction-submission
capabilities as interactive controls. Gate 1.1 is complete locally; this is the
next ordered UX-006 issue and the sole owner of this presentation increment.

The underlying prohibitions are correct and remain unchanged. The defect is
the control semantics: a capability that cannot be invoked in this phase is
status information, not a button.

`RELEASE-001` and `M1-A.1` remain blocked umbrella/release work and do not own
this increment. Existing Capital Network and Risk browser fixture changes are
user-owned and excluded.

This issue supersedes only WEB-014's old presentation wording that required
permanent capital-boundary controls to be disabled buttons. Its safety outcome
remains unchanged. PRODUCT-INTEGRATION-001 still fails closed at the execution
boundary, but this browser no longer offers a transaction-submission attempt as
a control. The underlying no-provider/no-submission behavior is unchanged.

## Scope

- Replace exactly ten permanent handler-less disabled buttons with
  non-interactive status rows or phase-boundary badges.
- Preserve each exact unavailable capability label and add a concise reason.
- Use one shared semantic pattern across Capital Partner, Provider Network,
  Trading Capital and Wallet & Permissions.
- Keep state-dependent buttons with real handlers unchanged; their temporary
  disabled prerequisites remain governed by current render logic.
- Add a fail-closed static regression that forbids any button which has no ID,
  generic action attribute or discoverable handler, including disabled ones.
- Update the user-facing control contract and UX-006 audit closure evidence.

## Non-goals

- No enabling Deposit, allocation, funding, withdrawal, public pool, production
  pricing, worker settlement or transaction submission.
- No new handler, API operation, permission, role, capability, state transition,
  wallet method, execution route, worker command or funds authority.
- No change to Capital Partner Offer withdrawal, Provider acknowledgement,
  Trading Capital close/proof, or wallet execution state machines.
- No protocol, database, migration, seed, deployment, credential, remote access,
  chain, signer, custody, mainnet or funds movement change.
- No broad redesign of the four product surfaces and no Gate 1.3 internal-ID
  remediation.

## Exact permanent-control inventory

| Surface | Current pseudo-buttons | Truthful non-interactive meaning |
| --- | --- | --- |
| Capital Partner | `Deposit`, `Allocate funds`, `Withdraw` | Real capital/custody lifecycle is not enabled |
| Provider Network | `Join public pool`, `Fund facility`, `Withdraw`, `Set production pricing` | Public/remote capital and pricing authority require separate human gates |
| Trading Capital | `Run settlement · worker only`, `Withdraw · unavailable` | Settlement is worker-controlled and synthetic; withdrawal has no product path |
| Wallet & Permissions | `Submit transaction · unavailable` | Local runtime can prepare Evidence but cannot submit a transaction |

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/capital-partner-boundary-browser-host.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`
- this issue

## Acceptance criteria

- All ten inventory items remain visible as non-interactive status content in
  the same role surface and retain an explicit unavailable reason.
- None is a `button`, link, form control, tab stop, click target, ARIA button or
  hidden route to the prohibited capability.
- No new operation, handler or network request is introduced.
- Every remaining button either has an ID referenced by browser logic or one
  approved generic action attribute; a static `disabled` attribute no longer
  exempts a handler-less button from the inventory test.
- State-dependent real buttons continue to render and enable only on their
  existing server-derived prerequisites.
- Capital Partner, Provider Network, Trading Capital and Wallet & Permissions
  render at desktop, 390px and 200 percent zoom without horizontal task-flow
  overflow; keyboard traversal skips unavailable status rows.
- Browser consoles are clean and clicking/tabbing adjacent real controls does
  not trigger any prohibited request.

## Exact test commands

```sh
node --test apps/web/test/static-ui.test.js
pnpm run test:transport
pnpm run test:security
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

Real-browser Evidence must inventory the four affected surfaces, current
tabbable controls, overflow, console and request behavior at desktop, 390px and
200 percent zoom.

## Security checklist

- [x] Every prohibited capability remains unavailable and non-authorizing.
- [x] No public operation, handler or transport surface is added.
- [x] Status content cannot receive focus or dispatch a request.
- [x] Existing real controls retain server-derived prerequisites.
- [x] No dependency, script, analytics, credential or external service is added.
- [x] Product claims remain local, synthetic and no-funds.

## Permission boundary

Founder approval to continue ordered UX-006 remediation authorizes this local
presentation-only correction. It does not authorize capital, settlement,
withdrawal, pricing, execution submission, deployment, chain or funds powers.

## Data and migration impact

None.

## Rollback plan

Revert only the semantic HTML/CSS, static control inventory assertions, user
copy and closure evidence. No durable state or migration rollback is required.

## Completion Evidence

Completed locally on 2026-08-12 against baseline
`65f999c0882ebd16486324509e0eb342a116cb19` plus the reviewed, uncommitted Gate
0 and Gate 1.1 changes. This issue was the sole implementation owner for the
bounded 3+4+2+1 presentation hunk; `RELEASE-001` and `M1-A.1` were not resealed,
and user-owned Capital Network/Risk fixture changes were not absorbed.

- Exactly ten permanent pseudo-buttons became four semantic status lists:
  Capital Partner 3, Provider Network 4, Trading Capital 2, and Wallet &
  Permissions 1. Every row preserves its exact label and reason, uses
  `role=listitem`, and contains no button, link, form control, tabindex, data
  action, inline handler, route, or request surface.
- The complete static button inventory now includes initially disabled buttons:
  there are **34** remaining state-dependent disabled buttons, all with stable
  IDs referenced by browser logic, and **0** anonymous disabled buttons. The
  targeted static UI and workspace-surface suites passed **24/24**. This static
  inventory is structural proof; real enable/result behavior remains covered
  by its role fixtures and later full-control-matrix work.
- Transport passed **79/79**; security passed **33/33** on isolated rerun (an
  earlier parallel run only missed the test-server readiness timeout). Web
  bundle integrity passed with 1 external module, 33 authored modules and 891
  unique IDs. Source lint, boundary lint, contract typecheck and
  `git diff --check` passed. Aggregate repository regression passed **925/925**.
- Real-browser evidence is in `output/playwright/ux-006-gate1-2/`: four surface
  audits, twelve screenshots, console/request logs, contrast and reduced-motion
  observations. At 1440px, 390px and 720px (200%-equivalent), document, body and
  list overflow were all zero. Eighty Tab presses per surface never entered a
  status list; each list had zero focusable descendants. All three fixture
  consoles had 0 errors and 0 warnings, and request logs contained only access,
  catalog and bounded read operations; prohibited economic mutations were zero.
- Status-row strong and explanatory text measured **16.09:1** and **6.11:1**
  against their background. With reduced motion enabled, animation and
  transition durations were `0.01ms`.
- The verification-only Capital Partner boundary fixture is authenticated but
  grants one read capability and rejects every Tenant mutation. It adds no
  product or protocol authority. No database, migration, seed, API operation,
  production deployment, credential, chain, signer, custody, pricing, capital,
  withdrawal, settlement, or funds path changed.
- Current-source isolated no-funds review links remain available:
  `http://127.0.0.1:8787/#overview`,
  `http://127.0.0.1:8788/#request-credit`,
  `http://127.0.0.1:8789/#risk-operations`, and
  `http://127.0.0.1:8790/#capital-partners`. Production remains unchanged.
