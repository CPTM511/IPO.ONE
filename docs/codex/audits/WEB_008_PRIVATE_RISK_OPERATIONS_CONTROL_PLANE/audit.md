# WEB-008 private Risk Operations control-plane audit

Date: 2026-07-17
Scope: authenticated Risk Operator and Human Borrower Risk Operations states,
desktop 1440x1000 and mobile 390x844, plus current Node 24 repository gates.

## Outcome

Passed for the scoped private no-real-funds product. The authenticated risk
view now exposes one authoritative aggregate portfolio query and one
protective-only Agent Subject freeze. The historical DEMO reset, Admin
Dashboard, plugin/rail fixtures, and raw object inspector remain test
infrastructure but are hidden from the connected private product.

This does not approve unfreeze, limit increases, real funds, production
identity, deployment, alerting, on-call ownership, external servicing, or
commercial launch.

## Functional evidence

Risk Operator fixture:

- queried exact portfolio `risk_portfolio_browser_qa`;
- rendered `$125,000.00` approved limits, `$48,750.00` utilized, `39%`
  utilization, `$34,250.00` outstanding, three adverse Obligations, and two
  complete asset-exposure rows;
- submitted exact Subject `agent_subject_browser_qa` with
  `risk_limit_breach` and explicit acknowledgement;
- received `Active -> Suspended`, refreshed aggregate Subject counts from
  36 active / 2 suspended to 35 active / 3 suspended, and refreshed frozen
  CreditLine count from one to two;
- cleared the acknowledgement and disabled replay from the UI after success.

Human Borrower fixture:

- the exact same portfolio identifier returned `Risk or Auditor access is
  required, or the portfolio is unavailable`;
- status became `Access required`, values remained `$0.00`, zero asset rows
  were rendered, and no resource-existence distinction was exposed;
- the legacy DEMO risk surface remained hidden.

## Design and responsive evidence

The approved Aave Pro reference and loaded IPO.ONE implementation were viewed
together in one comparison input. The current build reuses the existing
graphite sidebar, dark operational header, restrained lavender emphasis, white
data plane, large financial numerals, compact posture cards, and dense table.
It translates the reference into IPO.ONE risk semantics rather than copying
market/token content or Aave assets.

Desktop review found no clipped primary control or document-level horizontal
overflow. At 390x844:

- `scrollWidth === innerWidth === 390`;
- the private surface measured 358px and both primary actions measured 326px;
- metric and posture grids stacked into one column;
- two asset rows each measured 324px and rendered labeled mobile cells;
- no browser warning or error was captured.

Current-run captures:

- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-desktop-loaded.png`
- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-desktop-frozen.png`
- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-mobile-viewport.png`

The earlier full-page mobile artifact is retained only as runner diagnostics;
the dimensionally verified viewport capture above is the visual source of
truth.

## Verification

- Node runtime: 24.18.0; pnpm: 11.1.3.
- `pnpm run check`: 276/276 passed; 41 schemas, 21 migration pairs, 32 Tenant
  operations, and ten Agent MCP tools stayed exact.
- Fresh PostgreSQL 17 integration: 55/55 passed.
- Security: 21/21 passed.
- Authenticated transport/SDK/MCP: 35/35 passed.
- Provider process: 5/5 passed.
- Static UI and syntax checks passed.
- `git diff --check` passed for the implementation checkpoint.

## Remaining commercialization gaps

- Add named alert recipients, servicing queues, stop-loss/cap monitoring,
  freeze/pause runbooks, on-call ownership, and incident exercises.
- Keep unfreeze, exposure increases, production credentials, and private/real
  deployment behind separate reviewed permissions.
- Repeat assistive-technology and independent security assessment before any
  external private pilot; this audit is not full WCAG or penetration-test
  evidence.
