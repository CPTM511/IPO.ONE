# WALLET-002 audit

Date: 2026-07-23  
Status: `IMPLEMENTED_UNVERIFIED`  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

`WALLET-002` is implemented and the runnable local gates pass. PostgreSQL
execution and real-browser multi-tab execution remain unverified because this
environment has no reachable test database and prevents the required browser
or loopback processes from starting. This record therefore does not approve
`WALLET-003`, a deployment, production use, a new connector, a signer,
Testnet mutation, mainnet, capital, custody, or real funds.

## Accepted source and pre-change mapping

The package branch and commit match the repository. The existing worktree
differences are the user-accepted, uncommitted output of `AUDIT-001`,
`PRODUCT-002`, and `WALLET-001`. They are recorded in
`docs/codex/audits/WALLET-002/source-drift.md` and were preserved.

The pre-change browser, BFF, durable session, and proof boundaries are mapped
in `docs/codex/audits/WALLET-002/pre-change-mapping.md`. In particular:

- wallet events previously changed only browser display state;
- logout was not replay-safe after the first terminal transition;
- there was no wallet-context invalidation route or cross-tab quarantine;
- the existing durable Human session was already the server truth checked
  before every protected Human operation;
- SIWE and Agent AccountBinding remain separate proof lifecycles.

## Delivered diff

Added:

- `schemas/v2/wallet-session-invalidation.schema.json`;
- `modules/authentication/src/wallet-session-invalidation.js`;
- `apps/web/src/wallet-authority-lifecycle.js`;
- `apps/web/test/wallet-authority-lifecycle.test.js`;
- `apps/web/test/support/wallet-authority-browser-fixture.html`;
- `apps/tenant-api/test/human-access-invalidation.test.mjs`;
- `db/migrations/0026_idempotent_wallet_session_invalidation.up.sql`;
- `db/migrations/0026_idempotent_wallet_session_invalidation.down.sql`;
- `docs/codex/audits/WALLET-002/source-drift.md`;
- `docs/codex/audits/WALLET-002/pre-change-mapping.md`;
- `docs/codex/audits/WALLET-002/audit.md`.

Modified:

- `apps/web/src/app.js` binds account, chain, disconnect, and selected-Provider
  replacement events to immediate local/cross-tab quarantine, server
  invalidation, protected-request guards, and SIWE challenge epochs;
- `apps/web/src/index.html` describes the invalidation boundary and loads the
  reviewed application revision;
- `apps/tenant-api/src/human-access-routes.js` adds the closed invalidation
  route and moves logout onto the same idempotent terminal transition;
- `apps/tenant-api/src/tenant-web-assets.js` serves the lifecycle module;
- `apps/tenant-api/README.md` documents the route composition;
- `apps/tenant-api/test/human-access-routes.test.mjs`,
  `apps/tenant-api/test/transport-conformance.test.mjs`, and
  `apps/web/test/static-ui.test.js` cover the affected HTTP and browser
  composition;
- `modules/authentication/src/human-session-store.js`,
  `modules/authentication/src/postgres-human-authentication.js`,
  `modules/authentication/src/human-session-bff.js`,
  `modules/authentication/src/human-bff.js`, and
  `modules/authentication/src/index.js` implement and export the atomic
  invalidation operation;
- `modules/authentication/test/human-bff.test.js` and
  `modules/authentication/test-postgres/durable-human-authentication.test.mjs`
  cover the in-memory and durable transition;
- `apps/private-pilot/src/production-bootstrap.js` grants the existing
  authentication role only `SELECT, INSERT` on the new immutable table;
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs` includes
  the table in tenant-isolation coverage;
- `scripts/check-schemas.mjs` requires the new result schema;
- `product/traceability/ipo-one.v9-product-traceability.v1.json` and
  `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md` mark only
  `wallet_permissions.invalidate_session_on_provider_change` as
  `REAL_LOCAL`;
- `docs/security/IPO_ONE_COMMERCIAL_ACCESS_BOUNDARY_v0.1.md` records the
  fail-closed wallet-context boundary.

No package dependency, lockfile, workspace override, Tenant catalog operation,
OpenAPI operation, AuthZ policy, admission/quota policy, approval policy,
launch profile, chain profile, pricing, capital, custody, signer, external
network, deployment, or funds capability belongs to this task.

## Versioned result and route contract

`wallet_session_invalidation_result.v1` is a closed six-field result:

- `status: invalidated`;
- `reauthenticationRequired: true`;
- `authorityAvailable: false`;
- `credentialsIncluded: false`;
- `fundsAuthority: false`.

`POST /auth/v1/wallet/invalidate` accepts only:

- the existing host-only session cookie, except an exact replay may omit the
  already-cleared cookie;
- the exact configured Origin;
- the current CSRF bootstrap value;
- one bounded opaque idempotency key;
- the exact request schema version and one of four wallet material-change
  reasons.

Unknown body fields, query parameters, reasons, origins, missing CSRF,
malformed headers, and invalid response shapes fail closed. The bounded result
contains no account-existence signal, Tenant, Actor, role, wallet address,
Provider metadata, credential, token, signature, proof, or funds authority.

Logout uses the same operation with the closed `human_logout` reason and an
independent idempotency key. Both routes expire the session and CSRF cookies.
A later successful login issues fresh random session and CSRF material.

## Durable transition and restart semantics

Migration `0026` adds
`authentication_session_invalidations` with:

- Tenant-scoped primary and foreign keys;
- forced RLS and the existing Tenant-context trigger;
- one immutable record per session and one idempotency reference per Tenant;
- only keyed hashes of session and idempotency material;
- a closed reason set and schema version;
- a rollback refusal while durable invalidation records exist.

The PostgreSQL store executes one Tenant write transaction that:

1. checks Origin, reason, idempotency, session, CSRF, expiry, and active state;
2. locks and transitions the exact session to `revoked`;
3. inserts the immutable invalidation reference;
4. appends one existing credential-free `session_revoked` authentication
   Event;
5. returns the closed result.

An exact retry looks up the protected idempotency reference and checks the same
reason and CSRF binding. It can return the same result after the browser has
cleared its session cookie and after a process restart. A different key,
reason, session, or CSRF value receives the same non-enumerating inactive
session rejection. Concurrent conflicting requests cannot create a second
terminal transition or Event.

## Browser and cross-tab transition

The lifecycle state is memory-only: `available`, `pending`, `invalidated`, or
`unavailable`.

- `accountsChanged`, `chainChanged`, `disconnect`, selected-Provider removal,
  and selected-Provider replacement clear displayed wallet state immediately.
- The originating tab moves to `pending` before awaiting the server.
- A closed BroadcastChannel message moves every other same-origin tab to the
  same quarantine state without sharing wallet, session, CSRF, signature, or
  idempotency material.
- Protected Tenant requests check the lifecycle both before sending and after
  receiving a response. The Tenant catalog probe has the same before/after
  guard.
- A network failure moves to `unavailable`; protected actions and wallet
  sign-in remain blocked. The online retry reuses only the original
  idempotency key and cannot restore authority.
- A valid server result moves to `invalidated`. A new user-initiated login is
  then allowed, but no authority is restored automatically.
- Each material event increments a wallet challenge epoch. Any in-flight SIWE
  challenge, signature, or verify result from an older epoch is abandoned.
  Fresh wallet authentication requests a new server-generated one-use
  challenge and reloads the page only after verification succeeds.

Provider event payloads are never treated as account or chain truth. The
separate durable Agent AccountBinding is not silently revoked by an untrusted
browser event. Its create/submit operations remain behind the now-invalid
Human Principal session, and a new browser page session after reauthentication
must explicitly request any new one-use Agent challenge.

## Catalog, authorization, admission, Event, and data

- Tenant catalog: unchanged at 38 operations.
- New Tenant handlers: none.
- New private authentication route: one.
- AuthZ policy: unchanged; every protected call still requires a fresh
  server-derived Authentication Context and Authorization Decision.
- Admission/quota classification: unchanged.
- OpenAPI: unchanged at 21 paths and 21 operations.
- Migrations: 26 ordered up/down pairs, one new pair.
- Authentication Event type: reuses `session_revoked`; no new Event surface.
- Ledger, Evidence, outbox, reconciliation, and obligation kernel: unchanged.
- External services, wallet RPC, live accounts, and private data accessed:
  none.
- Real funds, mainnet, trading, transfers, approvals, or custody: none.

The V9 traceability gate remains at 60 material actions and now reports 27
`REAL_LOCAL`, zero `REAL_TESTNET_READ`, 14 `SIMULATION_ONLY`, 9
`SPECIFIED_DISABLED`, and 10 `ABSENT`.

## Commands and results

Exact repository gate:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm check
```

Passed with Node `v24.18.0` and pnpm `11.1.3`: all static gates, 49 schemas,
21 OpenAPI operations, 26 migration pairs, 38 Tenant operations, 60 product
actions, and 356 tests with zero failures.

Focused no-listener route, authentication, lifecycle, and wallet tests:

```sh
/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin/node \
  --test \
  modules/authentication/test/human-bff.test.js \
  apps/tenant-api/test/human-access-invalidation.test.mjs \
  apps/web/test/static-ui.test.js \
  apps/web/test/wallet-authority-lifecycle.test.js \
  apps/web/test/wallet-provider-registry.test.js
```

Passed 27 tests with zero failures. This includes exact cookie-less replay,
idempotent logout, CSRF/Origin/open-body rejection, one Event, cross-tab
quarantine before the deferred server result, fail-closed network retry using
the same key, challenge-epoch abandonment, and rejection of an open server
result.

Affected security tests that do not require a listener:

```sh
/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin/node \
  --test \
  security/test/gateway-security.test.mjs \
  security/test/approval-security.test.mjs \
  security/test/abuse-security.test.mjs
```

Passed 16 tests with zero failures. A first run found that the local variable
name `authenticationContextEpoch` could falsely imply browser access to the
server Authentication Context. It was renamed `walletChallengeEpoch`; the
Gateway security suite then passed 10/10.

Syntax and hygiene checks passed for the changed JavaScript and PostgreSQL
test files. `git diff --check` passed.

## UNVERIFIED evidence and environment failures

### PostgreSQL execution

`DATABASE_URL` is not configured and `pg_isready` reports no response on the
local socket. The destructive PostgreSQL test runner correctly refuses to run
without an explicit database whose name contains `test`. The durable test is
implemented and syntax-valid but was not executed.

Required reviewer command:

```sh
DATABASE_URL=postgresql://.../ipo_one_test \
  env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin \
  pnpm test:postgres
```

The reviewer must confirm the new restart replay assertion, one invalidation
row, one `session_revoked` Event, no plaintext session/CSRF/idempotency value,
RLS isolation, exact privileges, and rollback refusal with retained data.

### Loopback HTTP and real browser

The listener-based Tenant/authentication tests could not bind
`127.0.0.1`; Node returned `EPERM`. The affected new route is separately
covered through direct request/response stream invocation, but that is not
reported as loopback HTTP proof.

The Playwright skill prerequisite was available, but its wrapper needed
`@playwright/cli`. The sandbox had no network access and the required
escalation was rejected by the approval infrastructure with
`X-OpenAI-Internal-Codex-Responses-Lite` model support failure. The installed
Chrome headless fallback also terminated under the sandbox before loading the
fixture.

`apps/web/test/support/wallet-authority-browser-fixture.html` is therefore a
reviewer-ready real-module fixture, not evidence claimed as executed. It uses
no real Provider, account, RPC endpoint, credential, signature, or funds.

Required reviewer evidence:

1. start the closed no-funds test host on loopback;
2. open two same-origin tabs with Playwright;
3. trigger each of `accountsChanged`, `chainChanged`, `disconnect`, Provider
   removal, and Provider replacement;
4. prove both tabs show `pending` before the invalidation response;
5. prove a protected action fails in both tabs;
6. resolve the request and prove both tabs show `invalidated`;
7. interrupt one response, prove `unavailable`, retry the exact key, restart
   the server, and prove one row and one Event;
8. begin SIWE, change context before signature/verify completes, and prove the
   old epoch cannot establish a session;
9. record zero console errors and warnings.

The listener-dependent security server tests also remain unverified because
of the same `EPERM`, not a product assertion failure.

## Security proof

- No client-controlled Tenant, Actor, role, capability, policy, or
  authorization decision was added.
- Session, CSRF, and idempotency plaintext never enter PostgreSQL, Events,
  browser messages, logs, analytics, product traceability, or response bodies.
- Wallet address, Provider metadata, signature, SIWE message, and Agent
  account proof are absent from the invalidation operation.
- Unknown responses cannot restore browser authority.
- Network ambiguity and process ambiguity fail closed.
- A changed account, chain, or Provider cannot use the old host session after
  the atomic transition; local guards quarantine it before that transition
  completes.
- Existing deny-by-default AuthZ and live-state revalidation remain the
  ultimate server enforcement for every protected operation.
- No launch policy was widened. The only release-enabled profile remains the
  public sandbox.

## Rollback

Rollback requires human review because durable terminal-session records may
exist:

1. pause the private Human host and confirm no invalidation request is in
   flight;
2. preserve the authentication Events and terminal sessions as audit truth;
3. do not run the down migration while
   `authentication_session_invalidations` contains data; it intentionally
   refuses;
4. after an approved retention/export decision, remove the route, browser
   lifecycle integration, schema, BFF/store operation, narrow table grants,
   migration pair, tests, documentation, and traceability change;
5. preserve the separately accepted `AUDIT-001`, `PRODUCT-002`, and
   `WALLET-001` work;
6. rerun the exact repository, PostgreSQL, transport, security, and browser
   gates.

Rollback must not reactivate an already revoked session, discard its Event,
restore a previous CSRF value, or reinterpret a terminal invalidation as
active authority.

## Independent review handoff

The independent reviewer should attempt to:

- race two tabs and two server instances against one active session;
- replay the same key after cookie clearing and process restart;
- replay a different reason, CSRF, session, Tenant, and idempotency key;
- inject duplicate headers, duplicate JSON keys, unknown fields, oversized
  values, and malformed Origin/cookie input;
- change wallet context during account request, chain switch, SIWE challenge,
  signature, verification, Tenant request, and catalog response;
- send forged BroadcastChannel messages and confirm they can only deny, never
  grant, authority;
- inspect database rows, Events, browser storage, logs, and responses for
  credential or wallet leakage;
- verify no durable Agent AccountBinding is revoked from an untrusted browser
  event and no old browser-held challenge survives fresh page
  reauthentication;
- execute the PostgreSQL and real-browser evidence listed above.

Next manifest task: `WALLET-003`. Status: `NOT_STARTED`, pending independent
review and explicit human acceptance of `WALLET-002`. This audit does not
authorize it to start automatically.
