# SERVICING-002B audit: private Servicing Operations queue

Date: 2026-07-17
Verdict: Implemented locally; not release-verified in the current execution environment

## Outcome

IPO.ONE now has a formal private read-only servicing work queue over the same
durable `obligation.v2` projection used by Human and Agent owner views. It is a
commercial product control-plane surface, not an extension of legacy DEMO
state. The static Tenant catalog contains 34 closed private operations; Agent
MCP remains exactly eleven owner-scoped tools.

The queue is available only to authenticated Risk Operator and Operations
Operator actors holding `servicing.queue.read`, bound to one Tenant-owned
`servicing_queue` resource and recent phishing-resistant MFA. Human Borrower,
Agent, Auditor, Provider, Worker and public sandbox paths fail closed.

## Implemented boundary

- Closed query: `pilotReadServicingQueue` ->
  `tenant_servicing_queue_view.v1`.
- Exact adverse classes only: `defaulted`, `dpd_61_89`, `dpd_31_60`,
  `dpd_1_30`, and `grace_period`.
- Bounded limit 1–50 and opaque, filter-bound keyset cursor.
- Stable server ordering: severity, DPD descending, oldest due ascending,
  Obligation ID.
- Canonical current schedule and persisted servicing effective time determine
  past-due balances; caller input cannot set Tenant, time, amounts, status,
  severity, owner or review code.
- Parameterized PostgreSQL query filters `obligation.v2`, open adverse status,
  `sandbox_only=TRUE`, `production_funds_moved=FALSE`, and
  `withdrawable=FALSE`.
- Response excludes names, contacts, raw KYC/KYP, account/provider details,
  credentials, approval identities, raw Evidence/events and unnecessary hashes.
- Safety contract states read-only, PII-free, sandbox-only, no production funds,
  no withdrawal and no disposition authority.
- Aave-inspired private UI provides metrics, closed stage filters, desktop
  table, mobile cards, loading/empty/error/pagination states and no action that
  can assign, collect, restructure, repurchase, write off or move funds.

## Evidence completed

- Tenant protocol schema/catalog/fixture drift gate passes at 34 operations.
- Authorization unit coverage proves the exact Risk/Operations role and recent
  MFA boundary and denies all other actor classes.
- Handler tests prove closed filters, PII-free result shape, filter-bound cursor,
  non-enumerating resource mismatch and invalid-input rejection.
- Repository boundary tests prove one bounded parameterized SQL call, required
  sandbox/no-funds filters, exact mapping, unsafe-filter rejection and
  projection-integrity failure.
- Security source audit proves the queue is private, PII-free, bounded, MFA
  gated and explicitly forbidden from Agent MCP.
- Static UI and complete local quality gates cover the new contract, source,
  markup, responsive rules and unchanged Human/Agent paths.
- Final `pnpm run check` passes 306/306 with 46 schemas, 21 OpenAPI operations,
  23 migration pairs, 34 private Tenant operations and eleven Agent MCP tools.
- Transport evidence currently passes 33/37 tests; all four failures occur
  before product assertions because the environment rejects loopback listeners.

## Pending release gates

1. Run the PostgreSQL integration suite, including Risk/Operations allow,
   stale-MFA/role denial, forced-RLS cross-Tenant isolation and audit rows.
2. Run the full HTTP transport/security listener suites.
3. Capture and inspect loaded/filtered/empty/error/paginated desktop and 390px
   mobile states; verify no overflow, focus/live status and browser diagnostics.

These are execution-environment blockers, not additional permission requests.
They are intentionally not marked passed. The current environment failed
temporary PostgreSQL bootstrap at shared-memory allocation and rejects
`listen(127.0.0.1)` with `EPERM`.

## Commercialization boundary retained

This slice grants no production deployment, real funds, custody, capital,
collections, borrower messaging, notices, bureau reporting, legal action,
assignment, resolution, restructure, repurchase, write-off, unfreeze, limit
change or Agent authority. Those remain separate reviewed commercial gates.
