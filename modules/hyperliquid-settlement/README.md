# Hyperliquid Testnet settlement control (TC-402)

This module implements the deterministic, simulation-only close and accounting
boundary for a flattened Trading Facility. It does not connect to Hyperliquid,
submit a close, sign an Exchange action, pay a Provider, or move funds.

The settlement is released only after a source-fixed observation proves final
positions, zero open orders, zero exposure, zero unrealized PnL, no unknown
execution, and a complete reconciliation. `UNKNOWN`, stale, incomplete, or
binding-drift input stays closed or becomes an immutable incident.

## Waterfall

One balanced transaction is posted to the canonical IPO.ONE Ledger:

1. venue and closing costs are reconciled into final equity;
2. Provider principal is returned first, without a guarantee;
3. Subject contribution is returned next, so the Subject absorbs first loss;
4. fixed return uses Actual/365 floor arithmetic;
5. performance participation applies only to remaining realized income;
6. the IPO.ONE fee applies only to realized Provider income;
7. any minor-unit rounding residual remains with Subject profit.

No fee is charged on principal or unrealized PnL. No receivable, second
Facility, second Obligation, or second Ledger is created. The fee policy is a
versioned test input with `productionPricingApproved=false`; production
pricing needs a new, precise human approval.

## Durability and Evidence

PostgreSQL stores the immutable identity, version-locked transitions, final
economics, canonical Ledger reference, and current Evidence revision under
forced RLS. Settlement, the balanced Ledger transaction, Ledger accounts,
Facility transition, domain events, Evidence envelopes, and outbox messages
commit atomically.

Performance Evidence is append-only, revocable, and supersedable. It is not an
official report, universal score, production authority, or proof of live
Hyperliquid connectivity. A restart recovers the durable settlement and its
Evidence chain without replaying an external action.

## Explicit boundary

Live Testnet Exchange writes, API Wallets, signing, withdrawals, external
transfers, mainnet, real funds, payout execution, and deployment remain
unavailable. Enabling any of them requires a separate task, fresh threat-model
review, and new, precise human approval. This implementation is not live-testnet or production-readiness evidence.
