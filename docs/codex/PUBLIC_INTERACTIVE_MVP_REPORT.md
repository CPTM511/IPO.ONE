# Public Interactive MVP Report

> Historical public-demo snapshot. For current implementation truth and the
> audit-driven hardening results, use `README.md`, `MVP-051`, and the v0.2
> architecture review draft.

## What Was Built

- Full-stack local demo served from one Node process.
- Interactive frontend with seven required screens:
  - Agent Setup
  - Lockbox
  - Credit Line
  - Provider Spend
  - Revenue Capture & Repayment
  - Credit Learning Dashboard
  - Admin Dashboard
- Backend API routes for Agent setup, wallet binding, Lockbox, credit line, spend, settlement, revenue capture, auto repayment, credit learning, demo cycles, status, credit profile, audit, vertical slice, and reset.
- Transparent `credit-learning` module with deterministic score deltas, risk tiers, limit recommendations, demo interest-rate recommendations, score history, reason codes, and append-only events.
- Static frontend wired to real API calls and shared module state. No dead buttons or disconnected UI.
- OpenAPI 3.1.2 contract for all 21 current operations, stable Problem Details,
  request correlation, and an alpha JavaScript SDK with TypeScript declarations.

## Quality Gate

Verified with:

```sh
pnpm run check
pnpm run test:postgres
pnpm run smoke:api
```

The gates cover dependency boundaries, schemas, OpenAPI/route/SDK parity,
migration parity, 72 database-free unit and vertical-slice tests, a live adversarial HTTP suite, a real
PostgreSQL event-runtime suite, and the public HTTP workflow. The browser flow
was also completed interactively at desktop size.

## Safety Boundary

- No real lending.
- No real funds.
- No financial advice.
- Demo credit score only.
- Demo interest rate only.
- No production reinforcement learning or black-box scoring.
- No real human lending.
- No unrestricted withdrawals.

## Local URLs

- Frontend: `http://127.0.0.1:3000`
- Backend health: `http://127.0.0.1:3000/healthz`
- Vertical slice: `http://127.0.0.1:3000/v1/demo/vertical-slice`

## Recommended Next Milestone

Expand the reviewed PostgreSQL repository pattern beyond Rail, then add
authenticated tenants, RBAC, reconciliation workers, and certified adapter
operations before any production value path.
