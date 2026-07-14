# ADR-027: Durable Tenant Risk Portfolio View

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

The commercial pilot control plane needs a reliable Tenant-wide answer to
basic risk questions before it can expose detailed Subjects or execute any
economic action. The normalized PostgreSQL projections contain the required
Agent Subject, CreditLine, and Obligation state, but direct table access would
bypass protocol validation, authorization audit, admission, and response
privacy boundaries.

A portfolio response can also become an accidental data-export endpoint if it
returns raw Subjects, names, account references, Provider details, or an
unbounded asset list. Process-local caching would introduce a second mutable
truth and obscure the point in time represented by the figures.

## Decision

1. Compose `pilotReadTenantRisk` through the existing Tenant Command Gateway
   for `risk_operator` and `auditor` Actors with `risk.read.tenant` only.
2. Require recent phishing-resistant authentication and an active
   Tenant-owned `risk_portfolio` authorization resource. The resource is
   provisioned by trusted Tenant setup; its identifier is not Tenant authority.
3. Read normalized current projections under the Gateway's serializable,
   transaction-local Tenant Security Context and forced RLS. Do not create a
   second cache or bypass the repository boundary.
4. Include only Agent Subjects and their CreditLines and Obligations. Human
   prototype or future Human-credit states do not enter this pilot view.
5. Return complete status and amount totals for all assets. Return no more than
   50 per-asset rows, ordered by outstanding amount, utilized amount, then
   asset identifier, and include `hasMoreAssetExposures` when truncated.
6. Keep all amounts as exact decimal minor-unit strings. Counts are bounded
   non-negative integers. Unknown statuses, negative or malformed amounts, and
   unsafe counts are integrity failures, never silent omissions.
7. Omit Tenant ID, Subject IDs, display names, Principal/account references,
   Provider details, raw Events/Evidence, KYC/KYP, and PII. Detailed and export
   views require separate contracts and privacy review.
8. The query emits authorization allow/deny audit and bounded admission state,
   but no domain Event, Evidence envelope, projection mutation, command
   execution authority, or idempotency record.
9. Keep the operation private and `local_in_process`. A future authenticated
   HTTP/MCP/A2A adapter must pass a separate production identity and deployment
   review.
10. This view grants no freeze, unfreeze, limit, activation, spend, payment,
    custody, chain, or real-funds authority.

## Consequences

- Risk Operators and Auditors gain one shared, reconstructable overview over
  the same durable state used by future economic handlers.
- The first commercial Admin/Risk surface can display meaningful totals
  without exposing private entity detail.
- Asset-detail truncation is explicit; complete per-Subject, Provider, and
  chain concentration views remain future bounded queries.
- Every read is current and auditable, at the cost of bounded database
  aggregation work on each request.

## Verification

- Contract fixtures prove exact Actor, resource, request, and result shapes.
- Unit tests prove exact mapping, bounds, unknown-state rejection, and
  dedicated client authority separation.
- PostgreSQL tests prove empty and populated totals, same/different Tenant
  isolation, stale-MFA and role denial, read-only behavior, audit, and RLS.
- Security tests prove no identifiers, PII, unbounded export, public route,
  mutation, or funds authority is introduced.
