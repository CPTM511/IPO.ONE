# M1-B Vercel Golden Flow Evidence

## Status

Status: `LOCAL_SERVERLESS_GATES_PASS_DEPLOYED_GOLDEN_FLOW_PENDING`

No deployed capability is verified by this document until a deployment URL,
exact commit, trace, screenshots, logs, Event IDs, and PostgreSQL evidence are
recorded below.

## Exact deployment identity

| Evidence | Value |
| --- | --- |
| Source commit | `PENDING` |
| Source tree | `PENDING` |
| Primary Vercel project | `ipo-one-internal` |
| Primary project ID | `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y` |
| Primary deployment ID / URL | `PENDING` |
| Risk Vercel project | `ipo-one-internal-risk` |
| Risk deployment ID / URL | `PENDING` |
| Stable primary and Risk URLs | `PENDING` |
| Neon project / branch / database | `PENDING_NON_SECRET` |
| Migration head | `0053_workspace_continuation_tenant_guard` |
| Node runtime | `24.x` |
| Vercel CLI | `58.5.1` |
| Playwright trace | `PENDING` |
| Evidence manifest | `PENDING` |

## Authenticated Agent Golden Flow

| Step | Required deployed evidence | Status |
| --- | --- | --- |
| Sign in | Real invited SIWE challenge on role-isolated Principal and Risk origins, wallet signature, durable sessions | `PENDING` |
| Create Principal | Server result, Event ID, projection row | `PENDING` |
| Create Agent | Controller-bound Subject and Principal evidence | `PENDING` |
| Bind Wallet | Verified CAIP-10 AccountBinding and proof evidence | `PENDING` |
| Create Lockbox | Purpose-bound, Mandate-controlled, Provider-restricted durable row | `PENDING` |
| Obtain CreditLine | `credit_line.v2` derived capacity/utilization projection | `PENDING` |
| Provider Spend | Allowlisted Provider/category and signed non-redeemable Sandbox receipt | `PENDING` |
| Obligation | Canonical shared Obligation and balanced ledger | `PENDING` |
| Revenue Capture | Synthetic revenue event, no external funds | `PENDING` |
| Partial repayment | Allocation, repayment Event, Lockbox and CreditLine update | `PENDING` |
| Full repayment | Fully repaid Obligation, closed Lockbox, zero outstanding exposure | `PENDING` |
| Risk/Admin view | Authenticated Risk-origin exposure and repayment visibility | `PENDING` |
| Admin freeze | Reason-coded durable freeze Event and projection | `PENDING` |
| Rejected spend | Subsequent spend fails closed because current status is frozen | `PENDING` |

Protocol fees must display `disabled`; no fee calculation or posting is
permitted.

## Serverless-specific acceptance matrix

| # | Acceptance | Required evidence | Status |
| ---: | --- | --- | --- |
| 1 | Fresh browser login and server-truth recovery | Playwright trace plus server continuation query | `PENDING_DEPLOYED` |
| 2 | Refresh during unfinished Offer continuation | Same Offer/version restored; browser storage cleared | `PENDING_DEPLOYED` |
| 3 | Cold invocation | Function and Neon wake from no recent traffic | `PENDING_DEPLOYED` |
| 4 | Concurrent duplicate API requests | One effect and one exact replay | `VERIFIED_LOCAL_POSTGRES` |
| 5 | Duplicate Provider webhook | One signed callback inbox result; replay rejected or replayed without effect | `VERIFIED_LOCAL_POSTGRES` |
| 6 | Duplicate chain receipt | One Evidence observation and one canonical projection | `VERIFIED_LOCAL_POSTGRES` |
| 7 | Cron and webhook concurrency | Advisory lock, inbox/outbox lease, one effect | `VERIFIED_LOCAL_POSTGRES` |
| 8 | Function termination and retry | Transaction rollback or expired lease recovery; bounded attempts | `VERIFIED_LOCAL_POSTGRES` |
| 9 | Connection exhaustion protection | 1/1 request pools, 2 Cron pool, bounded handler concurrency | `VERIFIED_LOCAL` |
| 10 | Partial then full repayment | Exact allocations and no duplicate economic effect | `VERIFIED_LOCAL_POSTGRES` |
| 11 | CreditLine replay/projection parity | Event replay equals PostgreSQL `credit_line.v2` | `VERIFIED_LOCAL_POSTGRES` |
| 12 | Freeze then rejected spend | Durable freeze and current-state denial | `VERIFIED_LOCAL_POSTGRES` |
| 13 | Deployment rollback | Prior deployment restored without database mutation; Cron checked separately | `PENDING_DEPLOYED` |
| 14 | Clean database migration | 53 exact migration pairs and bootstrap role verification | `VERIFIED_LOCAL_POSTGRES` |
| 15 | Golden Flow on Vercel URL | Complete trace, screenshots, Events, rows, logs | `PENDING_DEPLOYED` |

Local test status does not upgrade any deployed Requirement.

## Current local machine evidence

```text
Static Vercel gate: PASS
Serverless-specific unit tests: 15/15 PASS
Repository unit/contract tests: 717/717 PASS
PostgreSQL tests: 83/83 PASS
Node 24 bundle syntax/import: PASS
```

## Required final result

- zero duplicate financial effects;
- zero unauthorized exposure;
- zero canonical state in Function memory or browser storage;
- 100% Event/projection parity;
- 100% deployed Golden Flow completion;
- successful interruption, restart, replay, and rollback evidence.
