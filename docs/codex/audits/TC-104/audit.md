# TC-104 Implementation Audit

## Status

`IMPLEMENTED_UNVERIFIED`

Implementation and self-verification finished at
`2026-07-25T09:05:07.416Z`. This is not an independent review, release
approval, production-readiness statement, or authority for a successor task.

## Source identity and authority

- Repository: `/Users/cptmao/Documents/IPO.ONE`
- Branch: `codex/commercial-access-release`
- Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- Prerequisite: TC-103 accepted by the IPO.ONE Founder at
  `2026-07-25T07:57:58.241Z`.
- Task source:
  `IPO_ONE_V9_V10_Codex_Product_Basis_10.1.0/prompts/TC-104.md`
- Pre-change evidence:
  `docs/codex/audits/TC-104/pre-change-mapping.md`
- Runtime: Node `24.18.0`, pnpm `11.1.3`, PostgreSQL `17.10`.

The repository remains a deliberately stacked dirty worktree containing
prior accepted tasks. TC-104 performed no commit, branch change, deployment,
external network request, venue request, Testnet or mainnet mutation, signer
use, credential use, wallet action, custody action, withdrawal, transfer, or
funds movement.

## Exact TC-104 diff manifest

Because the accepted tasks share one stacked dirty worktree, a baseline
`git diff` would mix TC-104 with earlier accepted work. The exact files
authored or touched after the TC-104 pre-change capture are:

- Protocol generation:
  `api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json`,
  `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`.
- Local MCP:
  `apps/agent-mcp/src/index.js`,
  `apps/agent-mcp/src/trading-capital-mcp-adapter.js`,
  `apps/agent-mcp/test/trading-capital-mcp-adapter.test.js`.
- Bootstrap and static delivery:
  `apps/private-pilot/test-postgres/production-bootstrap.test.mjs`,
  `apps/tenant-api/src/tenant-web-assets.js`.
- Web:
  `apps/web/src/app.js`, `apps/web/src/index.html`,
  `apps/web/src/styles.css`,
  `apps/web/src/trading-capital-facility-presentation.js`,
  `apps/web/src/trading-capital-product-presentation.js`,
  `apps/web/test/static-ui.test.js`,
  `apps/web/test/trading-capital-product-presentation.test.js`.
- Migration:
  `db/migrations/0032_trading_capital_settlement.up.sql`,
  `db/migrations/0032_trading_capital_settlement.down.sql`.
- Audit and traceability:
  `docs/codex/audits/TC-104/pre-change-mapping.md`,
  `docs/codex/audits/TC-104/audit.md`,
  `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md`,
  `product/traceability/ipo-one.v9-product-traceability.v1.json`.
- Policy:
  `modules/abuse-control/src/abuse-policy.js`,
  `modules/authorization/src/authorization-constants.js`,
  `modules/authorization/src/authorization-policy.js`,
  `modules/authorization/test/authorization-policy.test.js`.
- Persistence:
  `modules/persistence/src/postgres-core-repository.js`,
  `modules/persistence/src/postgres-reconciliation-service.js`,
  `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`.
- Gateway:
  `modules/tenant-command-gateway/src/index.js`,
  `modules/tenant-command-gateway/src/tenant-command-clients.js`,
  `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`,
  `modules/tenant-command-gateway/src/trading-capital-settlement-handlers.js`,
  `modules/tenant-command-gateway/test/tenant-command-gateway.test.js`,
  `modules/tenant-command-gateway/test/trading-capital-settlement-handlers.test.js`.
- API contract:
  `packages/api-contract/index.d.ts`,
  `packages/api-contract/src/agent-credit-offer-workflow-receipt.js`,
  `packages/api-contract/src/agent-sandbox-obligation-workflow-receipt.js`,
  `packages/api-contract/src/human-credit-offer-workflow-receipt.js`,
  `packages/api-contract/src/human-sandbox-obligation-workflow-receipt.js`,
  `packages/api-contract/src/tenant-protocol.js`.
- Domain:
  `packages/domain/src/enums.js`, `packages/domain/src/index.js`,
  `packages/domain/src/trading-capital-facility.js`,
  `packages/domain/src/trading-capital-settlement.js`,
  `packages/domain/test/trading-capital-facility.test.js`.
- SDK:
  `packages/sdk/index.d.ts`, `packages/sdk/src/index.js`,
  `packages/sdk/src/trading-capital-client.js`,
  `packages/sdk/test/trading-capital-client.test.js`.
- Schemas:
  `schemas/v2/abuse-control-policy.schema.json`,
  `schemas/v2/tenant-protocol-catalog.schema.json`,
  `schemas/v2/tenant-protocol-request.schema.json`,
  `schemas/v2/tenant-protocol-result.schema.json`,
  `schemas/v2/trading-facility-close-request.schema.json`,
  `schemas/v2/trading-facility.schema.json`,
  `schemas/v2/trading-performance-proof.schema.json`,
  `schemas/v2/trading-settlement.schema.json`.
- Security:
  `security/test/gateway-security.test.mjs`.
- Browser evidence:
  `output/playwright/tc-104-trading-capital-desktop.png`,
  `output/playwright/tc-104-trading-capital-mobile.png`.

## Delivered boundary

TC-104 completes the 25-operation local no-real-funds Trading Capital contract
by adding operations 21 through 25:

1. `tradingRequestClose`
2. `tradingRunSettlement`
3. `tradingReadSettlement`
4. `tradingIssuePerformanceProof`
5. `tradingReadFacilityEvidence`

Runtime truth after implementation:

- Tenant protocol: 71 operations.
- Trading Capital: 25/25 local no-funds operations.
- TC-104: 5/5 operations.
- Eight product views: Overview, Profile, Marketplace, Setup, Live, Risk,
  Settle, and Proof.
- Every operation remains private and has `fundsAuthority: false`.
- Protocol maturity remains `local_non_funds`.
- No external venue, live market data, external verification, official
  settlement, official report, remote MCP, redeemable value, or production
  authority exists.

## Settlement and proof semantics

Primary domain implementation:

- `packages/domain/src/trading-capital-settlement.js`
- `packages/domain/src/trading-capital-facility.js`
- `packages/domain/src/enums.js`
- `packages/domain/src/index.js`
- `packages/domain/test/trading-capital-facility.test.js`

The settlement path:

- requires the exact flattened Facility hash and version;
- requires zero open Order Intents and zero synthetic exposure;
- records an immutable Actor-requested close;
- accepts no caller-authored price, PnL, cost, return, participation, or fee;
- uses only server-recorded synthetic equity;
- fixes venue cost, closing cost, realized PnL, fixed return, performance
  participation, and IPO.ONE fee to zero;
- returns recorded non-redeemable Subject and Provider contributions exactly;
- requires total allocation to equal final synthetic equity;
- transitions risk state monotonically to `SETTLEMENT`;
- creates no second Obligation or Ledger and no Ledger mutation; and
- performs no transfer, withdrawal, venue call, or production action.

The Performance Proof is synthetic, privacy-minimized, hash-bound, expires
after seven days, and is revocable by design. It contains no raw history,
strategy data, universal credit score, real-profit claim, official-report
claim, external-verification claim, or authorization power.

Facility Evidence is bounded to at most 50 redacted Evidence summaries. The
handler queries one extra row and fails closed rather than falsely presenting
an incomplete page as complete.

## Contracts and protocol

New closed schemas:

- `schemas/v2/trading-facility-close-request.schema.json`
- `schemas/v2/trading-settlement.schema.json`
- `schemas/v2/trading-performance-proof.schema.json`

Updated closed surfaces:

- `schemas/v2/trading-facility.schema.json`
- `schemas/v2/tenant-protocol-request.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- `schemas/v2/tenant-protocol-catalog.schema.json`
- `schemas/v2/abuse-control-policy.schema.json`
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`
- `api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- the four Human/Agent workflow receipt validator registries.

All five requests and results are closed, versioned, schema-validated, and
catalog-bound. Unknown operations, fields, resources, result variants, or
safety flags fail closed.

## Authorization, approval, and admission

| Operation | Actor types | Capability | Resource | Boundary |
| --- | --- | --- | --- | --- |
| `tradingRequestClose` | Human, Agent | `trading.facility.close_request.self` | Facility | exact bound Subject and flattened state |
| `tradingRunSettlement` | system worker | `trading.settlement.run.worker` | close request | worker-only deterministic no-funds settlement |
| `tradingReadSettlement` | Human, Agent, Provider | `trading.settlement.read.bound` | settlement | active resource binding required |
| `tradingIssuePerformanceProof` | Human, Agent, Provider | `trading.performance_proof.issue.bound` | settlement | active binding and exact settlement hash |
| `tradingReadFacilityEvidence` | Human, Agent, Provider | `trading.facility.evidence.read.bound` | Facility | active Facility binding and bounded Evidence |

Authorization remains deny-by-default. Commands are idempotency-bound, queries
prohibit mutation idempotency, admission classes are closed, and no operation
is public. The approval gate remains limited to the existing 11 high-impact
operations; TC-104 introduces no real-value or permission-increasing action.
The abuse gate covers 88 Tenant operations.

## Gateway, SDK, and MCP

Primary implementations:

- `modules/tenant-command-gateway/src/trading-capital-settlement-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `packages/sdk/src/trading-capital-client.js`
- `apps/agent-mcp/src/trading-capital-mcp-adapter.js`

Each mutation binds the exact authorization resource, current resource
bindings, locked projection state, expected hash/version, Event, Evidence,
outbox, projection, and result view within the existing PostgreSQL unit of
work. The typed SDK publishes the exact 25-operation union. The MCP adapter is
role-scoped and local stdio only; it does not expose remote MCP, A2A, dynamic
URLs, credentials, venue tools, or funds authority.

## Persistence, reconciliation, and rollback

Migration:

- `db/migrations/0032_trading_capital_settlement.up.sql`
- `db/migrations/0032_trading_capital_settlement.down.sql`

Tables:

- `trading_facility_close_requests`
- `trading_settlements`
- `trading_performance_proofs`

All three tables are Tenant-owned, immutable, forced-RLS projections with
closed safety checks and projection/reconciliation registration. The durable
scenario proves exact replay, restart recovery, cross-Tenant invisibility,
projection-hash verification, balanced allocation, unchanged Ledger
transaction count, and clean full reconciliation.

Migration 0032 rolls back only when all three tables are empty. It refuses to
discard synthetic audit state silently. A rollback reviewer must preserve any
required Evidence, approve exact row disposition, run the down migration, and
reverse catalog, handlers, schemas, clients, and UI as one reviewed change.
No `git reset`, production-data deletion, or implicit value action is part of
this handoff.

The temporary PostgreSQL instance used for verification was loopback-only and
is stopped. Its inert synthetic test directory is
`/private/tmp/ipo-one-tc104-pg.eAa99L`; it is not a product dependency.

## Eight-view product surface

Primary implementation:

- `apps/web/src/trading-capital-product-presentation.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/trading-capital-product-presentation.test.js`
- `apps/web/test/static-ui.test.js`

The top-level Trading Capital destination exposes the exact eight reviewed
views and 25-operation catalog. Human, Agent, and Provider presentations must
reconcile to one Facility. The browser can request close and issue a proof
only through authenticated catalog calls. Worker settlement is never exposed
as a browser action, and withdrawals remain unavailable.

The presentation fails closed on Facility, settlement, contribution,
allocation, proof, privacy, shared-kernel, safety, or catalog drift. Tabs use
native ARIA tab semantics, roving focus, Arrow, Home, and End keyboard
navigation. The static asset allowlist includes the reviewed presentation
module, preventing a runtime 404.

Real-browser evidence:

- Desktop, `1440x1000`:
  `output/playwright/tc-104-trading-capital-desktop.png`
- Mobile, `390x844`:
  `output/playwright/tc-104-trading-capital-mobile.png`

All eight tabs and keyboard navigation were exercised at both responsive
sizes. The final browser run reported zero console errors and zero warnings.

## Traceability

Updated machine and reviewer views:

- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md`

Final traceability covers 13 destinations, 65 actions, and all 71 catalog
operations:

- `REAL_LOCAL=38`
- `REAL_TESTNET_READ=0`
- `SIMULATION_ONLY=12`
- `SPECIFIED_DISABLED=7`
- `ABSENT=8`

TC-104 maps operations 21 through 23 to
`repay_settle.trading_facility_settlement` and operations 24 through 25 to
`activity_proofs.trading_facility_proof`.

## Verification evidence

### Complete local runtime

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check
```

Result: **PASS**.

The gate included:

- exact Node `24.18.0` and pnpm `11.1.3`;
- boundary lint;
- 65 closed schemas;
- 21 OpenAPI paths and operations;
- 32 ordered migration pairs;
- deploy, launch, approval, abuse, and operations policies;
- Tenant protocol: 71 operations, 91 request fixtures, 79 result fixtures,
  8 handoff fixtures, 3 capability manifests plus 8 invalid mutations, and
  5 workflow receipt fixtures plus 33 invalid mutations;
- product traceability: 13 destinations, 65 actions, 71 bindings;
- web bundle: 1 external module, 24 authored modules, 707 unique IDs; and
- unit, domain, protocol, SDK, MCP, and presentation tests: **469/469**.

### PostgreSQL

```text
DATABASE_URL=postgresql://127.0.0.1:55433/ipo_one_tc104_test \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres
```

Result: **PASS, 74/74** with PostgreSQL `17.10`.

The TC-104 case extends the same durable TC-101 through TC-103 lifecycle
through close, settlement, proof, restart, projection verification, forced
RLS, unchanged Ledger transaction count, and reconciliation.

### Security

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security
```

Result: **PASS, 24/24**.

The first security run correctly failed because the exact safety-flag
allowlist stopped at TC-102. The test was repaired to require
`tradingCapitalNoFundsSettlementEnabled: true`; no assertion was weakened.
The complete security suite then passed.

### Browser

The Playwright browser verification exercised:

- exact 25/25 operation display;
- all eight tabs;
- desktop and mobile layouts;
- Arrow/Home/End keyboard behavior;
- static module serving; and
- browser console.

Result: **PASS**, zero final console errors and zero warnings.

### Patch and boundary checks

- `git diff --check`: **PASS**.
- JavaScript syntax checks for the domain, handler, SDK, MCP, and
  presentation modules: **PASS**.
- Targeted scan found no network URL, external venue method, private key,
  credential, mainnet, withdrawal, transfer, or successor-task implementation
  in TC-104 runtime files.

## Failures found and resolved

Self-verification exposed and resolved:

1. create-child handler plans initially attempted an invalid simultaneous
   resource transition;
2. protocol resource and response enums initially lacked the new closed
   variants;
3. Facility schema initially rejected the final `SETTLEMENT` risk state;
4. generated workflow validators initially lacked the three new schema
   registrations;
5. the first browser run found the new presentation module missing from the
   static asset allowlist;
6. the first responsive view hid the operation count at mobile width;
7. the Human-readable traceability view retained pre-TC counts; and
8. the security exact-safety-object assertion omitted the TC-104 flag.

All failures were corrected and their affected full gates rerun to green. No
failed assertion or browser error is reclassified as PASS.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `packages/domain/src/trading-capital-settlement.js` | `dc5f8eb1e30ad28a46b0cb35c681fcd7b34bc7b05b7d98a92adbd8ddb2f1df93` |
| `modules/tenant-command-gateway/src/trading-capital-settlement-handlers.js` | `787a0aaafc7538312fbd23701a011e8f84687fe9011e448822de1ec5e773b7eb` |
| `modules/persistence/src/postgres-core-repository.js` | `76b2a75e57860b8bee1552686d18a292fa4b7d2e364dbab5951e7ccda518ad1b` |
| `modules/persistence/src/postgres-reconciliation-service.js` | `2ea00c9b4b634a98345ba1358b623b4d12e7ee95398d68ea0e94bd95481f595c` |
| `db/migrations/0032_trading_capital_settlement.up.sql` | `a358cf0f2ad60bb7b85b2ed32fb30ff3a2e56bc4c6033c943111d05dbc86f8a9` |
| `db/migrations/0032_trading_capital_settlement.down.sql` | `7cc26700d30b61b3c345b0314689654da2c5a8541fdd38c73b58e56a15a324f6` |
| `schemas/v2/trading-facility-close-request.schema.json` | `2e49d91fbc6d94706e5580ccd30fabbc033cf57a82d819faf88d7b7f3ce6affc` |
| `schemas/v2/trading-settlement.schema.json` | `89697205a14f0a933e72b585226efdaec54b69e87067c859439d2d31fea6a52f` |
| `schemas/v2/trading-performance-proof.schema.json` | `06d644c6961a5c6f1828954816c06a9f8bcee5a5d1819e669d43f19efedac35e` |
| `packages/sdk/src/trading-capital-client.js` | `f7ef563d413751ee06e69e76930391491b73bf90c309f6f5311d1b19357629ef` |
| `apps/agent-mcp/src/trading-capital-mcp-adapter.js` | `c40f1df901b816041dcf15ff13eabf0926d189d3b46bd4a338f3685d947f0e9c` |
| `apps/web/src/trading-capital-product-presentation.js` | `6fc8ff7de490d53977f3c7788bfbe66288f358a81c60187ca141778b5cb2d914` |
| `api/tenant-protocol/ipo-one.tenant-protocol.v1.json` | `afd24d90ecc8904714fc45724a3d79c5d6ba8ffe71ca0182a7e84c73709e09a3` |
| `product/traceability/ipo-one.v9-product-traceability.v1.json` | `db881db752160d7e5bdc60966ad5ffb1da0fb3ea1d902d16204f8f13c48f6cd0` |
| Desktop browser evidence | `e657ad47a691c8b8d39e248ad5a26e4512f9b2287f756bcc1ec9074c2760b7c8` |
| Mobile browser evidence | `d3f71734ac40f154974ce2310fd393f89f54dbde756602f0aa5e3e68d91342b8` |

## Independent review gate

Review must verify at least:

- all five operation contracts, capabilities, actor types, and resource
  bindings;
- exact synthetic conservation and zero caller-authored economics;
- no Ledger mutation, second Ledger, official settlement, official report, or
  external-verification claim;
- proof privacy, expiry, and revocation semantics;
- PostgreSQL forced RLS, replay, restart, projection, and reconciliation
  evidence;
- exact SDK and local role-scoped MCP parity;
- all eight responsive and keyboard-accessible product views;
- absence of external venue, signer, credentials, Testnet/mainnet mutation,
  custody, withdrawal, transfer, real funds, and successor work; and
- artifact hashes and commands in this audit.

Only an independent review plus explicit Founder acceptance may change
TC-104 from `IMPLEMENTED_UNVERIFIED` or authorize any successor task. TC-105
and all later tasks remain blocked.

## Founder acceptance

The IPO.ONE Founder accepted TC-104 and instructed Codex to continue at
`2026-07-25T10:13:42.775Z` through `同意TC104，继续后面的工作`, followed by
`继续`. This changes the TC-104 decision status to accepted and unlocks
TC-201 only.

TC-201 remains bounded to the signer-free official Hyperliquid Testnet Info
origin, fixed `/info` path, closed read query types, actual master/subaccount
addresses, and no credentials. This acceptance does not authorize TC-202,
mainnet, `/exchange`, an API wallet, signing, account binding, Testnet writes,
custody, deployment, withdrawals, transfers, or real funds.
