# V9-001 implementation audit

Recorded: 2026-07-24  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `IMPLEMENTED_UNVERIFIED`
Review gate: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Accepted at: `2026-07-24T04:32:54Z`

This task productizes the authenticated V9 shell, Overview, and maturity
labels. Its V9-001 review gate was accepted by the IPO.ONE Founder before
V9-002 began. That acceptance does not approve production release, production
funds, a financial operation, or any later task.

## Source and prerequisite disposition

- The package source identity matched the current branch and `HEAD` before the
  change.
- The accepted, uncommitted AUDIT-001 through WALLET-003 worktree was
  preserved.
- WALLET-003 had already closed its approved Base Sepolia Testnet scope before
  V9-001 began. V9-001 does not extend that approval.
- The pre-change route, truth-source, gap, and non-goal mapping is recorded in
  `docs/codex/audits/V9-001/pre-change-mapping.md`.

## Implemented surface

The authenticated shell now exposes exactly these 13 V9 destinations:

1. Overview
2. Request Credit
3. Repay & Settle
4. Credit Passport
5. Obligations
6. Agent Console
7. Capital Network
8. Wallet & Permissions
9. Activity & Proofs
10. Credit Track Record
11. Reports & Exports
12. Risk & Operations
13. Architecture

Each destination is a real keyboard-reachable route with one matching active
content panel and one `aria-current="page"` navigation item. Five previously
implicit product areas now have dedicated shell views: Credit Passport,
Capital Network, Wallet & Permissions, Credit Track Record, and Reports &
Exports.

Files changed by V9-001:

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `apps/web/test/support/risk-operations-browser-host.mjs`
- `docs/codex/audits/V9-001/pre-change-mapping.md`
- `docs/codex/audits/V9-001/audit.md`

No migration, schema, Tenant operation, OpenAPI operation, dependency, signer,
chain write, funds path, launch policy, or deployment was added by V9-001.

## Server-derived truth

The shell receives the authenticated operation catalog from the Tenant server.
Destination maturity badges are derived from that catalog and the server
authentication options:

- `Server operation available` means the required operation is present in the
  authenticated catalog. It is not an authorization grant.
- `Server sign-in available` means an approved server authentication option is
  present.
- `Unavailable · no operation` is used when no operation exists. Reports &
  Exports remains in this state.
- Architecture reports the available server contract, not production
  readiness.

Operation presence never bypasses Gateway authorization. Risk and object reads
continue through their existing permission, Tenant, Actor, purpose, and MFA
checks.

Overview no longer presents a missing Obligation as a reconciled `$0.00`
portfolio:

- selected outstanding is formatted only from the owner-authorized Obligation
  returned by `pilotReadOwnObligation`;
- next payment is formatted only from that returned schedule;
- available credit is `Unavailable`, because no aggregate available-credit
  operation exists;
- empty, denied, unavailable/error, loading, and recovered/restart states are
  explicit;
- recovered copy reports only the count of opaque Actor-bound resource
  references returned by the server.

The browser does not aggregate a portfolio, calculate available credit,
manufacture maturity, or treat a catalog entry as permission.

## Browser evidence

The browser fixture served the production shell assets and authenticated
Tenant protocol responses on loopback only. It added a truthful authentication
options response and a workspace-resume response for existing durable resource
references; it did not add a browser-only financial result.

Clean authenticated browser result:

- all 13 destinations were focused and activated with `Enter`;
- every activation produced the expected URL hash and visible panel;
- exactly one panel and one current navigation item remained active;
- browser console: 0 errors, 0 warnings;
- duplicate static IDs: none;
- active main landmark: one;
- mobile menu closes with `Escape` and returns focus to its trigger;
- 390 x 844 navigation remains scrollable and exposes all destinations.

The lifecycle browser created a synthetic Human Subject, Consent, $120.00
no-funds Offer, and accepted Obligation through authenticated server
operations. After page reload, workspace resume restored three opaque durable
resource references and the selected owned Obligation. Overview then rendered:

- selected outstanding: `$120.00`;
- next payment: `$60.00 · Aug 15`;
- available credit: `Unavailable`;
- state: `Workspace recovered from durable server state`.

The clean-host empty state separately rendered `No selected Obligation` and
`Unavailable`, with no zero-value success claim.

Responsive evidence:

- `output/playwright/v9-001/v9-001-overview-desktop.png`
- `output/playwright/v9-001/v9-001-mobile-navigation.png`

## Automated gates

Focused JavaScript and transport gate:

```text
npx -y node@24.18.0 --check apps/web/src/app.js
npx -y node@24.18.0 --check \
  apps/web/test/support/human-lifecycle-browser-host.mjs
npx -y node@24.18.0 --test \
  apps/web/test/static-ui.test.js \
  apps/tenant-api/test/transport-conformance.test.mjs \
  apps/tenant-api/test/human-access-routes.test.mjs
```

Result: 13 passed, 0 failed.

Exact repository gate:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: PASS.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- schemas: 51 contracts;
- OpenAPI: 21 paths / 21 operations;
- migrations: 26 ordered up/down pairs;
- Tenant protocol: 38 operations;
- product traceability: 13 destinations / 60 actions / 38 bound operations;
- local JavaScript tests: 378 passed, 0 failed.

## PostgreSQL process-restart evidence

PostgreSQL 17.10 ran in an isolated `/private/tmp` cluster:

```text
/private/tmp/ipo-one-v9001-pg.DwkCjA
```

It used Unix socket
`/private/tmp/ipo-one-v9001-pg.DwkCjA/socket`, port identifier `55436`, an empty
listen address, local trust inside the mode-restricted temporary directory,
and rejected host authentication. No Homebrew service or TCP listener was
used.

The first diagnostic retries used a Unix-socket URL with no authority host.
Node's `URL.username` setter cannot serialize a role into that shape, so test
role switching was silently lost and PostgreSQL correctly rejected the
superuser connection as an unsafe Tenant role. A new clean cluster and an
authority-preserving connection URL fixed the test environment without
changing product code or weakening role checks.

Final clean-cluster result:

```text
pnpm run test:postgres
```

- tests: 70;
- passed: 70;
- failed: 0;
- durable Human/Wallet authentication: pass;
- Tenant isolation, event recovery, replay, Gateway restart, and
  reconciliation: pass.

The PostgreSQL process was then stopped with fast shutdown and restarted from
the same data directory and Unix socket. A read-only query returned:

```text
26|0001_mvp_foundation|0026_idempotent_wallet_session_invalidation
```

The focused durable Human/Wallet authentication suite passed 5/5 after that
physical process restart. All temporary PostgreSQL processes were then stopped
normally.

## Security and product boundaries

- No production funds or real Human lending capability exists.
- No wallet credential, private key, CSRF secret, signature, or raw KYC/PII is
  persisted or rendered by V9-001.
- No aggregate portfolio number or available-credit number is calculated
  client-side.
- Missing or unauthorized resources remain non-enumerating.
- Reports & Exports remains unavailable because no server operation exists.
- Mobile/QR remains separately classified and does not become production-ready
  through this shell work.
- Existing Ledger, Obligation, Event, Evidence, outbox, reconciliation,
  authorization, and admission boundaries are unchanged.

## Known limitations and rollback

- The maturity badge reports operation/contract availability, not the current
  Actor's object-level authorization.
- Only one selected owned Obligation is available to Overview; no aggregate
  portfolio projection exists.
- Official report generation and export remain unavailable.
- V9-002 has not started.

Rollback is limited to the six V9-001 web/test files listed above and this
audit directory. No database or onchain rollback is required because V9-001
introduced no migration, deployment, or chain mutation.
