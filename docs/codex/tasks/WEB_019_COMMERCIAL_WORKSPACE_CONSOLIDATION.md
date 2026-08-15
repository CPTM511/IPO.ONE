# WEB-019: Commercial workspace consolidation

Status: Implemented and browser-verified locally; not deployed

## Context

The authenticated shell now exposes the approved Credit, Trading Capital, and
Capital Partners product families, but the Overview and sidebar still present
too many protocol, lifecycle, access, and operations concepts at the same
visual level. The result is functionally complete but feels like an internal
MVP console rather than a commercial product workspace.

The founder selected the first product-design direction: a portfolio command
center with a compact dark navigation rail, a Human/Agent workspace switch,
four truthful portfolio signals, one primary next action, clear product rows,
and recent verified activity. `o1.credit` is a secondary reference for
restraint and spacing only; IPO.ONE keeps its own graphite/lavender identity
and uses stronger text contrast.

## Scope

- Consolidate the desktop navigation around Home, Credit, Trading Capital,
  Capital Partners, Repay & Settle, and Credit Passport.
- Keep every existing destination available behind an explicit More tools
  control and automatically reveal that control when an advanced view is
  active.
- Reframe Overview as a portfolio command center using authenticated server
  truth only.
- Present product families as compact, readable rows rather than large nested
  cards.
- Move identity, authority, and detailed lifecycle state behind progressive
  disclosure while keeping recent verified activity visible.
- Rename Human/Agent controls as Human Workspace and Agent Workspace.
- Improve global text contrast, minimum readable sizes, focus states, and
  responsive layout without changing behavior.
- Preserve all existing element IDs, route keys, event handlers, authenticated
  operations, and safety boundaries.

## Non-goals

- No protocol object, API, SDK, MCP, database, migration, authentication,
  authorization, Evidence, risk, or state-machine change.
- No invented available-credit amount, credit score, transaction, Evidence,
  return, TVL, or capital claim.
- No real funds, public LP pool, deposit, allocation, withdrawal, custody,
  mainnet, pricing, or deployment.
- No external runtime asset or production dependency.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `design-qa.md`

## Acceptance criteria

- [x] At desktop width, the primary sidebar exposes six product/user tasks and
      one More tools disclosure without removing any existing destination.
- [x] Selecting or deep-linking an advanced destination reveals its active
      navigation item.
- [x] Overview shows available credit, outstanding, next payment, and verified
      track-record state only from authenticated server truth.
- [x] Credit, Trading Capital, and Capital Partners route to their existing
      views and retain existing no-funds boundaries.
- [x] Identity, authority, and detailed lifecycle information remain available
      through progressive disclosure.
- [x] Human Workspace and Agent Workspace retain their existing mode behavior.
- [x] Text and interactive-control contrast remain readable on light and dark
      surfaces, with no important copy relying on low-contrast gray.
- [x] Desktop and mobile browser verification show no horizontal overflow,
      clipped actions, inaccessible navigation, or console errors.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
node --test apps/web/test/*.test.js
pnpm run check:web-bundle
pnpm run check
git diff --check
```

## Security checklist

- [x] No server operation, route key, resource ID, or authorization mapping is
      changed.
- [x] No browser fixture or invented portfolio amount replaces missing server
      truth.
- [x] Missing and denied resources remain non-enumerating.
- [x] Human and Agent remain access modes over the same Obligation, Ledger,
      risk, Event, and Evidence truth.
- [x] No raw KYC/PII, credential, secret, or private identifier is added to
      presentation or URLs.
- [x] No funds, chain write, contract, risk control, permission, or deployment
      authority is introduced.
