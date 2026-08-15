# OPS-005 — Durable Tenant Command Pause

## Status

Implemented locally. No production deployment, remote control, unpause,
signer, capital, or real-funds authority is granted.

## Context

The approval vocabulary included `tenant.command.pause`, but the current local
runtime had no durable pause state enforced by the Tenant Command Gateway.
Facility-level protective pause already reduced one Trading Facility to
`REDUCE_ONLY`; it was not a Tenant-wide command stop.

## Scope

- Persist one append-only, Tenant-scoped `tenant_command_pause.v1`.
- Emit Domain Event, Evidence and outbox atomically with the pause.
- Block every new Tenant command before object authorization and handler
  planning.
- Allow exact replay of a command committed before the pause because replay is
  a read of existing durable state, not a new mutation.
- Keep Tenant queries, reconciliation, outbox delivery and Evidence/Outcome
  materialization available.
- Expose only a direct internal risk/operations store in this issue.
- Provide no unpause path in the MVP.

## Non-goals

- No browser, OpenAPI, SDK, MCP or remote pause endpoint.
- No automatic incident decision or automatic unpause.
- No Provider, worker, chain, signer, venue or funds control.
- No replacement for Facility `REDUCE_ONLY` or Subject freeze.

## Acceptance criteria

1. Pause is one immutable Tenant-scoped row with forced RLS.
2. Pause, Event, Evidence and outbox commit atomically.
3. Exact pause retry returns the original result.
4. A different second pause fails closed.
5. New Tenant commands fail with `tenant_commands_paused`.
6. Queries remain available and reveal no new private identifiers.
7. Background reconciliation and Evidence/Outcome jobs are not disabled.
8. There is no unpause or authority broadening path.
9. Mutation/deletion of the pause row is rejected.
10. Migration up/down/up, unit, PostgreSQL and full repository checks pass.

## Test commands

```sh
pnpm run check:migrations
pnpm test
DATABASE_URL=postgresql://..._test pnpm run test:postgres
pnpm run check
```

## Security checklist

- [x] Tenant RLS and deterministic idempotency.
- [x] Append-only pause, Domain Event, Evidence and outbox.
- [x] Commands closed; queries and background evidence remain available.
- [x] No unpause, release, funds, signer or production authority.
- [x] Closed reason codes and hash-only Tenant/Actor references in the pause.
- [x] No raw PII, wallet, credential, account or strategy data.

## Rollback

Disable the gateway check only through a reviewed code rollback. Migration
rollback is allowed only before a pause exists; an existing pause is safety
Evidence and must not be silently removed.
