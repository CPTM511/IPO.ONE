# HL-TESTNET-001B final Evidence

Verdict: `PASS — TESTNET VERIFIED`

Date: 2026-09-01

Run: `agent-credit-exec-001-l3-hltestnet001b-20260901-001`

Evidence:
`artifacts/testnet/hl-testnet-001b-live-20260901-001.json`

Evidence SHA-256:
`eeb1f5e77de5397d7f2317c080770da44412cca3876145752ad1a2837f50aaa3`

## Bound execution

- Founder approval and action-time confirmation authorized one exact Testnet
  run; no successor authority was inferred.
- Master account:
  `0x8c2cbe747578c03c385dfd4d2e45774e5541217e`; no subaccount.
- Fresh API Wallet:
  `0xb85316c032ab550597b74238291b0e9fefa11d14`; official `/info`
  readback returned role `agent` for the exact master.
- The approved package commit was `50b343f...`. A fail-closed UI defect found
  before signing was repaired at `eb3c0fa...`: the handoff requests the exact
  already-approved Arbitrum Sepolia chain, then repeats chain and account
  checks before typed-data signing. The focused regression suite passed 8/8.
- The immutable preparation bound candidate `eb3c0fa...`, BTC, one cycle,
  notional greater than 10 and at most 12 Testnet USDC, effective leverage at
  most 1x, 30-minute preparation expiry, no retry and no second run.

## Venue result

- Open: buy IOC `0.00013 BTC`, order `58993042377`, filled at `78872.0`,
  position value `10.24647` Testnet USDC.
- Close: sell `0.00013 BTC`, order `58993044519`, reduce-only, filled at
  `78820.0`.
- No cancellation, emergency close, automatic retry or unknown outcome was
  used.
- Independent official `/info` reads at `2026-08-31T16:56:04.203Z` returned
  zero positions, zero open orders, zero margin used, both exact orders with
  zero remaining size, and the two exact fills.
- The observed Venue position setting was `cross / 20`, but no leverage-change
  action occurred. The bound 1x cap is enforced on effective position value
  divided by master account equity; actual effective leverage was about
  `0.010257x`.

## Canonical outcome

- Account equity moved from `998.989328` to `998.973344` Testnet USDC.
- Closed PnL was `-0.00676000`; fees were `0.00922400`; realized result was
  `-0.01598400` or `-2` minor units.
- The canonical repayment truth is therefore `1198/1200`, not a fabricated
  full repayment. The Obligation is `partially_repaid` with `2` minor units
  outstanding and Credit State `LOSS_OUTSTANDING`.
- Venue, Facility, Ledger transaction, repayment Event, Obligation and Evidence
  reconcile with no unexplained residual position or order.

## Retirement and boundary

The fresh key was overwritten, truncated, unlinked and confirmed absent at
`2026-08-31T16:56:24.624Z`. Its address is tombstoned against reuse. Storage-
medium secure erase is not claimed. No raw key, raw signature or raw Venue
response entered Git or the Evidence artifact.

Mainnet, real funds, external funding transfer, withdrawal, transfer,
production authority, `RISK-003B`, Phase 3 closure and M3 remain unauthorized
by this run.

