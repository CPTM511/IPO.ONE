# IPO.ONE Decision and Offer Boundary v0.1

Status: Active for the local no-funds profile after CREDIT-001D approval and
successful security/PostgreSQL review on 2026-07-15.

## Permitted

- An owning Human Borrower or Agent Runtime may trigger one deterministic
  sandbox evaluation of its exact existing Credit Intent.
- The server may persist one bounded RiskDecision and, only when approved, one
  versioned Credit Offer with synthetic terms.
- The owner may read bounded Intent, Decision, Offer hashes, dates, terms,
  reason codes, and explicit no-funds flags.

## Prohibited

- Caller-supplied risk facts, scores, policy version, rate, fee, schedule,
  reasons, disclosure, authority, Tenant, Subject, Principal, production flag,
  or destination.
- Offer acceptance, Obligation or CreditLine creation, Mandate activation,
  execution, spend, settlement, repayment, withdrawal, custody, capital,
  onchain submission, public or remote exposure, or production lending claim.
  Separately approved loopback HTTP and local stdio MCP may invoke only the
  same private Gateway operation and do not widen this boundary.
- Raw identity claims, KYC/PII, credentials, secrets, signatures, keys, or
  unbounded Evidence.

## Required Enforcement

- Trusted Authentication Context and exact owner authorization precede object
  resolution and policy execution.
- Subject, Principal, Consent/Mandate, Human identity Evidence, freeze,
  adverse Obligation, cap, duplicate, and capacity checks run against locked
  durable state in the same serializable transaction as the outcome.
- RiskDecision v2 contains exactly one composite-FK-backed Consent or Mandate
  authority and the exact Intent; existing v1 rows remain stable.
- Closed schemas, policy version, idempotency, canonical hashes, replay,
  immutable projections, RLS, reconciliation, and non-enumerating denials fail
  closed.
- `sandboxOnly` is true and every production/funds flag is false in all paths.
