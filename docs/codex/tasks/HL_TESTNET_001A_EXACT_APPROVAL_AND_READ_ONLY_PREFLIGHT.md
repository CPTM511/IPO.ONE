# HL-TESTNET-001A — Exact approval package and read-only preflight

Status: `BLOCKED — NOT COMPLETE (EXACT TESTNET MASTER ADDRESS REQUIRED)`

Date: 2026-08-31

Authority: Founder pre-authorization for no-write `HL-TESTNET-001A` only.

Runtime baseline:
`c4cc81f09f1c7aeb78871373d29ed581e428daca`

## Outcome

The offline gate and live read-only Hyperliquid Testnet market preflight pass.
The exact Principal, account structure, signer method, action envelope,
numerical caps, code/config hashes, recovery and retirement procedure are
defined in the compact decision package.

The package cannot truthfully bind the exact master address because no current
Founder-controlled Hyperliquid Testnet account was exposed to this task. The
historical `HYPERLIQUID-002D` API wallet is terminal, logically destroyed and
must not be reused. This task therefore stops before `HL-TESTNET-001B` with no
signer, signature, economic nonce or Venue mutation.

## Proposed exact run

- Principal: IPO.ONE Founder, accountable controller for one synthetic Agent
  Facility.
- Account structure: one existing Founder-controlled Hyperliquid Testnet
  **master** account, no subaccount. The current runner binds
  `accountType=master` and `vaultAddress=null`; selecting a subaccount would
  require a separately reviewed code change.
- Signer: one fresh dedicated named Hyperliquid API Wallet, provisioned only
  after `HL-TESTNET-001B` approval into the owner-only
  `/private/tmp/ipo-one-agent-credit-exec-001/` boundary. No historical address
  or key is reused.
- Market: BTC perpetual, asset index 3, quantity precision 5.
- Economic action: one bounded open/close cycle. Opening is one BTC buy IOC;
  close is reduce-only IOC; one emergency reduce-only close is allowed only
  for observed residual position. `cancelByCloid` may target only a cloid from
  this run if an IOC is unexpectedly still observable. Modify, scheduleCancel,
  transfer, withdrawal, leverage change and account administration are denied.
- Maximum opening notional: greater than 10 and at most 12 Testnet USDC.
- Maximum leverage: 1x; maximum concurrent positions: 1; trade cycles: 1;
  run count: 1; maximum Facility loss/drawdown: 12 Testnet USDC; terminal open
  orders and positions: 0.
- Price envelope: opening limit is at most 1% above current best ask; closing
  limit is at most 1% below current best bid, rounded to the runner's valid
  price step.
- Preparation expiry: 30 minutes. Venue state is reread before each signature;
  each Info call has a 10-second timeout and every signed request expires 9
  seconds after its nonce.
- Structural submission cap: at most six `/exchange` attempts in the closed
  runner (open, targeted cancel if unexpectedly pending, close, targeted
  cancel if unexpectedly pending, one emergency close, targeted cancel if
  unexpectedly pending). Normal fully filled lifecycle is two writes. Any
  `UNKNOWN` outcome stops the run immediately and cannot retry.

## Verification

```sh
IPO_ONE_EXECUTION_VENUE=hyperliquid \
IPO_ONE_EXECUTION_ENVIRONMENT=testnet \
IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN=https://api.hyperliquid-testnet.xyz \
node deploy/testnet/agent-credit-hyperliquid-l3.mjs preflight

node --test deploy/testnet/test/agent-credit-hyperliquid-l3-gate.test.js \
  deploy/testnet/test/agent-credit-hyperliquid-l3-live.test.js
git diff --check
```

## Security and recovery

- [x] No signer was created, loaded or registered.
- [x] No signature, submission nonce, `/exchange` request, transfer,
      withdrawal or Venue mutation occurred.
- [x] Testnet-only origin, no real-funds authority and no mainnet authority
      passed the local gate.
- [x] Current BTC metadata, mid and order book were read through `/info` only.
- [ ] Exact master address, its role, account value, withdrawable value, open
      orders, positions and subaccount inventory must be observed read-only.
- [ ] Fresh API-wallet identity and registration require the later exact
      Founder decision.

On timeout, disconnect or ambiguous response, persist `UNKNOWN`, freeze new
risk and reconcile `userRole`, `clearinghouseState`, `openOrders`, fills and
the run cloid. Never retry from inference. Cancel only an exact observed cloid;
reduce-only close only an exact observed residual position; require zero orders
and zero positions before settlement.

After terminal reconciliation, overwrite, truncate and unlink the owner-only
signer file, verify absence and record a no-reuse tombstone. This is logical
destruction, not storage-medium secure erase. Venue-side API-wallet
deregistration is not implemented by the current runner and remains an explicit
residual risk; no key remains capable of signing after local destruction.

## Evidence and next gate

- Decision package:
  `artifacts/testnet/hl-testnet-001a-decision-package-20260831.json`.
- Audit:
  `docs/codex/audits/HL-TESTNET-001A/read-only-preflight.md`.

`HL-TESTNET-001B` remains `BLOCKED — NOT COMPLETE`. Supply or visibly connect
the exact Founder-controlled Hyperliquid Testnet master account, then refresh
the account-specific read-only Evidence and return the final signed-run
approval marker. No B action is authorized by this task.
