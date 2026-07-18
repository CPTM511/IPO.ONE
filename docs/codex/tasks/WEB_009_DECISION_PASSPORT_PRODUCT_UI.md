# WEB-009: Decision Passport product UI

Status: Completed locally on 2026-07-17 within Product Charter v1.1 and the already
approved no-real-funds Human/Agent lifecycle. This issue presents the existing
`risk_decision.v3` result; it does not create a new decision, permission, policy,
data source, or production authority.

## Context

`RISK-002A` made an immutable, Evidence-derived Decision Passport part of every
new authenticated Human and Agent evaluation. The Human Offer UI still reduces
that result to a raw status and joined reason-code string. A design partner can
accept the Offer, but cannot readily understand which facts were checked,
whether the sources were finalized, which policy version ran, or how to verify
the exact machine-readable result.

Commercial product requirements supersede the older demo score and generic
reason presentation. The formal UI must explain the same authoritative result
that the Agent receives through the existing SDK/MCP receipt.

## Scope

- Add a Human-readable Decision Passport inside the authenticated Offer review.
- Translate the closed risk reason registry into plain-language outcome copy
  while retaining canonical reason codes for audit and Agent parity.
- Show point-in-time policy, feature set, evaluated time, finalized Evidence
  count, source roles, aggregate versions, and shortened copy-safe hashes.
- Provide an accessible expand/collapse proof inspection and a copy action for
  the exact bounded `decisionPassport` JSON already validated by the Human
  workflow receipt.
- Keep Offer acceptance adjacent to the explanation so the user can review the
  decision and exact economic terms in one uninterrupted path.
- Make the Agent Runtime state explicitly identify that the same
  `risk_decision_passport.v1` is returned by the existing evaluation tool and
  SDK workflow; no UI-only decision field may be introduced.
- Reuse the existing Aave-inspired graphite/white/lavender product system and
  existing icon sprite. Validate desktop and 390px layouts in the real browser.

## Non-goals

- No new Tenant operation, route, MCP tool, SDK method, response field, database
  write, Evidence source, policy registry, model, feature, score, or override.
- No change to risk caps, rates, fees, terms, denial priority, Offer economics,
  identity/KYC processing, permissions, production identity, or deployment.
- No real funds, lending, custody, withdrawal, capital, mainnet, or production
  underwriting claim.
- No raw KYC/PII, account address, credential, signature, provider payload,
  internal feature values, or database identifiers in the UI.
- No claim that synthetic Evidence establishes real-world creditworthiness.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`
- `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`
- `docs/codex/audits/WEB_009_DECISION_PASSPORT_PRODUCT_UI/`
- `design-qa.md`

## Acceptance criteria

- [x] A completed authenticated Human evaluation shows one visible Decision
  Passport before Offer acceptance.
- [x] Plain-language reasons and canonical reason codes are rendered from one
  closed local registry and preserve the server order.
- [x] The UI shows exact policy and feature-set versions, the trusted evaluation
  time, finalized source count, and safe proof hashes without exposing raw PII.
- [x] Expanded proof shows every returned source role, aggregate version,
  finality, Evidence hash, and entity hash using text-safe DOM construction.
- [x] Copy proof returns the exact bounded passport already accepted by the
  Human workflow receipt; it contains no session, CSRF, credential, or funds
  authority.
- [x] Missing or malformed passport state is never shown as verified and cannot
  silently fall back to the legacy demo score.
- [x] Agent Runtime names the same passport schema and existing evaluation
  tool/SDK receipt without adding an Agent-only or Human-only truth.
- [x] Expand/collapse, copy, keyboard focus, loading/empty/approved states, and
  Offer acknowledgement remain usable at desktop and 390px mobile widths.
- [x] Desktop/mobile browser evidence has no horizontal overflow or console
  diagnostics, and Product Design QA passes against the selected Aave reference.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm run check:tenant-protocol
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security checklist

- [x] The UI consumes only the already-validated bounded Decision Passport.
- [x] All API-controlled fields use `textContent` and DOM nodes; no `innerHTML`
  or markup interpolation is introduced.
- [x] Full hashes are exposed only through explicit proof inspection/copy and
  remain non-authorizing, synthetic, and PII-free.
- [x] The UI cannot provide or mutate a feature, Evidence reference, policy,
  reason, score, Decision, trusted timestamp, or authority field.
- [x] `sandboxOnly`, `nonAuthorizing`, `productionAuthority=false`, and no-funds
  disclosures remain visible next to the Decision and Offer.
- [x] Unknown reason/source roles and unsafe passport flags fail closed instead
  of producing a verified presentation.
