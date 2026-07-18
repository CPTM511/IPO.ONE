# CREDIT-001C: Shared Credit Intent Gateway Permission Map

Status: Approved by the project owner and completed locally on 2026-07-15.
This increment broadens only the three reviewed no-real-funds permissions and
does not authorize Offer acceptance, Obligation creation, execution, spend,
withdrawal, deployment, or value movement.

## Context

CREDIT-001A/B provide one canonical and durable `CreditIntent` projection for
Human Consent and Agent Mandate entry, while HUMAN-001C now provides an
authenticated Human Subject, Consent lifecycle, and synthetic Identity
Reference reads. Neither entry can submit a Credit Intent through the private
Tenant Gateway. Product Charter v1.1 requires both entries to converge on the
same application kernel before the product can be considered operable.

The existing authorization catalog already reserves `credit.request` and
`pilotRequestCredit` for an Agent Actor, but there is no Gateway handler or
private protocol branch. HUMAN-001C deliberately excluded `credit.request`
until this shared authority resolution could be reviewed separately.

## Proposed Permission Changes

1. Add the existing `credit.request` capability to `human_borrower`.
   `agent_runtime` keeps its existing capability; no Developer, Risk,
   Operations, Auditor, Provider, or public role gains it.
2. Change `pilotRequestCredit` from Agent-only to
   `allowedActorTypes = [human, agent]`, still against an exact owned
   `subject`, with required idempotency and `fundsAuthority = false`.
3. Replace the Agent-specific live-check label with the shared closed set
   `credit_authority`, `risk`, `cap`, and `freeze`. The live adapter branches
   only on trusted Actor/Subject type, then returns one canonical Intent.
4. Add a new read-only `credit.read.self` capability to `human_borrower` and
   `agent_runtime`, used by `pilotReadCreditApplication` against an exact owned
   `credit_intent`. This avoids reusing Developer integration permissions.

## Proposed Authority Semantics

### Human entry

- The owned Subject must be `human`, `prototypeOnly = true`, and pending or
  active; its exact Human Principal must be active.
- The server resolves one explicitly supplied owned Consent ID from the
  resource-scoped request context; the payload cannot supply Subject,
  Principal, Actor, Tenant, authority type, or production flags.
- Consent must be active, currently valid, sandbox-only, bound to the exact
  Subject/Principal, and authorize the requested asset, purpose, amount, term,
  repayment frequency, and installment count.
- Synthetic Identity Reference remains Evidence for the later deterministic
  decision step. Missing identity Evidence may cause a reason-coded rejection,
  but it does not let the caller bypass Consent or create production authority.

### Agent entry

- The owned Subject must be `agent` and pending or active; its exact Principal
  must be active.
- The server resolves an exact owned draft Mandate containing
  `request_credit`, the requested asset, and limits sufficient for the Intent.
- Approval would permit a draft Mandate to submit a sandbox Intent only. It
  does not activate the Mandate, authorize Provider spend, accept an Offer,
  create an Obligation, or move value. Catalog safety remains
  `mandateActivationEnabled = false`.

This narrow draft semantic is necessary because the current local product has
no approved Mandate activation operation. A future activation or real-value
pilot remains a separate Human approval gate.

## Proposed Gateway Operations

| Operation | Kind | Resource / ownership | Capability | Result |
| --- | --- | --- | --- | --- |
| `pilotRequestCredit` | Idempotent mutation | Owned `subject`; server resolves Consent or draft Mandate | `credit.request` | Durable canonical `CreditIntent` summary |
| `pilotReadCreditApplication` | Query | Owned `credit_intent` | `credit.read.self` | Bounded Intent plus later decision/Offer summaries |

The request payload contains only:

- `authorityId`
- `assetId`
- `requestedPrincipalMinor`
- `purposeCode`
- `requestedTermDays`
- `repaymentFrequency`
- `installmentCount`

`authorityId` is an object selector, not caller authority. The server verifies
its type, Tenant, ownership, Subject/Principal binding, status, validity, and
scope inside the same serializable transaction.

## Scope

- Implement the two private local Gateway operations, shared handler, Human
  and Agent clients, closed protocol branches, schemas, fixtures, audit, abuse
  classification, RLS reads, replay, concurrency, and reconciliation tests.
- Persist only `CreditIntent` in this increment. Explainable Decision and Offer
  generation remain CREDIT-001D so the permission and deterministic pricing
  policy can be reviewed independently.
- Keep all results explicit about `sandboxOnly = true` and
  `productionFundsRequested = false`.

## Non-Goals

- No Offer acceptance, Obligation, execution, payment, withdrawal, Provider
  spend, Mandate activation, real credit decision, capital, custody, interest
  collection, chain transaction, public endpoint, or MCP exposure.
- No caller-supplied Subject, Principal, Tenant, Actor, authority type,
  production flag, risk decision, score, terms, KYC claim, or raw PII.
- No Developer inheritance and no reuse of broad integration-read authority.

## Likely Files

- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/abuse-control/src/abuse-policy.js`
- `modules/tenant-command-gateway/src/credit-intent-handlers.js`
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`
- `modules/tenant-command-gateway/test*/*`

## Acceptance Criteria After Approval

- [x] Human and Agent requests persist the exact same canonical Intent shape;
  only `authorityType` and resolved authority object differ.
- [x] Human Consent and Agent draft Mandate scope checks run in the same
  transaction as the durable Intent commit and fail closed on revocation,
  expiry, freeze, cap, or binding drift.
- [x] Exact replay returns one Intent; concurrent duplicate execution produces
  one committed application; a new idempotency key cannot duplicate the same
  authority-bound Intent hash.
- [x] Only the owning Human or Agent can read the bounded application view;
  same-Tenant and cross-Tenant object guessing is non-enumerating.
- [x] Protocol catalog, handlers, authorization, abuse policy, schemas,
  fixtures, clients, TypeScript declarations, audit, RLS, restart, and
  reconciliation agree exactly.
- [x] No operation gains public, production, Mandate activation, Offer,
  Obligation, execution, or funds authority.

## Approval Gate

- [x] Approved adding `credit.request` to `human_borrower` and adding the narrow
  `credit.read.self` capability to both Human Borrower and Agent Runtime.
- [x] Approved one shared `pilotRequestCredit` plus
  `pilotReadCreditApplication` surface for Human and Agent Actors.
- [x] Approved the no-real-funds rule that a scoped draft Agent Mandate may
  submit a Credit Intent but cannot activate, accept, execute, spend, or move
  value.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Caller authority derives only from trusted Authentication Context and
  server-resolved durable objects.
- [x] Consent/Mandate, Principal, Subject, freeze, cap, and risk state are
  locked and revalidated before commit.
- [x] Requests and results are closed, bounded, versioned, idempotent, and free
  of raw PII, KYC claims, secrets, signatures, and production flags.
- [x] Every allow and deny is audited without exposing object existence.
- [x] No real-value, deployment, public endpoint, or production permission is
  introduced.

## Verification Evidence

- `pnpm run check`: 196/196 unit, contract, security-boundary, chain, and demo
  tests pass; 30 schemas, 15 private Tenant operations, 27 request fixtures,
  21 result fixtures, 13 ordered migration pairs, and 36 abuse classifications
  agree.
- `pnpm run test:postgres`: 52/52 PostgreSQL 17 integration tests pass from an
  empty isolated database. Coverage includes Human Consent and Agent draft
  Mandate parity, exact replay, concurrent duplicate execution, restart reads,
  same- and cross-Tenant denial, frozen-risk rejection, RLS, capacity floors,
  migration down/up, and clean reconciliation.
- The test database role receives only the additional `UPDATE(status)` needed
  for PostgreSQL row-locking reads on `obligations` and `credit_lines`; the
  Gateway exposes no matching mutation operation in this increment.
- Local verification ran on Node.js 26 and emitted the repository engine
  warning; CI/review should repeat on the required Node.js 24.18.x runtime.
