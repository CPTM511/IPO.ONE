# M2B-002 local pre-write verification

Verdict: `BLOCKED — NOT COMPLETE`

This verdict applies to external Hyperliquid Testnet execution and product
completion. The local no-external-write composition is implemented and tested,
but the exact L3 launch profile, durable bound composition in the review
workspace, fresh reconciled Hyperliquid account observation, non-exporting
signer handoff and one-use Founder run approval do not exist.

## Implemented local boundary

- Exact active M2B-001 authorization, shared-kernel hashes, Facility, Obligation,
  account/delegate/signer references, policy, BTC Testnet ALO order and maximum
  10 Testnet-USDC notional bind one deterministic composition.
- Exact protective close binds only `cancelByCloid` for the parent opening order
  and cannot increase exposure.
- Additive PostgreSQL migration stores one immutable `PREPARED` composition and
  append-only first transition under forced Tenant RLS. Unique authorization,
  stable-intent and idempotency constraints prevent a second local attempt.
- The existing `agentReadSecuredFacilityAuthorization` operation carries the
  same closed STOP receipt through Tenant API, typed SDK and local MCP. The
  authenticated Human page shows the same disabled recovery state and provides
  no submit control.
- The pre-write runner reads launch policy only. It creates no external nonce,
  signature, `/exchange` request, network submission or profile mutation.

## Verified commands

```text
node --test modules/hypercore-venue-adapter/test/m2b-secured-facility-composition.test.js
  5 passed
node --test deploy/testnet/test/m2b-002-prewrite.test.js
  1 passed
node --test modules/tenant-command-gateway/test/agent-secured-facility-authorization-handlers.test.js
  3 passed
pnpm run check:migrations
  67 ordered up/down pairs passed
pnpm run check:schemas
  142 contracts passed
pnpm run check:tenant-protocol
  109 operations, 107 request fixtures and 95 result fixtures passed
pnpm run typecheck
  3 declaration surfaces and 75 runtime exports passed
pnpm run test:security
  34 passed
pnpm run test:transport
  85 passed
pnpm test
  1188 passed
```

Standalone pre-write inspection returned policy version `1.3.3`, policy
inspection hash
`0x018545deadb36674dcf3b670a3adb8c03e027ab3bb187f32f8dc815c2b1c1b1e`,
`requestedProfilePresent=false`,
`currentPoolAgentVenueExecutionEnabled=false`, and all of:

- `externalNonceAllocated=false`
- `signatureCreated=false`
- `networkCalled=false`
- `exchangeRequestCreated=false`
- `profileMutated=false`
- `submissionAuthorizedByReport=false`

## Remaining exact L3 gates

1. Reviewed `live_testnet_secured_pool_agent_execution` launch profile.
2. Durable exact composition created from current server resources.
3. Fresh signer-free Hyperliquid Testnet account reconciliation with no
   unresolved `UNKNOWN` outcome.
4. Fresh non-exporting, non-reusable signer handoff.
5. One-use Founder run approval naming the exact Principal, Agent, Mandate,
   authorization, Facility, account, action, caps, expiry and rollback owner.

This document and its tests grant no signer, deployment, production, mainnet,
custody, transfer, withdrawal or real-funds authority.
