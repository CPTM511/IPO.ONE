# WALLET-003 temporary PostgreSQL evidence

Date: 2026-07-24  
Owner approval: IPO.ONE Founder  
Approved location: `/private/tmp` only  
Status: `PASS_LOCAL_RESTART`

## Isolated runtime

PostgreSQL 17.10 was already installed through Homebrew, so no second server or
system service was installed. WALLET-003 initialized this exact isolated
cluster:

```text
/private/tmp/ipo-one-wallet003-pg.zSAXgk/data
```

Runtime properties:

- socket:
  `/private/tmp/ipo-one-wallet003-pg.zSAXgk/socket`;
- port identifier: `55434`;
- `listen_addresses`: empty;
- local authentication: trust inside the mode-restricted temporary directory;
- host authentication: reject;
- TCP listener: none;
- Homebrew service: not used;
- unrelated PostgreSQL on `127.0.0.1:55433`: detected and left untouched.

The test server was stopped normally after verification. Its temporary data
directory remains under the approved `/private/tmp` location for audit and
bounded reruns; no production or user database was modified.

## First run exposed and fixed real defects

The first complete `pnpm test:postgres` execution reached PostgreSQL and found:

1. two migration tests still expected `0025` after WALLET-002 added
   `0026_idempotent_wallet_session_invalidation`;
2. idempotent invalidation replay used `FOR UPDATE OF i, s`, which requires
   `UPDATE` on the append-only invalidation table even though the approved
   authentication role intentionally has only `SELECT` and `INSERT`.

The implementation now locks only the mutable session row with
`FOR UPDATE OF s`. It did not broaden role privileges or weaken the immutable
invalidation table. Migration expectations and rollback counts now include
`0026`.

## Complete PostgreSQL suite

Command:

```text
pnpm run test:postgres
```

Result:

- tests: 70;
- passed: 70;
- failed: 0;
- migrations: 26 ordered up/down pairs;
- durable Human/Wallet authentication: pass;
- durable operations, event runtime and Tenant gateway: pass.

The authentication coverage includes one-use encrypted login transactions,
hash-only sessions, rotation, revoke, wallet context invalidation, idempotent
replay, membership downgrade, Tenant isolation and secret-leakage checks.

## Physical database-process restart

After the complete suite passed, the actual PostgreSQL process was stopped
with fast shutdown and restarted from the same data directory and Unix socket.
This was a server-process restart, not merely construction of a new JavaScript
store.

After restart, a read-only query returned:

```text
26|0001_mvp_foundation|0026_idempotent_wallet_session_invalidation
```

The focused durable Human/Wallet authentication suite was then rerun against
the restarted process:

- tests: 5;
- passed: 5;
- failed: 0.

The temporary PostgreSQL and WALLET-002/WALLET-003 restart gate is therefore
executed and locally verified. This evidence does not approve a production
database, production credentials, or a managed PostgreSQL provider.
