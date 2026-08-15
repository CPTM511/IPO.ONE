# WEB-007 private shared-kernel navigation audit

Date: 2026-07-17
Scope: authenticated private Human and Agent navigation at 1440x1000 and
390x844. This audit covers current-session product projection, mode retention,
primary action routing, responsive layout, and isolation of legacy demo state.

## Outcome

Passed for the scoped private no-funds product. Portfolio, Borrow & Credit,
Payments, and Evidence now preserve the selected Human or Agent entry mode and
render the authenticated shared-kernel session instead of the process-local
demo. No horizontal overflow or browser diagnostic messages were observed.

This result does not claim full WCAG conformance or commercial readiness. The
projection remains session-only and real funds remain disabled. The later
PROVIDER-001A implementation passed its local security gates and now appears as
capability status only; it does not claim Provider execution for the current
Obligation. See the separate PROVIDER-001A audit.

## Evidence and steps

1. Opened the authenticated Human Payments page and confirmed the private
   repayment/servicing projection was visible while all legacy Payments demo
   surfaces were hidden. Health: passed.
2. Selected Portfolio, Borrow & Credit, and Evidence from Human mode. Human
   remained pressed, the expected private surface was visible, legacy demo
   surfaces were hidden, and each page reported zero horizontal overflow.
   Health: passed.
3. Selected Agent explicitly. The product returned to the same shared
   Portfolio with Agent copy, bounded-authority status, and no legacy Agent
   fallback. Health: passed.
4. Activated the Agent primary action without a Mandate. It routed to and
   focused the Human Principal authority workbench; it did not create a
   credential or invoke the old demo Agent route. Health: passed.
5. Activated the Human primary action. It routed to and focused the canonical
   Human application workbench. Health: passed.
6. Repeated Portfolio in a 390x844 viewport for Human and Agent. The mobile
   menu closed after navigation, the mode control remained usable, primary
   actions stacked, and `scrollWidth === clientWidth === 390`. Health: passed.
7. Inspected browser diagnostics after the journey. No console or page-error
   messages were present. Health: passed.

## Current-run captures

Before:

- `artifacts/product-design-audit/2026-07-17-navigation-coherence/01-human-start-before.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/02-portfolio-fallback-before.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/03-borrow-fallback-before.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/04-payments-fallback-before.png`

After:

- `artifacts/product-design-audit/2026-07-17-navigation-coherence/05-payments-human-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/06-portfolio-human-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/07-borrow-human-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/08-evidence-human-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/09-portfolio-agent-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/10a-portfolio-human-mobile-viewport-after.png`
- `artifacts/product-design-audit/2026-07-17-navigation-coherence/11-portfolio-agent-mobile-after.png`

## Design review

Strengths:

- The Aave-inspired graphite/lavender hierarchy is consistent across modes
  without copying Aave assets or market semantics.
- High-signal lifecycle, balance, next-payment, and Evidence state appear before
  lower-level protocol detail.
- Human and Agent are visibly parallel modes over one Obligation kernel.
- Mobile actions stack into clear full-width controls and the 390px shell stays
  bounded.

Remaining risks:

- The current private projection is intentionally not durable after reload. A
  durable owned-portfolio query remains a separate product task.
- Evidence contains both an owner summary and a detailed Auditor query console;
  this is functionally justified but should be watched for hierarchy fatigue as
  the product adds more Evidence types.
- Accessibility evidence here is semantic and interaction-focused, not a full
  assistive-technology or WCAG audit.

## Commercialization conflict rule

Historical demo behavior is not a compatibility requirement for the private
product. Where a demo route, fixture, or state projection conflicts with the
Product Charter v1.1 or an approved commercialization requirement, the formal
product requirement wins. Demo infrastructure may remain only when isolated,
explicitly labelled, and unable to supply authenticated product truth.
