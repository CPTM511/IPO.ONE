# CONFORMANCE-001: Dual-Native Credit Offer Economic Parity

Status: Completed locally on 2026-07-16 under the approved CREDIT-001D, HUMAN-001C/D, and
TRANSPORT-001 boundaries. This task strengthens conformance evidence and grants
no new role, capability, operation, endpoint, identity, acceptance, obligation,
execution, repayment, deployment, or funds authority.

## Context

Human HTTP and Agent MCP both reach the shared durable Credit Intent,
deterministic Decision, and Offer kernel. Current tests prove common schemas,
property sets, authorization, durability, and replay. The durable cross-entry
test, however, submits different principal amounts and terms, so it does not
prove that identical economic inputs produce identical economic outcomes.

Product Charter v1.1 requires Human and Agent to be different authority and
transport entries over one economic truth. A fixed machine gate must compare
the economic terms while deliberately excluding Subject IDs, Consent/Mandate
IDs, hashes, transport-specific steps, absolute evaluation time, and
authority-specific eligibility reason codes.

## Scope

- Add one closed `assertDualNativeCreditOfferParity(...)` API-contract helper.
- Validate both versioned workflow Receipts before comparison.
- Compare the exact Credit Intent economics, policy result, Offer terms,
  schedule offsets, and no-funds safety flags.
- Permit only the intentional Human Consent/HTTP versus Agent Mandate/MCP
  identity, authority-evidence, reason-code, and absolute-time differences.
- Return one deeply frozen, non-authorizing parity evidence view.
- Add fixture drift tests and make `check:tenant-protocol` fail when the Human
  and Agent golden Receipts stop being economically equivalent.
- Change the PostgreSQL cross-entry workflow to submit identical economics and
  assert the parity helper over the two durable Receipts.

## Non-Goals

- No claim that Human and Agent identity evidence, authority records, reason
  codes, timestamps, IDs, or hashes should be equal.
- No new pricing policy, underwriting rule, Consent/Mandate scope, acceptance,
  Obligation, execution, payment, repayment, servicing, chain action, or funds.
- No public endpoint, remote MCP, production credential, production identity,
  durable parity table, authoritative Evidence event, or deployment change.

## Likely Files

- `packages/api-contract/src/dual-native-credit-offer-parity.js`
- `packages/api-contract/src/index.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `scripts/check-tenant-protocol.mjs`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `security/test/gateway-security.test.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] Valid Human and Agent Offer Receipts with identical economic requests
  produce one deeply frozen `dual_native_offer_economics.v1` evidence view.
- [x] Principal, purpose, term, schedule, policy, approved amount, APR, fee,
  disclosure, schedule offsets, and all no-funds flags are compared exactly.
- [x] Intentional identity, authority, transport, reason-code, identifier, hash,
  and absolute-time differences do not create a false mismatch.
- [x] Any economic, schedule-offset, policy, or safety drift fails with one
  bounded stable error and exposes neither differing values nor validator paths.
- [x] Unknown helper configuration and malformed Receipts fail closed.
- [x] Golden fixture parity is enforced by `check:tenant-protocol` and declared
  in TypeScript.
- [x] PostgreSQL proves identical Human/Agent requests persist and return the
  same economic outcome after authorization and deterministic evaluation.
- [x] Targeted, protocol, security, PostgreSQL, and full repository checks pass.

## Test Commands

```sh
node --test packages/api-contract/test/api-contract.test.js
pnpm run check:tenant-protocol
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] Receipts are validated first and the returned view is output-only,
  non-authorizing, sandbox-only, and funds-disabled.
- [x] No Subject, Principal, Consent, Mandate, Intent, Decision, Offer,
  credential, session, token, Tenant, role, hash, or Evidence identifier enters
  the parity view or mismatch error.
- [x] Comparison fields are closed and reviewable; callers cannot select or
  omit fields.
- [x] Absolute timestamps and authority-specific eligibility evidence are not
  treated as shared economic truth.
- [x] Public/remote transport, production identity, deployment, and real funds
  remain unchanged.

## Verification Evidence

- `node --test packages/api-contract/test/api-contract.test.js`: 8/8. Identical
  golden Receipts match; purpose, APR, and schedule-offset drift fail; a uniform
  absolute-time shift and authority-specific reason evidence remain permitted.
- `pnpm run check:tenant-protocol`: passes with 17 private operations, two
  workflow Receipt fixtures, 15 invalid Receipt mutations, and mandatory
  Human/Agent economic parity.
- `pnpm run test:postgres`: 53/53 against a fresh isolated PostgreSQL 17
  cluster. The durable Human Consent and Agent Mandate workflows both request
  12,000 minor units for 60 days in two monthly installments and return the
  same 900 bps, zero-fee, schedule-offset, and safety outcome.
- `pnpm run test:security`: 21/21. The parity view contains no Actor, Subject,
  Principal, Consent, Mandate, workflow-object, credential, Tenant, role, hash,
  reason-code, endpoint, or funds authority.
- `pnpm run check`: 218/218; all 34 schemas, migrations, deployment, policy,
  abuse, protocol, domain, SDK, and UI checks pass.
- The isolated PostgreSQL server listened only on `127.0.0.1:55439` and its
  temporary data directory was stopped and removed immediately after the run.
- The current shell is Node 26.0.0; CI/release execution still needs alignment
  to the repository-required Node 24.18.x.
