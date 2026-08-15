# ADR-028: Shared Human and Agent Credit Intent Gateway

Status: Accepted on 2026-07-15 by project-owner approval of CREDIT-001C.

## Decision

IPO.ONE exposes one private, local, no-real-funds application entry for both
Human and Agent Actors:

- `pilotRequestCredit` is an idempotent command against an exact owned Subject.
- `pilotReadCreditApplication` is a query against an exact owned Credit Intent.
- Human authority is one active, current, sandbox-only Consent bound to the
  exact Subject and Principal.
- Agent authority is one current draft Mandate bound to the exact Subject and
  Principal, containing `request_credit`, the requested asset, and sufficient
  per-action and aggregate limits.
- Both paths persist the same canonical `credit_intent.v1` projection and emit
  the same bounded summary; only `authorityType` and the resolved authority ID
  differ.

The Human Borrower role receives `credit.request` and `credit.read.self`. Agent
Runtime retains `credit.request` and receives `credit.read.self`. No Developer,
Risk, Operations, Auditor, Provider, anonymous public, or transport role gains
these capabilities.

## Transaction and risk boundary

Subject, Principal, Consent or Mandate, adverse Obligation state, frozen
CreditLine state, duplicate Intent hash, persistent capacity, event append,
projection write, authorization resource ownership, command execution record,
abuse charge, and audit are resolved inside one serializable Tenant transaction.
PostgreSQL row locks require the application database role to have the narrow
`UPDATE(status)` privilege on `obligations` and `credit_lines`; no Gateway
operation in this increment can exercise those mutations.

## Safety invariants

- `sandboxOnly` is always true and `productionFundsRequested` always false.
- A draft Mandate can request an Intent only. It cannot activate, accept,
  execute, spend, withdraw, settle, or move value.
- No Decision, Offer, acceptance, Obligation, payment, or chain transaction is
  created here.
- The operations remain absent from the anonymous OpenAPI server and MCP/A2A.
- Raw KYC, PII, credentials, signatures, secrets, and caller-supplied Tenant,
  Actor, Principal, authority type, or production flags are rejected.

## Consequences

The product now has a durable, restart-safe common application primitive that
the Human UI and Agent client can share. Deterministic Decision/Offer policy,
acceptance, Obligation execution, repayment, servicing, public authenticated
transport, and production value remain separate reviewed increments.
