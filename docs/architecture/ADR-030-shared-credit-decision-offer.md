# ADR-030: Shared Deterministic Credit Decision and Offer

> Superseded for new authenticated evaluations by ADR-033 and
> `risk_decision.v3`. The v2 contract remains historical compatibility only.

Status: Accepted and implemented locally on 2026-07-15 under the three
project-owner approvals in CREDIT-001D.

## Problem

The durable application path stops at `credit_intent.v1`. The current
`risk_decision.v1` relation requires an Agent Mandate and cannot represent a
Human Consent without losing relational integrity. The public demo risk rules
also mix Agent Lockbox and Provider assumptions with CreditLine creation, so
they cannot be reused as the shared Human/Agent application policy.

## Decision

Introduce a private, no-funds `pilotEvaluateCreditApplication` command and a
dual-authority `risk_decision.v2` projection linked to the exact Credit Intent.
The handler uses one closed deterministic policy,
`credit-application-rules.v1`, and creates an Offer only for an approved
Decision. It never creates a CreditLine or any execution authority.

Human and Agent paths differ only before policy input normalization:

- Human resolves active Consent and current synthetic Identity Reference.
- Agent resolves the scoped draft Mandate and accountable Principal binding.

Both normalize into the same policy input: exact Intent terms, eligibility
facts, adverse-state facts, and remaining sandbox caps. All policy terms and
reason codes are server-derived.

## Transaction Boundary

Within one serializable Tenant transaction, lock the Intent, Subject,
Principal, exact authority, Human identity Evidence when applicable,
CreditLine/Obligation adverse state, existing Decision/Offer, and persistent
capacity. Commit Intent state, Decision, optional Offer, Event, Evidence,
outbox, projection registry, snapshot, owner resource, command replay, abuse
charge, and authorization audit together.

## Rejected Alternatives

- Reuse the public Agent `RiskService.requestCreditLine`: it requires a
  Lockbox, Provider count, Mandate, and immediately creates/reuses a CreditLine.
- Add a separate Human decision table: this would create two risk truths and
  violate Product Charter v1.1.
- Store a polymorphic authority string without relational checks: this would
  permit cross-Tenant or wrong-type authority drift.
- Generate an Offer in the UI: this would make pricing and schedule caller
  controlled and non-reconcilable.

## Consequences

Human and Agent applications can now reach a
durable explainable Offer without gaining acceptance, execution, or funds
authority. CREDIT-001E will still require a separate approval for Offer
acceptance and Obligation creation.
