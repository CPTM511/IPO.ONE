# HUMAN-001A: Durable Credit Consent

Status: Complete locally on 2026-07-15. This is a local, synthetic-data, no-real-funds Human
authorization foundation and does not approve production identity, contracts,
private data, credit, or funds.

## Context

Product Charter v1.1 requires Human and Agent entry modes to converge on one
credit and obligation kernel. CREDIT-001A/B now provide shared durable Credit
Intent and Offer objects, but a Human Intent can still carry an arbitrary
`authorityRef`. A string reference is Evidence, not authority. Before the
Tenant Gateway can accept Human credit applications, the protocol needs a
first-class Consent record whose purpose, scope, validity, disclosure, data
usage, revocation, and sandbox boundary are independently verifiable.

## Scope

- Add a closed `ConsentRecord v1` domain and JSON Schema contract.
- Bind Consent to one Human Subject and its accountable primary Principal.
- Scope credit application Consent by allowed assets, requested-use codes,
  repayment frequencies, maximum requested principal, term, and installments.
- Bind versioned terms, data-usage notice, and Human-readable disclosure
  references to deterministic hashes.
- Make Consent explicitly expiring and revocable; new use must fail after
  expiry or revocation while historical Intent/Event/Evidence remains intact.
- Add a pure domain guard that verifies one Human Credit Intent against live
  Consent without treating `authorityRef` as self-authenticating.
- Add a tenant-owned PostgreSQL projection with forced RLS, composite Human
  Subject/Principal foreign keys, immutable scope, and terminal transitions.
- Extend repository snapshots, registry hashes, restart reads,
  reconciliation, and PostgreSQL tests.

## Non-Goals

- No Tenant Gateway operation, HTTP/API/SDK/MCP route, UI, production Human
  IdP, real signature, legal contract execution, KYC/VC provider, or private
  data.
- No Credit Offer acceptance authority; acceptance must later bind one exact,
  unexpired Offer and terms hash.
- No Human credit decision, Obligation, disbursement, collection, or fund
  movement.
- No change to the anonymous public sandbox or production deployment.

## Likely Files

- `packages/domain/src/human-consent.js`
- `packages/domain/src/enums.js`
- `packages/domain/test/human-consent.test.js`
- `schemas/v2/consent-record.schema.json`
- `db/migrations/0011_durable_human_credit_consent.*.sql`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `scripts/check-schemas.mjs`
- `scripts/check-migrations.mjs`

## Acceptance Criteria

- [x] A Consent can belong only to a Human Subject and that Subject's primary
  Principal in the same Tenant.
- [x] Terms, data usage, disclosure, credit-request scope, hashes, validity,
  and no-real-funds flags are closed, bounded, versioned, and immutable.
- [x] A matching active Consent authorizes only a sandbox Human Credit Intent
  inside its exact asset, use, amount, term, frequency, and installment scope.
- [x] Revoked, expired, future, mismatched, over-limit, Agent, or production-
  capable use fails closed without mutating the Consent or Intent.
- [x] Revocation is terminal, reason-coded, Evidence-referenced, event-linked,
  restart-readable, and does not delete historical application state.
- [x] RLS, Tenant transaction guards, composite foreign keys, snapshot hashes,
  reconciliation, rollback, replay, and migration down/up tests pass.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] No raw PII, KYC document, biometric, bank credential, signature, secret,
  or legal-contract content is stored; only bounded references and hashes.
- [x] `sandboxOnly = TRUE` and `productionAuthority = FALSE` are enforced in
  domain, schema, and database constraints.
- [x] Caller-supplied `authorityRef` never proves authorization by itself.
- [x] Consent cannot authorize an Agent Subject or a different Principal,
  Tenant, asset, use, amount, term, schedule, or repayment frequency.
- [x] Revocation and expiry block new use without deleting audit history.
- [x] No endpoint, permission, deployment, private-data, or real-value
  capability is added.

## Verification Evidence

- `pnpm run check`: 175/175 tests passed; 27 closed schemas and 11 ordered
  migration pairs passed their repository gates.
- `pnpm run test:postgres`: 48/48 PostgreSQL 17 tests passed on a fresh,
  isolated database, including migration down/up, forced RLS, Human-only
  composite references, terminal revocation, delete rejection, restart reads,
  projection snapshots, and reconciliation.
- `git diff --check`: passed.
- The local shell used Node.js 26.0.0 and emitted the repository engine warning;
  the declared supported runtime remains Node.js `>=24.18.0 <25`.
