# IPO.ONE Phase 3 remaining execution plan v0.1

Status: `FOUNDER-AMENDED — PILOT-008B VERCEL + NEON TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED`

Date: 2026-08-27

Baseline: `origin/main` at
`39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`

## 1. Executive conclusion

The proposed direction is correct: M2 has reached its bounded no-funds end,
there is no `M2B-007`, and the repository contains no approved post-M2 M3
Task/API/Compute execution plan.

Two corrections are required before the sequence is executable:

1. Treat the current `ipo.one` deployment as the exact remote no-funds
   baseline, not as an activated closed pilot. Its runtime profile label does
   not override `closed_non_funds_pilot.releaseEnabled=false` or the explicit
   M2B-006 no-promotion boundary.
2. Put the Constitution prerequisites in front of the `PILOT-008` cohort:
   `REQ-PILOT-001` is absent and `REQ-PILOT-002` is incomplete. They must close
   through issue-sized work and named review before invited L2 activation.

With those corrections and the Founder-approved Pool integration amendment,
the controlling order is:

```text
PHASE3-000 alignment
  -> PHASE3-POOL-001 remote read-only Pool product integration repair
  -> PILOT-008 prerequisite closure and exact cohort
  -> HL-TESTNET-001 exact restricted signed proof
  -> RISK-003B finalized-outcome shadow loop
  -> PHASE3-CLOSE-001 release closure
  -> M3-000 Constitution and execution alignment
  -> later, separately proposed Phase 4 controlled-real-value gate
```

## 2. Authority and invariants

This plan is subordinate to Product Constitution v1.3, Product Charter v1.1,
the Product Optimization Measure, Engineering Standard, M2 decisions, launch
policy, and exact issue approvals. It does not activate a successor.

Every successor must preserve:

- one Human/Agent Subject, Offer, Obligation, Facility, Ledger, servicing,
  Event, Evidence, Credit State, risk, and reconciliation kernel;
- Capital Partner ownership of bilateral economic Offer terms;
- deterministic active policy and versioned, shadow-only learning;
- offchain, least-privilege KYC/PII, credentials, signatures, and private
  policy;
- no arbitrary withdrawal, external transfer, mainnet, real funds, public
  real-value LP/vault, token/DAO, or automatic model promotion;
- exact distinction between digest, transaction, observation, finality, and
  reconciliation; and
- fail-closed stale, unknown, unauthorized, revoked, and unreconciled state.

## 3. Canonical mode names

New tasks must use Constitution modes. Historical Local-to-Closed-Pilot labels
may be included only as cross-references:

- `L2_CLOSED_NO_FUNDS` = the guide's L1 hosted closed pilot.
- `L3_LIVE_TESTNET` = the guide's L2 live testnet execution.
- `L4_CONTROLLED_REAL_VALUE` = the guide's L3 controlled real value.

The `profile` string returned by a runtime is descriptive configuration. It is
not proof that the corresponding launch-policy mode is enabled or exited.

## 4. Dependency graph and issue sizing

`PILOT-008` and `HL-TESTNET-001` are retained as the umbrella IDs from the
approved delivery guide, but implementation must be split into the following
issue-sized gates. Child issue documents must be active before code or external
mutation begins.

```text
PHASE3-000
  -> PHASE3-POOL-001 remote read-only Pool product integration repair
  -> PILOT-008A  prerequisite and current-candidate rebase
       - REQ-PILOT-001 case/correction workflow
       - REQ-PILOT-002 support/privacy/incident closure
       - current 55-requirement traceability and release-control rebase
  -> PILOT-008B  exact L2 deployment/profile activation
  -> PILOT-008C  invited cohort run and L2 exit
  -> HL-TESTNET-001A exact account/signer/action/cap/run approval package
  -> HL-TESTNET-001B one bounded signed Hyperliquid Testnet run and recovery
  -> RISK-003B finalized/reconciled outcome ingestion and shadow evaluation
  -> PHASE3-CLOSE-001 complete Phase 3 release closure
  -> M3-000 Constitution vNext and post-M2 execution-plan alignment
```

Parallel documentation and local non-authorizing test preparation may occur
only when it cannot bypass a predecessor's authority. External activation and
completion claims remain strictly sequential.

## 5. Program tasks

### PHASE3-000 — remaining alignment

- Outcome: current-state traceability, normalized mode names, dependency graph,
  successor task contracts, and no runtime change.
- Status: complete in this documentation change.
- Exit: `ALIGNMENT READY — NO RUNTIME CHANGE`.

### PHASE3-POOL-001 — remote read-only Pool product integration repair

- Outcome: the exact deployed Base Sepolia secured Pool becomes a normal,
  discoverable, server-derived and recoverable read-only product on `ipo.one`.
- Authority: exact `live_testnet_secured_pool` profile intersected with this
  read-only issue and authenticated role/object/account authority.
- Required truth: deployment, RPC, indexer/reconciliation, market,
  authenticated position and submission authority remain independent.
- Non-goals: signer, Pool/Venue transaction, mainnet, real funds, a second
  market/asset/chain, new architecture or unrelated infrastructure.
- Exit: final merged main SHA is deployed and user-verified on `ipo.one`; Human,
  LP, Risk/Ops and applicable Agent reads agree; no P0/P1 remains; final verdict
  is `PASS — DEPLOYED AND USER-VERIFIED` or `BLOCKED — NOT COMPLETE`.
- Current status: `PASS — DEPLOYED AND USER-VERIFIED` at merged/deployed SHA
  `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`.

### PILOT-008 — invited closed no-funds cohort

- Canonical mode: `L2_CLOSED_NO_FUNDS`.
- Outcome: a small Human, Agent, and Capital Partner cohort completes the
  shared product without database intervention.
- Required precursor work:
  - complete `PHASE3-POOL-001` with the final deployed/user-verified verdict;
  - implement and verify `REQ-PILOT-001` through visible Human controls and an
    equivalent authorized versioned API/MCP operation;
  - close `REQ-PILOT-002` with named privacy, retention, ordinary support,
    incident, restore, rollback, and on-call owners;
  - rebase July topology/operations artifacts and all release Evidence to the
    exact current candidate;
  - pass independent security, backup/restore, reconciliation, revocation,
    pause, incident, support, privacy/legal, and participant gates; and
  - approve the exact launch-policy revision. Evidence cannot self-enable it.
- Exit: invited users finish without database intervention; cross-Tenant,
  duplicate, replay, restart, restore, credential revocation, pause, incident,
  rollback, and Evidence reconciliation gates pass; no P0/P1 remains.
- Current status: `PILOT-008A PASS — LOCALLY VERIFIED; PILOT ACTIVATION NOT
  AUTHORIZED`; `PILOT-008B GATE 0 REBASED — TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED`;
  `PILOT-008C` remains `BLOCKED — NOT COMPLETE`.

### HL-TESTNET-001 — restricted Hyperliquid Testnet proof

- Canonical mode: exact `L3_LIVE_TESTNET` profile, separate from the existing
  Base Sepolia pool profile.
- Outcome: one approved account/signer/action family performs bounded
  test-asset-only execution and reconciles Venue, Ledger, Obligation,
  repayment, and Evidence truth.
- Required approval: exact account, subaccount, signer, action allowlist,
  market/product, numerical caps, expiry, nonce policy, one-run window,
  execution owner, incident owner, and signer retirement.
- Exit: no unauthorized action, duplicate nonce, unresolved unknown outcome,
  withdrawal, transfer, or authority expansion; pause, cancel, reduce-only,
  flatten, restart, signer revocation, settlement, and reconciliation pass.
- Current status: `BLOCKED — NOT COMPLETE`.

### RISK-003B — finalized-outcome shadow learning

- Canonical mode: non-authorizing work after the exact L3 proof.
- Outcome: finalized trading, risk, repayment, loss, intervention, and
  reconciliation outcomes produce point-in-time versioned features, outcome
  labels, challenger recommendations, and offline evaluation.
- Exit: replay is idempotent; lineage is complete; Human/Agent privacy is
  preserved; active policy, Offers, limits, price, terms, Facilities, and
  external actions are unchanged.
- Current status: `BLOCKED — NOT COMPLETE`.

### PHASE3-CLOSE-001 — Phase 3 closure

- Outcome: one exact Phase 3 report reconciles L2 cohort Evidence, L3 signed
  execution, shadow learning, recovery drills, defects, and remaining gates.
- Exit: every required CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED state is
  explicit, no required verification is substituted, and the exact scoped
  verdict is recorded.
- Current status: `BLOCKED — NOT COMPLETE`.

### M3-000 — post-M2 Task/API/Compute alignment

- Outcome: a Constitution vNext proposal, requirement crosswalk, architecture
  decisions, threat model, launch-policy proposal, task decomposition, and
  reviewed execution plan for Task/API/Compute Agent credit.
- Non-goal: M3 implementation, deployment, provider/compute integration,
  capital, signer, or funds.
- Naming rule: this post-M2 M3 is not the historical `M3 Backend Alpha` row in
  the July MVP Build Spec.
- Entry: only after `PHASE3-CLOSE-001` and explicit Founder direction.
- Current status: `NOT AUTHORIZED`.

## 6. Required decision inputs

### Before PILOT-008B activation

- exact cohort composition and invited participant references;
- pilot jurisdiction and Legal/Privacy approval;
- ordinary support channel, support owner, incident owner, on-call owner,
  restore owner, rollback owner, and notification recipients;
- retention policy, RPO/RTO, cost ceiling, billing/provider owners, deployment
  topology, secret manager, and independent security reviewer;
- exact candidate SHA, image, migrations, database, worker, edge, identity,
  and rollback target; and
- reviewed launch-policy revision.

### Before HL-TESTNET-001B

- exact Hyperliquid Testnet master/subaccount and accountable Principal;
- dedicated restricted signer and custody/rotation/destruction method;
- action allowlist, market, order/position/notional/leverage/rate/staleness/
  loss caps, expiry, and run count;
- execution, incident, recovery, and reconciliation owners; and
- single-run approval bound to the exact code/config/Evidence package.

### Before any M3 plan can become active

- Founder-approved product problem and user;
- accountable Principal and provider/compute counterparty model;
- authority, value, cashflow, repayment, loss, privacy, and non-redundancy
  boundaries;
- stable requirement IDs and explicit relationship to existing Agent Lockbox,
  Trading Capital, Provider spend, and Capital Partner Offer flows; and
- a Constitution version decision and separate human-review gates.

## 7. Program verification

Each successor must include targeted positive, denial, replay, restart,
recovery, and real-browser/API acceptance. Phase 3 closure additionally runs
the exact repository, migration, security, PostgreSQL/RLS, transport, worker,
deployment, browser, accessibility, chain/Venue, and reconciliation gates for
the selected release.

No successor is complete if a required deployed or user verification is
unavailable. The truthful verdict remains `BLOCKED — NOT COMPLETE`.

## 8. Rollback posture

- Alignment: remove proposal documents only.
- Closed pilot: preserve canonical Events/Evidence/idempotency; revoke cohort
  credentials; return traffic to the exact prior immutable release; repair
  forward; never weaken RLS/authentication/edge controls.
- Hyperliquid Testnet: freeze, cancel, reduce-only/flatten, reconcile, retire
  signer, preserve redacted Evidence, and disable the exact profile.
- Shadow learning: disable challenger evaluation and preserve immutable input,
  feature, decision, and evaluation lineage; active policy remains unchanged.
- M3: reject or revise the proposal; no code exists to roll back.

Permission/funds/deployment impact: **none**. This plan is a sequencing and
review artifact only.
