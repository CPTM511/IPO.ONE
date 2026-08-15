# ADR-037: Trading Capital Settlement, Incident Ownership, and Recovery

Status: Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority

Date: 2026-07-24

Decision owner: IPO.ONE Founder

Accepted at: 2026-07-25T00:32:32.792Z

## Context

A Facility can cross multiple truth domains: Hyperliquid orders, fills,
positions and fees; IPO.ONE Obligation and Ledger state; Capital Provider
economics; and immutable Evidence. Partial fills, stale reads, crashes, or
ambiguous responses can leave those domains temporarily inconsistent. A
settlement design must not invent value, guarantee principal after trading loss,
or allow an execution signer to become a withdrawal or Ledger authority.

## Accepted Architecture Decision

### Settlement authority

The Tenant Command Gateway orchestrates settlement through one canonical
Obligation and Ledger. It receives normalized, validated venue Evidence from
the signer-free read plane and never accepts caller-authored settlement totals.

Authority is separated:

- the strategy and Operator can request close but cannot post settlement;
- the Risk Guardian can stop new risk and, only after separate approval,
  perform protective cancel/reduce-only/flatten actions;
- the Hyperliquid writer cannot withdraw, transfer, approve keys, post the
  IPO.ONE Ledger, or declare settlement final;
- the settlement worker can calculate a proposed deterministic allocation but
  cannot sign exchange actions or bypass Gateway AuthZ/dual control; and
- the Gateway commits accepted settlement postings, Events, Evidence,
  projections, outbox, idempotency, and aggregate versions atomically.

Real-value settlement, manual corrections, release of capital, and overrides
require the exact separately approved capability and dual-control policy.

### Settlement sequence

A future Facility settlement follows:

1. close admission to new risk;
2. cancel open orders;
3. flatten remaining exposure through server-proven reduce-only actions where
   separately authorized;
4. reconcile all submitted, unknown, canceled, rejected, partially filled, and
   filled actions against venue state;
5. establish a finalized valuation point and complete source Evidence;
6. account for venue fees, execution costs, realized gains/losses, and approved
   external costs;
7. apply a future accepted loss waterfall and Provider/Subject allocation;
8. repay Provider principal only from actual available value under the accepted
   Obligation;
9. apply only accepted fixed participation/fee terms to actual realized
   financial income; and
10. atomically post the canonical Ledger/Event/Evidence settlement result and
    issue a performance proof.

The system creates no synthetic profit, receivable, guarantee, or make-whole
claim to hide trading loss. IPO.ONE fees are not due merely because a trade or
Facility existed; an exact fee policy and actual realized financial income must
both be proven. Current pricing, fee, first-loss, and waterfall terms remain
unapproved.

### Incident ownership

For TC-G0 no-real-funds documentation and any later separately approved Testnet
exercise, the proposed accountable incident owner and Evidence custodian is
the IPO.ONE Founder. This is governance responsibility only and grants no
signing, withdrawal, deployment, or bypass capability.

Before any real-value gate, named operational roles must be approved for:
incident commander, venue operator, risk owner, signer custodian, capital
custodian, settlement reviewer, Ledger reviewer, communications, legal, and
Evidence custody. No person may self-approve a conflicting settlement or
credential action.

### Incident and recovery protocol

On stale data, signer anomaly, nonce collision, unknown response, policy breach,
unexpected fill, reconciliation mismatch, or process restart:

- deny new risk and limit actions to separately authorized protection;
- do not retry an uncertain write;
- capture immutable request/action hashes, nonce state, timestamps, endpoint,
  account, response/error, and correlation identifiers without secrets;
- reconcile by client order ID/order status/fills/positions/account state;
- quarantine conflicting projections and open an incident;
- use append-only correction Events and Ledger postings after dual review;
- restore only from durable idempotency, nonce, Event, outbox, and Evidence
  state; and
- require fresh reconciled Evidence and an accepted recovery decision before
  loosening risk.

Recovery never deletes Events, rewrites Ledger history, edits signed Evidence,
or treats an external timeout as proof of failure.

## Owner and Rationale

The IPO.ONE Founder owns acceptance and is the proposed interim no-funds/Testnet
incident owner. The rationale is to make settlement auditable across domains
without combining execution, custody, risk, and accounting authority.

## Alternatives Considered

- **Venue balance as the Ledger:** rejected because it omits the accepted
  Obligation, allocations, corrections, and Evidence lineage.
- **Writer declares settlement:** rejected because signing authority must not
  become accounting authority.
- **Retry unknown orders:** rejected because it may duplicate exposure.
- **Provider principal guarantee after loss:** rejected because the system
  cannot create value absent a separately contracted loss bearer.
- **Charge fees on gross flow or unrealized PnL:** rejected because it is not
  proven realized financial income.
- **Mutable correction of historical rows:** rejected because it destroys audit
  and replay integrity.
- **One operator owns every incident action:** rejected because settlement and
  credential conflicts need separation and dual control.

## Rollback

Before acceptance, removal has no runtime effect. After any future
implementation, rollback closes new-risk admission, preserves separately
authorized protective actions, disables automated settlement advancement,
reconciles external effects, retains immutable Event/Evidence/Ledger history,
and restores the last accepted settlement policy only through a reviewed
append-only correction. Credential revocation, capital release, and venue
withdrawal remain separately authorized operations.

## Explicitly Unapproved Decisions

- provider, legal entity, jurisdiction, custody structure, capital source,
  settlement account, loss bearer, guarantee, insurance, first loss,
  collateral, waterfall, pricing, fee, tax, or accounting policy;
- numerical finality, valuation, slippage, timeout, loss, exposure, or materiality
  thresholds;
- real-value incident roles, vendors, pager targets, communication channels,
  recovery time objectives, or override authorities;
- any withdrawal, transfer, capital release, API-wallet management, mainnet
  action, or real-value settlement;
- any runtime schema, worker, policy, Ledger posting, UI, SDK, MCP, or operation;
  and
- any production claim or automatic advancement after ADR acceptance.

## Consequences

The proposal defines conservative settlement and recovery semantics while
leaving all economic and real-value decisions behind named human approval. It
adds operational steps, but those steps are the Evidence needed to distinguish
loss, delay, ambiguity, and successful finality.
