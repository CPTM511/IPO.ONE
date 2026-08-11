# HYPERLIQUID-002B Audit — Durable Delegate Persistence

Date: 2026-08-08

Issue: `HYPERLIQUID-002B`

Implementation state: `VERIFIED_SANDBOX — LOCAL/NO-FUNDS DURABLE PERSISTENCE`

External Hyperliquid execution: `DISABLED — SEPARATE REVIEW GATE`

## Outcome

The Founder-approved local persistence gate is complete. Migration `0057`
adds Tenant-scoped, hash-only canonical projections for HyperCore account
bindings, API-wallet delegate lifecycles and immutable terminal address
tombstones. The repository recovers exact state after restart, rejects stale
transitions and permanently prevents reuse of a retired address hash.

The private-pilot runtime now composes capability discovery, durable binding
reads and delegate preparation through the existing Tenant Command Gateway.
The production runtime remains uncomposed. Activation, external revocation,
official signing, Exchange submission and execution reads stay fail-closed.

No Hyperliquid endpoint was called. No `approveAgent`, raw address, private key,
signature, credential, external account mutation, Testnet write or funds
movement occurred.

## Durable truth and controls

| Control | Result |
| --- | --- |
| Forced RLS and tenant-context guards on all three tables | PASS |
| Same-Tenant composite foreign keys | PASS |
| Hash-only binding, delegate and tombstone records | PASS |
| Immutable account binding and terminal tombstone | PASS |
| Monotonic delegate lifecycle and terminal no-reopen rule | PASS |
| Deferred exact delegate/tombstone pairing | PASS |
| One-use delegate address across restart and concurrency | PASS |
| Optimistic delegate hash/version conflict denial | PASS |
| Non-superuser `NOBYPASSRLS` cross-Tenant isolation | PASS |
| Down migration refuses while durable truth exists | PASS |
| Local-only application; production composition unchanged | PASS |
| Activation, signing, external revocation and submission disabled | PASS |

## Migration Evidence

- Up migration SHA-256:
  `714a987733d8f29695d8afb29c9c35842095291e08d2fff8b9cafe812aae864f`
- Down migration SHA-256:
  `355d7c75a2b1b97d9274998d5597b97002374e67f82bbec59d28c08056780340`
- Tombstone schema SHA-256:
  `eb4a1f2c2b6d414dd0902b72d6bc85ce2cde481d06a04efcc779d69ad3d4a8a1`
- Fresh migration up/down/up is covered by the PostgreSQL suite.
- A populated `0057` down attempt fails closed with PostgreSQL code `23514`
  and leaves the migration applied.

## Verification Evidence

- Targeted HyperCore adapter/Gateway: PASS, 16 tests, 0 failures.
- `pnpm run test:postgres`: PASS, 85 tests, 0 failures. This covers restart,
  idempotent replay, forced-RLS Tenant isolation, terminal tombstone creation,
  address-reuse denial, tombstone immutability, reconciliation and populated
  downgrade refusal.
- `pnpm test`: PASS, 818 tests, 0 failures.
- `pnpm run check:schemas`: PASS, 112 contracts.
- `pnpm run check:tenant-protocol`: PASS, 94 operations with complete closed
  conformance fixture coverage.
- `pnpm run check:migrations`: PASS, 57 ordered up/down pairs.
- `pnpm run check:openapi`: PASS, 21 paths and 21 public operations; Venue
  operations remain private behind the authenticated Tenant route.
- `pnpm run typecheck`: PASS, 3 export surfaces and 72 runtime value exports.
- `pnpm run lint`: PASS, 621 JavaScript modules; boundary lint PASS.
- `git diff --check`: PASS.

The aggregate `pnpm run check` passed runtime, lint, type, schema, OpenAPI,
migration, deployment-topology, provider-selection, closed-pilot operations,
local-stack and all 44 M1 Constitution requirement gates before the existing
sealed candidate branch assertion stopped it:

```text
actual:   codex/checkpoint-20260727-pre-strategy
expected: codex/m1-b-deployable-sandbox
```

No HYPERLIQUID-002B implementation test failed.

## Rollback

External controls are already disabled, so operational rollback begins by
removing the private-pilot composition. Migration rollback is intentionally
blocked while any binding, delegate or tombstone truth exists. An authorized
rollback must first preserve Evidence and terminal tombstones; it must not
erase an unknown outcome, reuse an address hash or replace durable truth with
an in-memory fallback.

## Next review gate

The next phase is not implicitly authorized. It requires one named decision
package covering:

1. the exact approved Hyperliquid Testnet master/subaccount, products and
   markets;
2. numeric order, position, leverage, loss, exposure and frequency limits;
3. isolated signer custody and one-use API-wallet provisioning/revocation;
4. official signing conformance for `l1_action` and `user_signed_action`;
5. bounded endpoint transport, operators, pause, reconciliation and rollback;
6. the exact zero-value Testnet order/cancel/modify Evidence plan.

Until that review is explicitly approved, there is no `approveAgent`, key,
credential, external signing, Hyperliquid request, Testnet write/proof,
deployment, mainnet, production, capital or funds authority.
