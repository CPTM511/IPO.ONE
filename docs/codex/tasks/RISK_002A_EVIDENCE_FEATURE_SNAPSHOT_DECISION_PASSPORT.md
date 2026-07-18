# RISK-002A: Evidence Feature Snapshot and Decision Passport

Status: Implemented and verified locally under the already approved
no-real-funds Human/Agent credit-evaluation authority. Production underwriting,
policy changes, real identity/KYC processing, funds, and deployment remain
unapproved.

Date: 2026-07-17

## Context

The authenticated Tenant Gateway already creates one deterministic,
reason-coded Human/Agent Decision and Offer. It does not yet freeze the exact
point-in-time facts, policy identity, source Evidence, or reason-to-feature
lineage that produced that Decision. The older process-local score remains an
educational DEMO and cannot become product truth.

Commercial requirements supersede conflicting DEMO behavior. Product truth is
the shared obligation kernel and its Event/Evidence-backed Tenant Gateway path.
This issue upgrades that path without changing the approved sandbox cap, term,
rate table, fee, authority, or funds boundary.

## Scope

- Define one closed `credit-application-evidence-features.v1` feature set over
  server-derived Credit Intent, Subject, Principal, Consent/Mandate, optional
  Human identity-reference, and current Obligation/CreditLine state.
- Bind every present source projection to its immutable entity hash, aggregate
  version, source Event, Evidence hash, and finality inside the same serializable
  evaluation transaction.
- Attest the exact adverse-Obligation and frozen-CreditLine query result with a
  domain-separated state hash; callers cannot submit features or evidence.
- Freeze the exact existing `credit-application-rules.v1` policy as a checked-in
  manifest and domain-separated policy hash. No policy value changes.
- Create `risk_decision.v3` containing an immutable feature snapshot and
  decision passport with reason-to-feature and reason-to-source lineage.
- Persist v3 in the existing immutable Tenant-RLS Risk Decision projection and
  Event/Evidence/Outbox transaction through migration `0023`.
- Upgrade the evaluated response to
  `tenant_credit_application_evaluated.v2` and expose a bounded, PII-free
  passport summary to both Human and Agent entry modes.
- Prove equivalent Human/Agent policy hash, feature-set version, and economic
  outcome for equivalent requests while retaining entry-specific authority
  Evidence.
- Retain legacy v2 construction only for historical unit-fixture compatibility;
  it is not accepted as current authenticated product truth.

## Non-Goals

- No new risk threshold, cap, rate, fee, term, score, model, feature weight, or
  pricing rule.
- No ML, opaque scoring, universal reputation score, override, recommendation,
  adverse-action notice, or automatic policy promotion.
- No new operation, tool, route, role, permission, provider, external data
  source, KYC/PII field, credential, webhook, or remote transport.
- No real Human loan, public LP, custody, collection rail, withdrawal, mainnet,
  production funds, or production identity.
- No production policy registry service or mutable runtime configuration.
- No claim that a sandbox approval is a production underwriting decision.

## Likely Files

- `packages/domain/src/credit-decision.js`
- `packages/domain/src/credit-acceptance.js`
- `modules/tenant-command-gateway/src/credit-decision-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `db/migrations/0023_evidence_derived_risk_decisions.*.sql`
- `schemas/v2/risk-decision.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- Tenant protocol catalog, TypeScript contracts, Human/Agent receipt builders,
  fixtures, and conformance tests
- commercialization, traceability, architecture, and audit guidance

## Acceptance Criteria

- [x] Authenticated evaluation accepts no caller-supplied feature, score,
  policy, Evidence, timestamp, or Decision value.
- [x] Every approved positive source fact references immutable finalized
  Evidence from the same Tenant; missing or mismatched lineage fails closed.
- [x] The point-in-time snapshot contains the exact approved feature keys only,
  a trusted UTC `asOf`, and an exact adverse/frozen state attestation hash.
- [x] The policy hash is deterministic from the checked-in existing sandbox
  rules and changes if any cap, term, rate, fee, validity, disclosure, reason
  mapping, or feature definition changes.
- [x] The Decision hash binds feature snapshot hash and policy hash; the
  passport hash binds the Decision and closed reason lineage.
- [x] Human and Agent share the same feature set, policy hash, denial priority,
  cap/rate calculation, Decision/Offer semantics, and persistence path.
- [x] Entry-specific identity Evidence remains explicit and cannot be confused
  across Consent and Mandate modes.
- [x] v3 Event, Evidence, Outbox, normalized row, immutable projection snapshot,
  aggregate version, response, and replay identity commit atomically.
- [x] Risk Decision mutation/deletion, forged source Evidence, cross-Tenant
  lineage, and exact replay conflicts fail at the database/runtime boundary.
- [x] Evaluated v2 response is closed, bounded, PII-free, non-authorizing,
  sandbox-only, and identical across HTTP/SDK/MCP contract surfaces.
- [x] Existing cap, term, rate table, origination fee, offer validity, and
  disclosure reference remain byte-for-byte unchanged.

## Test Commands

```sh
node --test packages/domain/test/*.test.js
node --test modules/tenant-command-gateway/test/*.test.js
pnpm run check:schemas
pnpm run check:migrations
pnpm run lint:boundaries
pnpm run test:postgres
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:provider
pnpm run test:chain:conformance
pnpm run test:chain:live-unit
git diff --check
```

## Security Checklist

- [x] Feature values are server-derived from locked Tenant projections only.
- [x] Source Event/Evidence/entity hashes and aggregate versions are verified
  against one projection snapshot before use.
- [x] Risk-state absence is an exact bounded query attestation, not a caller
  assertion or synthetic positive event.
- [x] Hash domains distinguish policy, feature snapshot, risk-state query,
  Decision, passport, and entity identifiers.
- [x] Reason codes and their feature/source lineage use closed registries.
- [x] Raw KYC, PII, account addresses, credentials, provider payloads, free text,
  and database error detail never enter snapshot, passport, response, or logs.
- [x] `sandboxOnly=true`, `productionAuthority=false`, and
  `nonAuthorizing=true` are enforced by domain, schema, and PostgreSQL checks.
- [x] Forced RLS and Tenant-scoped foreign keys continue to protect every row.
- [x] No new permission, funds movement, policy promotion, or production
  deployment is introduced.
- [ ] Production policy/risk limits, pricing, KYC/identity, legal notices,
  model validation, overrides, deployment, and real funds receive separate
  named human review.
