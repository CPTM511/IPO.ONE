# WEB-010 Dual-native Servicing Case workspace audit

Date: 2026-07-17
Result: passed locally
Boundary: authenticated loopback Human pilot, fixed synthetic no-real-funds fixture

## Outcome

The authenticated Payments product surface now renders one formal Servicing
Case from the exact shared `obligation.v2`. It exposes trusted-time
classification and DPD, past-due principal/interest/fees, total outstanding,
schedule sequence, next due, servicing policy, immutable schedule, returned
servicing action and owner Evidence. It does not create a parallel UI state
machine.

The presentation fails closed when lifecycle/classification, DPD bucket,
trusted time, schedule balances, oldest-unpaid reference, policy, hashes,
sandbox flags, action source, action balances or resulting state drift. Human
repayment reuses only `pilotPostSandboxRepayment` and the existing correlation/
idempotency sequence. Restructure, repurchase and write-off remain visible only
as Operations + Risk dual-control boundaries.

Agent mode never displays the Human session Obligation as Agent state. It
points to the already approved `pilotPostSandboxRepayment` and
`pilotReadOwnObligationEvidence` SDK/MCP path and adds no tool or permission.

## Browser evidence

The in-app browser exercised the real same-origin lifecycle Host:

1. create Human Subject and scoped Consent;
2. request/evaluate and accept the exact Offer;
3. execute the nonwithdrawable sandbox Obligation;
4. open the active Servicing Case;
5. submit a $60 synthetic-bank repayment;
6. verify the exact returned `Cured` classification, $60 remaining balance and
   `servicing_cured_by_repayment` action;
7. open and load five immutable owner Evidence events, including
   `servicing_cured`;
8. switch to Agent mode and verify Human case state is hidden.

Desktop and 390x844 responsive states were captured. At 390px, page scroll
width equalled viewport width and the primary repayment control measured 44px.
No application console warning/error was recorded.

## Visual comparison

Primary source:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`

Secondary source:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`

Artifacts are under
`artifacts/product-design-audit/2026-07-17-servicing-case/`. A same-input
source/implementation review confirms the intended Aave-derived hierarchy:
graphite overview, large white operating surface, muted lavender state,
finance-style metrics and clear actions. No actionable P0/P1/P2 mismatch
remained.

## Regression and security evidence

- Node 24.18.0 syntax checks: passed.
- Presentation/static UI tests: 5/5 passed.
- `pnpm run check`: 296/296 passed.
- `pnpm run test:security`: 21/21 passed.
- `pnpm run test:transport`: 35/35 passed.
- Tenant transport conformance: 6/6 passed on loopback.
- `sandboxOnly=true`, `productionFundsMoved=false`, trusted UTC, zero penalty,
  DOM-safe rendering and Operations + Risk disposition boundaries are explicit.

This increment adds no route, Tenant operation, SDK method, MCP tool,
capability, permission, database state, policy, caller clock, privileged
disposition, production deployment or real funds.
