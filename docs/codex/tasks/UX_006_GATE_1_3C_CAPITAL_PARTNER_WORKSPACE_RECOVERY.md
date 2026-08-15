# UX-006 Gate 1.3c — Capital Partner Workspace Recovery

Status: Complete locally — 2026-08-13
Phase: Product Optimization Phase 1 / L0_LOCAL_NO_FUNDS
Branch: `codex/m1-b-deployable-sandbox`
Baseline: `65f999c0882ebd16486324509e0eb342a116cb19`
Code owner for this increment: this issue only

## Context

The invited Capital Partner workspace currently cannot start without five opaque values obtained outside the product: the Partner Profile ID plus the Passport artifact ID, Credit Intent ID, artifact hash, and artifact version. Its visible primary controls remain disabled until those values are typed. This contradicts `REQ-CREDIT-003`, `REQ-CREDIT-004`, `REQ-CREDIT-005`, `REQ-UX-003`, `REQ-UX-005`, `REQ-PRIV-001`, and the rule that normal role journeys recover from authenticated server truth without internal IDs.

Gate 1.3b is complete locally. This single issue owns the complete Capital Partner recovery and authorized-inbox increment; it is not split into separate profile, inbox, or presentation issues.

## Scope

1. Add two narrow, empty-payload, read-only queries:
   - `pilotReadCapitalPartnerSelf`, reusing `capital_partner.portfolio.read.own`, resolves only the active invited Profile belonging to the authenticated Actor;
   - `pilotReadCapitalPartnerPassportInbox`, reusing `capital_partner.offer.create.own`, resolves only active, current, unexpired Passport artifacts bound to that same Actor as verifier.
2. Both handlers run under current-Tenant RLS, accept no caller locator/filter/Actor/Tenant input, validate the active Partner Profile, and return operation-specific response schemas. The inbox reverse lookup joins active verifier bindings/resources and current Passport/source Decision/Intent truth, is stably ordered and capped at 16; overflow or malformed durable truth fails closed without returning IDs or counts.
3. Self returns only the own Profile reference, display label, `fundsAuthority:false`, and server/read-only markers. Inbox rows return one safe application label/timing/claim count plus the exact technical authoring tuple required by the existing Offer command. No raw KYC/PII, credential, controller reference, lender policy, Evidence body, or unrelated Tenant resource is returned.
4. Discovery never grants authority. Existing exact Passport verification and `pilotAuthorCapitalPartnerOffer` must still reauthorize the bound artifact, Profile, current Decision/Intent, hash/version, pause state, and Offer conflict rules.
5. On authenticated Capital Partner boot, recover Self, exact Portfolio, and Inbox from server truth. One authorized application opens automatically; multiple applications render a labeled picker; empty/denied/ambiguous/stale states expose one real Refresh action and no economic form.
6. Remove editable Profile/Passport/Intent/hash/version controls from the normal journey. Keep exact references in collapsed read-only technical details. Economic terms remain explicit editable inputs and the Offer action retains explicit mutation language.
7. Before authoring, refresh the Inbox and exact-match the selected tuple. Drift clears selection and dispatches zero mutation. Refresh, reload, fresh session, sign-out/sign-in, and local restart recover from server truth; browser storage, URL, DOM metadata, first-row guesses, and fixture constants are forbidden as canonical fallback.
8. Offered Offer withdrawal remains deliberate and visible only while executable. Portfolio and lifecycle truth remain server-composed. All Phase 2 no-funds boundary copy remains accurate.

## Non-goals

- No new capability, role bundle, credential, production identity, authorization grant, or borrower recipient-directory authority.
- No change to Offer economics, acceptance, Obligation, Facility, servicing, repayment, Evidence, Passport issuance/revocation, or Human recipient-selection semantics.
- No funds, custody, deposit, allocation, withdrawal rail, signer, KYC/PII, chain, testnet/mainnet, deployment, promotion, release reseal, or hosted-availability claim.
- No table, column, seed, binding, or migration. Existing verifier bindings and indexes are reused.
- No Tenant-wide Actor, Profile, Passport, Subject, Intent, or artifact enumeration.

## Likely files

Protocol/policy/gateway/persistence:

- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`
- `api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json`
- `schemas/v2/tenant-protocol-request.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- `schemas/v2/tenant-protocol-catalog.schema.json`
- `schemas/v2/abuse-control-policy.schema.json`
- `modules/authorization/src/authorization-policy.js`
- `modules/authorization/test/authorization-policy.test.js`
- `modules/abuse-control/src/abuse-policy.js`
- `modules/abuse-control/test/abuse-policy.test.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/tenant-command-gateway/src/capital-partner-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/test/tenant-command-gateway.test.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `security/test/gateway-security.test.mjs`

Web/transport/evidence:

- `apps/web/src/capital-partner-workspace-selection.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/capital-partner-workspace-selection.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/capital-partner-boundary-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/web/test/manual-primary-actions.v1.json`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`

## Acceptance criteria

1. An authenticated Capital Partner with exact existing capabilities recovers only its own active Profile and verifier-bound current Passport applications. Other roles, missing capability, inactive Profile/binding/resource, stale authentication, and cross-Tenant attempts receive the existing generic denial boundary.
2. Both payloads are exact `{}` and reject resource, Actor, Tenant, filter, cursor, reason, idempotency, or extra input. Self returns zero/one own Profile only; duplicate/malformed state fails closed. Inbox returns 0–16 exact current items; overflow, duplicate, mismatch, corrupt source, expired/revoked/superseded artifact, or wrong verifier fails closed.
3. Discovery performs no business mutation, Event, Evidence, projection, binding, seed, or command-response write. Existing authentication/authorization/abuse audit behavior remains permitted.
4. A normal single-item boot performs Self + Portfolio + Inbox reads and zero mutations/reference-Agent calls. Normal UI exposes no editable Profile, Passport, Intent, hash, or version locator.
5. Empty state shows no economic form. One item is selected from server truth. Multiple items provide a keyboard-accessible labeled picker without displaying opaque IDs. Technical values remain collapsed and read-only.
6. Author preflight rereads Inbox and exact-matches the selected artifact/Intent/hash/version. Changed, removed, revoked, expired, or ambiguous truth clears the economic form and performs zero Offer mutation. The server command independently revalidates again.
7. No visible permanently disabled primary action exists. Busy disabling is bounded and announced. Withdrawal appears only for a current offered Offer. Back/reload/sign-out does not loop or restore stale browser truth.
8. Fresh load, hard reload, new context, test-only sign-out/sign-in, stale in-flight response, catalog missing/recovery, empty/multiple/denied/stale Inbox, and local restart pass at 1440/720/390, keyboard, focus, contrast, reduced motion, overflow, console, and request inventory.
9. Production remains unchanged and completion is local synthetic/no-funds only.

## Test commands

```sh
node --check apps/web/src/app.js
node --test \
  apps/web/test/capital-partner-workspace-selection.test.js \
  apps/web/test/static-ui.test.js \
  modules/tenant-command-gateway/test/tenant-command-gateway.test.js \
  modules/authorization/test/authorization-policy.test.js \
  modules/abuse-control/test/abuse-policy.test.js
pnpm run check:tenant-protocol
pnpm run check:abuse-policy
pnpm run check:product-traceability
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
pnpm run check:web-bundle
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

## Security checklist

- [x] Existing least-privilege capabilities and Actor boundary are preserved.
- [x] Current-Tenant RLS and cross-Tenant non-enumeration are tested.
- [x] Active own Profile and active verifier binding are both required.
- [x] Zero/one/multiple/overflow/malformed/revoked/expired/stale truth is tested.
- [x] Inbox technical tuple never replaces exact verification or Offer authorization.
- [x] No browser locator fallback or stale in-flight repaint exists.
- [x] No hidden economic mutation, funds, sensitive data, credential, migration, seed, deploy, or production change exists.
- [x] Real-browser request inventory proves read-only recovery and zero mutation for all recovery states.

## Permission boundary

Founder direction to continue Gate 1.3c authorizes this combined local synthetic/no-funds Profile and authorized Passport Inbox recovery only. It does not authorize production provisioning, deployment, new credentials/capabilities, borrower directory disclosure, funds, signers, KYC/PII, testnet/mainnet writes, or real-value operation.

## Migration impact

None. Existing Capital Partner Profile uniqueness, verifier bindings, Passport projections, RLS, and indexes are reused.

## Rollback plan

Revert only the two protocol queries, policy/handler/client/repository additions, Capital Partner recovery/presentation helper, bounded UI/tests, and documentation. No durable business data or schema rollback is required.

## Completion evidence

Closed against the current local synthetic/no-funds candidate on 2026-08-13.

- The browser now recovers the authenticated Partner Profile, authorized
  Passport Inbox and Portfolio through the bounded `Self -> Inbox -> Portfolio`
  sequence. Five editable internal locators are absent from the normal journey;
  one item auto-opens, multiple items use a keyboard-complete picker, and exact
  references remain in collapsed read-only technical details.
- Empty, multiple, denied, stale, catalog-missing/retry, re-login and delayed
  sign-out states fail closed. Final browser inventories record three reads and
  zero mutations for normal startup, and zero Offer mutations for every
  recovery/preflight scenario. Evidence is in
  `output/playwright/ux-006-gate1-3c/README.md`.
- `pnpm test` passes 955/955; the focused Gate 1.3c matrix passes 68/68;
  `pnpm run test:postgres` passes 86/86 on a fresh isolated test database;
  transport passes 79/79 and security passes 34/34. Tenant protocol (102
  operations), schemas (136), abuse policy (119), traceability (102 bindings),
  Web bundle, lint, typecheck and `git diff --check` pass.
- The current-source review runtime remains available at
  `http://127.0.0.1:8790/#capital-partners`; all four role roots and
  `/tenant/v1/healthz` return HTTP 200. This is separate from the incomplete
  standard compose target and is not a production/deployment claim.
- No migration, seed, new capability, credential, role, funds path, signer,
  production configuration or deployment was added. Production remains
  unchanged.
