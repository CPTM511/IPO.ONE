# HL-TESTNET-001B — One bounded signed Hyperliquid Testnet execution

Status: `PASS — TESTNET VERIFIED`

Date: 2026-09-01

## Context

`HL-TESTNET-001A` passed with the exact historical 002D Testnet master account,
current zero-position/zero-order reads and a compact decision package. The
Founder then approved that package with: `可以做，我同意，你自动执行到全部完成`.

Approval package SHA-256:
`f2bdafba8c042d0efb9985572a6260799f27adaec31a83cf3d337715c309cc49`.

Exact run ID:
`agent-credit-exec-001-l3-hltestnet001b-20260901-001`.

## Scope

- Reuse only master account
  `0x8c2cbe747578c03c385dfd4d2e45774e5541217e`; no subaccount.
- Provision one fresh owner-only API Wallet and register it under the closed
  runner's named-agent boundary `ipo1-l3-002`. Matching the prior name replaces
  the prior named wallet; no historical key or address is reused.
- Execute one BTC perpetual buy IOC with exact limit notional greater than 10
  and at most 12 Testnet USDC, then reduce-only close the observed position.
- Permit only exact-run `cancelByCloid` and one residual reduce-only emergency
  close when required to end with zero orders and zero positions.
- Reconcile Venue reads, canonical Facility, Obligation, repayment, Credit
  State and Evidence, then logically destroy the fresh signer.

## Non-goals

No mainnet, real funds, production credential, transfer, withdrawal, leverage
change, account administration, new market, second run, automatic retry,
deployment, RISK-003B mutation or M3 work.

## Files likely to change

- owner-only runtime files under
  `/private/tmp/ipo-one-agent-credit-exec-001/`;
- redacted Evidence under `artifacts/testnet/`;
- this task, the Phase 3 plan and traceability after final reconciliation.

No migration or runtime architecture change is authorized or expected.

## Acceptance criteria

1. The fresh signer, account, action, caps, code/config, preparation expiry and
   run ID bind one immutable preparation before any order signature.
2. API-wallet registration is one-use and independently reads back role
   `agent` before trading.
3. Every Venue submission is exact-run, short-lived and non-retryable on an
   unknown outcome.
4. Final read truth has zero open orders and zero positions; fills, fees, PnL,
   repayment, outstanding amount and Evidence reconcile without inference.
5. The fresh key is absent after logical destruction and a no-reuse tombstone
   is recorded. Mainnet interaction, real funds, transfer and withdrawal remain
   false.

## Verification

```sh
node --test deploy/testnet/test/agent-credit-hyperliquid-l3-gate.test.js \
  deploy/testnet/test/agent-credit-hyperliquid-l3-live.test.js \
  deploy/testnet/test/hypercore-002d-handoff.test.js \
  deploy/testnet/test/hypercore-isolated-signer.test.js
pnpm run check:product-traceability
git diff --check
```

## Security and rollback

- [x] Founder approval is bound to the exact A package and one run ID.
- [x] Historical signer reuse is denied.
- [x] Testnet-only origin and no-real-funds boundary are exact.
- [x] Fresh signer is registered and independently verified.
- [x] Exact open/close cycle is reconciled.
- [x] Signer retirement and final Evidence are complete.

On timeout or ambiguous submission, persist `UNKNOWN`, freeze new risk and use
read-only account/order/fill reconciliation. Never resubmit from inference.
Cancel only the exact run cloid and reduce-only close only an observed residual
position. Preserve immutable Evidence and retire the signer even when the run
is partial or blocked.

## Final result

Run `agent-credit-exec-001-l3-hltestnet001b-20260901-001` completed at repair
commit `eb3c0fa718bb82c141c34a7717df3e8ac7597033`. The fresh API Wallet read back
as role `agent`; one `0.00013 BTC` IOC open and one exact reduce-only close both
filled. Independent Venue reads returned zero positions and zero open orders.

Actual realized loss plus fees was `0.015984` Testnet USDC, so the canonical
Obligation truth is `1198/1200` repaid, `2` minor units outstanding,
`partially_repaid`, and `LOSS_OUTSTANDING`. The signer key was logically
destroyed and confirmed absent. No mainnet, real funds, transfer, withdrawal,
automatic retry, second run or successor authority occurred.

Final Evidence:
`artifacts/testnet/hl-testnet-001b-live-20260901-001.json` at SHA-256
`eeb1f5e77de5397d7f2317c080770da44412cca3876145752ad1a2837f50aaa3`.
