# M2B-003 local dual-risk recovery verification

Verdict: `BLOCKED — NOT COMPLETE`

This verdict applies to external protective execution and product completion.
The L0 local no-external-write risk composition and recovery Evidence boundary
is implemented and tested. No fresh bound Pool/Venue observation, durable live
incident or separately approved external protective run exists.

## Implemented local boundary

- One closed snapshot composes the exact M2B-002 composition, finalized Pool
  projection observation and Hyperliquid account/margin observation.
- Either stale, unknown or unreconciled domain freezes new risk and raises the
  combined state to at least `REDUCE_ONLY`. Pool liquidation or critical Venue
  margin raises it to `FLATTEN`; the more restrictive domain always wins.
- Recovery order is fixed as `FREEZE_NEW_RISK`, `CANCEL`,
  `REDUCE_OR_FLATTEN`, `RECONCILE`, `REPAY_OR_LIQUIDATE`, then
  `SETTLEMENT_REVIEW`. Automatic movement to a less restrictive state fails.
- Protective authority cannot expand risk. External cancel, reduce/flatten and
  repay/liquidate stages remain `BLOCKED_EXTERNAL_APPROVAL` and create no nonce,
  signature or network call.
- Loss is never erased by recovery. Snapshot and incident Evidence bind
  `CANONICAL_OBLIGATION_REMAINS_OUTSTANDING` until additive servicing/default,
  repayment, liquidation or settlement Evidence changes canonical truth.
- Migration 0068 stores one immutable incident and first transition with forced
  Tenant RLS, unique composition and idempotency bindings, secret-pattern
  rejection and non-destructive down behavior after Evidence exists.
- Principal and Agent read the same closed recovery STOP receipt through the
  existing Tenant operation, typed contract and browser surface. The browser
  offers no external recovery mutation control.

## Verification commands

```text
node --test modules/hypercore-venue-adapter/test/m2b-secured-facility-composition.test.js
  9 passed
node --test deploy/testnet/test/m2b-003-recovery-prewrite.test.js
  1 passed
node --test modules/tenant-command-gateway/test/agent-secured-facility-authorization-handlers.test.js
  3 passed
pnpm run check:migrations
  68 ordered up/down pairs passed
pnpm run check:schemas
  142 contracts passed
pnpm run typecheck
  3 declaration surfaces and 75 runtime exports passed
pnpm run test:postgres
  91 passed
pnpm run test:security
  34 passed
pnpm run test:transport
  85 passed
pnpm test
  1193 passed
```

The standalone inspection returns `BLOCKED_RECOVERY_PREWRITE`, the exact six
stage order, policy version `1.3.3`, and all of:

- `launchPolicyMutated=false`
- `externalWriteAuthorized=false`
- `externalNonceAllocated=false`
- `signatureCreated=false`
- `networkCalled=false`
- `protectiveAuthorityCanExpandRisk=false`
- `mainnetAuthority=false`
- `productionAuthority=false`
- `realFundsAuthority=false`

## Remaining external gates

1. The exact M2B-002 external composition must first satisfy its separate L3
   profile, current observation, signer-handoff and one-use approval gates.
2. Fresh exact Pool and Venue observations must bind one durable M2B-003
   incident with no unresolved identity or composition drift.
3. Every external protective stage requires its own exact reviewed action,
   account, cap, expiry, evidence and rollback authority. This local receipt is
   never approval.
4. Restart/reconciliation and visible Principal/Risk verification must run on
   the exact deployed candidate SHA before any completion verdict.

This document grants no signer, deployment, launch-profile mutation, exchange
request, withdrawal, transfer, custody, production, mainnet or real-funds
authority.
