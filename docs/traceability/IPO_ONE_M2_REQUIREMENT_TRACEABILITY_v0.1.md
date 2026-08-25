# IPO.ONE M2 requirement traceability v0.1

Status: IDs ratified in Product Constitution v1.3; M2A-001 and M2A-003 through
M2A-007 have bounded local implementation Evidence; M2A-008 is deployed and
user-verified at the exact Base Sepolia test-assets/local-product boundary;
M2A-009 has a blocked engineering candidate pending Human and independent
review gates

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
| REQ-POOL-EVID-002 | pool/Obligation mapping | M2A-006 binds one exact self-Principal execution AccountBinding and canonical Obligation; ordered finalized effects atomically create Event/Evidence/outbox/Ledger/receipt/projection updates | adapter + kernel | EVID-001, ID binding | one finalized event -> one canonical effect | L0 locally verified |
| REQ-POOL-EVID-003 | exact finality/reconciliation | M2A-005 replay/restore and two normalized direct-read comparison locally verified; no provider/RPC selected | indexer + persistence | EVID-001 | replay/reorg/RPC disagreement/restart/restore | L0; L3 exact providers |
| REQ-POOL-EVID-004 | discrepancy fail-closed | M2A-005 reason-coded additive discrepancy, new-risk freeze, protective operations and approved zero-discrepancy recovery locally verified | Risk/Ops + Gateway | EVID-003 | discrepancy freezes new risk; additive recovery | L0 |
| REQ-POOL-UX-001 | LP workspace | M2A-007 locally verifies visible supply/withdraw review, exact liquidity/share blockers and explicit no-deployment state; no submit operation | Web + Tenant API | POOL-002/003 | visible click supply/withdraw + truthful states | L0 locally verified; L3 submission separate |
| REQ-POOL-UX-002 | Human secured-borrow workspace | M2A-007 locally verifies visible collateral/borrow/repay/release review with projected health/oracle/reconciliation blockers; no transaction path | Web + Tenant API | COLL/RATE/ORACLE | real-browser complete and adverse paths | L0 locally verified; L3 submission separate |
| REQ-POOL-UX-003 | pool Risk/Ops workspace | M2A-007 locally verifies aggregate server-derived solvency/oracle/reconciliation/control state with no address or liquidation submission | Web + Gateway | POOL-005, EVID-004 | visible controls, dual control, discrepancy drill | L0 locally verified; L3 separate |
| REQ-POOL-UX-004 | Agent API parity | M2A-007 adds closed Tenant API, typed SDK and two-tool MCP read/review parity; forbidden submit/transfer/authority inputs fail closed | API contract/SDK/MCP | kernel operations | conformance and forbidden-capability tests | L0 locally verified; M2B L3 |
| REQ-AGENT-POOL-001 | Principal/Mandate-bound secured Facility | M2A-006 proves Human/Agent self-Principal parity over one binding contract; Mandate-specific pool Facility operations remain for M2A-007/M2B | Gateway + kernel | POOL-EVID-002 | revocation/replay/wrong-account tests | partial L0 locally verified; M2B L3 |
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

## M2A-006 local canonical-kernel Evidence update — 2026-08-23

M2A-006 adds one immutable Tenant-scoped binding from an active Human or Agent
self-Principal execution `account_binding.v3` to one existing
`obligation.v2` and one exact chain/contract/market/account position. Only an
ordered M2A-005 finalized effect whose debt asset matches the Obligation
CAIP-19 asset may enter the shared kernel. Older, pending, safe, invalidated,
wrong-account, wrong-chain and wrong-asset inputs fail closed.

Migration `0065` adds forced-RLS bindings, rebuildable projections and
append-only execution/effect receipts. Each admitted effect commits through
the existing Event/Evidence/outbox transaction with balanced canonical Ledger
postings. Finalized repayment settles the same Obligation and installment;
terminal state feeds the existing Credit Outcome/Credit State materializer as
non-authorizing, non-scoring and incapable of automatic limit change. Pool and
sandbox execution rails are mutually exclusive.

At this boundary `REQ-POOL-EVID-002` is `IMPLEMENTED=YES` and
`LOCALLY VERIFIED=YES`; the self-Principal parity subset of
`REQ-AGENT-POOL-001` is locally verified, while a Mandate-specific secured
Facility operation remains incomplete. The full PostgreSQL suite passes
90/90, including fresh/rollback migrations, atomicity, concurrency replay,
restart and forced RLS. No provider, public RPC, signer, transaction,
deployment, testnet/public endpoint, UI/API/SDK/MCP surface or real value is
selected or authorized. Those states remain `NO` and separately gated.

## M2A-007 local product-surface Evidence update — 2026-08-23

M2A-007 adds one closed three-operation secured-Pool product family over the
M2A-005/M2A-006 PostgreSQL projection and canonical Obligation binding. Human
and Agent own-position reads and exact action review share the same Gateway
handlers; Risk, Operations and Auditor receive only an aggregate, PII-free
control view. The typed Agent SDK and two-tool MCP adapter expose read/review
only. There is no submit, signer, RPC, generic transfer or arbitrary withdrawal
operation.

At this boundary `REQ-POOL-UX-001..004` are `IMPLEMENTED=YES` and `LOCALLY
VERIFIED=YES` for no-funds read/review behavior only. The 1139-test unit and
contract suite, 90-test clean PostgreSQL suite, 34-test security suite,
84-test transport suite, 25-test Foundry suite and six-test Playwright click
path pass. Browser acceptance covers a visible Human exact-action review,
keyboard operation, mobile width, 200-percent zoom and the aggregate Risk Pool
control view.

After the bounded M2A-008 Base Sepolia deployment, the local product uses
`pool_submission_unavailable`: it may show the exact deployed test Pool from
the enabled launch profile while keeping local indexer state explicit and all
transaction submission absent. This does not claim a current-user chain
record, real value, public production usability or funds authority.

## M2A-008 Gate E product acceptance — 2026-08-25

Release candidate `d7707b43726fb15490c2664b0ba89b4ffb18e3fe` passes exact local
runtime acceptance and exposes the deployed Base Sepolia test Pool while
truthfully reporting that the local indexer has no current projection. An
authenticated Founder-signed Human session visibly refreshed Pool state and
reviewed one exact Borrow without signature, RPC submission, transaction or
funds movement. Role-isolated synthetic browser hosts separately prove visible
Capital Partner and aggregate Risk journeys; the click-path suite passes 8/8.

The Gate E Evidence set binds this product acceptance to the finalized Pool,
Sourcify source matches, two-RPC finality, restart and duplicate replay,
zero-discrepancy reconciliation, freeze/recovery behavior and destroyed signer
tombstones. `TESTNET VERIFIED`, local `RUNTIME`, local `REACHABLE`, and local
`VERIFIED` are `YES`; public production `DEPLOYED` and real-value authority are
`NO`.

## M2A-009 recovery candidate Evidence update — 2026-08-25

Engineering candidate `25921f008f260d2d8a39524603cd1a6f2512fd63`
adds one closed recovery manifest and read-only runner over the existing
M2A-008 Pool. The two admitted RPCs agree on finalized deployment receipts,
current runtime bytecode and configuration at their latest common finalized
height. No wallet, signer, signing method, transaction preparation or broadcast
primitive exists in the runner.

At this boundary the recovery Evidence for `REQ-POOL-EVID-001`,
`REQ-POOL-EVID-003`, `REQ-POOL-EVID-004`, `REQ-POOL-005`, `REQ-RISK-001` and
`REQ-RISK-002` is `IMPLEMENTED=YES` and `LOCALLY VERIFIED=YES`. Restart and
duplicate replay preserve one projection hash; non-final reorg data invalidates
additively; RPC/oracle/projection discrepancies freeze new risk while retaining
protective repayment; zero discrepancy cannot auto-recover; and one role-bound
approval is rejected before two distinct role hashes create a local recovery
transition.

The PostgreSQL suite passes 90/90 after isolating a downgrade drill from shared
append-only Pool Evidence. Visible synthetic browser paths pass 8/8 for
Borrower, Capital Partner and Risk, and aggregate tests pass 1173/1173. The
exact local OCI image is reachable at
`http://127.0.0.1:8787/#request-credit` and reports the candidate SHA.

Final `USER VERIFIED` for M2A-009 remains `NO` because the prior Human session
was correctly invalidated after rebuilding the exact candidate and has not yet
been re-signed. Independent Security review is also absent. Public production,
mainnet, real value, new transactions and M2B authority remain `NO`; the
candidate verdict is `BLOCKED — NOT COMPLETE`.

## M2A-008 preflight Evidence update — 2026-08-23

The original M2A-008 preflight established one closed exact-deployment decision
schema, a mode-0600 strict
decision reader, deterministic nonce-derived adapter/pool addresses, bounded
test-asset/risk/signer fields, a fail-closed 13-gate pending Evidence template,
and a read-only two-RPC dependency inspector. It adds no signer, wallet client,
transaction-signing or broadcast primitive.

Official Base and Circle sources identify the exact Base Sepolia WETH and test
USDC candidates. The Chainlink Base Sepolia directory identifies one ETH/USD
feed candidate. Read-only observations through `sepolia.base.org` and
`base-sepolia-rpc.publicnode.com` agree on chain ID, dependency code hashes,
token decimals and a fresh positive feed round. A Base Sepolia fork dry run
successfully constructs the immutable oracle adapter and pool against those
dependencies using explicitly non-authorizing fixture caps and roles.

The focused preflight suite passes 6/6, fork dry run 1/1, Foundry local suite
25 passed with the explicit non-fork case skipped, indexer/reconciliation 15/15,
security 34/34, transport 84/84, clean PostgreSQL 90/90 and aggregate unit/
contract 1145/1145. Dependency provenance, schemas, launch policy, lint,
typecheck, migrations, Web bundle and production dependency audit pass.

This Evidence establishes only preflight CODE and local/read-only/fork
verification. `TESTNET VERIFIED`, `DEPLOYED`, `REACHABLE` and `USER VERIFIED`
remain `NO`. The launch profile is still disabled with `exactProfile: null`,
and no exact Risk/cap/role Evidence, public pause/recovery addresses or fresh
one-use signer is present. No transaction was signed or broadcast and no funds
moved.

The subsequent Founder review confirmation is recorded as Founder/Release
acceptance only. A closed `m2a_008_independent_contract_review.v1` schema,
pending template and report-byte verifier now make the separate Independent
Security assurance mechanically admissible once a named external reviewer
supplies the exact attestation and immutable report.

## M2A-008 testnet governance correction — 2026-08-23

Policy v1.2.0 replaces the testnet profile's 13 named approval gates with five
effective gates without removing technical verification. Gates A-C cover code
integrity, exact configuration and authority/signer safety before signing. Gate
D is enforced inside the closed deployment runner. Gate E is required after
deployment for finality, indexer/reconciliation, restart/replay, safe pause/
recovery and Human/LP/Risk browser acceptance.

Independent Security review is no longer a blocking requirement for the first
Base Sepolia test-assets-only engineering deployment. The exact review schema,
verifier and handoff remain available and no review is claimed. Policy
validation now rejects any mainnet-named or real-funds profile that omits an
`Independent Security` gate.

The exact-decision contract permits both testnet role addresses to identify the
Founder as controller while still requiring distinct EVM addresses, distinct
private keys, testnet-only scope and zero key material in Evidence. Exact
1,000/100 test-USDC caps, 50% LTV, `mainnetAuthorized=false` and
`realFundsAuthorized=false` are executable invariants. The only unavoidable
Founder-supplied inputs remaining with this correction applied are the two
public role addresses. The profile remains disabled and no transaction is
authorized by the correction alone.

## M2A-008 exact-profile activation — 2026-08-24

Policy v1.3.3 enables exactly one Base Sepolia test-assets-only profile bound
to the finalized immutable Adapter and a fresh Pool-only one-use deployer, deterministic pool address, runtime
pool bytecode hash, WETH/test-USDC/Chainlink dependencies, exact 1,000/100
test-USDC caps, 50% LTV, two distinct Founder-controlled role addresses and
configuration hash recorded in
`docs/codex/audits/M2A-008/pool-recovery-004.md`. Mainnet, real funds,
Human production credit, private Tenant data, external Provider execution and
Agent venue execution remain false.

The enabled profile is not self-executing. The runner still requires private
mode-0600 Gate A-C Launch Evidence bound to the final green SHA, exact observed
signer balance/nonce/gas and a live two-RPC preflight. Gate D and Gate E remain
unfulfilled until genuine deployment and product acceptance Evidence exists.
