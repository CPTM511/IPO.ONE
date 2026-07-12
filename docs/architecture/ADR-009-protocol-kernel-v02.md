# ADR-009: Protocol Kernel v0.2 Boundaries

- Status: Accepted for the local MVP; production adoption requires review
- Date: 2026-07-10

## Context

`Identity + Payment + Obligation` is the public product primitive, but the
runtime needs two additional explicit controls: a Mandate that proves who may
act, and Evidence that proves what happened. Treating these as incidental
fields would make authorization and interoperability impossible to audit.

## Decision

The internal protocol kernel is:

```text
Identity + Mandate + Payment + Obligation + Evidence
```

- Identity identifies the Subject, Principal, accounts, and attestations.
- Mandate defines revocable delegated authority and bounded capabilities.
- Payment represents transfer intent and settlement evidence, never implied
  finality.
- Obligation is the portable credit-state primitive.
- Evidence is a versioned, hashed envelope for state-changing facts.

Services may project convenient current state, but authorization, accounting,
and evidence must remain independently inspectable. Human and Agent Subjects
share the same kernel while using different policy and compliance adapters.

## Consequences

- Credit and spend flows must fail closed without an active Mandate.
- Schemas become more explicit, but integrations can replace components without
  changing the kernel.
- The public three-part product story remains valid; Mandate and Evidence are
  protocol controls, not competing product primitives.
