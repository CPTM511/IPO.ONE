# WEB-014: Product entry information architecture

Status: Implemented and verified on 2026-07-27 under Product Charter v1.1 and the
no-real-funds private-pilot boundary.

## Context

The authenticated product currently presents a flat destination list that mixes
products, lifecycle stages, user roles, integrations, Evidence, and operations.
The approved product-structure discussion separates three top-level user
intentions:

1. Credit;
2. Trading Capital, with Hyperliquid as the MVP venue; and
3. Capital Partners, as an invitation-only preview with no funding actions.

Human and Agent remain parallel access modes over one shared obligation kernel.
The existing `capital-network` implementation is a Provider assignment,
delivery, and reconciliation workspace; it must not be presented as the capital
provider or LP product.

Design source:

- Editable FigJam:
  `https://www.figma.com/board/GG5rlZHZiODH8KuyUmb1ry`

## Scope

- Group the existing sidebar destinations by product, credit lifecycle,
  access/integration, and Evidence/operations.
- Add direct Credit, Trading Capital, and Capital Partners entry cards to the
  authenticated Overview.
- Add a static, explicitly disabled Capital Partners preview page.
- Rename the user-visible Capital Network destination and page to Provider
  Network while preserving its internal route, IDs, presentation contract, and
  runtime behavior.
- Label Hyperliquid as the only MVP Trading Capital venue and keep other venue
  adapters explicitly disabled.
- Preserve Human/Agent mode selection and every existing `data-view` route.
- Verify desktop and 390px mobile rendering, navigation, focus, and browser
  diagnostics.

## Non-goals

- No protocol object, schema, API, MCP tool, SDK workflow, database, migration,
  server operation, permission, authentication, authorization, or risk-policy
  change.
- No real capital, public LP pool, deposit, allocation, withdrawal, custody,
  pricing, yield, mainnet, or external Provider capability.
- No change to the existing Credit or Trading Capital lifecycle logic.
- No new production dependency or deployment.

## Files likely to modify

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_014_PRODUCT_ENTRY_INFORMATION_ARCHITECTURE/`
- `design-qa.md`

## Acceptance Criteria

- [x] Given the authenticated shell, when a user opens navigation, then Credit,
  Trading Capital, and Capital Partners are visible as distinct product
  destinations.
- [x] Given Human or Agent mode, when a user opens a product destination, then
  the selected access mode is preserved unless an existing destination already
  requires Agent mode.
- [x] Given Overview, when a user activates a product card, then it routes to
  the existing Credit or Trading Capital view, or the new Capital Partners
  preview, without adding a backend operation.
- [x] Given Provider Network, when the page loads, then the existing exact
  Provider TransferIntent, acknowledgement, and reconciliation behavior is
  unchanged.
- [x] Given Trading Capital, when the page loads, then Hyperliquid is identified
  as the MVP venue and no other venue is represented as active.
- [x] Given Capital Partners, when the page loads, then deposit, allocation, and
  withdrawal controls are disabled and the page states that public LP and real
  capital are unavailable.
- [x] Desktop and 390px mobile browser evidence has no horizontal overflow,
  clipped primary action, blank primary surface, or console/page error.

## Test Command

```sh
pnpm dlx node@24.18.0 --check apps/web/src/app.js
pnpm dlx node@24.18.0 --test apps/web/test/static-ui.test.js
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security Checklist

- [x] Existing route keys and server-operation mappings are preserved.
- [x] Capital Partners creates no command, funding, withdrawal, or pricing
  authority.
- [x] Provider Network remains exact-resource, non-enumerating, no-funds, and
  nonwithdrawable.
- [x] Human/Agent access modes do not fork Obligation, Ledger, Event, Evidence,
  or risk truth.
- [x] No API-controlled HTML insertion, external runtime asset, secret,
  credential, raw KYC/PII, or browser persistence is introduced.
- [x] No protocol ID, state machine, funds path, permission, risk control, or
  deployment is changed.
