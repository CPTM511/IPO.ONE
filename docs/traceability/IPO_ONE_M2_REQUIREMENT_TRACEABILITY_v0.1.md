# IPO.ONE M2 requirement traceability v0.1

Status: IDs ratified in Product Constitution v1.3; M2A-001 and M2A-003 through
M2A-005 have bounded local implementation Evidence only

Base: `71786a3c72237320f7bacf77b64496dd1a0c526f`

State vocabulary is not collapsed: `APPROVED`, `IMPLEMENTED`, `LOCALLY
VERIFIED`, `TESTNET VERIFIED`, `DEPLOYED`, `REACHABLE`, `USER VERIFIED`, and
`REAL-VALUE ACTIVE` require independent Evidence. At this baseline every new
`REQ-POOL-*`, `REQ-COLL-*`, `REQ-ORACLE-*`, `REQ-RATE-*`, `REQ-POOL-EVID-*`,
`REQ-POOL-UX-*` and `REQ-AGENT-POOL-*` row is architecture-approved only; all
implementation and runtime states remain `NO` until current Evidence proves
them independently.

| Proposed ID | Capability | Current capability / exact gap | Owner | Dependency | Acceptance Evidence | Earliest authorized mode |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-POOL-001 | one curated secured market | no pool/factory; only non-custodial registries (`contracts/README.md`) | pool contracts | governance, M2A-002 | constructor/config/bytecode and no-factory tests | L0 model; separate L3 deployment |
| REQ-POOL-002 | public testnet supply/valid withdrawal | UI states public LP disabled (`apps/web/test/static-ui.test.js:1890-1903`) | pool + LP UI | 001, shares | contract/browser happy/denial/recovery | L3 only for public calls |
| REQ-POOL-003 | LP share/exchange-rate accounting | absent | pool accounting | ADR-M2-005 | reference differential + stateful invariants | L0 model |
| REQ-POOL-004 | cash, debt, reserve, bad-debt solvency | existing Ledger is reusable, not pool custody (`modules/ledger/README.md`) | pool + adapter + Ledger | 003, COLL-004 | exact reconciliation after restart/restore | L0 then L3 |
| REQ-POOL-005 | market/borrow caps and pause/recovery | generic caps/freeze reusable; no pool controls | pool + Risk/Ops | governance roles | privilege/action-matrix tests | L0; L3 exact roles |
| REQ-COLL-001 | WETH deposit/release | synthetic collateral explicitly `realCollateral=false` (`packages/domain/src/trading-capital-facility.js:144-184`) | pool + Human UI | token admission | balance-delta and health tests | L0 model; L3 assets |
| REQ-COLL-002 | collateral valuation and health | absent | oracle + pool | ORACLE-001 | formula/reference vectors and UI projected health | L0 model |
| REQ-COLL-003 | permissionless deterministic liquidation | liquidation words exist only in fixtures/risk Evidence; no pool action | pool | COLL-002, RATE-001 | fuzz, competing liquidator and adverse browser path | L0 model; L3 action |
| REQ-COLL-004 | explicit surplus/bad debt | trading settlement exists; no pool bad-debt account | pool + Ledger/Evidence | COLL-003 | one-time loss recognition and conservation invariant | L0 model |
| REQ-ORACLE-001 | valid/fresh/deviation-bounded price | no price oracle adapter found | oracle adapter | live source review | stale/zero/wrong-decimal/deviation tests | L0 deterministic; L3 exact feed |
| REQ-RATE-001 | utilization kink rate | synthetic utilization is exposure policy, not pool pricing (`packages/domain/src/trading-capital-facility.js:980-1029`) | rate model | POOL-003 | kink/boundary/reference vectors | L0 model |
| REQ-RATE-002 | monotonic bounded interest accrual | obligation schedule interest exists; no pool debt index | pool accounting | RATE-001 | time warp, chunking, no-user-loop invariants | L0 model |
| REQ-POOL-EVID-001 | pool event normalization | M2A-005 closed 13-event Pool V1 decoder and tuple/finality/reorg history locally verified; no live reader | adapter/indexer | contracts ABI | closed decoder/idempotency/reorg tests | L0 simulation; L3 reads |
| REQ-POOL-EVID-002 | pool/Obligation mapping | one finalized Pool event creates one local hash-only effect/outbox; shared Obligation binding remains absent | adapter + kernel | EVID-001, ID binding | one finalized event -> one canonical effect | L0 |
| REQ-POOL-EVID-003 | exact finality/reconciliation | M2A-005 replay/restore and two normalized direct-read comparison locally verified; no provider/RPC selected | indexer + persistence | EVID-001 | replay/reorg/RPC disagreement/restart/restore | L0; L3 exact providers |
| REQ-POOL-EVID-004 | discrepancy fail-closed | M2A-005 reason-coded additive discrepancy, new-risk freeze, protective operations and approved zero-discrepancy recovery locally verified | Risk/Ops + Gateway | EVID-003 | discrepancy freezes new risk; additive recovery | L0 |
| REQ-POOL-UX-001 | LP workspace | absent | Web + Tenant API | POOL-002/003 | visible click supply/withdraw + truthful states | L3 candidate UI |
| REQ-POOL-UX-002 | Human secured-borrow workspace | wallet/Human UI exists; no deposit/borrow/health/liquidation flow | Web + Tenant API | COLL/RATE/ORACLE | real-browser complete and adverse paths | L3 candidate UI |
| REQ-POOL-UX-003 | pool Risk/Ops workspace | generic Risk/Ops exists; no solvency/oracle/liquidation queue | Web + Gateway | POOL-005, EVID-004 | visible controls, dual control, discrepancy drill | L0 then L3 |
| REQ-POOL-UX-004 | Agent API parity | existing OpenAPI/SDK/MCP has no secured-pool operation family | API contract/SDK/MCP | kernel operations | conformance and forbidden-capability tests | L0; M2B L3 |
| REQ-AGENT-POOL-001 | Principal/Mandate-bound secured Facility | exact Principal/Mandate controls reusable; no pool binding | Gateway + kernel | POOL-EVID-002 | revocation/replay/wrong-account tests | L0 then M2B L3 |
| REQ-AGENT-POOL-002 | bounded Hyperliquid execution | exact approval/nonce/UNKNOWN/reconciliation reusable from ADR-035/038/039 | HyperCore adapter | AGENT-POOL-001 | independent Agent E2E with no withdrawal/transfer | M2B L3 only |
| REQ-AGENT-POOL-003 | dual-risk recovery | venue recovery exists; pool health not composed | Risk guardian + settlement | COLL-003, AGENT-POOL-002 | freeze/cancel/reduce/flatten/reconcile/repay/liquidate drill | M2B L3 only |

## Reusable requirements, not duplicated

`REQ-CORE-001`, `REQ-ID-001..005`, `REQ-CREDIT-007..009`, `REQ-PAY-001..004`,
`REQ-EVID-001..004`, `REQ-RISK-001..002`, `REQ-CHAIN-001..002`,
`REQ-UX-001..005`, `REQ-TRADE-001..005`, `REQ-PRIV-001` and `REQ-AUTO-001`
remain the governing shared-kernel requirements. M2 IDs narrow pool-specific
acceptance; they do not create a second identity, Ledger, Obligation, Evidence,
risk or Agent execution system.

## Governance conflict and gate

Constitution v1.3 sets only the bounded M2 architecture rows to
`APPROVED=YES`. It does not approve a generic or real-value public LP/vault.
Implementation and every higher state remain Evidence-based and currently
`NO`.

Permission/funds/deployment impact: **none**. The matrix neither enables a
launch profile nor authorizes assets, accounts, signers or transactions.

## M2A-001 local Evidence update — 2026-08-22

M2A-001 adds a dependency-free pure BigInt reference model at
`packages/domain/src/secured-pool-reference-model.js` with separate math and
invariant modules. It establishes only `IMPLEMENTED=YES` and
`LOCALLY VERIFIED=YES` for the exact model boundary of `REQ-POOL-003`, the
accounting portion of `REQ-POOL-004`, `REQ-COLL-001..004`, deterministic
`REQ-ORACLE-001`, and `REQ-RATE-001..002`.

Contract, persistence, adapter, deployed, reachable, user-verified, testnet and
real-value states remain `NO`. The Evidence is the accepted native-unit vector
suite, bounded time-chunk tests, negative action matrix, bad-debt one-time-loss
test and checked-in deterministic randomized seed corpus in
`packages/domain/test/secured-pool-reference-model.test.js`.

## M2A-003 local contract Evidence update — 2026-08-22

M2A-003 adds one native, non-proxy `IpoOneSecuredPoolV1` with immutable market,
asset, oracle-interface, cap and separated pause/recovery identities. At its
exact boundary it establishes `IMPLEMENTED=YES` and `LOCALLY VERIFIED=YES` for
the contract portion of `REQ-POOL-001`, `REQ-POOL-003`, `REQ-POOL-004`,
`REQ-POOL-005`, `REQ-COLL-001` and event-shape preparation for
`REQ-POOL-EVID-001`.

The local contract implements supply, liquidity-valid withdrawal, exact
redemption, internal non-transferable LP/debt shares, collateral deposit and
capacity-valid release, capped borrow/repay, exact token balance-delta checks,
protective pause and a closed event surface. It deliberately ignores
unsolicited token donations for internal accounting, preventing them from
inflating LP claims. The pinned Foundry stateful suite covers conservation,
caps, capacity, pause/recovery, stale/invalid price denial, malicious token
behavior, reentrancy and privilege negatives. Pinned solc and Foundry ABI plus
bytecode are compared against
`contracts/abi/m2/IpoOneSecuredPoolV1.v1.json`.

Interest/rate accrual, liquidation, bad debt, a live oracle source, adapter,
indexer, kernel mapping, persistence, UI/API, deployment, reachable,
user-verified, testnet and real-value states remain `NO`. This Evidence grants
no L3 asset, role, signer, RPC or transaction authority.

## M2A-004 local contract Evidence update — 2026-08-22

M2A-004 adds immutable closed-feed normalization, pool-side oracle binding and
deviation recovery, deterministic kink-rate accrual, liquidation-threshold
health, close-factor liquidation, reserves and explicit non-accruing bad debt.
At this exact boundary it establishes `IMPLEMENTED=YES` and `LOCALLY
VERIFIED=YES` for the contract portions of `REQ-POOL-003..005`,
`REQ-COLL-002..004`, `REQ-ORACLE-001`, `REQ-RATE-001..002`, and event-shape
preparation for `REQ-POOL-EVID-001`.

The adapter rejects wrong decimals, invalid/incomplete rounds, zero or negative
answers and stale/future observations. The pool additionally rejects wrong
asset/chain/source, timestamp/round regression and conflicting observations;
a greater-than-20% move creates a persistent halt that only the distinct
recovery authority can clear. Interest uses seven-day chunks with a maximum of
32 per on-chain call, allowing permissionless multi-call catch-up without a
user loop in economic mutations. Foundry unit/fuzz/stateful tests cover the
approved 50% utilization rate vector, a 20% price shock, close-factor seizure,
bad-debt one-time recognition/recovery, long time gaps, oracle failures,
slippage/deadline denial, pause asymmetry and exact token custody. Pinned solc
and Foundry ABI/bytecode parity is checked for both contracts.

A live oracle/feed identity, testnet action, adapter/indexer reconciliation,
kernel mapping, persistence, UI/API, deployment, reachable, user-verified and
real-value states remain `NO`. This local contract evidence selects no
commercial parameter and grants no L3 asset, role, signer, RPC or transaction
authority.

## M2A-005 local adapter/indexer Evidence update — 2026-08-22

M2A-005 adds a closed 13-event `IpoOneSecuredPoolV1.v1` decoder, tuple identity
bound to chain/contract/transaction/log index, monotonic included/safe/finalized
observations, append-only non-final reorg invalidation, canonical-order local
projection and hash-only finalized outbox. At this exact boundary it establishes
`IMPLEMENTED=YES` and `LOCALLY VERIFIED=YES` for `REQ-POOL-EVID-001`, the
effect-staging subset of `REQ-POOL-EVID-002`, and `REQ-POOL-EVID-003..004`.

Additive migration `0064` stores tenant-isolated observations, cursor history,
finalized effects, outbox, reconciliation runs/discrepancies/Evidence and risk
control transitions. Duplicate/concurrent admission commits one effect;
restart/restore reproduces the exact state hash. Reconciliation requires two
complete normalized direct reads. Incomplete input, provider disagreement or
projection mismatch adds reason-coded Evidence and freezes supply, withdrawal,
collateral release and borrow while retaining repay, collateral addition and
valid liquidation. Resume requires a later zero-discrepancy run and a separate
hash-bound approval record.

All reads in this issue are deterministic local fixtures. No provider, RPC,
account, credential, signer, transaction, contract deployment, testnet/public
endpoint, kernel Obligation mapping, UI/API, reachable, user-verified or
real-value state is added. Those states remain `NO` and separately gated.
