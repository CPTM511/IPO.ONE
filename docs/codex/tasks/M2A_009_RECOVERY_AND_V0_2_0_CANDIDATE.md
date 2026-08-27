# M2A-009 — Recovery drills and v0.2.0 candidate

Status: `BLOCKED — ENGINEERING CANDIDATE READY; HUMAN AND INDEPENDENT REVIEW REQUIRED`

Delivery mode: `L3_LIVE_TESTNET_TEST_ASSETS_ONLY` observation and local
recovery rehearsal; no new chain write

Base commit: `8faee5b7db683fb71ec7a49508c726c259396c7f`

Dependency: M2A-008 `PASS — DEPLOYED AND USER-VERIFIED` at the bounded Base
Sepolia test-assets-only and local-product boundary

## Context and current baseline

M2A-008 deployed one immutable Base Sepolia test Pool and oracle Adapter,
verified both sources, finalized both deployment transactions, reconciled the
existing indexer through two independent RPCs, proved restart and duplicate
replay, exercised local discrepancy freeze and recovery, destroyed every
one-use deployment signer, and completed Human/Capital Partner/Risk visible
product acceptance.

The current Evidence is split across deployment, source-verification, indexer
and product-acceptance artifacts. M2A-009 must turn that Evidence into one
closed v0.2.0 candidate contract and repeatable recovery drill without sending
another transaction or treating local recovery authority as onchain pause or
unpause authority.

## Scope

- Define one strict, schema-validated M2A-009 recovery-candidate manifest that
  binds the exact release SHA, chain, Pool/Adapter, test-assets-only policy,
  migrations, source verification, deployment/finality, indexer/reconciliation,
  product acceptance, rollback posture and named recovery owners.
- Add one read-only recovery drill that verifies the existing finalized Pool
  through two RPCs and deterministically rehearses provider disagreement,
  oracle invalidity/staleness, reorg-invalidated observations, process restart,
  duplicate replay, indexer rebuild and zero-discrepancy dual-control recovery.
- Verify the current PostgreSQL migration/restart/restore evidence and bind its
  exact result into the candidate report without copying credentials or private
  database material.
- Produce one exact v0.2.0 release report that distinguishes CODE, RUNTIME,
  DEPLOYED, REACHABLE and VERIFIED and records every excluded authority.
- Re-run repository, contract, PostgreSQL, security and real-browser gates on
  the exact candidate SHA; keep the local product URL available for Founder
  review.

## Non-goals

- No new deployment, contract call, pause/unpause transaction, signer, wallet,
  faucet funding, mainnet, real funds, Human cash loan, custody or KYC.
- No second Pool, market, collateral/debt asset, oracle, RPC write path,
  factory, proxy or upgrade.
- No Agent venue write, Hyperliquid execution, arbitrary transfer/withdrawal,
  production/Vercel deployment or remote-access change.
- No automatic unfreeze. Recovery requires a fresh zero-discrepancy run and
  two distinct named owner approvals represented only as non-secret hashes.
- No defect may be closed only in prose; the smallest correct implementation
  and regression test are required.

## Likely files

- `schemas/v2/m2a-009-recovery-candidate.schema.json`
- `deploy/testnet/m2a-009-recovery-candidate.mjs`
- `deploy/testnet/test/m2a-009-recovery-candidate.test.js`
- `deploy/releases/m2a-009-v0.2.0-candidate.json`
- `artifacts/testnet/eip155-84532-m2a-009-recovery-*.json`
- `docs/releases/IPO_ONE_V0_2_0_CANDIDATE.md`
- `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`
- this issue and requirement traceability

## Acceptance criteria

1. Given any unknown field, wrong SHA/chain/address/transaction, missing or
   drifted Evidence hash, non-test asset, production authority, unresolved
   P0/P1, overlapping recovery owner or unpracticed rollback step, when the
   candidate is validated, then it fails before any network access.
2. Given both admitted read-only RPCs, when current finalized code,
   configuration and deployment receipts are observed, then both providers
   agree with the M2A-008 Evidence and no transaction primitive exists.
3. Given duplicate, reordered and invalidated observations plus process
   restart, when the drill replays, then one finalized event maps once and the
   restored projection hash is identical.
4. Given RPC disagreement, stale/invalid oracle state, reorg uncertainty or
   reconciliation drift, when evaluated, then Borrow/new risk/release denies
   while protective repayment remains available where the Pool matrix allows.
5. Given a subsequent fresh two-provider zero-discrepancy read, when recovery
   is proposed, then one approval cannot unfreeze; only two distinct named
   recovery-owner approval hashes can create the local recovery transition.
6. Given PostgreSQL restart/restore/replay, when the exact migration set is
   applied, then Tenant/RLS, projections, Evidence and outbox truth survive
   without duplicate economic state or secret material in the report.
7. Given the exact candidate runtime, when Human, Capital Partner and Risk use
   visible controls, then current state and safe next action remain truthful;
   no hidden ID, fake completion or chain submission appears.
8. Given every required gate passes with no unresolved P0/P1, when the release
   report is generated, then it binds the exact commit and may claim only the
   Base Sepolia test-assets/local-product states actually evidenced.

## Test commands

```text
pnpm run test:m2a009
pnpm run testnet:m2a009:recovery:read-only
pnpm run test:indexer:reorg
pnpm run test:postgres
pnpm run test:security
pnpm run test:transport
pnpm run test:browser:click-path
pnpm run testnet:m2a008:fork:dry-run
pnpm run check
git diff --check
```

The live recovery command is read-only. It may use public clients and contract
reads only; a wallet client, private-key read, signing method, transaction
preparation or broadcast primitive is release-blocking.

## Security checklist

- [x] Scope explicitly prohibits another transaction and signer use.
- [x] Mainnet, real funds, production Human lending and Agent writes remain
  false.
- [x] Candidate schema is closed, canonical and rejects authority expansion.
- [x] Recovery runner is mechanically read-only and verified by source tests.
- [x] RPC/oracle/reorg/reconciliation failures freeze new risk monotonically.
- [x] Dual-control recovery rejects duplicate or overlapping owners.
- [x] PostgreSQL restore/replay preserves forced RLS and exact Evidence.
- [x] No raw PII, credentials, private keys, signatures or database secrets
  enter artifacts or logs.
- [x] Exact candidate automated browser and composite repository gates pass.
- [x] Rollback profile is practiced and leaves the product truthfully disabled.
- [x] Exact candidate Founder-signed visible-click acceptance is complete.
- [x] Founder-accepted offline independent engineering review is complete.
- [x] PR, merge SHA and post-merge CI Evidence exist.

## Permission boundary

Founder authorization to continue the ordered M2 plan permits this issue's
read-only chain verification, local deterministic recovery drills, schema,
tests, documentation and local candidate runtime. It does not authorize an
onchain pause/unpause, new deployment, signer access, remote/public production
deployment, mainnet, real value, custody, KYC or external Agent action. Any such
step requires a new named review at action time.

## Data and migration impact

The preferred implementation adds no migration. It validates the current 65
migrations and uses isolated test databases for destructive restore/replay
drills. If a durable recovery record gap is discovered, only an additive
migration with forced RLS, tested rollback before live Evidence and separate
review may be proposed.

## Rollback plan

Keep the exact Pool profile enabled only as historical deployed-testnet truth,
freeze local new-risk admission, stop ingestion, preserve all chain/Event/
Evidence history, rebuild projections from finalized authenticated logs and
require two-provider zero-discrepancy plus dual control before local recovery.
If candidate validation fails, do not alter the onchain contracts; withdraw the
v0.2.0 candidate claim and remain on the M2A-008 verified baseline.

## Required Evidence

- canonical candidate manifest and schema-validation receipt;
- exact Git SHA and clean-tree receipt;
- two-RPC finalized code/config/receipt observations;
- provider/oracle/reorg/restart/replay/freeze/recovery drill receipts;
- PostgreSQL restore/replay and migration receipt;
- complete test inventory and no-P0/P1 statement;
- exact-runtime Human/Capital Partner/Risk visible-click acceptance;
- rollback manifest and explicit excluded-authority list; and
- clickable local product URL kept alive for Founder review.

## Sequencing

M2A-009 closes M2A and produces the v0.2.0 review candidate. M2B-001 must not
start until this candidate is independently reviewed and accepted. M2A-009
completion grants no M2B signer, venue, transaction or real-value authority.

## Completion Evidence

Engineering candidate `25921f008f260d2d8a39524603cd1a6f2512fd63` binds the
manifest, two-RPC live read, recovery drills, PostgreSQL 90/90, browser 8/8,
fork 2/2, aggregate 1173/1173 and exact local runtime identity. Two defects
found by the gates were repaired with regression protection: shared-database
downgrade interference and pruned historical RPC state.

The prior Human session was correctly invalidated after the exact image
rebuild. The Founder re-signed and visibly refreshed/reviewed the Pool action;
that gate is recorded in
`docs/codex/audits/M2A-009/founder-visible-acceptance-and-review-attestation.md`.
The Founder confirmed an independently participating engineer reviewed the
candidate offline, accepted responsibility for the bounded review and waived
public identity/report publication. PR #53 merged as
`ad5cce4c3477cb5732f4601d892e13e223382abe`; post-merge CI, exact OCI rebuild,
local acceptance and signed visible-click recheck passed. The bounded verdict
is `PASS — DEPLOYED AND USER-VERIFIED`.
