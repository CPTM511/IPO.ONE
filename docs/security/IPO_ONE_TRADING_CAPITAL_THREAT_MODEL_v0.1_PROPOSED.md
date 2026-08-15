# IPO.ONE Trading Capital Threat Model v0.1 — Accepted Architecture

Status: Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority

Date: 2026-07-24

Decision owner: IPO.ONE Founder

Accepted at: 2026-07-25T00:32:32.792Z

Interim no-funds/Testnet incident owner: IPO.ONE Founder

## Scope

This model covers the proposed narrow wedge of one Capital Provider, one
segregated Facility, one Human Trader or Agent Operator, and one Hyperliquid
account binding. It covers architecture through TC-G4 decision-package
preparation. It does not authorize credentials, endpoint calls, Testnet writes,
production deployment, or real funds.

Assets at risk include canonical Obligation and Ledger integrity, Provider and
Subject value, account and Facility binding, API-wallet signing authority,
nonce uniqueness, risk-state correctness, immutable Evidence, Tenant isolation,
settlement allocation, and incident/recovery truth.

## Trust boundaries

1. Human/Agent client to authenticated Tenant Gateway.
2. Tenant Gateway to Facility, Obligation, Ledger, Event, Evidence, and outbox
   stores under Tenant/RLS scope.
3. Signer-free Info Adapter to the approved Hyperliquid environment.
4. Gateway/risk policy to an isolated protected writer.
5. Protected writer to the signed Hyperliquid Exchange endpoint.
6. Venue observations back through validation, freshness, Evidence, and
   reconciliation.
7. Settlement proposal to dual-controlled canonical Ledger posting.

No client, strategy, browser, general Agent runtime, report, fixture, log, or
Evidence artifact crosses into the signing-material boundary.

## Hard invariants

- All 25 Trading Capital candidates remain `specified_disabled` after TC-000.
- Facility state is a projection; canonical Obligation and Ledger remain truth.
- Read-only maturity has no signer or Exchange client.
- The writer accepts no raw action and denies unknown action types.
- Execution signing cannot withdraw, transfer, approve a key/fee, or post the
  Ledger.
- Capital/withdrawal, execution signer, and Risk Guardian authorities are
  separated.
- Nonces and submission outcomes survive restart; uncertain writes are not
  retried.
- `STALE` and `UNKNOWN` never authorize new risk.
- A composite factor score is presentation-only and non-authorizing.
- Economic terms do not reprice automatically.
- Settlement creates no synthetic value or principal guarantee after loss.

## Threat register

| ID | Threat / failure | Required prevention | Detection and recovery | Residual decision |
| --- | --- | --- | --- | --- |
| TC-T01 | Browser, Trader, or Agent exfiltrates API-wallet key | key absent from those runtimes; isolated non-exportable signer; closed intent contract | signer access audit, secret scanning, credential retirement, incident Evidence | signer/HSM/MPC vendor unapproved |
| TC-T02 | API-wallet address used for account reads, returning empty state | bind actual master/subaccount address; validate expected account identity | completeness anomaly; compare account binding Evidence; block new risk | exact account unapproved |
| TC-T03 | Raw or new Exchange action bypasses policy | positive typed allowlist; no generic passthrough; unknown action denied | action-schema mismatch and deny audit Event | future allowlist activation unapproved |
| TC-T04 | Execution signer withdraws or transfers value | deny `withdraw3`, transfers, vault, agent and fee approvals; separate custody key | signed-action audit, capability test, revoke/retire signer | custody process unapproved |
| TC-T05 | Reused or colliding nonce causes rejection/replay | signer-scoped durable atomic allocator; fresh wallet per process; never reuse retired address | nonce state audit, collision alarm, reconciliation | timing/batching values unapproved |
| TC-T06 | Timeout is retried and duplicates risk | durable `UNKNOWN`; no resend; reconcile by cloid/order/fill/position | unknown-outcome queue and aging alert | timeout/alert SLO unapproved |
| TC-T07 | Partial fill is treated as complete failure or success | normalized per-item status and cumulative fill Evidence | reconcile order, fills, position and balance before state change | finality window unapproved |
| TC-T08 | Stale/missing venue data authorizes exposure | explicit `FRESH/STALE/UNKNOWN`; absent max-age blocks new risk | freshness telemetry and restrictive transition | exact max-age unapproved |
| TC-T09 | Caller forges time, score, exposure, or Evidence | server-derived time/policy/factors from validated sources | hash/lineage mismatch, immutable rejection Evidence | data providers unapproved |
| TC-T10 | Black-box/PnL score alone sets limit | factor passport is non-authorizing; deterministic policy and binding reasons | policy/conformance review and decision Evidence | weights/thresholds unapproved |
| TC-T11 | Risk deterioration automatically raises price | active terms immutable; protection changes authority, not economics | Offer/Obligation hash mismatch; reject mutation | pricing/fee policy unapproved |
| TC-T12 | Stale recovery automatically returns to NORMAL | monotonic restriction; fresh reconciliation, hysteresis and approval required | recovery-decision Evidence and state-transition audit | hysteresis unapproved |
| TC-T13 | Tenant/account/Faulty Facility confused-deputy attack | Tenant Gateway/RLS/object AuthZ; server-bound account and environment | cross-Tenant negative tests, correlation audit | production account map unapproved |
| TC-T14 | One operator controls custody, trading, risk and settlement | authority separation and dual control | role/capability conflict audit and break-glass review | production owners unapproved |
| TC-T15 | Worker posts a second ledger or mutates canonical history | canonical Gateway unit of work; append-only Event/Evidence/Ledger correction | reconciliation mismatch and immutable audit | real-value posting policy unapproved |
| TC-T16 | Venue loss is hidden by synthetic Provider receivable | settlement only from actual reconciled value; no guarantee by default | allocation conservation checks and human settlement review | loss bearer/waterfall unapproved |
| TC-T17 | Fee charged on gross flow or unrealized PnL | fee requires accepted terms and actual realized financial income | deterministic fee-basis Evidence | fee/rate/tax unapproved |
| TC-T18 | Crash loses submission/idempotency state | durable nonce/idempotency/outbox/Event state before and after submit | restart recovery and unknown-effect reconciliation | infrastructure/RTO unapproved |
| TC-T19 | Logs, fixtures, reports, or Evidence leak secrets/PII | allowlisted fields, redaction, no keys/raw sensitive data | artifact scanning and Evidence access audit | production retention policy unapproved |
| TC-T20 | Incident rollback resends orders or erases history | stop new risk; reconcile; append-only correction; no uncertain retry | incident timeline and immutable recovery Evidence | production incident roster unapproved |

## Tabletop review

### Scenario A — successful venue acceptance, lost HTTP response

Expected sequence:

1. durable submission remains `UNKNOWN`;
2. new risk for the affected intent/Facility is blocked;
3. no retry is sent;
4. Info Adapter queries order status, fills, positions, and account state using
   the actual account address;
5. reconciliation records a confirmed, rejected, or still-unknown outcome with
   source Evidence; and
6. only the reconciled result advances the local projection.

TC-000 assessment: **architecture PASS; runtime UNIMPLEMENTED**.

### Scenario B — venue data stale during drawdown

Expected sequence:

1. freshness becomes `STALE` or `UNKNOWN`;
2. no new/exposure-increasing intent can pass;
3. separately authorized cancel/protective actions remain possible;
4. Facility may move only toward `REDUCE_ONLY`, `FLATTEN`, or `SETTLEMENT`; and
5. recovery requires fresh reconciled Evidence and an accepted hysteresis
   decision.

TC-000 assessment: **architecture PASS; numeric policy UNAPPROVED**.

### Scenario C — attempted `withdraw3` or `approveAgent`

Expected sequence:

1. request cannot be represented by the closed internal intent;
2. writer's positive allowlist denies the action before signing;
3. denial is recorded without destination/key material;
4. repeated attempts trigger abuse/incident review; and
5. execution signer still lacks capital/withdrawal authority.

TC-000 assessment: **architecture PASS; runtime UNIMPLEMENTED**.

### Scenario D — Provider principal is lower after realized loss

Expected sequence:

1. finalized venue Evidence and costs establish actual available value;
2. future accepted waterfall allocates only conserved value;
3. no synthetic receivable or guarantee is created;
4. fee applies only if future accepted terms and actual realized financial
   income support it; and
5. canonical Ledger/Event/Evidence records the reviewed result.

TC-000 assessment: **architecture PASS; economics and real value UNAPPROVED**.

### Scenario E — process restarts with reserved and submitted nonces

Expected sequence:

1. startup reads durable state rather than initializing from memory;
2. `RESERVED` entries are handled without reissuing the nonce;
3. `SUBMITTED/UNKNOWN` entries enter reconciliation;
4. retired signer addresses remain permanently non-reusable; and
5. new signing remains blocked until consistency checks pass.

TC-000 assessment: **architecture PASS; persistence/runtime UNIMPLEMENTED**.

## Rollback

TC-000 rollback removes or supersedes this proposal with no runtime effect.
Future runtime rollback must disable admission, retain separately authorized
protection, retire affected signing authority without address reuse, reconcile
unknown effects, preserve Event/Evidence/Ledger history, and require human
review before risk authority is restored.

## Explicitly unapproved

All credentials, accounts, endpoints, writes, numeric policies, custody/signer
vendors, real-value roles, legal/economic terms, deployments, operations, and
runtime implementations remain unapproved. Founder ownership in this document
is accountability only; it is not a credential or bypass grant.
