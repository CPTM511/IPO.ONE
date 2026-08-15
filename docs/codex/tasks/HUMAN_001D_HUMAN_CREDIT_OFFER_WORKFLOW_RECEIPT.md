# HUMAN-001D: Human Credit Offer Workflow Receipt

Status: Completed locally on 2026-07-16 under the already approved HUMAN-001C,
CREDIT-001C, CREDIT-001D, and TRANSPORT-001 boundaries. This task composes existing Human
operations and hardens their output; it grants no new role, capability,
operation, endpoint, identity authority, acceptance, obligation, execution,
repayment, or funds authority.

## Context

The authenticated Human UI reaches the same durable Credit Intent, Decision,
and Offer kernel as the Agent path, but it does not yet return a closed workflow
receipt. The Agent path now exposes a schema-validated result through
`IpoOneAgentMcpClient`, leaving the Human journey less machine-verifiable.

Current UI inspection also found that its Consent request includes
`credit_application` and `identity_reference_use` but omits the approved
`credit_decision` purpose required by CREDIT-001D evaluation. The Gateway
correctly treats that omission as insufficient authority, so the rendered
Human journey is not yet a faithful executable composition of the approved
path.

## Scope

- Include the already approved `credit_decision` purpose when the Human UI
  creates its bounded sandbox Consent.
- Compose exactly four existing private operations: Human self-read, Credit
  Intent submission, application read, and deterministic evaluation.
- Verify the exact owned Consent and one current synthetic Identity Reference
  before submission; the Gateway remains authoritative and revalidates both.
- Define a closed `human_credit_offer_workflow_receipt.v1` JSON Schema that
  reuses canonical Credit Intent, Decision, and Offer summaries.
- Construct an immutable receipt in the browser and expose a Human-friendly
  copy action after Decision/Offer completion.
- Add runtime validator, TypeScript declarations, valid/adversarial fixtures,
  and CI drift checks.
- Prove Human and Agent receipts converge on the same economic object shapes
  while retaining different Consent/Mandate and HTTP/MCP entry evidence.

## Non-Goals

- No synthetic Identity Reference creation in the browser; it remains an
  operator-provisioned prerequisite under the current approved pilot.
- No production KYC/VC, raw PII, credential exposure, remote/public private
  endpoint, Offer acceptance, Obligation, execution, repayment, servicing,
  withdrawal, or real funds.
- No new Tenant operation, capability, role, pricing policy, risk rule, or
  authoritative Evidence object.

## Likely Files

- `schemas/v2/human-credit-offer-workflow-receipt.schema.json`
- `api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json`
- `packages/api-contract/src/human-credit-offer-workflow-receipt.js`
- `packages/api-contract/src/index.js`
- `packages/api-contract/index.d.ts`
- `packages/api-contract/test/api-contract.test.js`
- `apps/web/src/human-credit-offer-workflow-receipt.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/test/human-credit-offer-workflow-receipt.test.js`
- `apps/web/test/static-ui.test.js`
- `scripts/check-schemas.mjs`
- `scripts/check-tenant-protocol.mjs`
- `security/test/gateway-security.test.mjs`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] Newly created Human Consent contains exactly the three purposes required
  for application, identity-reference use, and deterministic decision.
- [x] The UI runs the four approved operations in order and derives Consent
  authority from the exact UI-selected owned Consent.
- [x] A valid Human path returns one immutable, closed, non-authorizing,
  no-funds Receipt containing the canonical Intent, Decision, and optional
  Offer.
- [x] Subject, Consent, Identity Reference, authority type, operation order,
  response schema, Intent, Decision, or Offer drift fails closed.
- [x] Receipt and UI contain no raw identity payload, credential, session/CSRF
  value, Tenant/role context, acceptance, execution, or funds authority.
- [x] Human and Agent economic summaries remain schema-identical apart from
  the exact Consent/Mandate authority discriminator.
- [x] Full, security, transport, PostgreSQL, static UI, and visual checks pass.

## Test Commands

```sh
node --test packages/api-contract/test/api-contract.test.js apps/web/test/*.test.js
pnpm run check:tenant-protocol
pnpm run test:transport
pnpm run test:security
pnpm run test:postgres
pnpm run check
git diff --check
```

## Security Checklist

- [x] The Receipt is output-only, non-authorizing, and cannot be replayed as a
  Tenant request or Offer acceptance.
- [x] Human BFF session, CSRF token, Authentication Context, cookies, and
  identity-reference payload never enter the Receipt.
- [x] Consent and synthetic Identity Reference checks only reduce execution;
  they cannot substitute for Gateway authorization or live-state revalidation.
- [x] All identifiers, values, result shapes, step tuples, and output fields
  remain closed and bounded.
- [x] Public sandbox, production identity, deployment, and real funds remain
  disabled.

## Verification Evidence

- `pnpm run check`: 217/217 tests; 34 closed JSON Schemas; 17-operation private
  catalog; two workflow-receipt fixtures plus 15 adversarial mutations.
- `pnpm run test:transport`: 18/18 over local in-process, authenticated loopback
  HTTP, local stdio MCP, and Agent SDK surfaces.
- `pnpm run test:security`: 21/21, including closed Receipt fields and absence
  of browser credential/Authentication Context material.
- `pnpm run test:postgres`: 53/53 against a fresh PostgreSQL cluster. The Human
  path uses one correlation ID for self-read, Intent, application read, and
  evaluation; all four authorization audits are durable and allowed.
- PostgreSQL compares Human and Agent Intent, Decision, and Offer property sets
  and validates the Human Receipt with the runtime contract.
- Browser QA at 1280x720 and 390x844 found no horizontal overflow. The mobile
  copy action is 44px high and the locked no-credential/no-funds boundary
  remains readable.
- The local environment used Node 26.0.0 and therefore emitted the repository's
  expected engine warning; the required release runtime remains Node 24.18.x.
