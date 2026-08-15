# HUMAN-001B: Durable Synthetic KYC/VC Identity Reference

Status: Complete locally on 2026-07-15. This issue adds only local synthetic identity Evidence. It
does not approve a production identity provider, KYC process, credential,
borrower eligibility decision, private-data boundary, or real credit.

## Context

Product Charter v1.1 requires the Human entry mode to carry KYC/VC references
without placing raw PII onchain or in the shared protocol kernel. HUMAN-001A
now provides durable, revocable Consent, but the repository still cannot
express which privacy-safe identity Evidence was available for one Human
Subject. A free-form string on a Credit Intent would be unauditable and could
silently become a raw-data channel.

## Scope

- Add a closed `HumanIdentityReference v1` domain and JSON Schema contract for
  synthetic KYC and verifiable-credential reference types.
- Bind every reference to one Human Subject, its primary Principal, and one
  active Consent that explicitly includes `identity_reference_use`.
- Store only versioned provider/reference URNs, deterministic hashes, bounded
  purpose codes, synthetic assurance metadata, validity, and status.
- Enforce `syntheticOnly = true` and `productionVerified = false` in the domain,
  schema, and PostgreSQL.
- Add pure guards that require the current Consent and reference to remain
  active, unexpired, subject/principal-matched, and purpose-authorized.
- Add terminal, reason-coded, Evidence-referenced revocation and expiry without
  deletion or mutation of the original reference identity.
- Add a tenant-owned PostgreSQL projection with forced RLS, composite Human and
  Consent foreign keys, immutable identity fields, snapshots, replay, and
  reconciliation coverage.

## Non-Goals

- No real KYC/KYB, identity document, biometric, address, phone, email, date of
  birth, national ID, bank data, credential payload, selective disclosure,
  signature verification, issuer trust registry, or provider API.
- No Human Gateway operation, UI upload, authenticated HTTP/MCP endpoint,
  production IdP, eligibility decision, underwriting, Offer, Obligation, or
  fund movement.
- No new role, capability, permission policy, deployment, or external service.

## Likely Files

- `packages/domain/src/human-identity-reference.js`
- `packages/domain/src/enums.js`
- `packages/domain/test/human-identity-reference.test.js`
- `schemas/v2/human-identity-reference.schema.json`
- `db/migrations/0012_durable_human_identity_reference.*.sql`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `scripts/check-schemas.mjs`
- `scripts/check-migrations.mjs`

## Acceptance Criteria

- [x] A reference can belong only to a Human Subject, its primary Principal,
  and a same-Tenant Consent with `identity_reference_use` scope.
- [x] The object is closed, bounded, versioned, immutable, synthetic-only, and
  contains no raw identity claim or credential payload.
- [x] New use requires the exact live Consent and reference, matching subject,
  Principal, purpose, and validity windows.
- [x] Revoked, expired, future, mismatched, Agent, cross-Tenant, raw-data, or
  production-verified use fails closed.
- [x] Revocation is terminal, reason-coded, Evidence-referenced, event-linked,
  restart-readable, and preserves historical Consent and application Evidence.
- [x] RLS, Tenant guards, composite foreign keys, snapshots, reconciliation,
  rollback, replay, and migration down/up tests pass.

## Test Commands

```sh
pnpm run check
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] No raw PII/KYC, credential, claim set, document, biometric, address,
  contact data, bank data, signature, key, token, or secret is accepted.
- [x] References reject credentials, query strings, fragments, unsafe schemes,
  and unversioned provider contracts.
- [x] Hashes and synthetic references are Evidence, not proof of real identity
  or production eligibility.
- [x] Consent withdrawal or expiry blocks new use without deleting history.
- [x] No endpoint, permission, production identity, private-data, deployment,
  or real-value capability is added.

## Verification Evidence

- `pnpm run check`: 181/181 tests passed; 28 closed schemas and 12 ordered
  migration pairs passed their repository gates.
- `pnpm run test:postgres`: 49/49 PostgreSQL 17 tests passed on a fresh,
  isolated database, including migration down/up, forced RLS, Human and Consent
  composite references, live-Consent insertion checks, terminal revocation,
  delete rejection, restart reads, snapshots, and reconciliation.
- `git diff --check`: passed.
- The local shell used Node.js 26.0.0 and emitted the repository engine warning;
  the declared supported runtime remains Node.js `>=24.18.0 <25`.
