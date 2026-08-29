# PHASE3-POOL-001 — Remote read-only Pool product integration repair

Status: `PASS — DEPLOYED AND USER-VERIFIED`

Date: 2026-08-27

Baseline: `origin/main` at
`39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`

Requirements: `REQ-POOL-001..003`, `REQ-COLL-001..002`, `REQ-ORACLE-001`,
`REQ-RATE-001`, `REQ-POOL-EVID-001`, `REQ-POOL-UX-001`, `REQ-UX-002`,
`REQ-UX-004..005`, `REQ-PRIV-001`

Founder decision: `APPROVED — BEGIN IMPLEMENTATION NOW`

## Context and current truth

M2 ends at `M2B-006`; this issue is not `M2B-007`. M2A-007 implemented local
Pool product surfaces, and M2A-008 deployed, source-verified, finalized and
reconciled one exact Base Sepolia test-assets Pool. M2A-008 product acceptance
was local, and M2B-006 explicitly excluded Pool/Venue writes and testnet
transaction integration.

The remote product currently buries the Pool inside Human Credit, collapses a
missing remote workspace into `not deployed`, and cannot recover truthful live
Pool state. The exact Pool exists onchain, but remote IPO.ONE product
integration is incomplete.

Current maturity:

- CODE: complete for the prior local read/review surface;
- TESTNET CONTRACT DEPLOYMENT: complete;
- LOCAL PRODUCT VERIFICATION: complete;
- REMOTE IPO.ONE PRODUCT INTEGRATION: incomplete; and
- current product verdict: `BLOCKED — NOT COMPLETE`.

Current exact server-policy input must be re-read at runtime from the approved
`live_testnet_secured_pool` profile. The checked-in profile currently binds:

- chain: Base Sepolia, `eip155:84532`;
- market: WETH collateral / test USDC debt;
- Pool: `0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`; and
- Oracle Adapter: `0xB06D905Da7c4a2b42843F3EF46Aff706622F9B19`.

These values are Evidence, not browser configuration input.

## Scope

Implement one coherent remote read-only vertical repair:

1. Add a normal, explicit secured-Pool product entry reachable from visible
   navigation without a hidden URL or internal identifier.
2. Resolve exact deployment/configuration truth on the server from the
   approved `live_testnet_secured_pool` policy profile.
3. Read the exact Base Sepolia Pool and Oracle through bounded read-only RPC
   adapters; introduce no signing or transaction primitive.
4. Model independently:
   - deployment identity/configuration;
   - RPC connectivity;
   - indexer/reconciliation state;
   - market state;
   - authenticated AccountBinding/user-position state; and
   - submission authority.
5. Expose, when authoritatively available, network, Pool, assets, deployment,
   liquidity, utilization, rate/index, oracle value/freshness, pause/control,
   and authenticated owned supply/collateral/debt/health.
6. Keep authoritative zero distinct from unknown, unavailable, denied,
   unbound and degraded state.
7. Preserve deployed truth when RPC, indexer or private user-position truth is
   unavailable.
8. Restore the same truth after refresh, logout/login, browser restart,
   application restart and Vercel redeploy.
9. Present the same canonical Pool truth through normal user, LP, Human
   borrower and Risk/Operations perspectives.
10. Preserve applicable versioned API/SDK/MCP read parity for Agents.

## Authority model

Effective authority is the intersection of:

```text
approved exact live_testnet_secured_pool profile
  INTERSECT this read-only repair scope
  INTERSECT authenticated role/object/account authority
```

Public deployment/market truth and private owned-position truth are separate
authority domains. Public exact Pool reads never imply private Tenant access.
Private position state may be returned only through existing Tenant, Actor,
Subject and AccountBinding authorization. Missing authorization returns a
non-enumerating denied/unavailable state.

The broader `publicPoolParticipationEnabled` policy capability does not widen
this issue. Its effective submission authority is always disabled.

## Truthful state model

The product must not collapse independent facts into one generic status.

- Deployment: `DEPLOYED` or `NOT_DEPLOYED` from exact server policy plus code.
- RPC: `CONNECTED`, `DEGRADED` or `UNAVAILABLE`.
- Indexer/reconciliation: `RECONCILED`, `DEGRADED`, `DISCREPANCY` or
  `UNAVAILABLE`.
- Market: authoritative values or explicit unknown/unavailable fields.
- Position: `BOUND_WITH_POSITION`, `BOUND_NO_POSITION`, `UNBOUND`, `DENIED` or
  `UNAVAILABLE`.
- Submission: `DISABLED_READ_ONLY` in every result and role.

A deployed Pool must not display `not deployed` merely because a downstream
dependency or owned-position query is unavailable.

## Non-goals

- No signer creation, load, reuse, request, custody or credential material.
- No supply, withdraw, collateral deposit/release, borrow, repay, liquidation,
  Hyperliquid order, Venue write or any other economic transaction.
- No mainnet, real funds, Human cash loan or production financial claim.
- No second Pool, chain, market, collateral/debt asset, factory, proxy,
  Strategy Vault, public real-value LP, Ledger, Obligation model, risk engine,
  score, provider, venue, token/DAO or upgrade framework.
- No `public_sandbox` or unrelated-profile capability expansion.
- No `PILOT-008A`, Hyperliquid, `RISK-003B` or M3 work.
- No application-wide redesign or infrastructure unrelated to this repair.

## Likely files

- `deploy/launch-policy.v1.json` as read-only canonical input; no capability
  widening is expected
- production configuration/profile readers under `packages/release-governance/`
  or the smallest existing server boundary
- `modules/chain-adapter/` for bounded read-only Pool/Oracle RPC
- `modules/event-indexer/` and existing Pool projection/reconciliation readers
- `modules/tenant-command-gateway/src/secured-pool-workspace-handlers.js`
- `packages/api-contract/`, `packages/sdk/src/secured-pool-client.js`, and
  `apps/agent-mcp/src/secured-pool-mcp-adapter.js`
- `apps/web/src/index.html`, `apps/web/src/app.js`,
  `apps/web/src/secured-pool-presentation.js`, and scoped styles/tests
- additive Evidence under `artifacts/phase3-pool-001/`
- Phase 3 execution/traceability/task documents in this same PR

## Acceptance criteria

1. Pool is reachable from a normal visible `ipo.one` product entry.
2. Exact chain, Pool, Adapter, assets and deployment identity are derived on
   the server from the approved exact policy/configuration.
3. Wrong profile, chain, contract, bytecode/config or asset binding fails
   closed without replacing deployed truth with invented state.
4. Read-only RPC returns truthful exact Pool/Oracle market state; unavailable
   RPC, stale oracle and unknown values remain distinguishable.
5. Indexer/reconciliation state is independently visible; discrepancy blocks
   new-risk semantics and never rewrites chain truth.
6. Authenticated owned positions are returned only under existing exact
   AccountBinding and Tenant/Actor/Subject/object authorization.
7. Authoritative zero, no position, unbound, denied, unknown and unavailable
   are not interchangeable.
8. Refresh, logout/login, browser restart, process restart and redeploy recover
   from server/chain/database truth rather than browser state.
9. Normal user, LP, Human borrower and Risk/Ops views agree on deployment and
   market truth while preserving role-scoped private data.
10. Applicable Agent API/SDK/MCP reads remain versioned and semantically
    equivalent; no Agent execution authority is added.
11. No submit, signer, raw RPC mutation, transaction, withdrawal, transfer,
    liquidation or admin control is reachable from Web/API/SDK/MCP.
12. No unresolved P0/P1 remains in scope.
13. Final successful verdict is exactly
    `PASS — DEPLOYED AND USER-VERIFIED`.
14. Final merged main SHA equals the SHA deployed and finally verified on
    `ipo.one`. Candidate verification alone cannot produce PASS.

## Focused verification

- exact approved profile admission and wrong-profile/chain/config denial;
- bounded Pool/Oracle read-only RPC and no-write static/runtime proof;
- RPC unavailable, stale oracle, indexer degraded and discrepancy states;
- authoritative zero versus unknown/unavailable;
- owned position, unbound, denied and cross-Tenant isolation;
- refresh/relogin/process restart/redeploy recovery;
- API/SDK/MCP conformance and no transaction primitive;
- real-browser normal-user, LP, Human borrower and Risk/Ops visible paths; and
- existing complete repository gate before merge.

If persistence behavior changes, PostgreSQL integration verification with
`DATABASE_URL` is mandatory before PASS.

## Test commands

Exact commands will be pinned after the implementation delta is known. The
minimum gate includes:

```sh
pnpm run check:launch-policy
pnpm run check:product-traceability
pnpm run test:security
pnpm run test:transport
pnpm run test:browser:click-path
pnpm run check
git diff --check
```

Add focused Pool profile, adapter, Gateway, SDK/MCP and Web tests. Do not use a
larger test count as completion Evidence.

## Security checklist

- [ ] No signer, private key, transaction primitive or economic write exists.
- [ ] Public market and private position authority are evaluated separately.
- [ ] Tenant, Actor, Subject, AccountBinding, resource and role checks remain
      exact and non-enumerating.
- [ ] Wrong/stale/unknown/unreconciled state fails closed.
- [ ] No raw PII/KYC, address/private-position disclosure, credential,
      signature or private policy leaks into public responses/logs/Evidence.
- [ ] Server policy/configuration, not browser constants, owns deployment
      identity.
- [ ] `public_sandbox`, mainnet, real funds, external Provider and Venue writes
      remain disabled.

## Data and migration impact

Prefer no schema migration. Reuse existing exact profile, adapter, finalized
Pool projection, reconciliation and authorized AccountBinding data. If an
additive projection is proven necessary, it requires RLS, immutability,
restart/restore and PostgreSQL verification within this same issue.

## Rollback

Before remote promotion, revert the scoped product/server integration. After
promotion, return `ipo.one` to the recorded immutable prior deployment, keep
the Pool contract and historical Evidence untouched, preserve fail-closed
state and repair forward. Do not disable or rewrite the existing exact testnet
deployment merely because the hosted read path is degraded.

## Branch, PR, merge and deployment discipline

- one short-lived implementation branch;
- one focused PR containing task/docs/server/API/SDK/MCP/Web/tests/Evidence;
- candidate pre-validation allowed;
- if merge changes SHA, redeploy the final merged main SHA and rerun final
  browser acceptance;
- final PASS requires `ipo.one` itself to run the final merged and verified
  SHA; and
- stop after the exact repair verdict and report. Do not begin `PILOT-008A`.

## Required completion Evidence

The final report records starting and final main SHA, PR, deployment identity,
normal Pool URL/entry path, exact chain/contracts/assets/config source, Pool,
Oracle, indexer/reconciliation, role views, Agent parity, recovery and quality
results, P0/P1 findings and these exact facts:

```text
signerCreated=false
poolTransactionSubmitted=false
venueTransactionSubmitted=false
mainnetAuthorized=false
realFundsAuthorized=false
```

## Completion result — 2026-08-29

- Starting implementation baseline: `39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`.
- Final merged `main` and deployed release SHA:
  `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`.
- Pull requests: `#60` for the vertical repair and `#61` for the final public-
  market/private-position authorization correction.
- Production deployment: `dpl_5KLezhu9ZA3vcob8xgpMp5GSNPkq`, promoted to
  `https://ipo.one`.
- Visible entry: `Products -> Secured Pool`, with the final review left at
  `https://ipo.one/#secured-pool`.
- Exact server-derived profile read: Base Sepolia `eip155:84532`, Pool
  `0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`, WETH collateral and test USDC
  debt.
- Production browser result: exact deployment verified, RPC connected, safe-
  block market reads current, authoritative market zeroes shown as zero, and
  indexer/reconciliation unavailability shown independently.
- Private-position result for the acceptance Actor: no authorized
  AccountBinding, so owned position fields remained unavailable and the read-
  only scenario review submit control remained disabled.
- Refresh and complete page reload restored the authenticated server workspace
  and current Pool market truth through visible navigation.
- Production request Evidence included HTTP 200 for
  `GET /tenant/v1/secured-pool/market`; browser console warning/error result was
  empty.
- Complete repository checks passed with 1,216 aggregate checks, 92 PostgreSQL
  checks, 25 contract checks plus two explicit fork-only skips, nine visible-
  click browser paths, and two successful CI runs.

```text
signerCreated=false
poolTransactionSubmitted=false
venueTransactionSubmitted=false
mainnetAuthorized=false
realFundsAuthorized=false
```

Completion Evidence:
`docs/codex/audits/PHASE3-POOL-001/completion-evidence.md`.

Final verdict: `PASS — DEPLOYED AND USER-VERIFIED`.
