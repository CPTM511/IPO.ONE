# CREDIT-001: Shared No-Real-Funds Credit Lifecycle

Status: In progress. PRODUCT-001, CREDIT-001A/B/C/D, HUMAN-001C/D,
MANDATE-001A, and TRANSPORT-001 are complete locally. Human HTTP and Agent MCP
now return separate closed Workflow Receipts over one durable Intent, Decision,
and Offer kernel. The remaining lifecycle is decomposed into explicit approval
gates: CREDIT-001E (acceptance/Obligation), CREDIT-001F (sandbox
execution/accounting/repayment), and SERVICING-001 (DPD and resolutions).

## Context

The public sandbox demonstrates an Agent lifecycle in process, while the
durable Tenant Gateway exposes only seven non-economic operations. Product
Charter v1.1 requires Human and Agent clients to converge on one deterministic
Credit Intent, Offer, Obligation, execution, repayment, servicing, and Evidence
kernel before either interface can be considered a complete product.

## Scope

- Add versioned `CreditIntent`, `CreditOffer`, and acceptance contracts.
- Compose deterministic no-funds decision, Offer, Obligation, sandbox execution,
  repayment, and Evidence commands in the durable Tenant Gateway.
- Reuse canonical Subject, Principal, Mandate/Consent authority, CreditLine,
  Obligation, Ledger, Repayment, RiskDecision, Event, and Evidence stores.
- Support Agent and Human caller policies without duplicating business state.
- Add DPD, cure, default, restructure, repurchase, and write-off simulation
  commands behind explicit reason codes and permissions.
- Extend the closed operation catalog, schemas, fixtures, reconciliation, and
  risk portfolio projection.

## Non-Goals

- No real funds, custody, withdrawal, lender capital, interest collection, or
  production credit approval.
- No raw KYC/PII, production identity provider, signed onchain execution, or
  public authenticated endpoint.
- No black-box score, automated adverse-action notice, or legal underwriting.
- No Provider worker, mainnet, token, or public LP surface.

## Likely Files

- `modules/tenant-command-gateway/src/*`
- `modules/domain/src/*`
- `modules/repository-postgres/src/*`
- `modules/reconciliation/src/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`
- `packages/api-contract/*`
- `db/migrations/*`
- `docs/architecture/ADR-028-shared-credit-lifecycle.md`

## Acceptance Criteria

- [ ] Human and Agent fixtures create the same canonical Intent, Offer, and
  Obligation shapes with only authority/identity presentation differences.
  Intent, Decision, and Offer parity is complete; shared Obligation remains
  gated by CREDIT-001E.
- [ ] Offer acceptance is version-bound, idempotent, expiring, and cannot use a
  stale decision or exceed caps.
- [ ] Execution and every repayment post balanced Ledger entries, Events,
  Evidence, projections, outbox, and audit atomically.
- [ ] DPD/default/cure/restructure/repurchase/write-off transitions are closed,
  reason-coded, permissioned, and reconciliation-safe.
- [ ] Replay, restart, concurrent acceptance, concurrent repayment, and rollback
  tests prove one economic outcome.
- [ ] No operation is exposed on the anonymous public API by accident.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [ ] Caller authority derives only from trusted Authentication Context.
- [ ] Requests/results are closed, bounded, versioned, and idempotent.
- [ ] Credit policy, caps, Consent/Mandate, and freeze/pause cannot be bypassed.
- [ ] Ledger, Event, Evidence, outbox, audit, and projections commit atomically.
- [ ] No raw PII/KYC, secrets, signatures, or production endpoints are added.
- [ ] No real-value or deployment capability is enabled.
