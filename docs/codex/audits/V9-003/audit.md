# V9-003 implementation audit

Recorded: 2026-07-24  
Completed at: 2026-07-24T08:40:52Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `IMPLEMENTED_UNVERIFIED`  
Review gate: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Accepted at: `2026-07-24T09:53:21Z`

V9-003 productizes the existing shared no-real-funds repayment and servicing
kernel as an authenticated, bounded multi-position Human experience. It does
not create a second Ledger, Obligation, repayment, DPD, default, cure, Event,
Evidence, or reconciliation implementation.

The IPO.ONE Founder accepted V9-003 at `2026-07-24T09:53:21Z` and authorized
V9-004 only. This does not approve V9-004 or any later task.

## Source and prerequisite disposition

- The package source identity matched the branch and source `HEAD` above.
- The accepted, uncommitted AUDIT-001 through V9-002 worktree was preserved.
- The IPO.ONE Founder accepted V9-002 at `2026-07-24T08:13:35Z`; that
  acceptance is recorded in the V9-002 audit.
- The existing authoritative repayment, servicing, approval, Ledger, Event,
  Evidence, and reconciliation paths are mapped in
  `pre-change-mapping.md`.
- No commit was created. The review base is the source `HEAD` above plus the
  accepted stacked worktree.

## Existing shared kernel retained

The authoritative server path remains unchanged:

- `pilotReadWorkspaceResume` returns bounded opaque Actor-owned resource
  references without balances or search.
- `pilotReadOwnObligation` reauthorizes one exact Obligation and returns the
  durable `tenant_owned_obligation_view.v1`.
- `pilotPostSandboxRepayment` uses the existing fee -> interest -> principal
  waterfall and commits the repayment, Obligation/installments, balanced
  Ledger transaction/entries, Event, Evidence, outbox, audit, capacity, and
  idempotent result atomically.
- `workerAdvanceSandboxServicing` derives grace, DPD, delinquency, and default
  from trusted UTC and the oldest unpaid installment.
- A repayment can derive cure inside the same server transaction.
- Restructure, repurchase, and write-off remain separately approved
  dual-control operations; V9-003 does not expose or approve them.
- PostgreSQL reconciliation remains the authority for detecting projection,
  Ledger, Event, Evidence, repayment, servicing-action, snapshot, and registry
  drift. Repair is not automatic.

The browser cannot supply allocation, DPD, lifecycle state, trusted time,
Ledger result, Evidence, production flags, or settlement finality.

## Implemented task delta

### Closed multi-position contract

`apps/web/src/servicing-position-index.js` adds the immutable
`servicing_position_index.v1` browser contract.

The contract:

- accepts only a Human Borrower
  `tenant_workspace_resume_view.v1`;
- accepts only matching `tenant_owned_obligation_view.v1` results returned for
  exact Actor-bound opaque Obligation references;
- delegates every refreshed position to the existing
  `servicing_case_presentation.v1` lifecycle, schedule, trusted-clock, DPD,
  cure, action, and safety validation;
- caps a refresh at eight positions and rejects duplicate IDs;
- rejects unknown fields, accessors, symbols, identity drift, resource drift,
  malformed timestamps, schedule drift, unsafe production flags, and invalid
  lifecycle state;
- rejects trusted-time, schedule-sequence, and cumulative-repayment
  regression on later refreshes;
- exposes financial values only for positions with a successfully
  reauthorized exact server view;
- exposes no invented balance, DPD, schedule, settlement, or aggregate value
  for an unrefreshed or unavailable position;
- derives aggregate counts and totals only when every bounded reference is
  current and the workspace response is not truncated.

The contract is presentation-only. It cannot mutate an Obligation, authorize a
payment, predict settlement, or approve a servicing disposition.

### Repay & Settle product composition

The authenticated Human surface now:

- shows the count of opaque owned-position references recovered from the
  server;
- provides one deliberate `Refresh current positions` action;
- reauthorizes each of at most eight exact references through the existing
  `pilotReadOwnObligation` operation;
- labels each row as `Server current`, `Not refreshed`, or `Unavailable`;
- shows server `asOf`, status, outstanding amount, and DPD only on successfully
  reauthorized rows;
- keeps an unavailable row reference-only and non-enumerating;
- switches the selected exact position without treating another row's cached
  data as authoritative;
- rereads the exact selected Obligation after no-funds execution or repayment
  before presenting its updated state;
- preserves current server views only while workspace recovery continues to
  return the same Actor-bound references;
- keeps synthetic repayment explicitly non-cash, non-withdrawable, and without
  a settlement prediction.

The selected detail continues to show authoritative component balances,
immutable schedule, trusted-time classification and DPD, cure amount, latest
servicing action, and no-production-funds flags through the existing
`servicing_case_presentation.v1`.

## Files in the V9-003 review scope

Task-specific implementation and tests:

- `apps/web/src/servicing-position-index.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/servicing-position-index.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `docs/codex/audits/V9-003/pre-change-mapping.md`
- `docs/codex/audits/V9-003/audit.md`

Prerequisite record correction:

- `docs/codex/audits/V9-002/audit.md` now records the Founder acceptance that
  authorized V9-003 while preserving every later and production gate.

Local browser evidence, ignored by release source control:

- `output/playwright/v9-003/multi-position-current.png`
- `output/playwright/v9-003/multi-position-cured.png`
- `output/playwright/v9-003/multi-position-mobile.png`

## Contract, migration, catalog, and policy disposition

- New Tenant operation: none.
- New successful server mutation: none.
- Database migrations: unchanged; 26 ordered up/down pairs.
- Tenant protocol catalog: unchanged; 38 operations.
- OpenAPI: unchanged; 21 paths and 21 operations.
- Request/result schemas: unchanged by V9-003.
- AuthZ capabilities, roles, ownership, policies, and MFA rules: unchanged.
- Admission classifications and quotas: unchanged.
- Repayment allocation, interest accrual, schedule, DPD, default, cure,
  restructure, repurchase, write-off, Ledger, Event, Evidence, and
  reconciliation policies: unchanged.
- Dependencies and lockfile: unchanged by V9-003.
- Contract, chain, RPC, signer, credential, custody, deployment, lender,
  facility, external network, mainnet, withdrawal, and real-funds changes:
  none.

The new module is served only through the fixed same-origin Tenant web asset
allowlist and remains covered by the existing restrictive CSP.

## Automated acceptance and negative proof

Focused browser-contract, presentation, static UI, and fixed-asset tests:

```text
npx -y node@24.18.0 --test \
  apps/web/test/servicing-position-index.test.js \
  apps/web/test/servicing-case-presentation.test.js \
  apps/web/test/static-ui.test.js \
  apps/tenant-api/test/transport-conformance.test.mjs
```

Result: 17 passed, 0 failed.

The focused proof includes:

- exact server-current multi-position values;
- no financial values for an unrefreshed row;
- duplicate, authority, identity, clock, lifecycle, schedule, and safety drift
  fail closed;
- later trusted-time, schedule-sequence, and repayment regression fail closed;
- cure is presented only from the exact returned servicing action;
- the fixed web asset and production shell contracts include the new module.

The monotonic refresh test was added after the first real-browser repayment
exposed a test-fixture clock that moved backward after cure. The fixture was
corrected to advance from the prior trusted servicing time, and the production
browser contract now independently rejects the same regression.

## Browser evidence

A real Chrome session loaded the production shell assets from the authenticated
same-origin loopback fixture.

Verified:

- two Actor-owned positions recovered from the server;
- the selected position showed its current exact values while the second
  position initially disclosed no financial value;
- one deliberate refresh produced `2/2 current`, with both rows labeled
  `Server current`;
- the primary position showed `$120.00`, Current, DPD 0;
- the secondary position showed `$120.00` outstanding, `$60.00` past due,
  DPD 12, and its exact trusted server timestamp;
- a `$60.00` synthetic bank repayment on the secondary position returned
  Cured, DPD 0, `$60.00` outstanding, `$0.00` past due, and `$60.00` repaid;
- cure was labeled `servicing_cured_by_repayment` and
  `no production funds moved`;
- a full page reload recovered the selected secondary position as Cured with
  `$60.00` outstanding;
- refreshing after reload again produced `2/2 current`;
- switching back to the primary position preserved its independent Current,
  `$120.00`, DPD 0 state;
- a 390 x 844 viewport had no horizontal overflow, displayed both positions,
  and retained a 44 px refresh control;
- browser console: 0 errors, 0 warnings.

The Playwright CLI session backend did not retain a launched session, and the
in-app browser timed out on the loopback host. Verification therefore used
the available Chrome control surface against the same real browser host. No
product fallback, demo state, or browser-manufactured success was introduced.

## Repository gates

Exact repository gate:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: PASS.

- local JavaScript tests: 387 passed, 0 failed;
- schemas: 51 contracts;
- OpenAPI: 21 paths / 21 operations;
- migrations: 26 ordered up/down pairs;
- Tenant protocol: 38 operations;
- product traceability: 13 destinations / 60 actions / 38 bound operations.

Affected transport and security gates:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Results:

- transport: 49 passed, 0 failed;
- security: 24 passed, 0 failed.

The final HTML contains 472 unique static IDs, no duplicate static ID, and
`git diff --check` passes.

## PostgreSQL physical-restart and reconciliation evidence

PostgreSQL 17.10 ran in a new isolated temporary cluster:

- root: `/private/tmp/ipo-one-v9003-pg.LCS6dB`;
- Unix socket only; TCP listening disabled;
- socket/cluster parent mode: `0700`;
- port selector: `55439`;
- database: `ipo_one_v9003_test`;
- user: `cptmao`;
- migrations after physical restart:
  `26|0001_mvp_foundation|0026_idempotent_wallet_session_invalidation`.

Before and after a real `pg_ctl -m fast stop` plus `pg_ctl start`, the exact
repository PostgreSQL gate was:

```text
DATABASE_URL='<local Unix-socket test URL>' \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Both runs passed 70 tests with 0 failures. Relevant included proof:

- repayment allocation and duplicate replay;
- balanced Ledger entries and atomic projection updates;
- DPD/default progression and repayment cure;
- restart-safe Human and Agent owned Obligation reads;
- durable dual-control servicing actions;
- crash rollback and outbox/inbox recovery;
- projection replay;
- full Gateway reconciliation;
- deliberate drift detection and approval-gated repair.

The persisted post-restart diagnostic was:

```text
ledger|5|0
repayment|2|0
reconciliation|2|0
```

This means five stored Ledger transactions had zero debit/credit imbalance,
two stored repayment events had zero unsafe sandbox/production-funds flags,
and two passed reconciliation runs had zero discrepancies.

One noncanonical verification attempt incorrectly launched the two
database-sharing test files concurrently. Their fixtures raced on cleanup and
produced authorization, foreign-key, and reconciliation failures. The
repository runner explicitly specifies `--test-concurrency=1`; rerunning that
exact serial gate after the physical database restart passed 70/70. This
failure and correction are retained here as audit evidence rather than hidden.

The temporary PostgreSQL server was stopped after evidence collection. No
production database, credential, or external database was used.

## Security boundaries and non-goals

- Human session and server-derived Actor authority remain the only browser
  authority.
- Position refresh performs exact owner reads only; it does not add a list,
  search, cross-Tenant lookup, or caller-provided authority field.
- Unavailable positions reveal no object existence reason or financial state.
- The browser cache is non-authoritative and rejected on server time,
  schedule, repayment, identity, safety, or reference regression.
- Synthetic repayment remains no-real-funds, nonwithdrawable, and
  server-finality-bound.
- No raw KYC/PII, private key, reusable wallet signature, CSRF value, session
  token, RPC secret, or custody authority is stored in the position index.
- No real Human lending, public capital, lender, facility, collection,
  mainnet, withdrawal, deployment, or production permission is approved.

## Known limitations

- The workspace response remains capped at 32 references; V9-003 deliberately
  refreshes at most the first eight returned references.
- There is no unbounded position list, pagination browser, or search surface.
- Browser values are refreshed snapshots, not a push subscription.
- There is no real collection rail, bank settlement, cash movement, or
  settlement prediction.
- Restructure, repurchase, and write-off remain existing approved-operation
  paths and are not exposed by this Human product step.
- Screenshots are local review evidence and not release artifacts.

## Rollback

Rollback V9-003 by removing the fixed
`/servicing-position-index.js` asset, the module and tests, and the bounded
position-refresh composition in the Human browser. The existing exact
single-Obligation read, repayment, servicing, Ledger, Event, Evidence, and
reconciliation kernel remains unchanged and operational.

## Required human review

Independent review should verify:

1. every displayed financial value is traceable to the matching exact
   `tenant_owned_obligation_view.v1`;
2. unavailable and unrefreshed rows disclose no financial value;
3. repayment presentation waits for the authoritative server result and exact
   follow-up read;
4. trusted clock, schedule, DPD/default/cure, and monotonic refresh checks fail
   closed;
5. Ledger, repayment, Event, Evidence, restart, and reconciliation evidence
   is sufficient;
6. no new operation, success mutation, permission, migration, policy,
   dependency, deployment, credential, or funds authority entered scope.

## Successor gate

`V9-004`: `AUTHORIZED_BY_ACCEPTANCE`.

The IPO.ONE Founder accepted the V9-003 review gate at
`2026-07-24T09:53:21Z` and instructed Codex to start V9-004. That acceptance
satisfies the V9-004 prerequisite only. It does not preapprove V9-004 issuer,
verifier, retention, privacy, sharing, revocation, public credential,
production readiness, deployment, real funds, or any later human gate.
