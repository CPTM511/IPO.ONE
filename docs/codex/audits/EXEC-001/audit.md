# EXEC-001 Completion Evidence

Date: 2026-08-07

Status: COMPLETE — `L0_LOCAL_NO_FUNDS`

## Authority and boundary

The Founder accepted Phase 1 Evidence and separately authorized only EXEC-001's
L0 local no-funds permission/data scope. This implementation does not authorize
EXEC-002, exact transaction payloads, simulation, wallet submission, Provider
permission provisioning, external signing, Testnet writes, deployment,
production operation or funds movement.

Every emitted grant and reservation remains fixed to:

- `adapterId=local_sandbox`;
- `sandboxOnly=true`;
- `transactionsAllowed=false`;
- `productionAuthority=false`;
- `fundsAuthority=false`.

## Delivered contracts and runtime

- Closed `ExecutionTargetPolicy`, `DelegatedWalletGrant` and
  `PendingExposureReservation` domain contracts.
- Limits derived as the minimum of active Mandate, SpendPolicy, canonical
  CreditLine and current no-funds Obligation authority.
- Fresh, exact, revalidated Authorization Decision required for grant prepare,
  local activation and revocation.
- Equal-or-narrower local permission compilation; activation performs no
  wallet, Provider, RPC or transaction call.
- Monotonic `prepared -> active -> revoked|expired|quarantined` state model.
- Serializable PostgreSQL repository committing projection, Event, Evidence,
  outbox and durable idempotent response together.
- Row-locked pending exposure enforcement across per-action, rolling 24-hour,
  aggregate and Obligation limits.
- Revocation atomically releases outstanding local reservations.

## Permission matrix

| Role | Prepare | Activate locally | Read owned | Revoke | Submit transaction |
| --- | --- | --- | --- | --- | --- |
| Human Principal Controller | Allow | Allow | Allow | Allow | Deny |
| Agent Runtime | Deny | Deny | Allow | Deny | Deny |
| Developer | Deny | Deny | Deny | Deny | Deny |
| Provider Service | Deny | Deny | Deny | Deny | Deny |
| Tenant Owner | Deny | Deny | Deny | Deny | Deny |
| Risk / Operations | Deny pending separate review | Deny | Deny | Deny pending separate review | Deny |

Mutations use the existing privileged abuse-control profile; owned reads use
the read profile. There is no OpenAPI, SDK, MCP or browser mutation route.

## Data scope and database enforcement

Migration `0055_agentic_execution_grants` adds five Tenant-scoped tables:

1. `execution_target_policies`
2. `delegated_wallet_grants`
3. `delegated_wallet_grant_target_policies`
4. `delegated_wallet_grant_transitions`
5. `delegated_wallet_pending_exposures`

All five use Tenant-composite foreign keys, enabled and forced RLS, a Tenant
write-context guard and immutable/monotonic database triggers. The down
migration refuses rollback while any pending exposure remains reserved.

No raw account, signature, credential, calldata, Provider response or reusable
secret is persisted. Account and authorization references are hash-only.

## Atomic concurrency proof

The PostgreSQL integration test creates and locally activates one grant, then
races two independent `60000` reservations against a `100000` aggregate limit
and the same expected grant version. Exactly one reservation commits; the other
fails closed on the serializable stream/version or exposure ceiling. Durable
state proves:

- one pending reservation;
- `pendingExposureMinor=60000` and grant version `3`;
- two lifecycle transitions;
- three grant events;
- three Evidence envelopes;
- three outbox messages;
- no transaction, production or funds authority.

## Verification results

- `pnpm test`: PASS — 745 tests, 0 failures.
- `pnpm run test:postgres`: PASS — 84 tests, 0 failures.
- Focused PostgreSQL event runtime: PASS — 27 tests, including the EXEC-001
  atomic/RLS/race case.
- `pnpm run check:schemas`: PASS — 90 closed contracts.
- `pnpm run check:migrations`: PASS — 55 ordered up/down pairs.
- Source and boundary lint: PASS.
- Authorization and abuse-control focused tests: PASS.

The isolated `ipo_one_exec001_test` database used for verification was deleted
after the successful run. No project, Testnet or production data was changed.

## Founder review experience

Local product URL: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)

Real-browser verification passed: meaningful content rendered, no framework
error overlay appeared, browser console reported 0 errors and 0 warnings, and
the unauthenticated Human/Agent workspace switch worked. EXEC-001 intentionally
adds no user-facing mutation surface, so the browser remains an unchanged,
non-authorizing no-funds product shell.

## Remaining gate

EXEC-002 remains unapproved and unimplemented. A separate Founder decision is
still required before adding exact transaction payload contracts, simulation or
preflight decisions. External wallet/Provider permission provisioning,
submission, signing and all value movement remain outside this Evidence.

## Changed-file proof

- `modules/agentic-execution/src/agentic-execution-grant.js`
- `modules/agentic-execution/src/postgres-agentic-execution-repository.js`
- `modules/agentic-execution/test/agentic-execution-grant.test.js`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/abuse-control/src/abuse-policy.js`
- `packages/domain/src/enums.js`
- `schemas/v2/delegated-wallet-grant.schema.json`
- `schemas/v2/execution-target-policy.schema.json`
- `schemas/v2/pending-exposure-reservation.schema.json`
- `db/migrations/0055_agentic_execution_grants.up.sql`
- `db/migrations/0055_agentic_execution_grants.down.sql`
- focused authorization, abuse-control, migration and PostgreSQL tests.
