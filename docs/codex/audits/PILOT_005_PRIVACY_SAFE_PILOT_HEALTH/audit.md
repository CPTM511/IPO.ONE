# PILOT-005 Audit — Privacy-safe Pilot Health

Date: 2026-07-17
Runtime: Node 24.18.0 / pnpm 11.1.3
Mode: local-only, synthetic-only, no real funds

## Outcome

The private product now exposes a 36th closed Tenant operation,
`pilotReadPilotHealth`. It gives Risk/Operations/Auditor users an aggregate
Human/Agent product funnel derived from the same durable PostgreSQL lifecycle
facts used by the shared obligation kernel. The Risk UI loads it alongside the
exact Tenant portfolio and presents entry-mode, conversion, position and full
repayment evidence without third-party analytics.

## Authorization and privacy result

- Existing exact Tenant-owned `risk_portfolio` resource reused; no enumerating
  resource or caller-selected Tenant scope added.
- New `pilot.health.read` capability is limited to Risk Operator, Operations
  Operator and Auditor, with recent phishing-resistant MFA required.
- Result schema is aggregate-only and rejects Subject, Principal, Actor,
  authority, Obligation, repayment, KYC and PII identifiers.
- Read has no idempotency key, business Event, Evidence, projection mutation,
  public route, Agent MCP exposure, funds authority or third-party endpoint.
- PostgreSQL counts are safe-integer checked and fail closed when entry-mode,
  funnel or position totals are inconsistent.

## Live evidence

The restarted local private product loaded
`risk_portfolio_local_private_pilot` through the visible Risk UI and the
authenticated Gateway. The server-backed result showed:

- 3 applications: 2 Human and 1 Agent;
- dual-native observation: true;
- 3 accepted, 1 executed, 1 repaid and 1 fully repaid;
- 3 total positions and 2 open positions;
- readiness stage: `verified`;
- browser console: 0 errors and 0 warnings.

No Cookie, CSRF token, browser storage or session credential was inspected or
exported during validation.

## Verification

- `pnpm run check`: passed; 321 tests, 46 schemas, 36 private Tenant
  operations, 21 OpenAPI operations and 23 migration pairs.
- `pnpm run check:tenant-protocol`: passed; 52 request fixtures and 44 result
  fixtures.
- Full security suite: passed, 23/23, including aggregate-only, recent-MFA,
  tracker-free, public-route isolation and live loopback ingress assertions.
- Handler tests cover verified, empty and partial stages plus malformed,
  overflow and non-monotonic projection rejection.
- Real PostgreSQL-backed Risk browser verification: passed.
- Borrower, Principal and Risk loopback health endpoints all returned `ready`.

## Residual boundaries

This is product instrumentation for a local no-funds design-partner pilot, not
production analytics or underwriting evidence. Production multi-tenant
deployment, backup/restore, protected operations ownership, privacy/legal
review, real capital, licensed Human lending and mainnet execution remain
separate protected gates.
