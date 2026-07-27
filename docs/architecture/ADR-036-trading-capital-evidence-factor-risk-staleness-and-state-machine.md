# ADR-036: Trading Capital Evidence, Factor Risk, Staleness, and State Machine

Status: Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority

Date: 2026-07-24

Decision owner: IPO.ONE Founder

Accepted at: 2026-07-25T00:32:32.792Z

## Context

Trading Capital needs an explainable view of strategy quality and operational
risk without turning a single score, wallet balance, or historical PnL into
credit authority. Venue data can be delayed, missing, reordered, paginated, or
inconsistent with an uncertain write. Risk decisions therefore need frozen
Evidence, explicit freshness, and conservative state transitions.

## Accepted Architecture Decision

### Evidence-derived factor profile

Every risk evaluation references an immutable point-in-time Evidence snapshot,
policy version/hash, input lineage, source account/environment, observation
time, ingest time, completeness/finality status, and reason-to-factor lineage.

The proposed factor groups are:

1. **Alpha Quality** — return shape, persistence, loss shape, and regime
   sensitivity;
2. **Risk Reliability** — drawdown, liquidation proximity, leverage behavior,
   concentration, and tail-loss behavior;
3. **Strategy Capacity** — liquidity, turnover, slippage, position capacity,
   and market impact;
4. **Mandate Compliance** — account, product, asset, action, exposure, and
   covenant compliance; and
5. **Evidence Confidence** — source coverage, freshness, reconciliation,
   finality, anomalies, and provenance.

A composite score may summarize these factors for presentation only. It is
non-authorizing and cannot alone approve a Facility, set a limit, increase
leverage, activate capital, price credit, or loosen a risk state. Every
decision exposes factors, inputs, policy, reason codes, missing Evidence, and
which constraints were binding.

No decision may rely solely on historical PnL, wallet balance, or a black-box
model. Any future model-assisted signal must be bounded, versioned, explainable,
monitored, and separately approved; deterministic policy remains authoritative.

### Freshness contract

Each external observation has one of `FRESH`, `STALE`, or `UNKNOWN`.

- `FRESH` requires a closed, successfully validated source response within a
  separately approved maximum age and complete pagination/reconciliation for
  the decision being made.
- `STALE` means the last known valid observation exceeds that age or a required
  stream/poll has missed its service objective.
- `UNKNOWN` means the source, time, completeness, identity, or reconciliation
  status cannot be established.

Until an exact maximum age is separately approved and configured, external
Evidence cannot authorize new risk. `STALE` or `UNKNOWN` never falls back to
zero exposure, last-known-good permission, or optimistic success. It blocks new
risk, preserves protective cancellation, and may only move the Facility toward
a more restrictive state.

Trusted server time and source observation time are recorded separately.
Caller time is never authority.

### Risk state machine

The proposed state order is:

`NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`

- **NORMAL:** future approved policy may permit bounded new risk.
- **WARNING:** no limit increase or automatic repricing; heightened review and
  monitoring apply.
- **REDUCE_ONLY:** new or expanded exposure is denied; cancel and server-proven
  exposure-reducing actions remain possible.
- **FLATTEN:** only protective cancel and server-proven flatten actions remain
  possible.
- **SETTLEMENT:** trading admission is closed and settlement/reconciliation
  workflow owns the Facility.

Protection is monotonic during stale, unknown, incident, or breach conditions.
A less restrictive transition requires fresh reconciled Evidence, separately
approved hysteresis/cooling conditions, policy evaluation, immutable Evidence,
and any named human approval required by the policy. No recovery is inferred
from passage of time alone.

An external write with an unknown result cannot be classified as failed or
successful until reconciliation. New risk remains blocked meanwhile.

### No procyclical economics

Risk deterioration may reduce authority or trigger protection; it does not
automatically raise interest, fees, collateral, or first-loss requirements on
an accepted Obligation. Economic changes require a new disclosed Offer and
human acceptance under a separately approved policy.

## Owner and Rationale

The IPO.ONE Founder owns the factor taxonomy and state-machine acceptance
because they constrain credit and trading authority. The rationale is to make
risk decisions reproducible from Evidence while failing closed when external
truth is stale or uncertain.

## Alternatives Considered

- **Single proprietary credit score:** rejected because it hides causal
  factors and can become an unreviewed authority.
- **Historical PnL as the limit:** rejected because past return does not prove
  capacity, liquidity, compliance, or future loss containment.
- **Wallet balance as creditworthiness:** rejected because balance does not
  prove ownership, mandate, obligations, or strategy behavior.
- **Last-known-good permits new risk indefinitely:** rejected because stale
  data can hide liquidation, fills, or account changes.
- **Automatic risk-based repricing:** rejected because it is procyclical and
  mutates accepted terms.
- **Automatic return to NORMAL:** rejected because incident recovery needs
  fresh Evidence and explicit hysteresis.

## Rollback

Before acceptance, removal has no runtime effect. After a future implementation,
rollback sets admission to the most restrictive safe state, stops new risk,
retains protective cancellation where separately authorized, freezes policy
version changes, reconciles venue and Ledger state, preserves all prior
snapshots and decisions, and restores the last accepted policy only after human
review. Historical risk Evidence is append-only and is never rewritten.

## Explicitly Unapproved Decisions

- factor weights, grades, pass/fail cutoffs, sample windows, models, data
  vendors, maximum age, polling interval, service objectives, hysteresis, or
  cooling periods;
- Facility caps, leverage, exposure, concentration, drawdown, liquidation,
  stop-loss, collateral, first-loss, pricing, or fee thresholds;
- any automated approval, limit increase, repricing, recovery to NORMAL, or
  real-value decision;
- any production risk owner, pager, dashboard, model validator, or override
  authority; and
- any runtime schema, policy, worker, adapter, UI, SDK, or operation.

## Consequences

The proposal gives TC-101 and later tasks an explainable, non-black-box target
and prevents stale data from authorizing additional exposure. Exact numerical
policy remains intentionally absent until a named human decision package.
