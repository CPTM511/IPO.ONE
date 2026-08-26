# M2 execution plan v0.1

Status: Phase 0 proposal prepared; M2A/M2B blocked on ratification

Base: `71786a3c72237320f7bacf77b64496dd1a0c526f`

## Authority and invariant envelope

No issue may begin from this backlog alone. It needs an active issue document
and the permissions named below. Every issue preserves one shared Human/Agent
kernel, secured-only M2, one market, no factory, no mainnet/real funds, no
unsecured fallback, off-chain sensitive data, deterministic policy, exact
Evidence states and fail-closed stale/unknown/unreconciled behavior.

Every active issue must copy these fields and replace placeholders with exact
values: Context/current SHA; Scope; Non-goals; likely files; Given/When/Then
acceptance; exact test commands; security checklist; permission boundary; data
and migration impact; rollback; required Evidence; dependencies; status.

## Dependency graph

```text
M2-000 -> M2-001 -> {M2-002, M2-003, M2-004, M2-005, M2-006, M2-007}
{M2-002..007} -> M2-008 -> Founder ratification

ratification -> M2A-001 -> M2A-002 -> M2A-003 -> M2A-004
M2A-003 + M2A-004 -> M2A-005 -> M2A-006 -> M2A-007
M2A-003..007 -> M2A-008 -> M2A-009 -> v0.2.0 review

v0.2.0 review -> M2B-001 -> M2B-002 -> M2B-003 -> M2B-004 -> M2B-005
```

No node represents “implement all M2.” Each node must be reviewable and
revertible without inventing permission for its successor.

## Phase 0 — documentation only

### M2-000 — exact baseline checkpoint

- Context: required SHA and dirty primary checkout must be reconciled safely.
- Scope/files: create
  `docs/codex/checkpoints/M2_PREDEVELOPMENT_BASELINE_2026_08_21.md` from an
  isolated exact-baseline worktree.
- Non-goals: runtime, dependency, schema, policy, deployment or evidence-state
  upgrades.
- Acceptance: Given `origin/main`, when inspected, then SHA/tree/migrations/
  contracts/policy/check results and worktree drift are exact and cited.
- Tests: `git rev-parse HEAD HEAD^{tree}`; `git status --short`;
  `node scripts/check-migrations.mjs`; `node scripts/check-launch-policy.mjs`.
- Security/permission: do not touch pre-existing untracked material; no network
  writes/signers. Migration impact: none. Rollback: delete only this new doc.
- Evidence/dependency/status: checkpoint doc; no dependency; prepared.

### M2-001 — exact-state gap audit and traceability

- Context: similarly named synthetic features must not be mistaken for a pool.
- Scope/files: code-level audit and
  `docs/traceability/IPO_ONE_M2_REQUIREMENT_TRACEABILITY_v0.1.md`.
- Non-goals: status elevation from names, fixtures or historical artifacts.
- Acceptance: Given each proposed capability, when audited, then all eight
  maturity states, current code, exact gap, owner, dependency and evidence are
  explicit.
- Tests: `git grep` audit; `node scripts/check-product-traceability.mjs` when
  dependencies are available; manual ID/row reconciliation.
- Security/permission: preserve privacy/runtime claims. Migration: none.
  Rollback: remove proposal. Evidence: matrix and baseline citations.
- Dependency/status: M2-000; prepared (aggregate check currently blocked by
  missing local `ajv`, with no dependency installation authorized).

### M2-002 — Constitution v1.3 proposal

- Context: v1.2 prohibits public LP/vault capability.
- Scope/files: exact proposal in
  `docs/governance/PRODUCT_CONSTITUTION_V1_3_M2_PROPOSED_DIFF.md`.
- Non-goals: editing/ratifying Constitution or enabling runtime.
- Acceptance: Given v1.2 IDs, when diff reviewed, then no ID is silently reused;
  one bounded testnet exception and v1.2->v1.3 crosswalk are explicit.
- Tests: manual registry uniqueness/crosswalk review; future
  `pnpm run check:product-traceability` after ratification.
- Security/permission: Founder/Governance approval required. Migration: none
  now; future registry migration additive. Rollback: reject proposal.
- Evidence/dependency/status: proposed diff; M2-001; prepared.

### M2-003 — launch-policy proposal

- Context: no L3 secured-pool profile exists.
- Scope/files: disabled exact-profile proposal in
  `docs/deployment/LAUNCH_POLICY_M2_TESTNET_PROPOSED_CHANGE.md`.
- Non-goals: edit policy, Vercel, contracts, accounts or `releaseEnabled`.
- Acceptance: Given missing/stale/mismatched fields, when validated, then the
  proposed profile fails closed; real funds/mainnet/Agent venue writes remain
  false.
- Tests: future schema fixture tests plus `pnpm run check:launch-policy`.
- Security/permission: exact Founder/Release/Security/Risk owners; no self-
  enabling Evidence. Migration: policy schema/version proposal only. Rollback:
  keep profile absent/disabled. Evidence: reviewed JSON and gates.
- Dependency/status: M2-001; prepared.

### M2-004 — pool/kernel and secured-only ADRs

- Context: the pool must not fork canonical economic/identity truth.
- Scope/files: ADR-M2-001, ADR-M2-002 and ADR-M2-003.
- Non-goals: contract decomposition code or runtime adapter.
- Acceptance: Given a pool fact/discrepancy, when classified, then authority,
  event identity, finality, fail-closed response and recovery owner are unique.
- Tests: architecture review against ADR-009/010/016/029/034-039.
- Security/permission: no silent repair or unsecured residual. Migration: none.
  Rollback: retain v1.2 boundary. Evidence: accepted ADR review.
- Dependency/status: M2-001; prepared.

### M2-005 — toolchain/math/upgradeability ADR

- Context: Node `solc` tests lack stateful pool invariants.
- Scope/files: ADR-M2-004 and ADR-M2-005.
- Non-goals: install Foundry/OpenZeppelin or create contract files.
- Acceptance: Given candidate versions/formulas, when reviewed, then exact pins,
  licenses, provenance, rounding, invariants and vectors are reproducible.
- Tests: document vector recomputation and dependency-source verification.
- Security/permission: dependency and license human approval. Migration: none.
  Rollback: retain Node toolchain. Evidence: accepted ADRs.
- Dependency/status: M2-001; prepared.

### M2-006 — oracle/rate/liquidation architecture

- Context: no current oracle, rate index, liquidation or bad-debt accounting.
- Scope/files: ADR-M2-005 formulas, fixture parameters and vectors.
- Non-goals: select commercial pricing or silently admit a live feed.
- Acceptance: Given each boundary vector, when independently calculated, then
  results and rounding match; stale/deviation behavior is fail closed.
- Tests: reference spreadsheet/script in future M2A-001; peer calculation.
- Security/permission: exact live feed and risk values remain separate approval.
  Migration: none. Rollback: no pool. Evidence: reviewed vectors.
- Dependency/status: M2-001; prepared.

### M2-007 — threat model and license gate

- Context: public calls and reusable code add attack/supply-chain/license risk.
- Scope/files: M2 threat model and `LICENSE_DECISION_REQUIRED.md`.
- Non-goals: claim independent audit, add license or copy Aave.
- Acceptance: Given each trust boundary, when reviewed, then control, residual
  risk and executable evidence are named; license remains a Founder/legal gate.
- Tests: threat-to-test traceability review; secret/PII scan of diff.
- Security/permission: independent review required before real value. Migration:
  none. Rollback: retain existing closed scope. Evidence: signed reviews later.
- Dependency/status: M2-001; prepared.

### M2-008 — consolidated execution backlog and Founder gate

- Context: implementation must remain issue-sized.
- Scope/files: this plan and alignment guide; consolidate exact decisions.
- Non-goals: merge governance or start M2A.
- Acceptance: Given Phase 0 set, when reviewed, then every issue has scope,
  negative path, tests, permission, migration, rollback and dependency.
- Tests: link/path check, `git diff --check`, documentation review.
- Security/permission: Founder ratification required. Migration: none. Rollback:
  close proposal. Evidence: one docs-only PR and review disposition.
- Dependency/status: M2-002..007; prepared.

## M2A — public secured pool core

### M2A-001 — deterministic pool reference model

- Context/scope: translate ADR-M2-005 into a pure BigInt model for cash, shares,
  debt, accrual, health, liquidation, reserves and bad debt; likely
  `packages/domain/src/secured-pool-reference-model.js` and unit tests.
- Non-goals: Solidity, database, UI, chain calls or commercial values.
- Acceptance: Given all ADR vectors and randomized action sequences, when run,
  then conservation, rounding bounds, monotonic debt and forbidden actions hold.
- Tests: `node --test packages/domain/test/secured-pool-reference-model.test.js`.
- Security/permission: closed inputs, bounded integers/time; L0 only. Migration:
  none. Rollback: remove isolated model. Evidence: vector/fuzz seed corpus.
- Dependency/status: ratified M2-005/006; pure BigInt reference model,
  native-unit vectors, negative matrix and deterministic seed corpus are
  implemented and locally verified at `L0_LOCAL_NO_FUNDS`. No contract or
  runtime authority is implied.

### M2A-002 — contract toolchain and dependency admission

- Context/scope: add exact reviewed Foundry, forge-std and OpenZeppelin pins,
  manifests/checksums/licenses, CI build; likely `foundry.toml`, lock/remapping,
  contract test directories and CI scripts.
- Non-goals: pool economic implementation or deployment.
- Acceptance: Given clean checkout, when build/test runs twice, then compiler,
  ABI and bytecode outputs match and no floating dependency exists.
- Tests: `forge --version`; `forge build --sizes`; `forge test`; existing Node
  contract tests; supply-chain verification script.
- Security/permission: named dependency/license approval first. Migration: lock
  files/tool manifests only. Rollback: revert pins/config. Evidence: hashes,
  SBOM/notices and reproducible outputs.
- Dependency/status: Founder-approved sequencing exception allows the isolated
  toolchain gate before M2A-001. License decision and dependency admission are
  completed; M2A-001 remains the prerequisite for economic contract work.

### M2A-003 — single-market pool contracts

- Context/scope: implement immutable market identity, supply/withdraw, share/debt
  accounting, collateral, borrow/repay, caps, pause and events; likely
  `contracts/src/m2/*`, Foundry tests and ABI fixtures.
- Non-goals: oracle-specific source, liquidation, adapter/UI, factory/proxy,
  flash loan, multi-asset or deployment.
- Acceptance: Given standard test tokens, when action sequences execute, then
  all pool/accounting invariants match M2A-001 and unauthorized/invalid actions
  revert atomically.
- Tests: `forge test --match-path 'contracts/test/m2/*'`; invariant depth/runs
  pinned in `foundry.toml`; Node ABI parity tests.
- Security/permission: no arbitrary transfer/admin drain; dependency approval.
  Migration: none. Rollback: remove un-deployed contract version. Evidence:
  coverage, invariant seeds, ABI/bytecode hashes.
- Dependency/status: M2A-001 and M2A-002; the immutable single-market custody,
  share/debt accounting, collateral, borrow/repay, cap, pause and event core is
  implemented and locally verified at `L0_LOCAL_NO_FUNDS`. Live-oracle source,
  rate accrual, liquidation, bad debt, adapter/UI and deployment remain outside
  this issue and unapproved.

### M2A-004 — oracle, rate and liquidation contracts

- Context/scope: implement reviewed oracle adapter, kink accrual, health,
  close-factor liquidation, reserves/bad debt and adversarial harnesses.
- Non-goals: choose commercial parameters or deploy a feed.
- Acceptance: Given stale/invalid/deviating prices and price shocks, when actions
  execute, then new risk/release/seizure fails safely and valid liquidation
  matches reference formulas exactly.
- Tests: focused unit/fuzz/invariants for oracle, time, rounding, competing
  liquidators, non-standard tokens and insolvency.
- Security/permission: live source/address and fixture values require Security/
  Risk approval before L3. Migration: none. Rollback: pause and replace
  un-deployed version. Evidence: differential and adversarial reports.
- Dependency/status: M2A-003 is merged. The immutable oracle adapter,
  deviation halt/recovery, kink-rate accrual, liquidation health/close factor,
  explicit reserve/bad-debt recognition and recovery are implemented and
  locally verified at `L0_LOCAL_NO_FUNDS`. No live feed, deployment, asset,
  commercial parameter, signer, RPC or transaction is selected or approved.

### M2A-005 — pool adapter, indexer and reconciliation

- Context/scope: closed ABI normalization, finality/reorg cursor, direct-read
  reconciliation and discrepancy freeze; likely `modules/chain-adapter/`,
  `modules/event-indexer/`, persistence and additive migrations.
- Non-goals: signer/broadcast/deployment or fabricate pool state.
- Acceptance: Given duplicates, reordered logs, reorg, RPC disagreement,
  restart/restore, when replayed, then one finalized event maps once and any
  mismatch blocks new risk with additive Evidence.
- Tests: chain/indexer unit; PostgreSQL RLS/idempotency/concurrency/replay;
  `pnpm run test:indexer:reorg` plus exact new tests.
- Security/permission: read-only L0 fixtures; live RPC separately gated.
  Migration: additive pool observation/projection tables with tested down only
  before Evidence exists. Rollback: stop ingestion, preserve observations and
  rebuild. Evidence: state hashes and discrepancy drill.
- Dependency/status: M2A-003/004 are merged. The closed Pool V1 decoder,
  tuple/finality/reorg history, canonical local projection, two-read direct
  reconciliation, discrepancy freeze, approved recovery record and forced-RLS
  additive persistence are implemented and locally verified at
  `L0_LOCAL_NO_FUNDS`. No provider, RPC, signer, transaction, deployment,
  public endpoint or real value is selected or approved.

### M2A-006 — canonical Obligation/Evidence integration

- Context/scope: bind self-Principal wallet/position to one Obligation and map
  finalized pool effects through Tenant Gateway/Ledger/Evidence/Credit State.
- Non-goals: second Ledger, browser truth or Credit State-based limit increase.
- Acceptance: Given direct wallet and authenticated journeys, when finalized
  events arrive, then one Obligation projection survives restart/replay and
  reorged/pending effects never finalize.
- Tests: protocol conformance, PostgreSQL RLS/atomicity/restart, parity and
  negative wrong-Subject/wrong-chain tests.
- Security/permission: exact AccountBinding and no PII onchain. Migration:
  additive bindings/projections. Rollback: disable adapter, preserve chain
  Evidence and rebuild projections. Evidence: linked receipts/state hashes.
- Dependency/status: M2A-005 merged at `6f4a1e0`; M2A-006 implemented and
  locally verified at `L0_LOCAL_NO_FUNDS`. It adds no provider, RPC, signer,
  transaction, deployment, public endpoint or real-value authority.

### M2A-007 — LP, Human and Risk/Ops surfaces

- Context/scope: server-derived workspaces and API/SDK parity for LP supply/
  withdraw, Human secured borrow/repay/release and Risk/Ops solvency/oracle/
  liquidation/discrepancy; likely Web feature modules, Tenant protocol, SDK/MCP.
- Non-goals: internal-ID workflows, fake success, unrelated redesign or Agent
  venue execution.
- Acceptance: Given authenticated users, when visible controls are used, then
  transaction review shows exact chain/contract/amount/health; pending/final/
  failed/unknown states are truthful; refresh/relogin/restart restore next action.
- Tests: unit/conformance/security/PostgreSQL and Playwright happy, denial,
  price-shock, recovery, keyboard/focus/zoom/mobile tests.
- Security/permission: real wallet only at separately deployed L3 candidate;
  no hidden mutation. Migration: queries may require additive projections.
  Rollback: feature gate off with truthful disabled state. Evidence: deployed
  SHA visible-click captures and queryable receipts.
- Dependency/status: M2A-006 local kernel integration is complete; M2A-007 is
  implemented and locally verified at `L0_LOCAL_NO_FUNDS`. Human/LP review,
  aggregate Risk/Ops read, and Agent SDK/MCP read/review share one closed
  protocol family; transaction submission remains absent and M2A-008 remains
  the separately approved deployment issue.

### M2A-008 — exact Base Sepolia deployment

- Context/scope: one approved deployment of exact contracts/assets/oracle/
  accounts/caps, source verification and indexer bootstrap.
- Non-goals: mainnet, real funds, multiple markets, Agent venue writes or
  production/Vercel changes outside the named profile.
- Acceptance: Given one-use approval and preflight, when deployed, then bytecode/
  config/roles match candidate; test assets only; finality and zero-discrepancy
  reconciliation recorded.
- Tests: dry-run fork, exact preflight, Foundry/Node gates, contract reads,
  independent RPC observations and browser acceptance against deployed SHA.
- Security/permission: explicit Founder/Release/Security/Risk approval, signer
  lifecycle and destruction; no reused signer. Migration: approved DB migration
  set only. Rollback: pause, disable profile, reconcile, preserve Evidence.
  Evidence: contracts, txs, configs, hashes, finality and owner sign-off.
- Dependency/status: M2A-003..007 are merged. The exact-decision schema,
  five-stage testnet gate policy, dual-RPC dependency inspection and Base
  Sepolia fork dry run were implemented and locally verified. The bounded
  Base Sepolia test-assets Pool and Adapter were subsequently deployed,
  source-verified, finalized, reconciled and accepted through visible Human,
  Capital Partner and Risk product paths in PR #52. Every one-use signer was
  destroyed. M2A-008 is `PASS — DEPLOYED AND USER-VERIFIED` only for that exact
  L3 test-assets and local-product boundary; it grants no mainnet, real-value,
  public-production or M2B authority.

### M2A-009 — recovery and v0.2.0 candidate

- Context/scope: reorg/RPC/oracle/indexer/process/database recovery, pause/unpause
  governance, rollback manifest and exact release report.
- Non-goals: fix defects only in prose, real-value promotion or unresolved P0/P1.
- Acceptance: Given each failure, when drilled, then new risk freezes, protective
  actions behave per matrix, state recovers from authoritative truth and browser
  journey passes on exact deployed SHA.
- Tests: complete repository gate, restore/replay, chaos drills, browser/a11y,
  independent security review.
- Security/permission: named recovery owners and dual control. Migration: exact
  manifest. Rollback: practiced disabled profile. Evidence: candidate bundle.
- Dependency/status: M2A-008 is complete. The exact M2A-009 engineering
  candidate at `25921f008f260d2d8a39524603cd1a6f2512fd63` passes recovery,
  two-RPC read-only, PostgreSQL 90/90, browser 8/8, fork 2/2 and aggregate
  1173/1173 gates. Exact-SHA Founder re-sign/visible-click verification is now
  complete. The Founder accepted the offline review performed with an
  independently participating engineer and waived public identity/report
  publication for this exact M2A boundary. PR #53, post-merge CI, exact OCI
  rebuild and signed visible-click recheck passed at
  `ad5cce4c3477cb5732f4601d892e13e223382abe`. M2A-009 and the bounded v0.2.0
  review are `PASS — DEPLOYED AND USER-VERIFIED`; M2B-001 is unlocked at L0.

## M2B — Principal-bound Hyperliquid Agent execution

### M2B-001 — Agent/Principal secured-Facility authorization

- Context/scope: bind existing Subject/Principal/Mandate/AccountBinding to one
  pool-backed Facility and exact Agent operation family.
- Non-goals: new kernel, Agent custody, self-expanding authority or live venue.
- Acceptance: unauthorized, expired, revoked, replayed, wrong-account/Facility
  requests deny before nonce/signing; Human and Agent share Obligation truth.
- Tests: protocol/SDK/MCP, RLS, revocation/replay/restart and parity tests.
- Security/permission: L0 only until exact M2B profile. Migration: additive
  binding. Rollback: revoke grant, preserve Evidence. Dependency: v0.2.0 review.
- Dependency/status: v0.2.0 bounded review passed. M2B-001 issue contract is
  active on `codex/m2b-001-facility-authorization`; implementation is limited
  to L0 no-funds authorization and contains no venue submission or signer.

### M2B-002 — bounded Hyperliquid Testnet composition

- Context/scope: reuse ADR-035/038/039 exact approval, JIT preflight, nonce and
  venue adapters for one testnet Facility/account/market.
- Non-goals: withdrawal/transfer, mainnet, extra venue leverage, arbitrary
  action, signer reuse or strategy code.
- Acceptance: exact approved order/cancel/reduce-only path records one outcome;
  ambiguity becomes `UNKNOWN` without resend; unauthorized shapes fail closed.
- Tests: existing HyperCore/Hyperliquid suites plus exact external conformance.
- Security/permission: one-use Founder approval, signer lifecycle/destruction,
  no credentials in DB/Evidence. Migration: reuse/additive receipts. Rollback:
  cancel/flatten, retire signer, reconcile. Dependency: M2B-001.
- Dependency/status: M2B-002 local composition is implemented at exact baseline
  `944f344196f6a63a86ba817d750d466b09887142`; external venue execution remains
  `BLOCKED — NOT COMPLETE`. M2B-003 local L0 work is unlocked only on the
  stacked branch and inherits every M2B-002 external STOP condition.

### M2B-003 — dual-risk monitoring and recovery

- Context/scope: compose pool health with venue margin and implement ordered
  freeze/cancel/reduce/flatten/reconcile/repay/liquidate recovery.
- Non-goals: model-authorized recovery, automatic unfreeze or hidden loss.
- Acceptance: either stale/unknown domain freezes new risk; crash/restart keeps
  nonce and recovery monotonic; loss remains outstanding/bad debt as applicable.
- Tests: dual shock, RPC/venue outage, partial fill, unknown, crash/restart and
  discrepancy drills.
- Security/permission: protective authority cannot expand risk. Migration:
  additive incidents/recovery evidence. Rollback: remain frozen and reconcile.
  Dependency: M2B-002.
- Dependency/status: local dual-risk composition, immutable incident Evidence,
  monotonic transition guard, read-only Human/Agent receipt and STOP runner are
  implemented on `codex/m2b-003-dual-risk-recovery`. No external protective
  action, signer, nonce, network, production, mainnet or real-funds authority is
  granted; external M2B-003 completion remains `BLOCKED — NOT COMPLETE`.

### M2B-004 — Agent repayment and Credit State E2E

- Context/scope: independently running Agent completes exact authorized action,
  venue reconciliation, pool repayment and terminal shared Credit Outcome.
- Non-goals: Credit State auto-increases limits/collateral relief or real value.
- Acceptance: after restart, exact pool/venue/Ledger/Obligation states reconcile;
  repayment uses canonical waterfall; Agent and Principal can query Evidence.
- Tests: API/SDK/MCP E2E positive/negative/restart plus browser Principal/Risk
  review.
- Security/permission: external Agent credentials exact and revocable. Migration:
  only previously approved additive schema. Rollback: freeze/close, preserve
  outcome. Dependency: M2B-003.
- Dependency/status: local shared-kernel repayment, terminal Credit Outcome,
  non-authorizing Credit State, independent Agent reads, restart/replay proof
  and visible healthy/loss review are implemented on
  `codex/m2b-004-agent-repayment-credit-state`. No external credential,
  signer, nonce, Pool/Venue write, deployment, mainnet or real-value authority
  is granted; external M2B-004 completion remains `BLOCKED — NOT COMPLETE`.

### M2B-005 — v0.2.1 release hardening

- Context/scope: exact release, recovery, signer-destruction, monitoring and
  deployed user/Agent verification evidence.
- Non-goals: mainnet, real capital, production custody or M3 Task/API/Compute.
- Acceptance: all M2B gates pass on exact SHA with no P0/P1; no withdrawal,
  transfer, mainnet or real-value authority exists.
- Tests: full repository/security/contract/PostgreSQL/browser/external Agent
  gates and recovery drills.
- Security/permission: independent review and Founder candidate decision.
  Migration: exact manifest. Rollback: disable profile, retire signer, reconcile
  all outcomes. Dependency/status: M2B-004. The L0 v0.2.1 engineering candidate
  is implemented at exact SHA
  `fd7ae2c06672dbee5aeb8becaf7dada4f8f1cfa7`; independent review, Founder
  candidate decision and any remote/external deployment remain blocked.

## Release verdict discipline

Before actual deployment and visible user verification, all M2 product verdicts
remain `BLOCKED — NOT COMPLETE`. Phase 0 may conclude only
`ALIGNMENT READY — NO RUNTIME CHANGE`; it is not a product completion verdict.

Permission/funds/deployment impact of this plan: **none**. It sequences future
approval requests and cannot activate any successor issue.
