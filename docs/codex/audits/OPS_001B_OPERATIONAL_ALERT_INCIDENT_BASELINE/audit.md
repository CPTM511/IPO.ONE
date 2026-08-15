# OPS-001B operational alert and incident baseline audit

Date: 2026-07-17
Scope: local closed no-real-funds operational signal normalization, alert
candidate policy/evaluation, manual incident runbooks, and current Node 24
repository gates.

## Outcome

Passed for the scoped local private-pilot foundation. Seven reviewed
event-presence conditions now map into one versioned operational signal model
and deterministic alert candidates. Exact source replay is idempotent, repeated
logical scopes aggregate, Evidence references are bounded, and source payloads
or raw identifiers never leave the adapters.

This is not a hosted alerting system. Notification targets and named owners are
explicitly unconfigured. The module has no dispatcher, scheduler, durable alert
store, command client, automatic protective action, release authority, or funds
authority.

## Implemented contract

The `ops_001b.v1` policy covers:

- failed full reconciliation;
- invalidated payment-chain Evidence;
- activated break-glass incidents;
- unavailable authenticated admission control;
- failed full-lifecycle synthetic checks;
- servicing default cases; and
- servicing write-off reviews.

Each candidate contains severity, route, role-level owner, readiness effect,
runbook reference, manual action codes, hashed logical scope, exact occurrence
count, first/last observation time, and up to 32 hashed Evidence references.
The current rules use event presence only; no credit, exposure, loss,
utilization, stop-loss, or incident-time threshold was invented.

## Security evidence

- Every relevant adapter requires a module-created
  `operational_source_boundary.v1`; an object with identical fields but without
  the internal brand is rejected.
- Tenant, Actor, Subject, Obligation, payment, incident, and check identifiers
  are used only to derive domain-separated hashes.
- Source payloads, PII, account references, credentials, and execution inputs
  are absent from signals and alerts.
- Policy drift fails if automatic actions, real-funds actions, or production
  release authority becomes true.
- Alert action codes are routing instructions only and cannot call an existing
  Gateway operation or bypass AuthN/AuthZ/Approval/Admission.
- Batches are bounded at 1,000 signals and each candidate retains at most 32
  Evidence references while preserving the exact unique occurrence count.

## Verification

- Runtime: Node 24.18.0; pnpm 11.1.3.
- `pnpm run check`: 283/283 passed; 44 Schemas, 21 migration pairs, 32 Tenant
  operations, ten Agent MCP tools, and seven operations-alert rules stayed exact.
- Fresh PostgreSQL 17 integration: 55/55 passed; the temporary cluster was
  stopped after the run.
- Security: 21/21 passed, including live public-sandbox adversarial HTTP checks.
- Authenticated Human/Agent transport, SDK, and MCP: 35/35 passed.
- Signed Provider process boundary: 5/5 passed.
- Operations-control unit and drift coverage: 7/7 passed.
- `git diff --check` passed.

The first in-sandbox live-server attempts were blocked by local `EPERM` socket/
shared-memory policy. The same suites passed when run through the approved local
loopback/test-process boundary; no product code change was used to bypass the
tests.

## Remaining commercialization gaps

Follow-up: `OPS-001C` has since completed the durable Tenant-RLS alert/
occurrence store and callable exact-release dual-native lifecycle runner. The
historical statement above remains the OPS-001B checkpoint; protected
scheduling, external delivery, named ownership and product lifecycle
permissions are still open.

- Configure and test named notification recipients, incident/takedown owners,
  escalation rota, and retention through approved private infrastructure.
- Deploy a protected schedule around the completed callable lifecycle runner;
  do not treat local invocation as continuous monitoring.
- Add the Human-friendly servicing case queue and authorized Evidence drilldown;
  do not expose a technical hash/proposal paste console as the commercial UI.
- Approve numeric SLOs, caps, and stop-loss policy separately; then add
  monitoring without weakening the current event-presence fail-closed rules.
- Exercise incident, reconciliation, key-rotation, break-glass, chain-reorg, and
  restoration runbooks before opening the closed design-partner pilot.
- Keep production identity, private deployment, unfreeze/limit increases,
  contracts, custody, real funds, and Human cash lending behind their named gates.
