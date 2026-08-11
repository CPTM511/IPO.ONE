# HYPERLIQUID-002A Audit — Local Venue Transport Parity

Date: 2026-08-08

Issue: `HYPERLIQUID-002A`

Implementation state: `VERIFIED_SANDBOX — LOCAL/NO-FUNDS TRANSPORT SURFACE`

External Hyperliquid execution: `DISABLED — SEPARATE REVIEW GATE`

## Outcome

The Founder-approved local no-funds Venue permission surface is active across
one canonical Tenant Protocol. The ordered eight-operation family is shared by
the catalog, AuthZ, abuse control, Tenant Command Gateway, OpenAPI metadata,
TypeScript SDK, local MCP and conformance fixtures. No transport contains Venue
business logic.

The surface remains non-public and every catalog entry has
`fundsAuthority=false`. Delegate preparation, activation and revocation are
Human-only, Principal Controller capabilities with recent MFA. Agent Runtime
receives only capability discovery, owned binding/execution reads and exact
OrderIntent-bound preparation/submission guards.

`venueActivateDelegate`, `venueRevokeDelegate` and `venueSubmitExecution`
remain unconditionally fail-closed in the L0 local profile. No `approveAgent`,
credential, official signature, external request or Testnet write occurred.

## Canonical operations

1. `venueDiscoverCapabilities`
2. `venueReadBinding`
3. `venuePrepareDelegate`
4. `venueActivateDelegate`
5. `venueRevokeDelegate`
6. `venuePrepareExecution`
7. `venueSubmitExecution`
8. `venueReadExecution`

## Security acceptance

| Acceptance | Result |
| --- | --- |
| Same ordered operation family across Gateway/OpenAPI/SDK/MCP | PASS |
| Unknown fields and unknown operations fail closed | PASS |
| Raw Venue action/payload is rejected by SDK and MCP | PASS |
| Agent cannot prepare, activate or revoke a delegate | PASS |
| Human delegate administration requires recent MFA | PASS |
| Every operation remains private and `fundsAuthority=false` | PASS |
| Delegate activation/`approveAgent` stays disabled | PASS |
| External delegate deregistration stays disabled | PASS |
| Exchange submission stays disabled | PASS |
| No remote MCP/A2A, signer, credential or network authority | PASS |

## Verification Evidence

- Targeted Venue transport/AuthZ/Gateway/SDK/MCP: PASS, 15 tests.
- `pnpm run check:tenant-protocol`: PASS, 94 operations with complete valid
  request/result fixture coverage.
- `pnpm run lint`: PASS, 618 JavaScript modules; boundary lint PASS.
- `pnpm run typecheck`: PASS, 3 package surfaces and 72 runtime value exports.
- `pnpm run check:schemas`: PASS, 111 contracts.
- `pnpm run check:openapi`: PASS, 21 paths and 21 public operations; Venue
  operations remain private behind the generic authenticated Tenant route.
- `pnpm test`: PASS, 815 tests, 0 failures.

The aggregate `pnpm run check` passed runtime, lint, type, schema, OpenAPI,
migration, deployment-topology, provider-selection, closed-pilot operations,
local-stack and M1 requirement gates before the pre-existing sealed candidate
branch assertion stopped it:

```text
actual:   codex/checkpoint-20260727-pre-strategy
expected: codex/m1-b-deployable-sandbox
```

No implementation test failed.

## Founder review runtime

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

Host-side page check: HTTP success. The loopback runtime remains available for
Founder review. This is not hosting or deployment Evidence.

## Migration and rollback

No database migration was added. Rollback removes the eight Venue catalog,
schema, role, quota, Gateway, OpenAPI, SDK, MCP and fixture entries together.
The underlying offline adapter stays inert; terminal delegate tombstones and
any existing Evidence must be preserved.

## Next review gate

The next phase is not implicitly authorized. It requires a named decision on:

1. durable Tenant-scoped PostgreSQL delegate/tombstone persistence;
2. exact Hyperliquid Testnet master/subaccount, products, markets and numeric
   risk limits;
3. isolated signer custody and one-use API-wallet provisioning/revocation;
4. official signing conformance for both Hyperliquid signing schemes;
5. bounded endpoint transport, operators, rollback and an exact no-value
   Testnet order/cancel/modify proof plan.

This checkpoint grants no Testnet write, deployment, mainnet, production,
capital or real-value authority.
