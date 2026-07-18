# CREDIT-001D: Shared Deterministic Decision and Offer

Status: Approved by the project owner and implemented locally on 2026-07-15.
Real funds, production credit, public exposure, acceptance, execution, and
deployment remain unapproved.

## Context

CREDIT-001C now lets an authenticated Human Borrower or Agent Runtime submit
and read the same durable `credit_intent.v1` shape. The application read model
deliberately returns `decision = null` and `offer = null`. Product Charter v1.1
requires one explainable, deterministic step between Intent and a versioned
Offer before either entry can become an operable borrowing product.

The current durable `risk_decisions` projection is Agent-specific: it requires
`mandate_id`, has no `credit_intent_id`, and only emits
`risk_decision.v1`. Reusing it without a reviewed migration would either make
Human decisions impossible or introduce an unverified polymorphic reference.

## Approved Three-Part Permission Change

### 1. Shared self-evaluation capability

- Add `credit.evaluate.self` to `human_borrower` and `agent_runtime` only.
- Add one idempotent private operation,
  `pilotEvaluateCreditApplication`, against an exact owned `credit_intent`.
- The operation has `fundsAuthority = false`, does not activate a Mandate, and
  cannot accept an Offer, create an Obligation, spend, execute, or move value.
- Existing `pilotReadCreditApplication` continues to use
  `credit.read.self` and returns the resulting bounded Decision/Offer summary.

No Developer, Operator, Risk, Auditor, Provider, anonymous public, HTTP,
MCP/A2A, or deployment role gains the capability.

### 2. Dual-authority RiskDecision v2 and atomic application commit

- Evolve `risk_decisions` so one Decision can reference exactly one Human
  Consent or Agent Mandate plus the exact `CreditIntent`.
- Backfill existing `risk_decision.v1` rows as Mandate authority without
  changing their canonical value; new application decisions use
  `risk_decision.v2`.
- Add nullable `consent_id` and `mandate_id` columns with an exact-one check,
  immutable `authority_type`, `authority_ref`, and `credit_intent_id`, Tenant
  composite foreign keys, and a unique Decision per Intent.
- Persist Decision, optional Offer, Intent status `decided`, Event, Evidence,
  outbox, registry, snapshot, owner resource, capacity charge, command replay,
  and audit in one serializable transaction.
- Add persistent `credit_decisions` capacity with the same per-Tenant default
  ceiling of 1,000 used for submitted Credit Intents.

Rejected or frozen applications persist a Decision and no Offer. Approved
applications persist exactly one offered `credit_offer.v1`. CREDIT-001D does
not create or update a `CreditLine`.

### 3. Approve the closed sandbox policy `credit-application-rules.v1`

The caller supplies no risk inputs, model output, pricing, reason, schedule,
disclosure, or production flag. The server derives all terms from the locked
Intent and authoritative durable state.

| Policy field | Approved v1 value |
| --- | --- |
| Supported asset | `urn:ipo-one:sandbox-asset:usd-cent` only |
| Per-application cap | `500000` minor units (USD 5,000 synthetic) |
| Approved principal | Exact requested principal; no partial or counter-offer |
| Maximum term | 366 days |
| Origination fee | `0` minor units |
| Offer validity | 24 hours from the trusted command time |
| Disclosure | `urn:ipo.one:sandbox:credit-offer-disclosure:v1` |
| Funds state | `sandboxOnly = true`, production flags always `false` |

Approved deterministic demo annual rate table:

| Requested term | `annualRateBps` |
| --- | ---: |
| 1-30 days | 600 |
| 31-90 days | 900 |
| 91-180 days | 1,200 |
| 181-366 days | 1,500 |

Schedule consistency is closed and deterministic:

- weekly: `installmentCount = ceil(termDays / 7)`;
- biweekly: `installmentCount = ceil(termDays / 14)`;
- monthly: `installmentCount = ceil(termDays / 30)`;
- end of term: `installmentCount = 1`.

`maturityAt` is trusted command time plus `requestedTermDays` in UTC.
`firstPaymentAt` is the earlier of the first frequency interval and maturity.

## Required Eligibility and Denial Rules

Every evaluation locks and revalidates:

- owning Subject and Principal, including status, type, and Tenant binding;
- exact Consent or draft Mandate, current validity, scope, amount, asset,
  purpose, term, repayment frequency, and installment count;
- Human `credit_decision` plus `identity_reference_use` Consent purposes and
  one current synthetic Identity Reference bound to the exact Consent;
- Agent `request_credit` Mandate capability and exact asset/limit scope;
- no Subject freeze, frozen/closed CreditLine, overdue/defaulted Obligation,
  existing Decision, active conflicting Offer, or exhausted Tenant capacity;
- supported asset, maximum amount, maximum term, and schedule consistency.

Approved reason codes are exactly:

- `authority_scope_current`
- `principal_and_subject_eligible`
- `identity_evidence_current` for Human or
  `principal_binding_current` for Agent
- `no_adverse_obligation`
- `within_sandbox_policy_cap`
- `sandbox_rules_v1_approved`

Denials use a closed, non-enumerating set such as
`application_not_eligible`, `authority_not_current`,
`identity_evidence_not_current`, `adverse_obligation_open`,
`credit_state_frozen`, `sandbox_cap_exceeded`,
`unsupported_sandbox_asset`, or `invalid_requested_schedule`. Human-readable
explanations are presentation mappings; the durable Decision stores stable
codes and bounded canonical reason objects.

## Approved Gateway Operation

| Operation | Kind | Resource | Capability | Result |
| --- | --- | --- | --- | --- |
| `pilotEvaluateCreditApplication` | Idempotent mutation | Exact owned `credit_intent` | `credit.evaluate.self` | Intent + Decision + optional Offer |

Request payload is empty. The operation derives the Intent from the exact
authorized resource, so the caller cannot swap Subject, Principal, authority,
asset, amount, purpose, schedule, model, rate, fee, disclosure, or flags.

## Implemented Scope

- Implement RiskDecision v2 dual-authority domain and schema contracts.
- Add migration `0014`, repository reads/writes/locks, reconciliation, and
  immutable transition rules.
- Add the private operation, authorization, abuse controls, clients, protocol
  schemas, TypeScript declarations, catalog, fixtures, and audit branches.
- Populate the existing application read result with bounded Decision and
  Offer summaries.
- Add Human/Agent parity, approved/rejected, expiry, replay, concurrency,
  restart, RLS, rollback, and reconciliation coverage.

## Non-Goals

- No Offer acceptance, decline command, Obligation, CreditLine, execution,
  payment, repayment, Provider spend, withdrawal, capital, custody, interest
  collection, chain transaction, public endpoint, authenticated HTTP, SDK
  transport, MCP/A2A server, deployment, or real credit decision.
- No black-box score, machine-learned model, caller-supplied risk input,
  production identity, raw KYC/PII, adverse-action notice, legal underwriting,
  jurisdictional pricing, or production lending claim.

## Likely Files

- `packages/domain/src/models.js`
- `packages/domain/src/credit-contracts.js`
- `packages/domain/test/*`
- `db/migrations/0014_shared_credit_decision_offer.*.sql`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/tenant-command-gateway/src/credit-decision-handlers.js`
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`
- `modules/authorization/src/*`
- `modules/abuse-control/src/*`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`

## Acceptance Evidence

- [x] Human Consent and Agent Mandate produce the same Decision/Offer schema;
  only authority and eligibility Evidence presentation differs.
- [x] Policy output is byte-stable for the same Intent and trusted command
  time; caller fields cannot influence Decision or terms.
- [x] Approved evaluation creates one Decision, one Offer, and one decided
  Intent atomically; rejected/frozen evaluation creates one Decision and no
  Offer.
- [x] Exact replay returns the committed result; concurrent evaluation creates
  one outcome; a new idempotency key cannot duplicate an Intent Decision.
- [x] Revoked/expired authority, missing Human identity Evidence, freeze,
  adverse Obligation, cap exhaustion, unsupported asset, and invalid schedule
  fail closed with bounded codes.
- [x] Owner-only reads, same/cross-Tenant guessing, restart, RLS, rollback,
  migration down/up, registry/snapshot hashes, and reconciliation pass.
- [x] No anonymous or public API, remote MCP/A2A, acceptance, Obligation, execution,
  funds, or production capability is introduced.

## Approval Gate

- [x] Approve `credit.evaluate.self` for Human Borrower and Agent Runtime plus
  the shared private `pilotEvaluateCreditApplication` operation.
- [x] Approve RiskDecision v2 dual Consent/Mandate authority migration and the
  atomic Decision/optional Offer/Intent commit described above.
- [x] Approve the exact `credit-application-rules.v1` sandbox cap, schedule,
  demo rate, zero-fee, validity, disclosure, eligibility, and reason-code
  policy in this document.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Caller authority derives only from trusted Authentication Context and
  exact durable owner bindings.
- [x] Request/result, policy version, reasons, dates, amounts, and schedules are
  closed and bounded.
- [x] Authority, identity Evidence, adverse state, freeze, caps, duplicates,
  and capacity are locked and revalidated before commit.
- [x] Decision, Offer, Event, Evidence, outbox, registry, snapshot, replay,
  resource, and audit state commit atomically.
- [x] No raw PII/KYC, secrets, credentials, signatures, account destinations,
  production flags, or real-value authority can enter the operation.
