# CREDIT-001E: Shared Offer Acceptance and Obligation v2

Status: Implemented and verified locally on 2026-07-16 under the project
owner-approved no-real-funds boundary. Depends on approved and completed
CREDIT-001D and MANDATE-001A. This implementation grants only the three bounded
changes below and no execution, repayment, production, deployment, or real-value
authority.

## Context

Product Charter v1.1 requires Human and Agent callers to accept exact terms and
create the same canonical Obligation. The current `obligation.v1` cannot do
that: it requires an Agent `mandate_id`, `spend_policy_id`, and
`cashflow_route_id`; it has no Intent, Decision, Offer, Consent, schedule,
interest, or acceptance reference. The database repeats those Agent-only
requirements.

Offer acceptance must not execute credit. It is the deterministic agreement
boundary that creates a committed but not yet active Obligation.

## Proposed Three-Part Permission Change

### 1. Shared self-acceptance capability

- Add `credit.offer.accept.self` to Human Borrower and Agent Runtime only.
- Add one idempotent private operation, `pilotAcceptCreditOffer`, against an
  exact owned `credit_offer`.
- The operation has `fundsAuthority = false`. It cannot activate or execute the
  Obligation, create proceeds, post a repayment, spend, or move value.
- No Developer, Operator, Risk, Auditor, Provider, anonymous public, HTTP,
  MCP/A2A, deployment, or worker role gains this capability.

### 2. Explicit Human and Agent acceptance authority

- Add `credit_offer_acceptance` to Human Consent purposes. Human acceptance
  requires the same current Consent that authorized the Intent, including
  `credit_application`, `credit_decision`, `credit_offer_acceptance`, and
  `obligation_servicing`, plus a current synthetic Identity Reference.
- Agent acceptance requires the same current active Mandate that authorized
  the Intent, including `request_credit` and `accept_credit_offer`, exact asset
  and amount scope, and a current Principal binding.
- A draft, suspended, revoked, expired, amended, or mismatched authority cannot
  accept. Agent Runtime cannot activate the Mandate in this operation.

The request contains only `expectedOfferHash`, `expectedTermsHash`, and an
`acknowledgementHash` over the rendered disclosure or machine-readable terms.
The server derives every economic term and ownership relation from the locked
Offer and durable state.

### 3. Shared Obligation v2 and atomic acceptance commit

Create `obligation.v2` with exactly one authority relation and no Human- or
Agent-specific state truth:

| Field group | Required canonical content |
| --- | --- |
| Provenance | Tenant, Subject, Principal, Intent, Decision, Offer |
| Authority | `authorityType`, `authorityRef`; exact-one Consent/Mandate |
| Terms | asset, principal, annual rate, fee, maturity, frequency, count |
| Balances | original/outstanding principal, accrued/outstanding interest, accrued/outstanding fees, total repaid |
| Schedule | immutable `scheduleVersion` plus normalized installment rows |
| Execution | `pending`; no receipt or activation at acceptance |
| Safety | `sandboxOnly = true`, `productionFundsMoved = false` |

`spendPolicyId` and `cashflowRouteId` become optional execution-policy
references rather than mandatory Obligation identity. Human and direct sandbox
rail Obligations do not invent Agent-only values.

Offer `offered -> accepted`, immutable acceptance, schedule rows, Obligation,
Event, Evidence, outbox, registry, snapshots, owner resource, open-obligation
capacity, command replay, and audit commit in one serializable transaction.
The accepted Offer and new Obligation are one-to-one.

## Schedule Construction

The server uses the CREDIT-001D Offer frequency and installment count. Dates
are derived in UTC and the final installment is exactly the Offer maturity.
Principal is divided in minor units; any indivisible remainder is added to the
final installment. Interest and fee schedule fields exist but their exact
calculation/allocation policy is approved separately in CREDIT-001F.

Until CREDIT-001F is approved, `obligation.v2` remains `created` with execution
`pending`; no balance is treated as funded or collectible.

## Required Denial Rules

Acceptance locks and revalidates Offer status/expiry/hash, Decision, Intent,
Subject, Principal, authority, identity Evidence for Human, owner resource,
freeze, adverse obligation, Tenant capacity, and current policy version.
It fails closed on any stale or mismatched relation.

Stable denial codes include `offer_not_available`, `offer_expired`,
`offer_terms_mismatch`, `authority_not_current`,
`acceptance_scope_not_authorized`, `identity_evidence_not_current`,
`credit_state_frozen`, `adverse_obligation_open`, and
`open_obligation_capacity_exhausted`.

## Non-Goals

- No execution, disbursement, withdrawable balance, payment, repayment,
  Provider spend, interest accrual, fee assessment, DPD/default, CreditLine,
  chain transaction, production contract, public endpoint, remote transport,
  deployment, or real lending agreement.
- No raw disclosure text, PII/KYC, caller-supplied terms, signature, or account
  destination in the command.

## Likely Files

- `packages/domain/src/enums.js`
- `packages/domain/src/models.js`
- `packages/domain/src/credit-contracts.js`
- `packages/domain/src/state-machines.js`
- `db/migrations/0016_shared_obligation_v2.*.sql`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/tenant-command-gateway/src/credit-acceptance-handlers.js`
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`
- `modules/authorization/src/*`
- `modules/abuse-control/src/*`
- `packages/api-contract/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`

## Acceptance Criteria After Approval

- [x] Human Consent and Agent Mandate create byte-equivalent canonical
  Obligation terms and schedule shapes for the same Offer.
- [x] Human acceptance requires current explicit Consent and disclosure
  acknowledgement; Agent acceptance requires a Principal-activated, explicitly
  scoped Mandate.
- [x] One Offer can create exactly one Obligation; exact replay returns it and
  concurrent or stale acceptance cannot duplicate it.
- [x] Offer, acceptance, schedule, Obligation, Event, Evidence, outbox,
  registry, snapshots, capacity, resource, replay, and audit commit atomically.
- [x] Existing Agent `obligation.v1` rows remain readable and are not silently
  reinterpreted as Human or accepted-Offer obligations.
- [x] Acceptance produces no execution receipt, active debt, spend, repayment,
  chain action, real value, or production authority.

## Approval Gate

- [x] Approve `credit.offer.accept.self` for Human Borrower and Agent Runtime
  plus private idempotent `pilotAcceptCreditOffer`.
- [x] Approve explicit Human `credit_offer_acceptance` Consent purpose and the
  active Agent `accept_credit_offer` Mandate requirement.
- [x] Approve the shared dual-authority `obligation.v2`, normalized schedule,
  optional execution-policy relations, and atomic acceptance commit.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Acceptance is exact-resource, owner-only, version-bound, expiring,
  idempotent, and non-economic.
- [x] Caller cannot supply or replace Subject, Principal, authority, terms,
  schedule, policy, rate, fee, maturity, flags, or destination.
- [x] Authority, identity Evidence, freeze, adverse state, duplicate, and
  capacity checks lock before commit.
- [x] No raw PII/KYC, secret, credential, private key, signature, destination,
  production flag, or real-value authority enters the operation.

## Implementation and Verification

- Added one shared acceptance kernel for Human Consent and Agent Mandate,
  deterministic installment construction, exact Offer/terms hash binding, and
  canonical `obligation.v2` creation with execution fixed to `pending`.
- Added migration `0017_shared_offer_acceptance_obligation_v2`, immutable
  acceptance and installment projections, one-to-one Offer/Obligation
  constraints, Tenant RLS, reconciliation coverage, and legacy `obligation.v1`
  compatibility.
- Added the private `pilotAcceptCreditOffer` Tenant operation, owner-scoped
  authorization, economic abuse classification, typed Human/Agent clients, and
  an Aave-inspired Human Offer acknowledgement and Obligation schedule view.
- Verification on Node 24.18.0 / pnpm 11.1.3: `pnpm run check` (228 tests),
  `pnpm run test:security` (21 tests), `pnpm run test:transport` (22 tests),
  `pnpm run test:chain:conformance` (4 tests), and `pnpm run test:postgres`
  (53 tests) all pass. Desktop and 390 px mobile UI checks show no horizontal
  overflow or browser errors.
