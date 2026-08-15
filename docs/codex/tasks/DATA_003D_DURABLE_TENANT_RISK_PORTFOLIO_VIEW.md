# DATA-003D: Durable Tenant Risk Portfolio View

Status: Complete locally under the approved SECURITY-001 local non-funds boundary.
This task is stacked on DATA-003C and grants no activation, limit change,
provider execution, public routing, or funds authority.

## Context

The durable Tenant Command Gateway now creates and protects Agent Subjects, but
Risk Operators and Auditors cannot inspect a Tenant-wide portfolio through the
same authenticated protocol. FR-009 requires exposure, utilization, overdue,
default, and alert-relevant status visibility before the control plane can
support a commercial pilot.

SEC-D05 already assigns `risk.read.tenant` to Risk Operators and Auditors.
`pilotReadTenantRisk` is already classified as a recent-MFA, Tenant-owned,
read-quota operation by AUTHZ-001 and ABUSE-001. This issue composes that
approved policy into the local durable Gateway without adding a network route
or production identity.

## Scope

- Add `pilotReadTenantRisk` as a local in-process Tenant protocol query for
  Risk Operators and Auditors only.
- Require recent phishing-resistant Human authentication, active
  Tenant/client membership, `risk.read.tenant`, and an active Tenant-owned
  `risk_portfolio` authorization resource.
- Read one serializable, RLS-scoped point-in-time view from normalized Agent
  Subject, CreditLine, and Obligation projections.
- Return complete portfolio totals plus at most 50 deterministic per-asset
  exposure summaries and an explicit `hasMoreAssetExposures` signal.
- Preserve minor-unit values as exact non-negative decimal strings and fail
  closed on unknown states, invalid counts, or malformed durable values.
- Expose aggregate Agent-only state. Do not return display names, Principal or
  account references, Provider details, raw Events/Evidence, KYC/KYP, PII, or
  Tenant identity.
- Add the operation to the closed request/result/catalog contract, TypeScript
  unions, conformance fixtures, a dedicated risk-view client, and drift gate.
- Record allow and deny authorization audits and read admission; commit no
  business Event, projection, or command response for this query.

## Non-Goals

- No Subject detail, Provider/chain concentration, alert engine, risk score,
  model decision, CSV/export, or unbounded portfolio dump.
- No freeze, unfreeze, credit-line change, Mandate activation, account proof,
  spend, payment, custody, chain transaction, or real funds.
- No public or authenticated HTTP route, MCP/A2A server, production IdP,
  production Credential provisioning, cloud resource, DNS, or deployment
  change.
- No Human lending, KYC/KYP processing, raw PII, wallet proof, signing key, or
  secret.

## Likely Files

- `modules/persistence/src/postgres-core-repository.js`
- `modules/tenant-command-gateway/src/*`
- `modules/tenant-command-gateway/test*/*`
- `packages/api-contract/*`
- `api/tenant-protocol/*`
- `schemas/v2/tenant-protocol-*.schema.json`
- `security/test/gateway-security.test.mjs`
- `docs/architecture/ADR-027-durable-tenant-risk-portfolio-view.md`
- `README.md` and versioned guidance/security documents

## Acceptance Criteria

- A current Risk Operator or Auditor with `risk.read.tenant` can read the
  authorized Tenant portfolio and receives only closed aggregate fields.
- Operations Operator, Developer, Agent, stale-MFA, missing-capability,
  cross-Tenant, wrong-resource, idempotency, reason, and payload-extension
  attempts fail closed.
- Empty portfolios return explicit zero counts and amounts. Populated totals
  include all Agent assets, while detail rows are deterministic, bounded, and
  advertise truncation.
- Subject, CreditLine, Obligation, and per-asset totals use one RLS-scoped
  serializable transaction and exact minor-unit arithmetic.
- Unknown statuses or malformed database aggregates cannot become a protocol
  result.
- Read success writes authorization audit and admission evidence but no domain
  Event, Evidence envelope, projection, command execution, or idempotent
  response.
- The anonymous public sandbox cannot address the operation or durable
  portfolio resource.

## Test Commands

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] Work remains inside approved SECURITY-001 SEC-D01 through SEC-D09.
- [x] Query grants no mutation, approval, economic, or funds authority.
- [x] Tenant and Actor authority remain trusted context, never caller data.
- [x] Output is aggregate, bounded, versioned, PII-free, and exact.
- [x] Production identity, public routing, private data, and real value remain
  deployment gates.
- [x] Full local verification evidence recorded; remote CI is required on the
  review branch before merge.

## Verification Evidence

- Frozen install succeeds with pnpm 11.1.3 on the required Node.js 24.18.0
  runtime.
- `pnpm run check`: 165 unit and contract tests pass; all 24 schemas, 21
  OpenAPI operations, nine migrations, deployment/launch/approval/abuse
  policies, and the seven-operation Tenant protocol contract pass their drift
  gates.
- `pnpm run test:security`: 21 adversarial tests pass, including aggregate-only
  response, recent-MFA policy, and public-route isolation assertions.
- `pnpm run test:postgres`: 47 PostgreSQL 17 tests pass, including 29 focused
  Tenant Gateway cases. The new case proves exact nonzero CreditLine and
  Obligation aggregation, empty and cross-Tenant isolation, Risk/Auditor
  access, stale-MFA and role denial, no business writes, fixture cleanup, and
  clean reconciliation.
- Live API smoke reaches a settled transfer and fully repaid obligation; the
  vertical-slice demo ends with a balanced Ledger and zero outstanding amount.
- `pnpm audit --prod` reports no known vulnerabilities; bounded secret-pattern
  scan and `git diff --check` pass.
- Remote Quality Gate evidence is required before merge.
