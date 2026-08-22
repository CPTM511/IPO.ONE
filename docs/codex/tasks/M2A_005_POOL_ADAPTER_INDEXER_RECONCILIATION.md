# M2A-005 — pool adapter, indexer and direct-state reconciliation

Status: `LOCALLY VERIFIED — L0_LOCAL_NO_FUNDS`

Remote `main` baseline: `7678314e002444c4df6f0ca8005d18a9ddd00f19`

Baseline tree: `336ca61a849d8f56ffaf4256ddf769f0e5dad856`

Branch: `codex/m2a-005-pool-indexer-reconciliation`

Requirements: `REQ-POOL-EVID-001`, `REQ-POOL-EVID-002`,
`REQ-POOL-EVID-003`, `REQ-POOL-EVID-004`, `REQ-CHAIN-002`,
`REQ-EVID-001`, `REQ-EVID-002`, `REQ-EVID-003`, and `REQ-RISK-002`

## Context

Product Constitution v1.3, ADR-M2-003 and the merged M2A-003/M2A-004 pool
contracts establish a split source of truth: the contract owns pool economic
state, the shared kernel owns authorization and Obligation projection, and the
adapter/indexer owns observation, finality and discrepancy history. The current
repository has generic sandbox payment indexing and read-only Registry
observation, but it does not yet have a closed Pool V1 event admission surface,
block-hash-aware cursor, durable reorg history or direct-state reconciliation
that freezes new off-chain risk when chain and projection disagree.

Named human review: after M2A-004 merged and the assistant restated that the
next issue would remain local, synthetic and no-funds, the IPO.ONE Founder
directed “同意，启动M2A-005” on 2026-08-22. This authorizes implementation and
testing only for the exact L0 scope below. It is not approval of a provider,
RPC call, signer, transaction, deployment, public endpoint, mainnet or value
movement.

## Scope

- Admit only the checked-in `IpoOneSecuredPoolV1` contract version, configured
  chain/contract and the 13 closed Pool V1 event signatures.
- Normalize one admitted log to one immutable IPO.ONE pool event identified by
  `(chainId, contractAddress, transactionHash, logIndex)` and bound to block
  number/hash, ABI version, market and finality.
- Persist raw-free normalized observations before projection, with monotonic
  `included -> safe -> finalized` transitions and append-only invalidation of
  non-final observations when a block hash is replaced.
- Track an append-only block cursor/checkpoint history that detects reordered
  input, duplicate delivery and non-final reorgs without deleting prior facts.
- Project finalized events exactly once into a deterministic Pool V1 state and
  emit hash-only Evidence/outbox facts in the same durable unit of work.
- Rebuild projections exactly from admitted history after process restart or
  database restore.
- Reconcile the finalized projection against two independently supplied,
  normalized direct-read snapshots. Any provider disagreement, incomplete
  read, or chain/projection mismatch records reason-coded additive Evidence and
  freezes new off-chain risk for the market.
- Preserve protective operations while frozen and require a later two-provider
  zero-discrepancy run plus an explicitly approved recovery record before new
  risk can resume.
- Add additive PostgreSQL storage, RLS, immutability/transition guards and
  deterministic unit/PostgreSQL tests. All provider inputs are local fixtures;
  this issue makes no network call.

## Non-goals

- Live RPC, provider URL/account/credential selection, wallet, signer,
  transaction, Base Sepolia/testnet call, contract deployment/verification,
  hosting, public access, mainnet or real assets/funds.
- Changing the merged pool ABI, bytecode, accounting, oracle, rate,
  liquidation, pause or authority semantics.
- Letting an off-chain projection overwrite or repair on-chain state, accepting
  caller-defined ABI/events, persisting raw provider payloads, or treating a
  submitted/included/safe log as finalized Evidence.
- Production risk automation, recovery authorization policy, operator UI,
  OpenAPI, SDK, MCP or user-facing product workflow changes.
- Multi-market discovery, dynamic contract registration, historical backfill
  service, provider retry scheduler, dead-letter operator workflow or hosted
  worker deployment.

## Likely files

- `modules/chain-adapter/src/secured-pool-v1-adapter.js`
- `modules/chain-adapter/src/index.js`
- `modules/chain-adapter/test/secured-pool-v1-adapter.test.js`
- `modules/event-indexer/src/pool-event-indexer.js`
- `modules/event-indexer/src/pool-observation-store.js`
- `modules/event-indexer/src/index.js`
- `modules/event-indexer/test/pool-event-indexer.test.js`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `modules/persistence/test-postgres/postgres-pool-indexer.test.mjs`
- `db/migrations/0064_pool_chain_reconciliation.up.sql`
- `db/migrations/0064_pool_chain_reconciliation.down.sql`
- `scripts/check-migrations.mjs`
- `package.json`
- `modules/chain-adapter/README.md`
- `modules/event-indexer/README.md`
- `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`
- `docs/traceability/IPO_ONE_M2_REQUIREMENT_TRACEABILITY_v0.1.md`
- this issue record

## Acceptance criteria

1. Given configured Pool V1 chain, address, ABI version and market, when a log
   arrives, then exactly one closed event is decoded and normalized; unknown
   topic, wrong emitter/chain/market, malformed values, extra raw/provider
   fields or identity drift fails closed before persistence.
2. Given duplicate or reordered deliveries, when observations are ingested,
   then the tuple identity maps once, finality advances monotonically, finalized
   projection occurs once and replay produces an identical state hash.
3. Given a non-final block replacement, when the canonical block hash changes,
   then prior observations are invalidated additively and replacements can be
   admitted; a post-finality replacement or finality regression fails closed.
4. Given a process restart, worker replay or database restore, when history is
   replayed, then cursor, observations, projection and outbox identities are
   identical with no duplicate economic effect.
5. Given two complete direct reads that agree with the finalized projection,
   when reconciliation runs, then a zero-discrepancy Evidence record is added;
   given provider disagreement, incomplete data or any economic mismatch, then
   reason-coded discrepancy Evidence is added and new off-chain risk freezes.
6. Given a frozen market, when protective work is queried, then repay,
   collateral-addition and valid liquidation remain allowed while supply,
   withdraw, collateral release and borrow remain denied. Resume requires a
   later agreeing zero-discrepancy run and an explicit approved recovery record.
7. Given concurrent duplicate ingestion/reconciliation across tenants, when
   PostgreSQL constraints and RLS apply, then one tenant cannot observe or
   mutate another, append-only facts cannot be rewritten/deleted, and one
   identity/effect/outbox record is committed exactly once.

## Exact test commands

```text
pnpm install --frozen-lockfile
node --test modules/chain-adapter/test/secured-pool-v1-adapter.test.js
node --test modules/event-indexer/test/pool-event-indexer.test.js
pnpm run test:indexer:reorg
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/ipo_one_test pnpm run test:postgres
pnpm run check:migrations
pnpm run lint
pnpm run typecheck
pnpm test
pnpm audit --prod
git diff --check
```

Focused adapter/indexer/reorg suites must run twice. PostgreSQL must cover RLS,
append-only guards, duplicate/concurrent admission, freeze/recovery and restore
replay. Browser behavior is unchanged, so real-browser verification checks the
existing local Human-to-Agent discoverable journey and truthful no-funds copy;
it is not evidence that this backend slice is deployed.

## Security checklist

- [x] Closed chain, emitter, ABI, topic, market and tuple identity admission.
- [x] No raw log/provider payload, URL, secret, account, signature or PII is
      persisted or emitted.
- [x] Observation is durable before projection; finality is monotonic and only
      finalized events can produce canonical projected effects.
- [x] Non-final reorgs add invalidation facts; history is never deleted or
      silently rewritten; finalized replacements fail closed.
- [x] Tuple, effect, cursor and outbox idempotency survive duplicates,
      concurrency, restart, replay and restore.
- [x] Direct-read comparison requires two complete independent normalized
      snapshots and zero economic tolerance except exact formula outputs.
- [x] Any disagreement or mismatch freezes new risk and adds reason-coded
      Evidence; off-chain state never overwrites contract truth.
- [x] Freeze narrows authority while explicitly preserving protective
      operations; resume is separate, approved and evidenced.
- [x] PostgreSQL RLS/tenant guards and append-only/transition triggers fail
      closed under a non-bypass application role.
- [x] No network, RPC, signer, transaction, deployment, custody or real-value
      path is introduced or invoked.

The minimal architecture is one pure closed decoder and one deterministic
indexer/reconciler over explicit store boundaries. This keeps untrusted EVM
shape validation out of persistence, keeps replayable lifecycle logic out of
SQL, and lets PostgreSQL enforce tenant isolation, uniqueness and append-only
durability. A hosted reader/worker or provider client would expand permissions
and is deliberately excluded.

## Permission boundary

Authorized mode: `L0_LOCAL_NO_FUNDS` source, additive local migration and
deterministic fixture execution only. Permission/funds/deployment impact:
**none**. The Founder review above grants no provider, URL, account, credential,
RPC, signer, transaction, testnet, deployment, public-access, mainnet,
real-value, custody, commercial-risk or production authority.

## Data, migration and rollback

Migration `0064` is additive and introduces tenant-scoped pool observation,
cursor, projection, outbox, reconciliation, discrepancy and risk-control
records. Chain observations, invalidations, finalized effects, reconciliation
results and recovery receipts are append-only; mutable risk state is guarded by
allowed transitions and every transition has a receipt.

The down migration is permitted only before any Pool V1 observation,
projection, outbox, reconciliation or risk-control evidence exists. After any
fact exists, rollback means stop ingestion, preserve all observations and
Evidence, revert application routing to the prior reader, and rebuild a new
projection from immutable history. It must not delete or rewrite chain facts.

## Required completion Evidence

- closed ABI/topic identity list and positive/negative decoder results;
- two identical focused duplicate/reorder/reorg/finality/replay runs;
- deterministic event-to-projection vectors for all admitted Pool V1 events;
- two-read agreement, disagreement, incomplete-read, mismatch, freeze,
  protective-operation and approved-recovery results;
- PostgreSQL RLS, immutability, concurrency/idempotency and restore evidence;
- full migration, lint, typecheck, unit and production-dependency audit output;
- exact changed-file, privilege-surface and permission-boundary review;
- one issue-sized PR with required remote checks passing before merge; and
- a still-working local IPO.ONE Human and Agent experience link, while
  truthfully stating this backend slice has no new user-facing runtime surface.

Dependencies: merged M2A-003 and M2A-004, ratified Constitution v1.3, accepted
ADR-M2-003 and admitted local M2A-002 toolchain. M2A-006 and every live reader,
testnet or deployment step remain separately gated.

## Completion Evidence

- The checked-in Pool V1 adapter admits exactly 13 event topics for one
  configured CAIP-2 chain, lowercase contract address, market ID and immutable
  ABI version. Negative tests reject a wrong chain/emitter/market, unknown
  topic, malformed encoding, zero-confirmation input and open provider fields.
- Focused adapter/indexer/reorg verification passes 15/15 in repeated runs.
  Every admitted event has a deterministic projection rule; duplicate and
  delayed duplicate delivery creates one effect, safe observations may arrive
  out of order, non-final block replacement appends invalidation, and a
  finalized replacement fails closed.
- The local projection reproduces the exact state/snapshot hash after restart.
  Two complete agreeing direct reads pass; incomplete reads, provider
  disagreement and matching-provider projection mismatch produce distinct
  reason codes and additive Evidence.
- A discrepancy blocks supply, withdrawal, collateral release and borrow while
  repay, collateral addition and valid liquidation remain available. A later
  zero-discrepancy run does not auto-resume; hash-bound approval and reviewer
  bindings create a separate recovery Evidence and risk transition.
- Additive migration `0064` passes ordered up/down validation. Its nine tables
  use forced RLS, tenant write guards, append-only triggers, unique tuple/effect
  identities and resolvable risk-control transition foreign keys. The down
  migration refuses to delete any existing observation, projection,
  reconciliation or risk Evidence.
- PostgreSQL 17 verification passes 89/89 against a fresh isolated database.
  Two independent indexers race the same finalized log and commit exactly one
  observation/effect/outbox; Tenant isolation, raw-free persistence,
  immutability, restart restore, discrepancy freeze and approved recovery all
  pass under a non-owner, non-bypass application role.
- The complete repository `pnpm run check` passes: runtime and boundary lint,
  136 schemas, 21 OpenAPI operations, 64 migration pairs, 103 Tenant protocol
  operations, security/transport/deployment/launch gates, 25/25 Foundry tests,
  web bundle integrity and 1,122/1,122 unit tests. Production dependency audit
  reports no known vulnerabilities and `git diff --check` passes.
- A headed real browser opened `http://127.0.0.1:8787/`, verified the visible
  “No-funds product sandbox” boundary, clicked the visible Agent Workspace
  control, and reached `http://127.0.0.1:8788/#agent-console` with the same
  safety boundary. Both loopback experiences still return HTTP 200. This issue
  intentionally adds no new user-facing runtime surface.
- Source/permission inspection finds no provider client, RPC URL, fetch,
  private key, signer, broadcast, wallet transaction, deployment, mainnet,
  custody, PII or real-funds path. No network call, RPC, signer, transaction,
  contract deployment or external-system mutation occurred.
- Evidence state for this issue is `CODE=YES` and deterministic local
  `RUNTIME/VERIFIED=YES`; `DEPLOYED=NO`, `REACHABLE=NO` for the new backend
  capability, and `USER VERIFIED=NO`. Therefore the overall M2 product verdict
  remains `BLOCKED — NOT COMPLETE` despite this issue being locally verified.
