# M1-B Human session refresh serialization

Status: Source correction complete; exact-candidate browser verification pending

## Context

Exact-candidate browser acceptance reached the durable Human credit journey, but
`pilotRequestCredit` failed before Gateway authorization and created no Credit
Intent. PostgreSQL recorded `Invalid active authentication session refresh`.
The Human session resolver captures request time before database work; two
same-session requests can therefore acquire the row lock in the opposite order
and attempt to move `last_seen_at` backwards. The database projection guard
correctly rejects that regression.

## Scope

- Make an authenticated Human session refresh monotonic after the session row
  is locked.
- Use the locked row's latest observation time for expiry, credential-current,
  refresh, terminal rejection, event, and returned Authentication Context
  decisions inside `authenticate`.
- Add a deterministic PostgreSQL regression in which an older queued request
  resumes after a newer refresh commits.
- Re-run the exact no-funds Human journey only after the fix is verified and a
  new exact candidate is built.

## Non-goals

- No new authentication method, OIDC provider, WebAuthn ceremony, session
  permission, capability, actor type, or browser authority.
- No change to wallet signing, CSRF, session lifetime, credential expiry,
  Tenant isolation, RLS, Tenant Protocol, Gateway operations, MCP, A2A, credit
  policy, funds movement, or production authority.
- No migration or trigger relaxation. The monotonic database guard remains
  fail closed.
- Adjacent rotate/revoke chronology hardening is tracked separately and is not
  required to resolve this active-request availability defect.

## Likely files

- `modules/authentication/src/postgres-human-authentication.js`
- `modules/authentication/test-postgres/durable-human-authentication.test.mjs`
- this issue record

## Acceptance criteria

1. A queued authenticate call whose captured time predates the locked row's
   `last_seen_at` succeeds without moving session time or idle expiry backwards.
2. The returned Authentication Context reports the stored monotonic observation
   time, not the stale caller timestamp.
3. Absolute expiry remains unchanged and idle expiry never exceeds it.
4. Expired or no-longer-current credentials and sessions continue to reject.
5. The focused PostgreSQL regression, complete PostgreSQL suite, security and
   transport suites, repository quality gate, and exact browser retry pass.
6. The failed pre-fix attempt remains zero-effect: no Credit Intent, Obligation,
   Ledger, Lockbox, or funds movement.

## Test commands

```sh
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run check
git diff --check
```

## Security checklist

- [x] The session row remains locked before effective request time is derived.
- [x] Effective time is never earlier than durable `last_seen_at`.
- [x] Idle and absolute expiry remain fail closed.
- [x] Credential, actor, membership, Tenant, client, role, capability, CSRF,
      and RLS checks are unchanged.
- [x] No cookie, CSRF token, signature, wallet address, PII, or database secret
      is logged or added to Evidence.
- [x] No permission, financial authority, or real-value surface is added.

## Permission boundary

The Founder-authorized M1-B closure covers this bounded correction to the
existing durable no-funds Human authentication path. It does not authorize
strong-MFA topology changes, production identity providers, real funds,
mainnet, signers, custody, withdrawals, venue writes, remote MCP, or A2A.

## Migration impact

None. The existing session schema and monotonic projection trigger are retained.

## Rollback plan

Revert only this issue's source, regression, and issue-record commit, then
rebuild the prior exact tracked source. Durable sessions and credit resources
require no data rollback.

## Completion Evidence

- Failing-before PostgreSQL trigger error and zero Credit Intent count.
- Focused lock-order regression before and after the correction.
- Exact diff, commit/tree, full automated gates, and exact local runtime identity.
- Real invited-wallet retry proving the Human request reaches durable Gateway
  authorization and creates only the intended no-funds lifecycle state.

## Automated Evidence

- Failing before: the delayed-request PostgreSQL regression exited `1` with
  SQLSTATE `23514`, `Invalid active authentication session refresh`, at the
  session projection guard. The retained browser failure likewise produced no
  `pilotRequestCredit` authorization record and no Credit Intent.
- Focused after-fix durable Human authentication suite: `6/6` passed on a fresh
  disposable PostgreSQL 17 database.
- Security suite: `34/34` passed.
- Authenticated transport suite: `79/79` passed.
- Full PostgreSQL suite: `87/87` passed on a fresh disposable PostgreSQL 17
  database with only `PATH` and `DATABASE_URL`; zero failures, cancellations,
  skips, or todos.
- Repository `pnpm run check`, source lint, syntax checks, and
  `git diff --check`: passed.
- No migration, retained-stack mutation, permission change, or funds movement.
