# SERVICING-002A audit: dual-native owned Obligation read

Date: 2026-07-17
Result: Passed for the exact-owner, read-only, no-real-funds local product
profile.

## Outcome

Human and Agent now rehydrate one exact current `obligation.v2` projection from
the same durable Tenant Gateway handler. The Human browser retains only the
opaque Obligation ID as reload navigation context; the Agent SDK and local MCP
tool expose the same response without accepting caller authentication or
ownership claims.

Commercial requirements supersede conflicting legacy DEMO state. No browser,
DEMO controller or cached receipt is authoritative for lifecycle, balances,
schedule, DPD, servicing action or Evidence.

## Closed contract

- Capability: `obligation.read.owned`.
- Operation: `pilotReadOwnObligation`.
- MCP tool: `ipo_one_read_obligation`.
- Result: `tenant_owned_obligation_view.v1`.
- Scope: Human Borrower and Agent Runtime owners only.
- Lookup: one exact Obligation ID; no list, search, cursor or enumeration.
- Output: shared Obligation summary, optional latest servicing-action summary,
  trusted `asOf`, `sandboxOnly=true`, `productionFundsMoved=false` and
  `withdrawable=false`.

## Security findings

- Durable authorization-resource ownership remains the sole object authority.
- Non-owner and wrong-Tenant reads return the same non-enumerating denial.
- Request schemas reject caller Tenant, actor, credential, role, authorization
  decision and network context.
- Response schemas exclude raw PII/KYC, account address, credential, signature,
  provider payload, raw event payload and authorization binding.
- Operator, Risk and Auditor permissions were not broadened.
- Read classification is bounded, idempotency-prohibited and funds-authority
  false.

## Product and browser verification

The in-app browser completed:

1. Human Subject and scoped Consent.
2. Deterministic Intent, Decision Passport and Offer.
3. Exact Offer acknowledgement and shared Obligation acceptance.
4. Signed non-redeemable sandbox execution.
5. Page reload and automatic exact-owner re-authorization.
6. Repayment after reload, with returned `Cured` state.
7. Payments reload and clean-tab manual exact-ID recovery.

The 390x844 state had no horizontal overflow; load and repayment controls were
44px high. Desktop/mobile console inspection returned no application warnings
or errors. Design comparison retained the approved Aave-inspired graphite,
white, lavender and scan-first finance hierarchy.

Evidence is stored under
`artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/`.

## Defects found and closed

- The Servicing Case presentation validator initially expected internal
  `actorHash` and schedule-hash fields that the approved transport summary
  intentionally excludes. It now validates the closed summary against exact
  lifecycle, classification, policy, sequence, balances, servicing reason and
  trusted time.
- Browser QA repayment/action hashes were corrected to canonical 32-byte hex
  fixtures.
- Abuse-control schema coverage was updated for the 33rd private Tenant
  operation.

## Verification matrix

- `pnpm run check`: 301/301.
- `pnpm run test:postgres`: 61/61 on PostgreSQL 17.
- `pnpm run test:security`: 21/21.
- `pnpm run test:transport`: 37/37.
- Schemas: 46; private Tenant operations: 33; abuse classifications: 50;
  local MCP tools: 11; migration pairs: 23.

## Residual commercialization gates

This slice does not approve or implement a privileged servicing queue,
scheduler ownership, notices/collections, production identity/KYC, remote
private transport, real collection rails, custody, capital, legal contract
form, withdrawals or real funds. Those remain separate named approvals and
implementation gates.
