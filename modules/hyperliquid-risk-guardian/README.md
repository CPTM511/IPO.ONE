# Hyperliquid Testnet Risk Guardian

TC-302 implements the offline, simulation-only enforcement boundary for
`WARNING`, `REDUCE_ONLY`, and `FLATTEN`. It does not activate a live
Hyperliquid Testnet writer.

## Effective risk state

The Guardian accepts only a closed, hash-bound, server-timed risk snapshot
using the version
`hyperliquid_testnet_risk_simulation_fixture.v1`. Its state order is:

`NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`

Stale or future venue data, an unknown external write, or a closed
risk-increasing kill switch forces the effective state to at least
`REDUCE_ONLY`. The module never moves a state in the less-restrictive
direction and exposes no automatic-recovery method.

No production staleness, liquidation-buffer, leverage, exposure, polling,
hysteresis, or recovery threshold is approved here. Numeric values in tests
are synthetic scenario fixtures only and cannot authorize production risk.

## Action boundary

- `WARNING` produces immutable notification evidence; no notification service
  is contacted.
- `REDUCE_ONLY` cancels risk-increasing open orders. If venue evidence is stale
  or unknown, it cancels all observed open orders.
- `FLATTEN` cancels all observed open orders before creating bounded,
  server-proven `reduceOnly: true` position-close actions.
- `SETTLEMENT` admits no execution action.

The TC-301 gateway can consume the Guardian policy evaluator. A denied action
fails before nonce reservation. In `REDUCE_ONLY`, generic orders and
non-reducing modifications are impossible; in `FLATTEN`, only cancel and
reduce-only order shapes remain admissible.

The narrow protective executor has no generic order, strategy, withdrawal,
transfer, account-administration, signer-provisioning, or API Wallet method.
Its checked-in implementation has no network capability and does not submit an
external order.

## Evidence and recovery

Each risk snapshot, protective request, planned action, action result,
post-action venue snapshot, verification, and state transition is separately
hash-bound. A control follows:

`PLANNED -> EXECUTING -> VERIFIED | INCOMPLETE | UNKNOWN`

`VERIFIED` requires a fresh simulated post-action snapshot proving the target
invariant. A rejection becomes `INCOMPLETE`; an interruption or unknown result
becomes terminal `UNKNOWN`. Neither outcome is retried or used to loosen risk
automatically.

Migration `0035_trading_testnet_risk_guardian` stores the control and its
immutable transition evidence behind forced Tenant RLS. Reservation and
transition are idempotent, transaction-bound, and restart-replayable.

## Live activation gate

A new, precise human approval and independent review are required before
adding any live Testnet transport or signer. That future decision must name the
qualified Founder-controlled master/subaccount, API Wallet custody, exact
numeric policy, action/rate limits, incident owners, reconciliation procedure,
deployment identity, and credential-retirement procedure.

Mainnet, real funds, withdrawals, external transfers, account administration,
API Wallet provisioning, and live Exchange writes remain unavailable.
