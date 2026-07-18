# WEB-005: Human Sandbox Obligation Workflow

Status: Complete on 2026-07-16 under the project-owner-approved HUMAN-001C,
CREDIT-001E/F, SERVICING-001, and TRANSPORT-001 boundaries. This task exposes
already-approved private operations through the existing authenticated
loopback route. It grants no new operation, permission, identity, endpoint,
deployment, or funds authority.

## Context

The Human pilot already reaches deterministic Decision and Offer with a closed
copy-safe receipt. The browser also contains controls for exact Offer
acceptance, shared Obligation creation, signed sandbox execution, and synthetic
repayment over the approved Tenant protocol, but the durable product evidence
stops at Offer. A copied Human receipt therefore cannot prove that all later
economic steps refer to the same Subject, Consent, Offer, Obligation, asset,
execution receipt, Ledger transaction, and repayment.

Product Charter v1.1 requires a fully operable no-real-funds Human pilot and a
Human-friendly UI over the same shared kernel used by Agents. The browser must
make the complete path understandable and return one closed machine-verifiable
lifecycle result without exposing credentials, KYC/PII, or funds authority.

## Scope

- Add `human_sandbox_obligation_workflow_receipt.v1` as a closed contract for
  exact Offer acceptance, shared `obligation.v2`, signed sandbox execution,
  principal Ledger reference, and synthetic repayment.
- Compose the three already-approved operations through the existing
  `/tenant/v1/operations` loopback route under one correlation ID and stable
  workflow/request/idempotency identities.
- Bind the receipt to the existing Human Offer receipt, exact Human Subject,
  Consent, synthetic identity-reference ID, Offer, Obligation, and asset.
- Validate each result and cross-step safety invariant before the UI reuses the
  returned resource ID or presents a verified lifecycle receipt.
- Update the Human workbench so the receipt state clearly advances from Offer
  to accepted Obligation, signed execution, and repayment.
- Keep the Aave-inspired information hierarchy, responsive layout, keyboard
  behavior, safe DOM rendering, and no-real-funds language.
- Capture and inspect the complete Human flow at desktop and mobile sizes.

## Non-Goals

- No new HTTP route, MCP tool, Tenant operation, permission, role, credential,
  Authentication Context, public/private remote endpoint, or deployment.
- No production KYC, raw PII, bank account, wallet key, custody, collections,
  capital, mainnet, withdrawal, or real funds.
- No borrower-triggered restructure, repurchase, write-off, clock advance, or
  servicing override. Those remain trusted worker or dual-controlled operator
  operations.
- No claim of full WCAG compliance from screenshots alone.

## Likely Files

- `schemas/v2/human-sandbox-obligation-workflow-receipt.schema.json`
- `api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json`
- `packages/api-contract/src/human-sandbox-obligation-workflow-receipt.js`
- `packages/api-contract/src/index.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `apps/web/src/human-sandbox-obligation-workflow-receipt.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/human-sandbox-obligation-workflow-receipt.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `scripts/check-schemas.mjs`
- `scripts/check-tenant-protocol.mjs`

## Acceptance Criteria

- [x] A Human borrower can visibly complete Offer acceptance, shared
  Obligation creation, signed sandbox execution, and synthetic repayment from
  the authenticated workbench.
- [x] All three economic requests use one correlation ID and deterministic
  replay identities without caller authority fields.
- [x] The browser validates the exact Offer/terms/acknowledgement, Consent,
  Subject, Obligation, asset, execution, repayment, and no-funds invariants
  before continuing.
- [x] The final copy action returns one immutable closed lifecycle receipt,
  while the pre-acceptance Offer receipt remains available before completion.
- [x] The receipt contains no cookie, CSRF token, credential, Authentication
  Context, raw identity reference, KYC/PII, private key, or production authority.
- [x] Existing Agent receipt and the Human receipt preserve one shared
  Obligation/execution/repayment economic shape.
- [x] The private Host serves the new module from its fixed allowlist; public
  and private module graphs remain executable.
- [x] Desktop and mobile screenshots prove the primary action, status,
  schedule, repayment allocation, and safety boundary are usable without
  horizontal overflow.
- [x] Node 24.18.0 full, transport, security, PostgreSQL, and diff gates pass.

## Test Commands

```sh
node --test apps/web/test/*.test.js packages/api-contract/test/*.test.js
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] Browser inputs and receipt-builder inputs are closed plain objects;
  unknown fields and result drift fail closed.
- [x] Human session, CSRF, Tenant, Actor, role, and Network Context remain
  adapter-owned and absent from workflow data.
- [x] The acknowledgement binds exact server-returned Offer and terms hashes.
- [x] Each next step uses only the validated previous response resource ID.
- [x] Copy-safe output fixes `sandboxOnly=true`,
  `productionFundsMoved=false`, `withdrawable=false`, and
  `fundsAuthority=false`.
- [x] UI renders API-controlled values through text-safe DOM methods only.

## Verification Evidence

- Runtime: `.nvmrc` and `.node-version` both activate Node `24.18.0`;
  `pnpm run check:runtime` confirms Node `v24.18.0` and pnpm `11.1.3`.
- Repository quality gate: `pnpm run check` passes `251/251` tests, 36 schemas,
  21 public OpenAPI operations, 19 migration pairs, all policy/deployment
  checks, and the Tenant protocol conformance matrix.
- Tenant protocol: 28 operations, 41 request fixtures, 34 result fixtures,
  eight handoff fixtures, four workflow receipts, and 28 invalid receipt
  mutations pass.
- Independent suites: transport `31/31`, security `21/21`, and PostgreSQL
  `53/53` on a fresh PostgreSQL 17 database using the documented
  `postgresql://127.0.0.1:5432/...test` role-switching profile.
- Browser QA: the in-app browser completed Subject -> Consent -> Offer -> exact
  acceptance -> shared Obligation -> signed execution -> `$30.00` repayment.
  Visible final state was `Partially Repaid`, `$90.00` outstanding, `$30.00`
  repaid, `Current` servicing, and DPD `0`.
- Clipboard QA: copied
  `human_sandbox_obligation_workflow_receipt.v1` with status
  `repayment_posted`, the exact three economic operation steps, and
  `productionFundsMoved=false`, `fundsAuthority=false`, and
  `credentialsIncluded=false`.
- Desktop and 390x844 mobile screenshots are under
  `artifacts/product-design-audit/2026-07-16-human-lifecycle/`; browser console
  error/warning inspection was empty after the final flow.
- The isolated browser QA Host and PostgreSQL test instance were stopped, and
  the two databases created for this task were removed after verification.
