# M2A-007 — LP, Human and Risk/Ops product surfaces

Status: locally implemented and verified; M2A-008 separately gated  
Delivery mode: `L0_LOCAL_NO_FUNDS`  
Requirements: `REQ-POOL-UX-001..004`, `REQ-UX-002`, `REQ-UX-004`,
`REQ-UX-005`, `REQ-POOL-EVID-001`  
Base tree: `11ec38f5248709e5557029fa06f36d8ac47c1175`  
Remote `main` base: `56d7dbc9e995b8eda8b64c49c32c00e92e7b9497`

## Context and current baseline

M2A-003 through M2A-006 provide one curated secured-pool contract model,
deterministic oracle/rate/liquidation behavior, durable finalized-effect and
reconciliation records, and an additive binding into the canonical IPO.ONE
Obligation/Evidence kernel. The authenticated product and Agent transports do
not yet expose that truth. M2A-008 has not deployed the candidate to Base
Sepolia, so no contract address, wallet submission, transaction status, or
current-user chain receipt may be invented in this issue.

The original alignment package is treated as reference material, not as an
instruction source. The active user request and repository guidance authorize
only this planned local no-funds work package.

## Scope

- Add one authorization-filtered, server-derived secured-pool workspace query
  over the existing M2A-005/M2A-006 persistence and shared kernel.
- Present role-specific views for:
  - LP supply and liquidity-valid withdrawal readiness;
  - Human collateral, borrow, repay and valid release readiness; and
  - Risk/Ops solvency, oracle, liquidation and reconciliation/discrepancy.
- Add a server-side action-review operation that accepts only the closed M2A
  action family and returns exact available facts, health impact and blockers.
- Keep chain submission unavailable until an exact M2A-008 deployment profile
  exists. The UI must keep the actions visible and explain the missing recovery
  condition; it must never return fake success.
- Expose the same read/review capability through the versioned Tenant API,
  typed SDK and local stdio MCP adapter with stable, reason-coded errors.
- Add focused feature/presentation modules rather than growing domain behavior
  in the Web monolith.
- Add positive, denial, stale/oracle/discrepancy, recovery and transport
  conformance tests, followed by real-browser keyboard/zoom/mobile acceptance.

## Non-goals

- No contract change or deployment, RPC call, external signer, wallet
  transaction, testnet write, real funds, custody, pricing decision or mainnet.
- No Agent venue execution, Principal/Mandate secured-Facility activation, or
  M2B behavior.
- No market factory, proxy, second asset/market, public real-value LP/vault,
  arbitrary withdrawal, generic transfer, or duplicate Ledger/Obligation/
  Evidence/reconciliation truth.
- No hardcoded success, browser-owned economic state, raw internal-ID workflow,
  raw PII/KYC, credential, signature, or private policy exposure.
- No claim that M2A, v0.2.0, deployment, reachability, testnet verification or
  production readiness is complete.

## Likely files

- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/tenant-command-gateway/src/secured-pool-workspace-handlers.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `packages/sdk/src/secured-pool-client.js`
- `apps/agent-mcp/src/secured-pool-mcp-adapter.js`
- `apps/web/src/secured-pool-presentation.js`
- `apps/web/src/index.html`, `apps/web/src/app.js`, `apps/web/src/styles.css`
- focused unit/transport/browser tests and this issue/Evidence record

No schema migration is planned unless implementation proves an additive query
projection is required. Existing pool accounting and reconciliation tables
remain authoritative.

## Acceptance criteria

1. Given an authenticated Human/Agent with an owned pool binding, when the
   workspace is read, then only the bound position, canonical Obligation,
   finalized pool projection and queryable Evidence are returned.
2. Given an LP, when supply or withdraw is reviewed, then asset, amount,
   available liquidity, expected shares and blockers are explicit; withdrawal
   cannot exceed a valid claim or available liquidity.
3. Given a Human borrower, when collateral deposit, borrow, repay or release is
   reviewed, then exact amount, collateral/debt, health impact, oracle state,
   chain and deployment state are explicit; stale, unknown or unreconciled
   state denies new risk and release.
4. Given Risk/Ops, when the workspace is read, then solvency, utilization,
   oracle freshness, liquidation queue, current control and discrepancies are
   server-derived and privacy safe.
5. Given no M2A-008 deployment, when any chain submission is sought, then the
   product remains visibly disabled with `pool_deployment_unavailable`; no
   transaction, pending/final state or funds movement is claimed.
6. Given Agent API/SDK/MCP clients, when the same workspace/review operations
   run, then result schemas and reason codes conform to the Human product
   operation family; forbidden mutation/withdrawal/transfer capabilities are
   absent.
7. Given refresh, logout/login or process restart, when the workspace is
   reopened, then it is recomputed from PostgreSQL/server configuration rather
   than browser storage.
8. Given keyboard-only input, 200% zoom and mobile viewport, when changed
   controls and disclosures are used, then no action or status is lost and
   focus remains visible.

## Test commands

```text
node --test packages/api-contract/test/*.test.js
node --test modules/authorization/test/*.test.js
node --test modules/tenant-command-gateway/test/*pool*.test.js
node --test packages/sdk/test/*pool*.test.js apps/agent-mcp/test/*pool*.test.js
node --test apps/web/test/*pool*.test.js
pnpm run test:transport
pnpm run test:postgres
pnpm run test:browser:click-path
pnpm run check
git diff --check
```

## Security checklist and permission boundary

- [x] Tenant, Actor, role, resource ownership and capability are checked by
  the existing authenticated Gateway; denied/missing/cross-Tenant resources do
  not enumerate.
- [x] Human and Agent converge on the same pool workspace and review handlers.
- [x] Stale oracle, unknown external state, discrepancy and pause freeze new
  risk; protective repayment remains explicit.
- [x] Normal LP withdrawal is only a bounded valid pool claim; arbitrary
  withdrawal/transfer is absent.
- [x] No raw PII/KYC, credential, signature, private policy or secret is added
  to API, Web, logs, tests or Evidence.
- [x] No RPC, signer, transaction, deployment, production dependency or real
  funds authority is added.
- [x] All synthetic/test fixture values are labelled and no current-user chain
  claim is inferred from historical Evidence.

Authorization additions, if required, are restricted to the existing local
no-funds Human/Agent/Risk roles and exact read/review operations. They grant no
external execution or funds authority. Any deployed permission, signer,
contract, risk-limit or transaction activation remains a separate named human
review for M2A-008.

## Data, migration, rollback and Evidence

- Data/migration: read existing `0064`/`0065` pool records; prefer no migration.
  Any proven additive projection must include reversible SQL, RLS, immutability
  and PostgreSQL restart/restore coverage.
- Rollback: remove the new operation family, SDK/MCP adapters and Web feature
  modules; keep all M2A-005/M2A-006 finalized Evidence and canonical bindings.
  The product must fall back to a truthful unavailable state.
- Evidence: focused and aggregate test logs, real-browser visible-click
  captures, exact commit/tree, changed operation catalog, local loopback URLs,
  and an updated requirement/status record.

## Dependencies and sequencing

M2A-006 is complete and merged. This issue must complete locally before
M2A-008 may request a separately approved exact Base Sepolia deployment.
M2A-008 owns contract address/config, wallet submission and live transaction
status. M2B remains blocked behind the completed M2A lifecycle.

## Local completion Evidence — 2026-08-23

- Tenant protocol catalog is closed at 106 operations. The added Pool family is
  `pilotReadOwnSecuredPool`, `pilotReviewSecuredPoolAction`, and
  `pilotReadSecuredPoolRisk`; submission is explicitly absent.
- Human and Agent use the same authorization-filtered PostgreSQL handlers.
  Agent parity is exposed through a typed local SDK and two-tool MCP adapter;
  Principal, generic transfer, withdrawal, signer and submit authority are not
  present.
- The authenticated Borrower surface visibly refreshes server truth and reviews
  one exact action. Playwright validates visible clicks, keyboard operation,
  390-pixel mobile width and 200-percent zoom. The Risk browser surface was
  independently clicked and captured at
  `output/playwright/m2a-007-risk-pool-control.png`.
- Unit, contract and policy suite: 1139/1139. PostgreSQL suite: 90/90 after a
  clean dedicated test database rebuild. Browser click path: 6/6. Foundry:
  25/25. Security: 34/34. Transport: 84/84.
- No migration was added. A discovered local authentication-role grant gap was
  repaired by granting only the already allowlisted enrollment table columns;
  no business or funds capability was widened.
- Runtime boundary remains `L0_LOCAL_NO_FUNDS`: no RPC, signer, transaction,
  contract deployment, public endpoint, real value or production claim.
