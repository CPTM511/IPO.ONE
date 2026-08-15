# SERVICING-002B: Private Servicing Operations queue

Status: Implemented locally on 2026-07-17 under the standing no-real-funds
commercialization authorization. Contract/unit/security/static-UI gates pass;
PostgreSQL RLS and browser/loopback execution remain release-gate retests due
to the current Codex environment. Commercial product requirements supersede
conflicting legacy DEMO behavior.

## Context

The shared kernel already persists trusted-time DPD/default state, cure,
immutable servicing actions, and dual-controlled sandbox dispositions. Human
and Agent owners can reload one exact owned Obligation, while the private Risk
Operations control plane exposes only aggregate Tenant risk. Operations cannot
yet review which adverse Obligations require attention without bypassing the
closed protocol or querying the database directly.

This slice adds a formal, read-only, PII-free work queue over the existing
Obligation projection. It does not create a second servicing state machine and
does not grant any disposition authority.

## Scope

- Add `servicing.queue.read` only to Risk Operator and Operations Operator role
  bundles.
- Add recent-phishing-resistant-MFA Tenant query
  `pilotReadServicingQueue` over one Tenant-owned `servicing_queue` resource.
- Return only open adverse sandbox Obligations in the existing closed servicing
  classifications: `defaulted`, `dpd_61_89`, `dpd_31_60`, `dpd_1_30`, and
  `grace_period`.
- Return bounded, exact, PII-free case summaries: opaque Obligation and Subject
  IDs, asset, lifecycle/classification, DPD, trusted effective time, oldest due,
  outstanding/past-due balances, schedule sequence, servicing owner, latest
  action summary, and a deterministic non-authorizing review code.
- Sort deterministically by severity, DPD descending, oldest due ascending, and
  Obligation ID. Support a validated closed classification filter, limit 1-50,
  and an opaque bounded keyset cursor.
- Render the queue inside authenticated Risk Operations using the existing
  graphite/white/lavender Aave-inspired design system, with desktop table and
  mobile cards.
- Preserve non-enumerating denied/unavailable behavior and audit/admission
  evidence through the existing Tenant Gateway transaction boundary.

## Non-goals

- No Human Borrower, Agent Runtime, Auditor, Provider, public sandbox, MCP, or
  anonymous access.
- No borrower name, contact data, raw KYC/PII, account, credential, signature,
  provider payload, actor identity, approval identity, or event payload.
- No acknowledge/assign/resolve operation, collections workflow, borrower
  messaging, notices, bureau reporting, hardship intake, legal action, export,
  arbitrary search, or entity-wide drill-down.
- No restructure, repurchase, write-off, unfreeze, limit change, clock advance,
  payment, custody, withdrawal, capital, real funds, production deployment, or
  mainnet authority.
- No new servicing classification, DPD rule, balance mutation, database source
  of truth, or browser-derived risk state.

## Likely files

- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/tenant-command-gateway/src/servicing-queue-query-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `modules/persistence/src/postgres-core-repository.js`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `schemas/v2/tenant-protocol-*.schema.json`
- `api/tenant-protocol/*`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/support/risk-operations-browser-host.mjs`
- `modules/tenant-command-gateway/test*/*`
- `security/test/gateway-security.test.mjs`

## Acceptance criteria

- [ ] Risk and Operations actors with the exact capability, active membership,
  matching client, Tenant resource ownership, and recent phishing-resistant MFA
  can read the queue; all other actor/role combinations fail closed.
- [ ] The query runs under forced Tenant RLS, uses only parameterized SQL, and
  cannot cross Tenant boundaries.
- [x] The queue includes only adverse open `obligation.v2` records with
  `sandboxOnly=true`, `productionFundsMoved=false`, and `withdrawable=false`.
- [ ] Stable sorting and opaque keyset pagination have no duplicate or skipped
  cases across adjacent pages; malformed, oversized, and stale-shape cursors
  fail closed.
- [x] Returned past-due balances are derived from the canonical current schedule
  at the persisted trusted servicing effective time and cannot be caller-set.
- [x] The result contract is closed, validated before commit, PII-free, and
  explicitly non-authorizing/no-funds.
- [ ] Private Risk Operations renders loading, denied/unavailable, empty,
  filtered, paginated, default and mobile states without exposing legacy DEMO
  risk state.
- [x] Existing owner reads, dual-controlled dispositions, Human/Agent lifecycle,
  public sandbox, MCP registry and Provider boundary remain unchanged.

## Test commands

```sh
pnpm run check:tenant-protocol
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security checklist

- [x] Separate narrow capability and resource type; no reuse of broad aggregate
  risk or owner-read authority.
- [x] Recent phishing-resistant MFA required for both allowed actor types.
- [x] Caller controls only closed classifications, bounded limit, and opaque
  cursor; Tenant, time, severity, review code, balances, and case state are
  server-derived.
- [x] Resource-blind errors prevent queue and Tenant enumeration.
- [x] Response omits PII, raw Evidence/events, hashes not needed for operations,
  credentials, accounts, provider details, approval identities, and funds
  authority.
- [x] UI has no executable disposition or collection controls and labels the
  queue as synthetic/private/no-real-funds.

## Verification checkpoint — 2026-07-17

- `pnpm run check`: passed 306/306 after implementation and documentation
  refresh; 46 schemas, 21 OpenAPI operations, 23 migration pairs and 34 private
  Tenant operations remain aligned.
- Non-listener security suite: passed, including queue role/MFA/PII/MCP checks.
- Queue handler and PostgreSQL repository boundary tests: 9/9 passed.
- Transport suite: 33/37 passed; the remaining four failed only at
  `listen(127.0.0.1)` with `EPERM` before exercising product assertions.
- `pnpm run test:postgres`: not executed because temporary PostgreSQL bootstrap
  failed at shared-memory allocation (`No space left on device`).
- Browser desktop/mobile capture: pending because its local QA Host cannot
  listen in the current environment.

Unchecked acceptance criteria above require the PostgreSQL and/or browser Host
runtime, not another product permission. They must remain launch-gate blockers
until rerun successfully.
