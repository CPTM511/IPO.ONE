# Hyperliquid Testnet reconciliation and recovery

This module is the TC-303 protected, simulation-only reconciliation boundary.
It does not connect to Hyperliquid, submit an order, sign a message, provision
an API Wallet, post the Ledger, mutate a Facility, deploy, use mainnet, or move
funds.

## What it proves

- A server-owned execution, nonce, Facility, order, risk, and canonical Ledger
  snapshot is hash-bound before reconciliation starts.
- Venue inputs are closed normalized observations from a source-fixed,
  network-disabled adapter. Raw responses and caller-selected endpoints are not
  admitted.
- Cumulative size and notional cursors make duplicate inbox delivery and a
  partial-fill/cancel race economically idempotent.
- `NOT_FOUND`, stale, incomplete, timeout, adapter failure, and poll exhaustion
  remain `UNKNOWN`. They never become a false success and never cause an
  uncertain write to be resubmitted.
- Repeated adapter failure and every binding, cursor, Ledger, Facility, or risk
  contradiction open the circuit breaker and block new risk.
- Manual safe stop is separately authorization/admission checked, immutable,
  idempotent, and terminal.
- PostgreSQL uses the existing Tenant-scoped command, Event, Evidence, outbox,
  and inbox runtime in one serializable transaction. Restart rebuilds the exact
  record from durable state.

## Accounting boundary

`cumulativeFillNotionalMinor` is a reconciliation cursor, not a Ledger account,
posting, balance, profit, fee, or settlement allocation. No accepted accounting
policy exists for simulated venue fills, so the module binds and continuously
checks the canonical Ledger snapshot without changing it. It records
`ledgerPostingRequired=false`, `ledgerMutationCreated=false`, and
`secondLedgerCreated=false`.

A later accounting policy must be separately approved and implemented through
the canonical Tenant Gateway and Ledger. Swapping the simulated adapter cannot
enable that path.

## Polling, circuit breaker, and recovery

The simulation fixture admits one through five poll attempts per invocation and
a one through five consecutive-failure circuit threshold. These are bounded
test values, not approved production timing or service objectives.

An `UNKNOWN` record can be reconciled after restart only when a later fresh,
complete, binding cumulative observation proves the external outcome. Historical
execution nonce state is not rewritten, risk authority is not loosened, and no
order is resent.

## Still requires new, precise human approval

- real Hyperliquid Testnet queries or Exchange writes;
- an API Wallet, live signer, signing conformance, custody, rotation, or
  retirement;
- live accounts, products, assets, sizes, rates, retry timing, or risk limits;
- a production authorization/admission composition or external worker;
- Facility or canonical Ledger mutation for real venue economics;
- deployment, mainnet, real capital, or real funds.

The checked-in protected simulation E2E is not production-readiness evidence.
