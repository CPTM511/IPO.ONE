# WEB-014 product-entry information architecture audit

Audit date: 2026-07-27
Viewports: 1440×1000 and 390×844
Surface: local no-funds private-pilot shell

## Source and implementation evidence

- Editable information architecture:
  `https://www.figma.com/board/GG5rlZHZiODH8KuyUmb1ry`
- `artifacts/product-design-audit/2026-07-27-product-entry/00-figjam-source-2400x1515.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/00b-figjam-capital-partners-source-400x880.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/01-overview-desktop-1440x1000.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/02-capital-partners-desktop-1440x1000.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/03-overview-mobile-390x844.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/04-overview-mobile-product-cards-390x844.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/05-mobile-navigation-390x844.png`
- `artifacts/product-design-audit/2026-07-27-product-entry/06-capital-partners-mobile-390x844.png`

## Verified outcome

- Overview and navigation now separate Credit, Trading Capital, and Capital
  Partners as product intentions. Human and Agent remain access modes over the
  same lifecycle and Evidence kernel.
- Credit retains the existing request-to-repayment route. Trading Capital
  retains its existing route and labels Hyperliquid testnet as the sole MVP
  venue; other adapters remain disabled.
- Capital Partners is a new presentation-only, invitation-only preview.
  Deposit, allocation, and withdrawal controls are disabled and the page
  expressly denies public LP, real capital, custody, and funds authority.
- The existing `capital-network` route, identifiers, presentation module, and
  Provider operations remain intact. Only its visible product label changes to
  Provider Network so it is not confused with an LP product.
- Product cards route through the existing client-side view controller and
  preserve the selected Human or Agent mode. No API operation or backend
  command was added.

## Browser and accessibility checks

- Desktop and mobile reported `scrollWidth === clientWidth` at 1440 and 390 CSS
  pixels.
- Mobile navigation opens with `aria-expanded=true`, removes sidebar `inert`,
  and applies `body.nav-open`; selecting Capital Partners closes the menu and
  restores sidebar `inert`.
- Capital Partners exposes exactly three disabled capital actions: Deposit
  capital, Allocate to facility, and Withdraw.
- Browser warning/error inspection returned an empty result.
- Full-view and focused source/implementation comparisons found no remaining
  actionable P0, P1, or P2 visual issue.

## Regression evidence

- JavaScript syntax check: passed.
- Static UI tests: 6/6 passed.
- Full repository check: 556/556 passed under Node 24.18.0.
- Security tests: 33/33 passed.
- Transport tests: 52/52 passed.
- `git diff --check`: passed.

The transport-only gate initially exposed a stale expected-module list: the
already allowlisted Trading Capital presentation module was imported by the web
entry but omitted from the test expectation. The expectation now covers the
existing fixed asset and the transport gate passes without changing runtime
behavior.
