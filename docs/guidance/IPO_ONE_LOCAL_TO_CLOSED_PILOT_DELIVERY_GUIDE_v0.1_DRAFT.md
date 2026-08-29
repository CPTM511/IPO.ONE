# IPO.ONE Local-to-Closed-Pilot Delivery Guide v0.1

- Version: v0.1
- Date: 2026-07-27
- Status: Founder-approved non-canonical delivery guidance; no deployment,
  funds, production credential, contract, or risk authority
- Applies to: local development, invited no-real-funds pilot, and bounded live
  testnet validation

## 2026-08-30 infrastructure amendment

The Founder selected the existing `ipo-one-internal` Vercel Functions/Cron
runtime and the existing Vercel-managed Neon Launch PostgreSQL project
`ipo-one-m1-b-sandbox` in `aws-us-east-1` for PILOT-008B. This amendment
supersedes the older Cloud Run/Cloud SQL implementation proposals in this
non-canonical guide. Their provider-neutral security, durability, isolation,
recovery and observability gates remain mandatory. Cloud SQL, Cloud Run and a
second control plane are not selected and must not be provisioned without a
new concrete requirement and approval.

## 1. Purpose and Authority

This guide turns the current IPO.ONE implementation into a cost-controlled,
evidence-based delivery path:

`local integration -> hosted closed pilot -> live testnet -> controlled real value`

It is subordinate to:

1. `IPO_ONE_PRODUCT_CHARTER_v1.1.md`;
2. `IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md`;
3. `deploy/launch-policy.v1.json`; and
4. the security, privacy, risk, legal, custody, and deployment review gates
   named by those sources.

This document approves the delivery sequence as guidance. It does not authorize
a production deployment, remote participant access, a signer, contract
deployment, real funds, underwriting policy, or capital commitment. Each
permission-expanding step remains a separately reviewed issue and launch
decision.

## 2. Delivery Decision

IPO.ONE should not buy or operate full production infrastructure before the
shared Human/Agent lifecycle has passed repeatable local acceptance.

After local acceptance, IPO.ONE may progress to an invited hosted pilot using
synthetic balances and testnet assets. The hosted pilot must use durable server
truth and real authentication; publishing the current process-local sandbox to
Vercel alone does not satisfy this gate.

Real Hyperliquid Testnet accounts and signed actions form a separate testnet
gate. Real-value Agent credit forms a later gate and remains locked until the
named capital, loss, custody, legal, security, risk, operations, and
infrastructure decisions are approved.

### Current implementation baseline

This guide starts from
`docs/codex/checkpoints/IPO_ONE_CHECKPOINT_2026-07-27_PRE_STRATEGY.md` and the
subsequent local shadow-credit work. At that baseline:

- the shared durable Human/Agent kernel and closed Tenant protocol exist
  locally;
- the hosted Vercel product uses the durable Neon PostgreSQL system of record;
- the former GCP closed-pilot runtime is offboarded;
- remote Agent access is not yet an approved hosted transport;
- Hyperliquid live signed Testnet execution and complete venue reconciliation
  remain unverified; and
- the trading-credit learner is supplemental and non-authorizing.

Before implementing any proposed issue, the issue owner must re-check this
baseline against the current branch and record material drift. This guide is a
sequence and gate definition, not a substitute for release evidence.

`DEPLOY-001` is amended to the existing one-project Vercel Functions and
bounded Cron topology with Neon PostgreSQL 17 canonical state. Technical
readiness deployment is approved; participant access and launch remain
blocked.

`DEPLOY-001B` selects the existing Vercel-managed Neon Launch project in
`aws-us-east-1`. New provider provisioning, plan upgrades, remote access,
profile activation and real funds remain disabled and unapproved.

`LOCAL-STACK-001` implements the L0 topology in a dedicated local Lima VM:
rootless Docker, digest-pinned PostgreSQL 17, the three-workspace Private Pilot,
and a separate unsigned synthetic outbox/reconciliation worker. It proves
local lifecycle and restart behavior only; it does not approve or substitute
managed PITR, cloud IAM, remote access, hosted operations, or L1 launch.

## 3. Meaning of "Real Use"

The term must always identify one of the following stages. A stage may not be
described using the authority of a later stage.

| Stage | Users and systems | Value | Permitted claim |
| --- | --- | --- | --- |
| L0 Local Integration | Founder, developers, reference Agents; local durable services | Synthetic only | Complete product behavior can be reproduced locally |
| L1 Hosted Closed Pilot | Invited Human and Agent users; authenticated durable hosted system | Synthetic only; optional read-only testnet Evidence | Real users can operate the no-real-funds product |
| L2 Live Testnet Execution | Invited users; real testnet venue accounts and bounded signed testnet actions | Test assets only | The external execution and reconciliation path is proven |
| L3 Controlled Real Value | Approved Agent operators, providers, capital and production operators | Small approved real value under hard caps | A production-limited Agent credit pilot is operating |

Public sandbox availability is not an additional authority stage. It remains a
separate, explicitly synthetic demonstration surface.

## 4. Target Closed-Pilot Topology

```text
Human wallet/browser ----\
                          -> Vercel Web + authenticated request boundary
Agent SDK/remote API ----/                    |
                                               v
                                   managed PostgreSQL truth
                                      |              |
                                      v              v
                              outbox/reconciliation  Evidence/Risk
                                      |
                                      v
                           protected execution worker
                                      |
                                      v
                           Hyperliquid Testnet adapter
```

### 4.1 Vercel responsibilities

Vercel may host:

- the Human product and Developer/Agent product surfaces;
- same-origin authentication and short-lived request handling;
- a bounded API/BFF layer compatible with its runtime;
- static OpenAPI, SDK onboarding, and capability discovery; and
- read views backed by durable server truth.

Vercel must not be treated as:

- the durable database;
- a source of process-local product truth;
- a safe home for a browser-exposed or broadly callable venue signer;
- the only scheduler for economically important reconciliation without overlap
  and retry controls; or
- a substitute for an independently recoverable worker and database.

### 4.2 Durable truth

The hosted pilot requires a managed PostgreSQL compatible with the checked-in
migrations, transactions, Tenant RLS, replay controls, and reconciliation
queries. It must provide:

- encrypted connections and reviewed credential separation;
- automated backups and point-in-time recovery where supported;
- a tested restore procedure;
- migration ownership and rollback evidence;
- bounded connection management for serverless callers; and
- separate local, pilot, and later production data boundaries.

No private pilot may use the public process-local sandbox store as canonical
truth.

### 4.3 Protected worker

A small independently deployed worker should own operations that do not fit a
short request lifecycle:

- Provider or venue callbacks;
- outbox consumption and retry;
- scheduled reconciliation and synthetic checks;
- Evidence finalization;
- credit-outcome materialization;
- live testnet signing after L2 approval; and
- alert delivery.

The worker must be horizontally safe or explicitly singleton-leased. Duplicate
delivery must not create duplicate economic state.

### 4.4 Agent access

Agents are users of IPO.ONE; IPO.ONE does not need to deploy customer Agents.
The hosted product should provide:

- versioned HTTPS OpenAPI and SDK workflows;
- a capability manifest declaring maturity and unavailable actions;
- Tenant-, Principal-, Agent-, scope-, and expiry-bound credentials;
- idempotency keys, request IDs, stable problems, and retry guidance;
- credential rotation and revocation; and
- later reviewed remote MCP/A2A transport over the same application protocol.

Local stdio MCP is useful for L0 but is not sufficient for invited remote Agent
use in L1.

### 4.5 Environment parity

| Component | L0 Local | L1 Hosted closed pilot | L2 Live testnet |
| --- | --- | --- | --- |
| Web | Local product build | Vercel invited surface | Same reviewed candidate |
| API | Loopback authenticated host | Protected HTTPS Human/Agent API | Same API plus testnet operations |
| Database | Local PostgreSQL | Managed pilot PostgreSQL | Same durable pilot truth |
| Agent transport | SDK/local stdio MCP | Versioned HTTPS SDK/API | Same authenticated transport |
| Worker | Local jobs | Protected unsigned background worker | Restricted signer plus background jobs |
| Venue | Mock/signed sandbox or read-only | Mock/read-only testnet | Bounded read/write Hyperliquid Testnet |
| Value | Synthetic | Synthetic | Test assets only |
| Operations | Local receipts and drills | Hosted alerts, restore, rollback | Venue incident and signer drills |

Environment parity means the same canonical schemas, migrations, protocol
contracts, event rules, and release checks. It does not require paying for
production-sized infrastructure in L0 or L1.

## 5. Stage Gates

### 5.1 L0 — Repeatable local integration

### Required composition

- PostgreSQL-backed Human and Agent Tenant protocol;
- Human wallet or local OIDC authentication and Agent workload authentication;
- synthetic Subject, Principal, Consent/Mandate, Credit Intent, Decision, Offer,
  Obligation, execution, repayment, servicing, Evidence, and Risk/Ops views;
- mock/signed sandbox Provider;
- local outbox, reconciliation, alert evaluation, and credit-outcome jobs; and
- reproducible seeded Tenant profiles and reference Agent clients.

### Mandatory happy-path receipt

One immutable release receipt must bind:

`authentication -> authority -> credit intent -> decision -> offer -> obligation
-> controlled execution -> payment -> repayment -> Evidence -> credit outcome`

Human and Agent entry Evidence may differ, but both paths must converge on the
same canonical obligation, ledger, risk, event, and Evidence rules.

### Failure-path acceptance

L0 must prove:

- database and application restart do not lose accepted state;
- duplicate requests, callbacks, and job retries do not duplicate value state;
- expired or revoked sessions and Agent credentials fail closed;
- wallet/account/Tenant switches cannot reuse prior authority;
- stale data and unknown external outcomes block further risk-increasing action;
- reconciliation can detect and repair an approved projection failure;
- Subject, Facility, per-chain, and global pause controls work; and
- credit-record updates can retry without changing the original Decision
  snapshot.

### L0 exit evidence

- supported-runtime repository checks pass;
- PostgreSQL integration and RLS tests pass;
- Human and Agent browser/API end-to-end tests pass;
- restart, replay, restore, reconciliation, and pause drills pass;
- no unexplained ledger or lifecycle divergence remains; and
- the exact candidate commit, migrations, configuration hashes, and test
  receipts are recorded.

### 5.2 L1 — Hosted invited no-real-funds pilot

### Access model

- invite-only; no public self-service Tenant creation;
- pre-provisioned Tenant, Human, Principal, Agent, and Risk/Ops memberships;
- Human SIWE or reviewed OIDC authentication;
- any third-party KYC/VC or fiat-account identity remains an offchain,
  least-privilege reference behind a separately reviewed adapter;
- distinct revocable Agent workload credentials;
- least-privilege roles and capability checks from reviewed code;
- HTTPS only, with trusted proxy/network context and bounded sessions; and
- a clear testing notice, privacy notice, synthetic-value disclosure, and
  participant consent. No real-credit agreement is implied.

### Hosted requirements

- durable PostgreSQL server truth;
- protected Human and Agent HTTP transports;
- secret management and credential rotation;
- rate, concurrency, enumeration, and abuse controls;
- scheduled reconciliation and synthetic lifecycle checks;
- logs, metrics, alert delivery, named owner, escalation, and stop procedure;
- backup plus successful restore drill; and
- documented rollback to the previous candidate.

### Initial cohort

The first cohort should remain deliberately small:

- two to three internal Human users;
- three to five invited design partners; and
- five to ten separately credentialed reference or participant Agents.

Recommended Agent test personalities include normal, high-frequency/low-limit,
low-frequency/long-hold, repayment-focused, deliberate risk-trigger, stale-data,
retry, and disconnect cases.

### L1 exit evidence

- invited users complete the lifecycle without database intervention;
- no cross-Tenant disclosure or authority reuse occurs;
- every mutation is attributable to Tenant, Actor, authority, request, Event,
  and Evidence;
- redeploy and database restore retain canonical state;
- all duplicate tests remain economically idempotent;
- support, pause, credential revocation, incident, and rollback drills pass;
- no open P0/P1 security finding exists; and
- an explicit L2 go/no-go names the account, signer, action allowlist, numeric
  caps, owner, and incident responder.

### 5.3 L2 — Live Hyperliquid Testnet execution

L2 requires a separately approved issue because it adds a real external signer
and live venue writes, even though test assets have no intended real value.

### Required controls

- one named testnet master/subaccount structure;
- one dedicated API Wallet or equivalent restricted signer;
- non-exportable or otherwise reviewed key handling, rotation, and revocation;
- exact action allowlist, initially order, modify/cancel, reduce-only, and
  flatten;
- withdrawals, external transfers, mainnet, and authority-expanding actions
  disabled;
- numeric product, position, notional, order, price-deviation, rate, staleness,
  and loss limits;
- nonce/replay and uncertain-result handling;
- live order/fill/funding/position reconciliation;
- restart-safe reduce-only, flatten, close, and settlement drills; and
- venue receipts mapped to canonical Ledger, Obligation, and Evidence records.

### L2 exit evidence

- all submitted actions are authorized and allowlisted;
- no duplicate nonce or duplicate execution survives reconciliation;
- every uncertain result is resolved within a named pilot SLA;
- venue, Ledger, obligation, and Evidence state reconcile for every test case;
- pause, reduce-only, flatten, signer revocation, restart, and incident drills
  pass; and
- live testnet performance and repayment outcomes feed the shadow credit loop
  without changing active credit authority.

### 5.4 L3 — Controlled real-value Agent credit

L3 remains disabled until the launch policy is explicitly revised after named
approval of:

- capital source, beneficial owner, source of funds, amount, and term;
- maximum loss and the exact loss bearer;
- legal entities, roles, jurisdiction, compliance, privacy, and complaints;
- custody, settlement, safeguarding, withdrawal, and recovery;
- production signer, key governance, rotation, and emergency access;
- chain, asset, venue, accounts, contracts, RPC/indexer, and finality policy;
- Provider, Agent, Trader, KYP/KYB, SLA, and removal lists;
- per-Facility, Agent, Tenant, Provider, asset, chain, and global limits;
- collateral, first-loss, margin, waterfall, pricing, fees, and accounting;
- risk, staleness, stop-loss, pause, reduce-only, flatten, and recovery rules;
- production SLO, alerts, on-call, exercises, and incident owner;
- independent review of the exact value path; and
- final Founder/Human go/no-go.

The first L3 cohort remains one venue, one asset, one capital source, ten to
twenty approved Agents, deterministic decision authority, shadow learning, hard
caps, purpose-limited use, and no arbitrary withdrawal.

Real Human cash lending, public LP/vaults, token/DAO governance, multi-venue
expansion, and automatic model promotion remain outside this guide.

## 6. Credit-Learning Rule During L0-L2

Credit learning may become operational before real funds, but it must not become
self-authorizing.

The permitted loop is:

1. verify finalized trading, risk, payment, repayment, delinquency, and
   intervention Evidence;
2. calculate versioned features at a named observation time;
3. preserve the active policy, feature set, reason codes, and Decision snapshot;
4. attach completed-Facility outcome labels without rewriting prior facts;
5. compare a challenger recommendation with the deterministic active policy;
6. evaluate loss, repayment, capture, false-reject, concentration, and drift
   offline; and
7. require named human review and a versioned release before any challenger can
   change active policy.

No online training job may directly increase a limit, remove a stop condition,
change pricing, activate a Facility, or send an external action.

## 7. Cost-Control Principles

The pilot should pay only for components that prove a current gate:

- use local PostgreSQL and workers for L0;
- use one managed pilot database rather than a production multi-region estate;
- use Vercel for Web and compatible short-request APIs;
- use one small worker service for background and L2 signing workloads;
- scale non-critical workers to zero only when leases, schedules, and recovery
  remain correct;
- reuse the PostgreSQL outbox before adding Redis or a separate queue;
- do not add Kubernetes, a data warehouse, multi-cloud failover, mainnet
  indexers, or public RPC capacity before evidence requires them;
- keep synthetic/testnet fixtures reproducible and replayable; and
- retain environment parity through migrations, configuration schemas, runtime
  versions, and executable release checks rather than identical infrastructure.

Cost saving must not remove Tenant isolation, durable truth, backups, audit
Evidence, idempotency, secrets protection, reconciliation, or stop controls.

## 8. Explicit Anti-Patterns

The following do not qualify as a closed pilot:

- exposing a developer laptop through a public tunnel for invited users;
- using Vercel process memory as the private product database;
- placing Agent credentials or venue signer secrets in browser code;
- giving Agents a shared Human session or one shared unrestricted API key;
- allowing a public/serverless request handler to perform unrestricted signing;
- describing synthetic credit, test assets, or shadow scores as real credit;
- running overlapping scheduled jobs without leases or idempotency;
- treating a smart-contract receipt as a substitute for the canonical Ledger,
  custody controls, or reconciliation; or
- enabling real funds because testnet behavior appeared successful.

## 9. Proposed Issue Sequence

Implementation should remain issue-sized:

| Order | Proposed issue | Outcome |
| --- | --- | --- |
| 1 | `PILOT-007` | Ratify this guide and freeze the L0/L1 release receipt and non-goals |
| 2 | `DEPLOY-001` | Select and compose the durable hosted pilot topology without enabling remote access |
| 3 | `LOCAL-STACK-001` | Run PostgreSQL, Private Pilot and unsigned worker in one local virtual stack |
| 4 | `DEPLOY-001B` | Recommend providers and cost posture without installation, procurement, or provisioning |
| 5 | `AUTHN-005` | Provision invite-only Human and Agent pilot identities and credential lifecycle |
| 6 | `TRANSPORT-003` | Publish the reviewed remote Agent HTTPS contract and conformance client |
| 7 | `OPS-004` | Compose hosted backup, restore, reconciliation, synthetics, alerts, ownership, and rollback |
| 8 | `PILOT-008` | Run the small L1 cohort and produce bounded launch evidence |
| 9 | `HL-TESTNET-001` | Under separate approval, wire restricted signed Hyperliquid Testnet execution |
| 10 | `RISK-003B` | Feed finalized testnet performance and repayment outcomes into the shadow learning loop |

Local implementation checkpoint on 2026-07-28: the `AUTHN-005`
pre-deployment contract is complete. Bootstrap v2 now requires a unique,
hash-only invitation reference and a maximum 90-day credential lifetime,
derives the Human Borrower, Principal Controller, Agent Runtime, and Risk
Operator capability sets in reviewed server code, and reuses durable
revocation/deprovisioning. Node 26 repository checks passed `616/616`,
PostgreSQL checks passed `78/78`, and LOCAL-STACK-001 acceptance passed with 42
migrations. This checkpoint does not issue a participant credential, select or
activate an external identity provider, open remote access, or authorize funds,
signing, or live trading.

Each issue must define Context, Scope, Non-goals, likely files, acceptance
criteria, test commands, security checklist, exact permission boundary, and
rollback. No issue inherits deployment, signer, remote-access, or funds
authority from this document.

## 10. Decision Record

Approved guidance:

- prove the complete product locally before paying for hosted production-like
  infrastructure;
- use Vercel as part of, not the whole of, the hosted closed-pilot topology;
- invite a small Human and Agent cohort only after durable authentication,
  database, operations, and rollback controls are composed;
- prove live signed external execution on Hyperliquid Testnet before real value;
  and
- keep real-value launch behind a distinct human decision and revised launch
  policy.

Still unapproved:

- provider and infrastructure vendor selection;
- exact hosted topology and cost commitment;
- external participant access;
- production identity provider and credential issuance;
- testnet or production signer provisioning;
- numeric risk limits;
- contracts or fund paths;
- real-value capital, pricing, custody, legal structure, and launch.
