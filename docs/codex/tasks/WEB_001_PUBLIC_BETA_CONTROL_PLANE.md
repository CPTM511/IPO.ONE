# WEB-001: Public Beta Control Plane

Status: Complete for the local launch candidate (2026-07-11). This task targets
a launch-ready no-real-funds public beta; it does not authorize production
credit, custody, KYC processing, or deployment.

## Context

The interactive MVP proves the Agent Lockbox loop, but the current single-page
stack of demo panels does not provide a product-grade operating model. V0.3
requires one interface that a human operator can scan and control and one
machine surface that an Agent developer can integrate without inventing a
second protocol truth.

Current Aave interfaces are used only as a quality benchmark for financial
hierarchy, compact navigation, position/risk summaries, scalable data tables,
and deliberate transaction controls. IPO.ONE retains its own product model,
visual identity, safety boundaries, and Agent-first workflow.

## Scope

- Replace the scrolling demo page with a responsive application shell and
  stable view navigation.
- Add explicit Human Operator and Agent Runtime modes over the same live state.
- Present Agent, Mandate, Lockbox, Credit, Transfer, Evidence, Risk, and SDK
  surfaces with clear status, prerequisites, and next actions.
- Keep every existing vertical-slice action functional against the real API.
- Add one verified sandbox-flow action for launch demonstrations.
- Add loading, disabled, online/offline, empty, success, and Problem Details
  states with request correlation.
- Add accessible focus, labels, landmarks, live regions, reduced motion, and
  responsive desktop/tablet/mobile behavior.
- Use vendored Lucide SVG symbols for interface actions; add no runtime icon or
  frontend framework dependency.
- Add public-beta security headers, static caching policy, favicon/manifest,
  launch metadata, and automated UI contract checks.
- Record remaining production launch gates without representing them as done.

## Non-Goals

- No real funds, lending, underwriting, custody, wallet signing, or withdrawal.
- No production AuthN, tenant, RBAC, credential, or rate-limit claim.
- No Human borrower application or raw KYC/PII.
- No remote Provider, on/off-ramp, x402 facilitator, chain transaction, or
  production webhook.
- No deployment, domain, certificate, analytics tracker, or third-party runtime
  dependency.
- No cloning of Aave branding, copy, assets, or lending semantics.

## Likely Files

- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/app.js`
- `apps/web/src/icons.svg`
- `apps/web/src/manifest.webmanifest`
- `apps/web/src/favicon.svg`
- `apps/web/test/static-ui.test.js`
- `apps/api/src/server.js`
- `scripts/smoke-api.mjs`
- `.github/workflows/quality.yml`
- `README.md`

## Acceptance Criteria

- Operator and Agent modes are visibly distinct and share the same API state.
- Every current MVP action remains reachable and prerequisite-gated.
- The complete Agent -> Lockbox -> Credit -> Spend -> Settlement -> Revenue ->
  Repayment -> Evidence flow succeeds from the browser.
- API problems show safe client detail plus a request ID; internal details are
  never rendered.
- No API-controlled value is inserted with `innerHTML`.
- Desktop at 1440x1000 and mobile at 390x844 have no horizontal overflow,
  clipped controls, overlapping text, or blank primary content.
- Keyboard focus, semantic navigation, labels, live status, and reduced-motion
  behavior are present.
- Static responses include a restrictive CSP and launch-safe browser headers.
- Existing API, SDK, schema, migration, database, and protocol tests pass.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
```

Browser verification must exercise the full flow at desktop and mobile widths,
inspect screenshots, check console errors, and assert `scrollWidth <= innerWidth`.

## Security Checklist

- [x] No external script, font, image, analytics, or runtime dependency.
- [x] No credential, token, private key, raw signature, or PII fixture.
- [x] No production fund or credit claim.
- [x] Problem details are safely rendered with request correlation.
- [x] Unsafe actions remain gated by real state prerequisites.
- [x] CSP, frame, MIME, referrer, permissions, and cache policies are explicit.
- [x] Agent Runtime examples do not contain production credentials.
- [x] Sandbox sessions are bounded and explicitly non-authenticating.
- [x] Production Auth/RBAC/tenant work remains in `SECURITY-001`.

## Verification Record

- `pnpm run check`: passed; 21 OpenAPI routes/operations, 8 schemas, 2
  migration pairs, and 72 database-free tests.
- `pnpm run test:postgres`: passed 8/8 migration, rollback, idempotency,
  concurrency, outbox/inbox, and restart-replay checks.
- `pnpm run smoke:api`: passed the full lifecycle, browser security headers,
  OpenAPI delivery, state refresh, and independent-client session isolation.
- `pnpm audit --prod`: no known vulnerabilities reported on 2026-07-11.
- Browser: complete UI lifecycle passed at 1440x1000 and 390x844; refresh
  retained the current session, horizontal overflow was zero, mobile focus
  isolation/Escape close passed, and console output contained zero errors or
  warnings.
- GitHub Actions workflow parses locally. Its hosted run remains a release-commit
  gate and has not been represented as already green.
