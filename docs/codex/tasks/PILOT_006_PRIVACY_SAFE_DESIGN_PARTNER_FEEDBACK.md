# PILOT-006 — Privacy-safe Design-partner Feedback

## Context

Product Charter v1.1 requires design-partner feedback to be measurable without
collecting unnecessary sensitive data. PILOT-002 already provides repeatable
private-pilot configuration and PILOT-005 provides aggregate lifecycle health;
the remaining product gap is a durable feedback loop shared by Human and Agent
entry modes.

## Scope

- Add one self-scoped `pilotSubmitPilotFeedback` Tenant command for Human and
  Agent actors over their existing `subject` resource.
- Accept only closed, versioned categorical fields for surface, lifecycle
  stage, sentiment, outcome and blocker code. Reject free text and unknown
  fields.
- Persist an immutable, RLS-isolated feedback projection and its Event,
  Evidence, outbox record and idempotent command receipt atomically.
- Add one MFA-protected `pilotReadPilotFeedbackSummary` aggregate query over
  the existing `risk_portfolio` resource for Risk, Operations and Auditor.
- Add Human/Agent feedback controls and a privacy-safe Risk summary to the
  private product UI, plus the shared Tenant client method for machine callers.
- Update the closed catalog, schemas, fixtures, quotas and commercialization
  traceability.

## Non-goals

- No free text, file upload, contact details, raw prompt, wallet address, KYC,
  PII, Subject/Actor identifier or third-party analytics.
- No public endpoint, mainnet deployment, real funds, production credit or
  disposition authority.
- No scoring, automated product decision or underwriting feature derived from
  feedback.
- No duplicate tenant-provisioning or onboarding system.

## Likely files

- `db/migrations/0024_privacy_safe_pilot_feedback.{up,down}.sql`
- `modules/tenant-command-gateway/src/pilot-feedback-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/authorization/src/authorization-{constants,policy}.js`
- `packages/api-contract/src/tenant-protocol.js`
- `schemas/v2/tenant-protocol-*.schema.json`
- `apps/web/src/{index.html,app.js,styles.css}`
- associated fixtures, tests and project guidance

## Acceptance criteria

- [x] Human and Agent can submit only for their exact owned Subject with
  `pilot.feedback.submit.self`; commands require idempotency and mutation quota.
- [x] The command payload is a closed five-field taxonomy plus schema version;
  no free-text or identifier-bearing field is accepted or returned.
- [x] Feedback is immutable, tenant-isolated and atomically linked to durable
  Event/Evidence; replay returns the same receipt without a duplicate row.
- [x] Risk, Operations and Auditor require `pilot.feedback.read.tenant`, exact
  Tenant portfolio access and recent phishing-resistant MFA.
- [x] Summary output contains bounded aggregate counts only and discloses no
  Subject, Principal, Actor, wallet, KYC, feedback or Event identifier.
- [x] Human and Agent UI surfaces submit the shared command; Risk UI renders the
  durable aggregate and explicit privacy/no-funds boundary.
- [x] PostgreSQL integration proves RLS, idempotency, aggregate consistency and
  cross-tenant isolation; full repository quality gate passes.

## Test commands

```sh
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH \
  node --test modules/tenant-command-gateway/test/pilot-feedback-handlers.test.js
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check:migrations
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check:tenant-protocol
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check
```

## Security checklist

- [x] Exact-resource authorization, ownership and forced PostgreSQL RLS reused.
- [x] Recent MFA required for every aggregate reader.
- [x] Closed enums, maximum lengths, immutable rows and tenant foreign keys
  enforced in both application and database boundaries.
- [x] No raw identifiers or PII in aggregate results, UI telemetry or external
  services; no third-party analytics dependency.
- [x] Real-funds, production-credit and public-route flags remain false.
