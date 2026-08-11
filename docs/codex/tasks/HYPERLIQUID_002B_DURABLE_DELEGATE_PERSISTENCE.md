# HYPERLIQUID-002B — Durable Venue Delegate Persistence

Status: `VERIFIED_SANDBOX — LOCAL/NO-FUNDS DURABLE PERSISTENCE`

Phase: 4 — Hyperliquid Execution

Decision authority: IPO.ONE Founder

Approved: 2026-08-08

## Context

`HYPERLIQUID-002` defined the hash-only HyperCore account-binding and API-wallet
delegate lifecycle. `HYPERLIQUID-002A` exposed the eight closed `venue*`
operations through the local Tenant Protocol surface, while deliberately
leaving the application uncomposed. Founder approval now authorizes the next
named gate: Tenant-scoped PostgreSQL persistence for account-binding
projections, delegate lifecycle records and terminal address tombstones.

## Scope

- Add paired PostgreSQL up/down migrations for hash-only HyperCore account
  bindings, API-wallet delegate records and immutable terminal tombstones.
- Enforce Tenant RLS, tenant context, same-tenant foreign keys, closed lifecycle
  states, optimistic versions and permanent one-use delegate address hashes.
- Add a Tenant-scoped repository that can persist/read bindings, prepare
  delegates from already-hashed inputs, transition local lifecycle state and
  atomically create terminal tombstones.
- Compose the durable repository into the local private-pilot Venue application
  for capability discovery, binding reads and delegate preparation.
- Keep activation, external deregistration, official signing and Exchange
  submission disabled.
- Prove restart recovery, cross-tenant isolation, concurrent address reuse
  denial, terminal immutability and raw-secret absence.

## Non-goals

- No `approveAgent`, API-wallet creation, private key, raw address, reusable
  signature, credential import, external signer or custody integration.
- No Hyperliquid Info/Exchange network request, Testnet account mutation,
  Testnet order/cancel/modify proof or external revocation.
- No market/product selection, numeric risk limit, operator, endpoint,
  deployment, mainnet, production or funds decision.
- No duplicate Facility, Obligation, Ledger, Evidence or settlement kernel.
- No change to the production runtime composition.

## Likely files

- `db/migrations/0057_hypercore_delegate_persistence.*.sql`
- `modules/hypercore-venue-adapter/src/hypercore-delegate.js`
- `modules/hypercore-venue-adapter/src/postgres-hypercore-delegate-repository.js`
- `modules/hypercore-venue-adapter/src/postgres-venue-execution-application.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- PostgreSQL and Gateway tests

## Acceptance criteria

1. Every record is Tenant-scoped, RLS protected and hash-only; no raw address,
   key, signature or provider payload column exists.
2. Account binding and delegate records retain the exact verified domain
   projection and safety flags.
3. A delegate address hash can be prepared only once per Tenant, including
   after process/repository restart and after any terminal transition.
4. REVOKED, EXPIRED, COMPROMISED and RETIRED transitions atomically create an
   immutable tombstone and cannot be changed or removed.
5. Optimistic hash/version checks deny stale lifecycle transitions.
6. Same identifiers in different Tenants remain isolated and cannot be read or
   referenced across Tenant contexts.
7. Local `venueReadBinding` and `venuePrepareDelegate` use the durable
   application; all external activation/submission guards still deny.
8. Migration up/down/up, targeted tests and the repository regression suite
   pass, apart from a separately documented pre-existing sealed-branch gate.

## Test commands

```sh
pnpm run check:migrations
node --test modules/hypercore-venue-adapter/test/*.test.js
pnpm run test:postgres
pnpm run check:tenant-protocol
pnpm test
```

## Security checklist

- [x] RLS is enabled and forced for every new table.
- [x] Tenant context triggers guard insert/update/delete.
- [x] Same-Tenant composite foreign keys prevent cross-Tenant references.
- [x] Address-hash uniqueness and tombstone checks deny reuse under concurrency.
- [x] Terminal transitions are atomic and terminal records cannot reopen.
- [x] Raw address/key/signature/provider response persistence is impossible.
- [x] Local application never calls `approveAgent` or an external adapter.
- [x] Production runtime remains uncomposed.

## Permission boundary

Approved now: Tenant-scoped PostgreSQL schema, repository, local private-pilot
composition, synthetic fixtures and no-funds verification.

Not approved: Hyperliquid account/market selection, numeric limits, signer
custody, key generation, `approveAgent`, official signing, endpoint transport,
external request, Testnet write/proof, deployment, mainnet, production, capital
or funds movement.

## Migration impact

Adds migration `0057_hypercore_delegate_persistence`. It stores only hash-bound
projection truth. No existing row is backfilled and no external account is
created or inferred. A binding must be explicitly recorded by an already
authorized local provisioning path before Venue delegate preparation.

## Rollback plan

The down migration refuses to run while delegate or tombstone truth exists.
Before an authorized rollback, preserve Evidence and export terminal
tombstones. Rollback must never delete an unknown external outcome, reuse an
address hash or silently fall back to in-memory delegate state.

## Completion Evidence

Accepted Evidence is recorded at
`docs/codex/audits/HYPERLIQUID-002B/audit.md`. It includes migration checksums,
PostgreSQL isolation/restart results, regression counts, disabled external
controls and the next separately reviewed Testnet gate.
