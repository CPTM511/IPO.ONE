# TC-202 Audit

Status: `IMPLEMENTED_UNVERIFIED`  
Completed at: `2026-07-25T11:20:39.003Z`  
Repository: `/Users/cptmao/Documents/IPO.ONE`  
Branch: `codex/commercial-access-release`  
Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Task boundary: TC-202 only

## Result

TC-202 replaces the callable synthetic history-import path with a fixed
Hyperliquid Testnet read-only Evidence path. It implements:

- a five-minute, one-use EIP-712 master-account ownership challenge fixed to
  HyperEVM Testnet chain `eip155:998`;
- independently queried `userRole(master)`, `userRole(subaccount)`, and
  `subAccounts(master)` relationship Evidence;
- a bounded 30-day history window with at most five 2,000-fill pages,
  inclusive-cursor deduplication, response/event manifests, and explicit
  pagination and 10,000-most-recent-fill survivorship limits;
- current subaccount-state reconciliation after history import;
- hash-only durable binding, provenance, aggregate metrics, data-quality, and
  factor Evidence;
- explicit `unknown` wallet-cluster, self-transfer, and wash-trading flags when
  the Info surface cannot support those conclusions;
- a non-authorizing point-in-time snapshot with no capital decision, numeric
  score, limit, pricing, or new-risk authority; and
- finalized-to-challenge rebinding that immediately deactivates prior Evidence
  authority and records the prior snapshot hash as invalidated.

Raw signatures, raw account addresses, and raw fill events are process-local
only and are not written to the projection, Event, Evidence, outbox, report, or
response profile. The challenge response necessarily returns the EIP-712 typed
data to the already authorized caller, but it contains address hashes rather
than raw addresses.

No API wallet, key, credential, `/exchange` client, order, transfer, withdrawal,
mainnet endpoint, capital approval, funds movement, custody power, production
authority, or successor-task implementation was added.

## Contracts and state

- New closed contract:
  `schemas/v2/trading-real-credit-profile.schema.json`
  (`trading_credit_profile.v2`).
- Existing operation IDs remain unchanged. The four Evidence operation response
  contracts advance to v2:
  - `tenant_trading_account_binding_challenge_created.v2`;
  - `tenant_trading_history_imported.v2`;
  - `tenant_trading_evidence_snapshot_finalized.v2`; and
  - `tenant_trading_credit_profile_view.v2`.
- `tradingCreateAccountBindingChallenge` now requires the fixed Testnet
  environment plus master/subaccount addresses.
- `tradingImportHyperliquidHistory` now requires the same two addresses and one
  canonical 65-byte signature. Unknown fields fail closed.
- Tenant catalog size remains 71 operations and Trading Capital remains 25
  operation IDs. No capability, role, admission class, approval class, or
  abuse-policy ceiling changed.
- One Event enum was added:
  `trading_hyperliquid_history_imported`.
- Ledger and obligation kernels are unchanged. The Evidence profile is
  deliberately rejected by the older synthetic capital-request eligibility
  path, preventing one real snapshot from authorizing capital.

## Migration

`0033_trading_real_evidence_binding`:

- permits v1 synthetic and v2 real-read profiles side by side;
- keeps sandbox, no-funds, no-production, no-credit-approval, no-raw-data, and
  no-secret checks in PostgreSQL;
- permits `external_system_queried` only to remain unchanged or advance from
  false to true;
- permits v2 `challenge_pending -> history_imported -> finalized` and
  `finalized -> challenge_pending` transitions with exact version increments;
- indexes binding epoch and hashed subaccount reference inside each Tenant;
- preserves forced RLS and immutable identity fields; and
- refuses down migration while any v2 profile exists, preventing Evidence
  erasure or silent schema loss.

The projection writer now persists the monotonic
`external_system_queried` transition. PostgreSQL restart verification,
idempotent command replay, Event/Evidence/outbox counts, RLS, projection
reconciliation, and rebinding invalidation were exercised against a temporary
PostgreSQL 17 instance.

## Security proof

- Authorization over the subject is checked before challenge creation.
- Import checks active ownership of the exact Trading Credit Profile before
  loading state or making any network call.
- EIP-712 ownership verification occurs before Hyperliquid relationship or
  account-data queries.
- The proof binds Tenant, Subject, Principal, master hash, subaccount hash,
  nonce, challenge ID, environment, Info profile, binding epoch, issuance, and
  expiry.
- The verifier rejects malformed and high-s signatures, expired or consumed
  challenges, wrong address hashes, chain/environment drift, and typed-data
  hash drift.
- Hyperliquid reads remain fixed to
  `POST https://api.hyperliquid-testnet.xyz/info`, with no credentials,
  redirects, dynamic URL, proxy, mainnet origin, or Exchange action.
- The 2,000-fill page is still bounded by the 1 MiB response ceiling. The
  strict-JSON key ceiling was raised from 20,000 to 50,000 because an official
  2,000-fill page contains more than 20,000 keys; depth, byte, call, retry,
  timeout, and page limits remain unchanged.
- Every successful import records gaps that cannot be proven from the Info
  surface. Completeness is always `partial`, even when pagination and freshness
  checks pass.
- Rebinding cannot reuse prior active Evidence authority.
- Static security regression rejects Exchange and high-risk action names from
  the TC-202 implementation.

## Verification

PASS:

1. `npx -y node@24.18.0 --test modules/hyperliquid-info/test/hyperliquid-info-adapter.test.js`
   - 10/10.
   - Includes ownership proof, expiry, actual-address role checks,
     master/subaccount relationship, 2,000-row pagination, inclusive overlap
     deduplication, and survivorship disclosure.
2. `npx -y node@24.18.0 --test packages/domain/test/trading-capital-real-evidence.test.js`
   - 3/3.
   - Includes closed v2 schema, hash-only/partial/non-authorizing Evidence,
     rebinding invalidation, replay, and expiry.
3. `npx -y node@24.18.0 --test modules/tenant-command-gateway/test/trading-capital-evidence-handlers.test.js`
   - 2/2.
   - Includes authorization-before-network ordering, atomic lifecycle,
     External Info call order, closed payloads, and cross-Actor denial.
4. `DATABASE_URL='postgresql://cptmao@localhost:55442/ipo_one_tc202_test?host=%2Fprivate%2Ftmp%2Fipo-one-tc202-sock.GXlOI0' npx -y node@24.18.0 scripts/run-postgres-tests.mjs`
   - 75/75.
   - Includes 33 migrations up/down/up, non-superuser migration owner, forced
     RLS, v1 compatibility, v2 restart, replay, projection verification,
     outbox/Evidence/Event exactness, and rebind invalidation.
5. `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`
   - 26/26.
6. `IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ=TC-201 npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:hyperliquid-info:live`
   - 1/1 fixed no-credential zero-address reachability probe.
   - Receipt:
     `docs/codex/audits/TC-202/live-readonly-reachability-evidence.json`.
   - This is explicitly not ownership or account-binding Evidence.
7. `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`
   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 67 schemas, 21-path OpenAPI, 33 migrations, deployment,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, and web-bundle checks passed.
   - Repository tests: 482/482.
8. `git diff --check`
   - passed.

FAIL:

- None remaining.

Resolved intermediate failures:

- The first 2,000-fill pagination test hit the old 20,000-key JSON ceiling.
  The ceiling was aligned to the already bounded 2,000-fill/1-MiB contract.
- Migration tests still expected migration 0032 as the tip. Exact up/down/up
  expectations were advanced to 0033.
- One no-raw-address assertion matched a repeated hash fixture substring rather
  than a raw-address field. It was corrected to assert forbidden field names.
- Product traceability still referenced the four v1 response versions. The
  operation bindings were advanced to the exact v2 response contracts.

UNVERIFIED:

- Independent reviewer acceptance of TC-202.
- A live Founder-controlled Hyperliquid Testnet master ownership signature.
- A live Founder-controlled master/subaccount relationship and non-empty
  account-history import. No approved master/subaccount pair or one-use
  signature was supplied to this task, so no ownership or real-account claim is
  made.
- Wallet-cluster, self-transfer, wash-trading, transfer, funding, liquidation,
  and counterparty lineage; the approved Info surface does not provide enough
  Evidence and the profile reports these gaps explicitly.
- Production/mainnet behavior, API-wallet signing, Exchange actions, custody,
  capital decisions, and real funds; all remain disabled and out of scope.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `modules/hyperliquid-info/src/binding-proof.js` | `43aaa62868dd3c2eb5aa0ededcbf1bb1e439f679a4fbe1ad9f9a80440904930e` |
| `modules/hyperliquid-info/src/index.js` | `e6e2175d4dac4cc60aadb1bd651681ab84da0247bb8718c26d404e56ce9a3c93` |
| `packages/domain/src/trading-capital-real-evidence.js` | `55adac6c3aa599baf2c63f08df0e2088af052257b20b73d1aac022dacbfc582b` |
| `modules/tenant-command-gateway/src/trading-capital-evidence-handlers.js` | `2b548a2b3dcdb669a86687e8fc5868ec439fdfd8f52316a9577458698655d7bb` |
| `schemas/v2/trading-real-credit-profile.schema.json` | `92983163006a93ac8a67d508932ec2dcde4318c3154349ef9cd8965f5ae91917` |
| `db/migrations/0033_trading_real_evidence_binding.up.sql` | `122ec22ea7e83688fffb2bbfcb394104f30ca30dfb3d8f16bff7492cb4a89c2e` |
| `live-readonly-reachability-evidence.json` | `70539b93e398f0868587e550521d28b6b3099f315f6a2f3bf3856e05747e0074` |

## Rollback

No production deployment or persistent shared database was changed. The
temporary PostgreSQL service was stopped, and its explicit data/socket
directories were moved to the user's Trash so recovery remains possible.

For an environment with no v2 rows:

1. run migration 0033 down;
2. remove only the TC-202 contract, domain, handler, adapter-proof, runtime
   wiring, fixture, type, and audit hunks; and
3. rerun the complete repository and PostgreSQL gates.

For an environment containing v2 rows, do not delete or rewrite Evidence.
Disable the four callable operations at ingress, retain migration 0033 and the
immutable records, review the incident, and prepare a separately approved
forward migration.

Because this worktree contains accepted stacked tasks, never use a broad reset
or checkout as rollback.

## Next task

## Founder acceptance and deferred live-account gate

- Accepted by: `IPO.ONE Founder`
- Accepted at: `2026-07-25T11:27:54.533Z`
- Founder instruction: `就按你推荐的来，然后继续后面的开发`
- Accepted maturity: `IMPLEMENTED_UNVERIFIED`
- The Founder-controlled Hyperliquid Testnet master/subaccount signature and
  non-empty history E2E is intentionally deferred into TC-203 integration
  evidence. This deferral does not convert the current reachability check into
  ownership, relationship, or account-history Evidence.
- That live-account E2E is a hard prerequisite for entering TC-301. TC-301 must
  remain blocked if the E2E is absent, empty, mismatched, stale, or fails
  independent review.
- This acceptance unlocks TC-203 only. It does not unlock an API wallet,
  Exchange action, signer, order, transfer, deployment, production authority,
  mainnet, or funds.

The successor is now `TC-203_UNLOCKED_BY_FOUNDER`; TC-301 remains
`BLOCKED_PENDING_TC_203_AND_LIVE_ACCOUNT_E2E`.

This audit does not approve the successor, unlock an API wallet, enable an
Exchange action, submit an order, deploy anything, move funds, or claim
production readiness.
