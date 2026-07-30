# CAPITAL-001 — Synthetic bilateral Capital Partner marketplace

**Status:** Planned; product direction approved, implementation not started
**Reference:** `IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md`
**Dependency:** `OPTIMIZATION-001` accepted
**Delivery shape:** One coordinated domain-to-UI vertical slice

## Context

Capital Partners currently appears as an invitation-only preview. Human and
Agent borrowers can already request credit, accept a deterministic sandbox
Offer, create an Obligation, execute, repay, and retrieve Evidence.

This issue converts the preview into a functioning three-sided no-funds
marketplace. A pre-provisioned Capital Partner receives a borrower-authorized
Credit Passport, authors exact terms, and monitors the resulting shared
Obligation and repayment outcome.

The implementation must reuse the existing Subject, Credit Intent, Offer
acceptance, Obligation, Lockbox, Ledger, servicing, Event, Evidence, outbox,
reconciliation, and CHAIN-001F boundaries. It must not create a parallel
lending kernel.

## Approved implementation model

### Identity and authorization

- Represent the Capital Partner organization with the existing organization
  identity boundary rather than a new borrower type.
- Represent its authorized staff as Human actors with a dedicated
  `capital_partner_operator` role bundle.
- Pre-provision the organization, operator, membership, and credential; no
  public self-service Capital Partner registration.
- Add only the capabilities required to read an explicitly granted Passport,
  author/manage its own sandbox Offers, and read its own portfolio.
- Do not reuse Risk, Operations, Provider, Auditor, or Tenant Owner authority.

### Credit Passport access

- Reuse the existing versioned, expiring, revocable
  `credit_passport_artifact.v1`; do not add a parallel review-grant object.
- The borrower issues the selected disclosure for the exact Capital Partner
  verifier actor, purpose, and lifetime.
- Keep Phase 2 same-Tenant and sandbox-only. Cross-Tenant marketplace access is
  a later hosted-security decision.
- Existing revocation or expiry blocks new verification and Offer authoring
  without rewriting previously finalized facts.

### Canonical Offer

- Extend the canonical Offer as a backward-compatible `credit_offer.v2`;
  do not create a separate lender-Offer state machine.
- Preserve reads and fixtures for existing `credit_offer.v1`.
- Bind v2 to:
  - Credit Intent and borrower Subject;
  - Capital Partner and operator;
  - reviewed Passport artifact, verification, and underwriting snapshot hashes;
  - asset, limit, rate/fee, schedule, term, permitted purpose, per-draw cap,
    conditions, validity, and undrawn-revocation rule;
  - sandbox-only and no-production-funds flags.
- Support offered, accepted, declined, expired, withdrawn, and superseded
  transitions with immutable economic terms.

### Facility and servicing

- Exact acceptance continues to create the existing `obligation.v2` and
  Lockbox/Ledger state.
- Present a `facility_view.v1` composed from the accepted Offer, Obligation,
  Lockbox, schedule, servicing state, and Evidence.
- Do not introduce another Facility state machine or accounting ledger.
- Existing execution, repayment, delinquency, remediation, and credit-outcome
  paths remain authoritative.

### Capital Partner portfolio

- Add one tenant-scoped read model for:
  - authored Offers and their status;
  - active and completed Facilities;
  - committed, available, utilized, outstanding, repaid, overdue, and written
    off synthetic amounts;
  - next payment, DPD, servicing state, and Evidence coverage.
- Portfolio rows link to existing canonical resources and receipts.
- Aggregates are derived from Ledger/Obligation truth, never browser arithmetic.

## Required workflow

```text
Borrower Credit Intent
  -> borrower issues selected Credit Passport
  -> Capital Partner verifies granted Passport
  -> Capital Partner authors credit_offer.v2
  -> Human or Agent reviews exact terms
  -> exact acceptance creates Obligation/Lockbox
  -> sandbox execution
  -> repayment or adverse servicing
  -> Evidence and credit outcome
  -> Capital Partner portfolio update
```

## Non-goals

- No real capital, deposit, allocation, custody, withdrawal, payout, or yield.
- No public LP/vault, token, DAO, insurance pool, or secondary market.
- No production pricing policy, KYC vendor, legal lender status, servicing
  agreement, loss allocation, or collections.
- No cross-Tenant Passport read in this phase.
- No platform model that automatically sets or overrides Capital Partner terms.
- No new chain contract, signer, test asset, venue action, mainnet, or external
  transfer.
- No change to existing Trading Capital execution authority.

## Likely files

- `packages/domain/src/credit-contracts.js`
- `packages/domain/src/credit-acceptance.js`
- new Capital Partner/grant domain module under `packages/domain/src/`
- new `schemas/v2/credit-offer-v2.schema.json`
- new `capital-partner-profile`, `facility-view`, and portfolio schemas under
  `schemas/v2/`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `packages/api-contract/src/tenant-protocol.js`
- `api/tenant-protocol/conformance/`
- `db/migrations/0048_synthetic_capital_partner_marketplace.up.sql`
- `db/migrations/0048_synthetic_capital_partner_marketplace.down.sql`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/private-pilot/src/production-runtime.js`
- private-pilot PostgreSQL and authorization tests
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- Capital Partner presentation modules and web tests
- `packages/sdk/` only where Agent exact Offer review/acceptance needs compatible
  v2 support

## Acceptance criteria

1. A pre-provisioned Capital Partner operator authenticates with no Risk,
   Operations, Provider, or borrower capability.
2. Human and Agent owners can each issue one bounded Passport artifact for an
   exact Capital Partner verifier.
3. No ungranted, expired, revoked, wrong-purpose, wrong-actor, or cross-Tenant
   Passport read succeeds.
4. A Capital Partner can author, withdraw, expire, or supersede only its own
   sandbox Offer.
5. Human and Agent receive the same `credit_offer.v2` economic schema and
   equivalent explanation.
6. Exact acceptance rechecks live identity/authority, grant, Offer validity,
   terms hash, policy, pause/freeze, and idempotency.
7. Duplicate acceptance or a stale/superseded Offer cannot create a second
   Obligation, Lockbox, Ledger entry, or Evidence event.
8. Accepted v2 Offers reuse `obligation.v2`, existing execution, repayment,
   servicing, credit outcome, and CHAIN-001F Evidence coverage.
9. Capital Partner portfolio aggregates equal canonical Ledger and Obligation
   truth after repayment, cure, write-off, restart, replay, and reconciliation.
10. Existing `credit_offer.v1` Human/Agent fixtures and routes remain compatible.
11. Database migration, rollback, forced RLS, object authorization, OpenAPI,
    SDK, browser, and local-stack tests pass.
12. Every new schema and operation is sandbox-only, no-funds, private, versioned,
    rate-limited, idempotent where mutating, and observable.

## Test commands

```sh
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:tenant-protocol
pnpm run check:migrations
pnpm run check:web-bundle
pnpm run check
pnpm run test:postgres
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:evidence-anchor:status
git diff --check
```

The final acceptance must run four complete paths:

1. Human accepts and fully repays;
2. Agent accepts and fully repays;
3. revoked/expired grant and stale Offer fail closed;
4. adverse servicing updates the Capital Partner portfolio without divergence.

## Security checklist

- [ ] Capital Partner role is least-privilege and separate from platform Risk,
      Operations, Provider, Auditor, and Tenant administration.
- [ ] Every Passport read requires an exact active artifact bound to the
      Capital Partner verifier.
- [ ] Raw KYC/PII, credentials, signatures, lender-private policy, and private
      notes never enter onchain Evidence or borrower-visible output.
- [ ] RLS and object authorization protect every new table and operation.
- [ ] Offer economic terms are immutable after issue; changes supersede.
- [ ] Acceptance is exact, replay-safe, authority-rechecked, and fail-closed.
- [ ] Portfolio numbers derive from canonical server Ledger/Obligation truth.
- [ ] No real-funds, custody, withdrawal, chain-write, deployment, or production
      authority is introduced.

## Completion handoff

Deliver:

- migration and schema inventory;
- Human, Agent, and Capital Partner workflow receipts;
- authorization/RLS matrix;
- Ledger/portfolio reconciliation report;
- browser screenshots for the three roles;
- full test results and remaining defects;
- explicit Phase 3 hosted-pilot go/no-go recommendation.
