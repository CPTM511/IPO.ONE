# PILOT-005 — Privacy-safe Pilot Health

## Context

Product Charter v1.1 requires Human and Agent to be measurable as parallel
first-class entry modes without collecting unnecessary sensitive data. The
private pilot already persists the complete no-funds lifecycle, but
Risk/Operations had no product-facing view proving entry-mode adoption or
funnel completion from durable facts.

## Scope

- Add one read-only `pilotReadPilotHealth` Tenant query over the existing
  `risk_portfolio` resource.
- Derive aggregate application, Offer, acceptance, execution, repayment,
  full-repayment and position counts from RLS-scoped PostgreSQL projections.
- Return cumulative basis-point conversion, dual-native observation and a
  deterministic readiness stage.
- Render the result in the private Risk Operations UI when the exact portfolio
  is loaded.
- Update the closed catalog, schemas, client, authorization, abuse policy,
  fixtures and commercialization traceability.

## Non-goals

- No third-party analytics, cookies, fingerprinting, new tracking store or raw
  event export.
- No Subject, Principal, Actor, KYC, authority, Obligation or repayment IDs in
  the result.
- No public endpoint, Agent MCP tool, production funds, disposition power or
  new resource-enumeration permission.
- No claims of production credit readiness or statistical underwriting value.

## Likely files

- `modules/tenant-command-gateway/src/pilot-health-query-handlers.js`
- `modules/authorization/src/authorization-{constants,policy}.js`
- `packages/api-contract/src/tenant-protocol.js`
- `schemas/v2/tenant-protocol-*.schema.json`
- `apps/web/src/{index.html,app.js,styles.css}`
- associated fixtures, tests and project guidance

## Acceptance criteria

- [x] Risk Operator, Operations Operator and Auditor require
  `pilot.health.read`, active Tenant membership, exact Tenant-owned
  `risk_portfolio` access and recent phishing-resistant MFA.
- [x] The response is closed, aggregate-only, safe-integer bounded and fails
  closed on malformed or non-monotonic projections.
- [x] Human plus Agent application counts equal total applications and funnel
  counts cannot increase downstream.
- [x] Zero-denominator conversion is deterministic and full lifecycle readiness
  requires both entry modes plus at least one fully repaid Obligation.
- [x] The Risk UI displays the durable funnel and explicit privacy/no-funds
  boundary without depending on a third party.
- [x] A real PostgreSQL-backed private Risk session loads the view and browser
  console remains clean.
- [x] Full repository quality gate passes.

## Test commands

```sh
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH \
  node --test modules/tenant-command-gateway/test/pilot-health-query-handlers.test.js
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check:tenant-protocol
PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check
```

## Security checklist

- [x] Existing exact-resource authorization and forced PostgreSQL RLS reused.
- [x] Recent MFA required for every allowed human operator type.
- [x] No business Event, Evidence, projection mutation or idempotency record.
- [x] No raw identifiers, KYC/PII, third-party endpoint or funds authority.
- [x] Closed request/result schema, catalog, abuse quota and private-route
  isolation covered by tests.
