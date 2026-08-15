# TC-402 pre-change mapping

Prepared: 2026-07-25

## Source and human gate

- Branch: `codex/commercial-access-release`.
- Package baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`.
- The Founder accepted TC-401 and explicitly authorized continuation into
  TC-402.
- The accepted stacked worktree is intentionally uncommitted and must remain
  intact.
- The approval unlocks the TC-402 contract, deterministic waterfall code,
  canonical Ledger postings, offline fault injection, PostgreSQL restart
  tests, and protected non-redeemable Testnet simulation.
- It does not supply or approve production pricing, a live Testnet close,
  withdrawal or payout authority, an API Wallet, signer, credential, mainnet,
  deployment, or real funds. Those paths remain unavailable and must be
  reported `UNVERIFIED`.

## Existing runtime truth

1. TC-104 owns the existing 25-operation local no-funds product contract.
   Its `trading_settlement.v1` is intentionally restricted to zero realized
   PnL, zero venue/closing costs, zero fixed/performance return, zero IPO.ONE
   fee, exact return of synthetic contributions, and no Ledger mutation.
2. Relaxing `trading_settlement.v1` would silently change an accepted local
   no-funds contract and its UI/SDK/MCP semantics. TC-402 therefore must not
   repurpose or weaken it.
3. TC-401 binds exact non-redeemable Subject and Provider contributions to one
   existing canonical Facility and activates that Facility without creating a
   second Facility, Ledger, or Obligation kernel.
4. TC-301/302/303 provide typed protected execution, monotonic protection,
   flattening, durable unknown-outcome handling, and cumulative final
   reconciliation. They do not calculate or post settlement economics.
5. The canonical PostgreSQL Event Repository and Core Repository already
   provide Tenant-scoped serializable commands, idempotency, Event, Evidence,
   outbox, inbox, projection snapshots, and balanced append-only Ledger
   transactions. TC-402 must reuse them.
6. The current Performance Proof is revocable by declaration but the product
   has no implemented revocation or supersession transition.
7. No approved production fee, price, tax, loss-bearer, guarantee, payout,
   transfer, custody, or accounting policy exists.

## Change boundary

TC-402 will add one closed internal Testnet settlement record and module. The
record will:

- bind one existing canonical Facility, Obligation, TC-401 funding control,
  close request, final reconciliation, accepted immutable terms, and canonical
  Ledger snapshot;
- freeze new-risk admission and require zero orders, zero exposure, zero
  unknown executions, complete positions, zero unrealized PnL, `FINAL`
  finality, and `RECONCILED` source Evidence before settlement;
- accept normalized final equity, realized PnL, venue cost, and closing cost
  only through a source-fixed, network-disabled adapter;
- require exact conservation:
  `capital + realized PnL - venue cost - closing cost = final equity`;
- apply Subject first-loss and Provider-principal-first recovery without
  manufacturing a receivable or guarantee;
- calculate fixed, performance-participation, and hybrid results using the
  immutable accepted terms;
- apply an IPO.ONE percentage fee only to Provider actual realized financial
  income, never principal or unrealized PnL;
- post one balanced canonical Ledger transaction containing contributions,
  realized gain/loss, costs, principal/collateral recovery, income allocation,
  and fee allocation;
- atomically settle the existing canonical Facility and persist Event,
  Evidence, outbox, Ledger, and the TC-402 projection;
- issue privacy-minimized versioned Performance Evidence; and
- revoke or supersede that Evidence through new append-only versions without
  deleting prior Event/Evidence history.

All payout fields are allocations only. The implementation cannot transfer,
withdraw, release capital, call Hyperliquid, or move value.

## Deterministic waterfall

For starting Provider principal `P`, Subject first loss `S`, finalized equity
`E`, realized PnL `R`, venue costs `V`, and closing costs `C`:

1. require `P + S + R - V - C = E` and `E >= 0`;
2. Provider principal return is `min(P, E)`;
3. Subject collateral return is
   `min(S, E - provider principal return)`;
4. positive realized financial income is only
   `max(E - P - S, 0)`;
5. fixed return is Actual/365 floor arithmetic over Provider principal and is
   capped by remaining realized financial income;
6. performance participation is floor basis-point arithmetic over remaining
   realized financial income and applies only to performance/hybrid terms;
7. IPO.ONE fee is floor basis-point arithmetic over Provider realized income
   only;
8. Subject profit receives the remaining realized financial income; and
9. every allocation plus fee must equal final equity exactly.

Loss consumes Subject collateral before Provider principal. A Provider
shortfall is explicit and cannot become a synthetic receivable or guarantee.
Rounding residuals stay in Subject profit, so no minor unit is created or
discarded.

## Fee policy boundary

The implementation will accept only a closed, versioned, source-fixed
Testnet-simulation fee policy. It must state:

- the exact policy/hash and human-decision Evidence hash;
- a bounded IPO.ONE fee rate;
- `feeBasis=provider_realized_income`;
- `principalFeeAllowed=false`;
- `unrealizedPnlFeeAllowed=false`;
- `productionPricingApproved=false`;
- `mainnetApproved=false`; and
- `fundsAuthority=false`.

Test policy vectors exercise non-zero rates to prove arithmetic. They are not
approved product pricing, cannot enter production, and do not authorize a
payout.

## Contract and catalog decision

- Add
  `schemas/v2/hyperliquid-testnet-settlement-record.schema.json`.
- Add internal module `modules/hyperliquid-settlement`.
- Add migration `0038_trading_testnet_settlement`.
- Keep the Trading Capital Tenant catalog at 25 operations and the complete
  Tenant catalog at 71 operations.
- Add no OpenAPI, SDK, MCP, browser, AuthZ capability, admission quota,
  approval-policy, external endpoint, dependency, credential, or deployment
  surface.

## Planned verification

- Property vectors for profit, loss, partial Provider recovery, zero income,
  total loss, fixed, performance, and hybrid templates.
- Exact minor-unit rounding and very large bounded integers.
- Principal and unrealized-PnL fee exclusion.
- `UNKNOWN`, stale, incomplete, open-order, nonzero exposure, and unreconciled
  finality blocking.
- Economic-term, Facility, funding, Obligation, Ledger, close-request, and
  reconciliation drift.
- Balanced canonical Ledger entries and exact conservation.
- Performance Evidence issue, revoke, supersede, expiry, redaction, and replay.
- PostgreSQL RLS, immutable identity/safety fields, legal transitions,
  Event/Evidence/outbox/inbox counts, atomic rollback, and restart replay.
- Protected simulation E2E only. Live Testnet close, payout, withdrawal, and
  production pricing remain `UNVERIFIED`.
