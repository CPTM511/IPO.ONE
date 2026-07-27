# V9-005 implementation audit

Recorded: 2026-07-24T12:42:38.468Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Next task: `V9-006 AUTHORIZED`

## Gate

V9-004 was accepted by the IPO.ONE Founder at
`2026-07-24T12:11:23.997Z`. V9-005 was independently reviewed and accepted by
the IPO.ONE Founder at `2026-07-24T13:46:27.622Z`. That acceptance unlocks
V9-006 only and does not authorize V9-007.

## Outcome

The Obligations destination now provides a bounded owned-position list and an
exact selected-position detail over the existing canonical `obligation.v2`
state. It shows:

- original principal, rate, maturity, outstanding, past due and repaid values;
- canonical installment schedule and reconciled row arithmetic;
- Human Consent or Agent Mandate authority presentation without forking the
  Obligation, Ledger, Event or Evidence model;
- current lifecycle and trusted-time servicing classification;
- signed local sandbox execution state and opaque receipt reference, with no
  production-rail claim;
- schedule, Obligation and loaded Evidence versions;
- hash-only append-only Evidence with explicit correction, resolution,
  reorganization and invalidation semantics.

No browser Ledger was introduced. Unrefreshed or denied references keep
financial and lifecycle values hidden. Portfolio aggregates appear only when
all visible references have been reauthorized and reconciled to current server
state.

## Authoritative read composition

V9-005 reuses exactly these existing operations:

1. `pilotReadWorkspaceResume` for at most 32 Actor-bound opaque references.
2. `pilotReadOwnObligation` for one exact owner/controller-authorized current
   Obligation.
3. `pilotReadOwnObligationEvidence` for one exact bounded redacted Evidence
   page.

The browser position index displays at most eight references and reauthorizes
each exact reference separately. The Evidence presentation displays at most 50
loaded items. At that boundary, pagination stops with an explicit browser
display-cap message rather than exposing an invalid or missing cursor.

No new Tenant operation, protocol branch, capability, catalog entry, AuthZ
rule, admission class, migration, SDK authority, mutation, deployment,
dependency or external network was added.

The requested "all owned obligations" action remains `ABSENT` in traceability
because there is no approved unbounded or paginated discovery authority. The
implemented product is the approved bounded owned-resource composition.

## Closed presentation contract

`obligation_portfolio_presentation.v1` accepts only:

- a closed `tenant_owned_obligation_view.v1`;
- the exact owner/controller relationship;
- a Human or Agent entry label;
- a matching `tenant_owned_obligation_evidence_view.v1` or an explicit
  unqueried state.

It fails closed for amount, schedule, authority, timestamp, finality, Evidence,
rail, safety-flag or output-shape drift. It reuses
`servicing_case_presentation.v1` for canonical schedule and amount arithmetic.
Human and Agent tests prove that the entry label changes while the canonical
Obligation ID, amounts, schedule and history remain identical.

## Change scope

V9-005 implementation and evidence are scoped to:

- `apps/web/src/obligation-portfolio-presentation.js`
- `apps/web/test/obligation-portfolio-presentation.test.js`
- `apps/web/src/servicing-position-index.js`
- `apps/web/test/servicing-position-index.test.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md`
- `docs/codex/audits/V9-005/pre-change-mapping.md`
- `docs/codex/audits/V9-005/audit.md`
- `output/playwright/v9-005/`

The worktree contains earlier accepted stacked task changes, so repository-wide
diff totals are not represented as V9-005-only totals.

## Verification

### Exact repository verification

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: pass.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: pass;
- schemas: 52;
- OpenAPI: 21 paths / 21 operations;
- migrations: 27 ordered up/down pairs;
- Tenant protocol: 42 operations, 58 request fixtures, 50 result fixtures;
- product traceability: 13 destinations, 60 actions, 42 bound operations;
- local tests: 401/401 pass.

### Focused browser-product verification

Commands:

```text
npx -y node@24.18.0 --check apps/web/src/obligation-portfolio-presentation.js
npx -y node@24.18.0 --check apps/web/src/app.js
npx -y node@24.18.0 --test apps/web/test/obligation-portfolio-presentation.test.js apps/web/test/servicing-position-index.test.js apps/web/test/static-ui.test.js
git diff --check
```

Result: syntax pass, 14/14 focused tests pass, diff check pass.

### Transport and security

The exact transport conformance suite passed 49/49, including direct delivery
of the versioned Obligation presentation module. The exact Gateway security
suite passed 24/24. No AuthZ or RLS weakening was introduced.

### PostgreSQL, restart and reconciliation

A temporary PostgreSQL 17 cluster was started at
`/private/tmp/ipo-one-v9005-pg.scDfE7` on loopback port `55438`. Command:

```text
DATABASE_URL=postgresql://cptmao@127.0.0.1:55438/ipo_one_v9005_test npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: 70/70 pass, including forced RLS, cross-Tenant denial, exact owned
reads, process restart, event replay and full reconciliation.

After the run, the database was dropped, PostgreSQL was stopped, and the exact
temporary cluster was moved to
`/Users/cptmao/.Trash/ipo-one-v9005-pg.scDfE7`. Port `55438` reports no
response. The Trash copy remains recoverable.

### Real browser verification

Playwright exercised the authenticated browser fixture at desktop and
`390x844` mobile sizes.

Verified:

- reload restores only the selected opaque reference and initially hides
  incomplete aggregate values;
- exact refresh reaches complete `2/2` coverage;
- aggregate outstanding is `$240.00`, past due is `$60.00`, and repaid is
  `$0.00`;
- the selected delinquent position shows `$120.00` outstanding, `$60.00` past
  due, `DPD 12`, `DPD 1–30`, two canonical `$60.00` schedule rows and signed
  local sandbox execution;
- five matching hash-only Evidence events load with `Evidence v5`;
- reload, exact refresh, position selection, Evidence load and repayment-route
  navigation controls are operable;
- switching to Agent entry preserves the exact current state while changing
  only entry-mode copy;
- console result: 0 errors / 0 warnings.

Evidence:

| Artifact | SHA-256 |
| --- | --- |
| `output/playwright/v9-005/obligations-desktop.png` | `a979d9a11cba3318439731c308e7e649d6915c7d019f1e00c94e2400d6f8cf76` |
| `output/playwright/v9-005/obligations-mobile.png` | `0aef39f99743ef2e16909664f179dbee86687ecd8aabad2979cb15bb72b945c4` |
| `output/playwright/v9-005/obligations-mobile-detail.png` | `12e1669727f5adbeb7ad33bbcd06650ae21e8bc7323408b4c03f8a60ee4d93b5` |
| `output/playwright/v9-005/obligations-mobile-full.png` | `94e023502763a5fda0351cd0a3431874ff59523e79c964eefb6e838c89c7ef5b` |

## Defects found and resolved during verification

1. The browser Evidence fixture returned an `asOf` earlier than the selected
   current Obligation read. Production correctly rejected that stale Evidence.
   The test host now derives an Evidence timestamp later than the exact
   Obligation view; no production validation was weakened.
2. Accumulating more than 50 Evidence items could produce `hasMore=true`
   without a valid next cursor after display slicing. Loaded Evidence is now
   capped explicitly at 50 with pagination closed and a visible boundary
   message.
3. Canonical DPD classifications were rendered as generic title-cased text.
   The product now renders `DPD 1–30`, `DPD 31–60`, and `DPD 61–89`
   consistently without changing canonical values.

## Rollback

Rollback removes the V9-005 browser presentation module, page composition,
asset allowlist entry, focused tests, traceability references and browser
evidence. No database rollback is required because V9-005 adds no migration or
durable write. Existing Events, Evidence, Ledger entries and owned-read
operations must not be altered during rollback.

## Residual boundaries

- No unbounded owned-resource enumeration or search.
- No report/export implementation.
- No new SDK list authority.
- No chain observation or Testnet transaction.
- No production funds, lending, withdrawal or transferable value.
- At the V9-005 implementation handoff, no V9-006 implementation had started.

The IPO.ONE Founder subsequently completed the independent review and accepted
V9-005 at `2026-07-24T13:46:27.622Z`.
