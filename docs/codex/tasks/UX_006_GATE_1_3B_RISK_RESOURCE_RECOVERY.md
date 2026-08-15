# UX-006 Gate 1.3b — Risk Portfolio and Servicing Queue Server Recovery

Status: Complete locally
Phase: Product Optimization Phase 1 / L0_LOCAL_NO_FUNDS
Branch: `codex/m1-b-deployable-sandbox`
Baseline: `65f999c0882ebd16486324509e0eb342a116cb19`
Code owner for this increment: this issue only

## Context

The authenticated Risk workspace currently requires a normal operator to obtain and type two opaque internal locators before any useful read is possible: a Risk Portfolio ID and a Servicing Queue ID. Both visible load controls remain disabled until the operator obtains those values outside the product. This contradicts `REQ-UX-004`, `REQ-UX-005`, `REQ-PRIV-001`, and the mandatory rule that normal role journeys must recover from authenticated server truth without internal IDs.

The existing `pilotReadWorkspaceResume` contract is intentionally Human/Agent-only and reads Actor-bound resources. Risk Portfolio and Servicing Queue resources are Tenant-owned and have different role/capability matrices, so that operation must not be widened or reused.

This issue is the sole code owner for the bounded locator/recovery/presentation slice. Sealed DATA-003D, SERVICING-002B, and WEB-008 behavior remains an input, not reopened scope. Gate 1.3a is complete locally. Broad release and historical umbrella issues remain blocked/backlog and do not own this increment.

## Scope

1. Add two narrow, authenticated, empty-payload, read-quota locator queries:
   - `pilotReadTenantRiskPortfolioReference`
     - Risk Operator or Auditor only;
     - reuses `risk.read.tenant`;
     - recent phishing-resistant MFA;
     - returns only the unique active Tenant `risk_portfolio` locator.
   - `pilotReadServicingQueueReference`
     - Risk Operator or Operations Operator only;
     - reuses `servicing.queue.read`;
     - recent phishing-resistant MFA;
     - returns only the unique active Tenant `servicing_queue` locator.
2. Each query accepts exact `{}` only, runs inside current-Tenant RLS, selects at most two active rows in stable order, and returns:
   - zero rows: a closed empty reference;
   - one exact row: `{ resourceType, resourceId }`;
   - more than one, duplicate, malformed, or mismatched rows: non-enumerating `workspace_recovery_unavailable`.
3. Use two operation-specific closed response schema versions—`tenant_risk_portfolio_reference_view.v1` and `tenant_servicing_queue_reference_view.v1`—with the same minimal shape, `serverTruth: true`, and `readOnly: true`. This prevents operation/type confusion and satisfies the protocol rule that response schema versions are unique. Do not return Actor/Tenant/role/capability/status/version/time, business data, Subject IDs, PII/KYC, Evidence, hashes, or authority.
4. The reference never grants access. The existing exact `pilotReadTenantRisk` and `pilotReadServicingQueue` reads must independently reauthorize capability, Tenant ownership, recent MFA, and exact resource.
5. In the Risk workspace, recover references from server truth, remove editable Portfolio/Queue ID controls, and automatically load the unique Portfolio and first Queue page. Keep stage filter/pagination as explicit reads. Technical locators may appear only in collapsed, non-editable details.
6. Empty, ambiguous, malformed, denied, stale, or catalog-missing states clear prior locators and data before rendering. No browser storage, URL, DOM metadata, fixture constant, first-row, or hardcoded fallback is allowed.
7. Keep automatic boot bounded to two locator queries plus one Portfolio and one first-page Queue read. Pilot health and feedback supporting reads are not silently added to this bootstrap.
8. Refresh, new tab, fresh authenticated session, and local restart recover from server truth again.

## Non-goals

- No Subject freeze/unfreeze, risk-limit, servicing disposition, assignment, acknowledgement, or queue-row mutation changes.
- No risk policy, DPD, queue ordering/schema, scoring, funds, signer, custody, KYC/PII, chain, testnet, mainnet, or production behavior.
- No new capability, role bundle, credential, authorization binding, seed, table, column, or migration.
- No production resource provisioning, deployment, promotion, release reseal, or hosted-availability claim.
- No multi-resource picker. More than one active locator fails closed and requires a separately reviewed assignment model.
- Queue rows must not prefill or invoke the Freeze command.

## Likely files

Protocol, policy, gateway:

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
- `modules/tenant-command-gateway/src/risk-workspace-reference-handlers.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `modules/tenant-command-gateway/src/index.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/test/risk-workspace-reference-handlers.test.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `security/test/gateway-security.test.mjs`

Web, transport, evidence:

- `apps/web/src/risk-workspace-selection.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/risk-workspace-selection.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/risk-operations-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`
- `apps/web/test/manual-primary-actions.v1.json`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`

## Acceptance criteria

1. Risk can recover and read both unique references; Operations can recover Queue only; Auditor can recover Portfolio only. Human, Agent, Provider, Developer, missing capability, stale MFA, and cross-Tenant attempts receive the existing generic denial boundary.
2. Payload must be exact `{}`. Resource, Tenant, Actor, role, filter, idempotency, reason, extra property, or wrong operation/type pairing fails closed.
3. Zero active resources returns a closed empty reference. Exactly one returns the exact locator. More than one, duplicates, malformed rows, suspended resources, or mismatched types fail closed without revealing IDs or counts.
4. Locator recovery performs no business mutation, Event, Evidence, projection, binding, seed, or command response write. Only existing authentication/authorization/abuse audit behavior may run.
5. Each subsequent detail read independently reauthorizes. A recovered locator cannot be used to bypass capability, MFA, Tenant isolation, or exact resource checks.
6. A normal Risk browser state performs at most four automatic reads: two reference reads, one Portfolio read, and one first-page Queue read. It performs zero Tenant mutations and zero reference-Agent calls.
7. Editable Portfolio/Queue ID inputs and their prerequisite-only Load buttons are absent from the normal accessible tree. No ID is recovered from storage, URL, DOM metadata, fixture constants, or a first-row guess.
8. Empty, ambiguous, malformed, one-side denied, catalog-missing, or stale recovery clears prior data and presents one stable, keyboard-readable recovery state with a real retry action. No permanently disabled primary action or navigation loop is visible.
9. Queue filtering and pagination remain read-only and deterministic. Freeze controls, confirmation, MFA, and exact Subject requirements remain unchanged and are never auto-invoked or prefilled by a queue row.
10. Fresh load, hard reload, new isolated browser context, test-only sign-out/sign-in, and local restart restore from server truth. Desktop 1440px, 720px equivalent 200%, 390px, keyboard, focus, reduced motion, contrast, overflow, console, and network inventories pass.
11. Production remains unchanged. Completion may state only local no-funds closure; production Risk resource provisioning remains a separate human-reviewed blocker.

## Test commands

```sh
node --check apps/web/src/app.js
node --test \
  apps/web/test/risk-workspace-selection.test.js \
  apps/web/test/static-ui.test.js \
  modules/tenant-command-gateway/test/risk-workspace-reference-handlers.test.js \
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

Real-browser evidence must cover single, empty, multiple, Portfolio denied, Queue denied, stale/refresh, fresh session, 1440/720/390, keyboard, console/network, and zero mutation.

## Security checklist

- [x] Exact existing capability and actor matrix preserved per reference.
- [x] Recent phishing-resistant MFA required and tested.
- [x] Current-Tenant RLS and cross-Tenant non-enumeration tested.
- [x] Zero/one/multiple/malformed active resources fail closed as specified.
- [x] Reference does not replace detail authorization.
- [x] No browser cache, URL, DOM, fixture, or hardcoded fallback.
- [x] No Freeze or other mutation triggered or prefilled.
- [x] No sensitive data, funds, signer, binding, migration, seed, deploy, or production change.

## Permission boundary

Founder approval on 2026-08-12 authorizes only these bounded authenticated read-only locator queries and their local no-funds UI recovery. It does not authorize new mutations, risk policy, credentials, bindings, production provisioning, deployment, funds, signers, KYC/PII, testnet/mainnet execution, or real-value operation.

## Migration impact

None. Existing local active Tenant resources are sufficient. Production bootstrap does not provision these resources; that remains a separate hosted-enablement issue.

## Rollback plan

Revert only this issue's protocol catalog/schema entries, two query policies/handlers/client methods, Risk recovery helper/presentation, focused tests, and documentation. No durable business state or schema rollback is required.

## Completion evidence

Complete locally on 2026-08-12 against uncommitted current source based on
`65f999c0882ebd16486324509e0eb342a116cb19` on
`codex/m1-b-deployable-sandbox`. Nothing was staged, committed, deployed,
promoted, funded, signed, or provisioned. Production remains unchanged.

Implementation evidence:

- Two operation-specific, empty-payload locator queries reuse the existing
  Portfolio and Queue read capabilities and recent phishing-resistant MFA
  requirements. Portfolio remains Risk/Auditor-only; Queue remains
  Risk/Operations-only.
- Each handler uses current-Tenant RLS plus an explicit current-Tenant
  predicate, active-resource filtering, stable ordering and `LIMIT 2`. It
  returns only a closed empty reference or one exact locator; ambiguity and
  malformed durable truth fail closed without returning IDs or counts.
- Locator discovery is non-authorizing. Existing exact detail queries still
  perform their own capability, recent-MFA, Tenant and exact-resource checks.
- Editable Portfolio/Queue ID fields and prerequisite-only Load actions were
  removed. The normal Risk bootstrap performs exactly two locator reads, one
  Portfolio read and one first Queue page. Supporting insights remain behind
  one explicit action and technical locators remain collapsed and read-only.
- Catalog, recovery, detail and pagination requests have single-flight owner
  tokens. Sign-out/sign-in, refresh, stale details, one-side denial, and denied
  append cannot repaint a newer session or preserve a stale locator, row,
  cursor, filter or retry loop.
- Risk ignores poisoned Human/Obligation browser locators. Queue recovery never
  prefills or invokes Freeze; the unchanged Freeze form still requires exact
  Subject, reason, acknowledgement, server authorization and recent MFA.

Executable verification on Node `v26.5.0` and pnpm `11.1.3`:

- `node --check apps/web/src/app.js`: PASS.
- Focused Risk selection, static UI, reference-handler, authorization and abuse
  suites: 42/42 PASS. Static UI alone: 19/19 PASS.
- `pnpm run check:schemas`: PASS, 136 contracts.
- `pnpm run check:tenant-protocol`: PASS, 100 operations, 101 request fixtures
  and 89 result fixtures.
- `pnpm run check:abuse-policy`: PASS, 117 operations.
- `pnpm run check:product-traceability`: PASS, 13 destinations, 69 actions and
  100 bound operations.
- `pnpm run test:transport`: 79/79 PASS. `pnpm run test:security`: 34/34 PASS.
- `pnpm run test:postgres` against a fresh temporary test database through a
  local SSH tunnel: 86/86 PASS; all temporary databases and the tunnel were
  removed afterward, and the persistent Pilot database was untouched.
- `pnpm run check:web-bundle`: PASS, 1 external module, 35 authored modules and
  897 unique IDs. Lint and contract typecheck pass (683 parsed JavaScript
  modules, 3 package surfaces and 72 runtime exports).
- `pnpm test`: 947/947 PASS. `git diff --check`: PASS.

Real-browser evidence is in
`output/playwright/ux-006-gate1-3b/README.md` and
`output/playwright/ux-006-gate1-3b/browser-audit.txt` with final screenshots,
network logs and machine-readable control/request inventories.

- A fresh synthetic no-funds Risk QA host and fresh browser context with
  poisoned storage issued exactly four Risk reads, zero owned-Obligation reads,
  zero reference-Agent calls and zero mutations. Reload and the test-only
  sign-out/sign-in ceremony restored the same server truth.
- Empty and multiple states used two reference reads only. One-side denial used
  three reads and preserved only the independently authorized side. Stale
  details used four reads and cleared both sides. A denied append used one read
  and cleared all rows, cursor, More action and filter.
- A 2.5-second old Portfolio read crossing sign-out/sign-in did not repaint or
  unlock the new authenticated session. Supporting insights add exactly two
  explicit reads; filtering adds one; Refresh resets the view and performs the
  exact four-read bootstrap.
- All four missing-catalog variants (Portfolio reference/detail and Queue
  reference/detail) issue one catalog request and zero Risk operations. A
  repeated missing-catalog Refresh remains one catalog request with no loop;
  after the catalog returns to complete, one Refresh performs one catalog read
  and the exact four Risk reads.
- 1440, 720 and 390 CSS-pixel layouts have zero horizontal overflow. Keyboard
  disclosure/focus, reduced motion and contrast pass; the minimum measured
  contrast is 5.0:1. Successful flows have zero console errors/warnings.
  Negative scenarios contain only their expected controlled HTTP 400/404
  rejections, with no uncaught JavaScript exception or UI loop.

Current-source review links remain available at
`http://127.0.0.1:8787/#overview`,
`http://127.0.0.1:8788/#request-credit`,
`http://127.0.0.1:8789/#risk-operations`, and
`http://127.0.0.1:8790/#capital-partners`. Every root,
`/tenant/v1/healthz`, and the changed Risk browser module returned HTTP 200 at
closure.

Evidence limit: the standard compose stack currently has only its PostgreSQL
service running, so `pnpm run local:acceptance` exits before product checks with
`service "worker" is not running` and is not counted for this Gate. It was not
started or mutated to manufacture a pass. The current-source isolated review
runtime and synthetic browser QA host are separately identified above.

Remaining boundaries: production does not provision these Risk resources and
was not changed. Capital Partner self-profile and Passport-inbox discovery,
multi-resource assignment, cross-role Freeze presentation, and any hosted
enablement remain separate permission/protocol or deployment reviews. This
closure grants no funds, signer, KYC/PII, testnet/mainnet, risk-policy,
production or real-value authority.
