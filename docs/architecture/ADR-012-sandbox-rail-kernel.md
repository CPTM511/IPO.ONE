# ADR-012: Event-Sourced Sandbox Rail Kernel

- Status: Accepted for the local MVP; production rail adoption requires review
- Date: 2026-07-11

## Context

IPO.ONE needs one payment language across provider payments, Web2 on/off-ramps,
and Web3 settlement. A boolean `settled` flag cannot represent authorization,
quote expiry, asynchronous submission, chain or bank finality, reversals, or
replay. Loading arbitrary plugin code into that path would also collapse the
plugin trust boundary.

## Decision

The protocol-facing rail flow is:

```text
Policy Decision + Mandate
  -> Transfer Intent
  -> Quote
  -> Authorization
  -> Submission
  -> Settlement Receipt(s)
```

- `TransferIntent` is the versioned aggregate and contains only opaque account
  reference hashes, never bank details, secrets, or raw credentials.
- Aggregate state is reduced from append-only events. The local runtime keeps no
  second mutable Rail state store.
- Every mutating command carries an idempotency key and expected aggregate
  version. Reuse is accepted only for an identical command payload.
- Quotes use integer minor units and an exact rational conversion. Same-asset
  and cross-asset arithmetic cannot hide floating-point rounding.
- `SettlementReceipt` is immutable evidence with explicit outcome and finality.
  A reversal appends evidence; it never rewrites settlement history.
- Adapters are injected trusted code at composition time. Plugin manifests may
  describe remote adapters, but the runtime does not dynamically load or execute
  third-party plugin code.
- This issue ships one deterministic sandbox adapter only. It does not make a
  network request and always reports `productionFundsMoved: false`.

The existing `payment_instruction.v1` and `settlement.v1` responses remain
temporary compatibility projections over the Rail aggregate. They are not
independent sources of truth.

## Consequences

- Web2 and Web3 integrations can share lifecycle, idempotency, evidence, and
  finality semantics while keeping provider-specific behavior in adapters.
- Provider spend cannot reach the Rail without both an approved SpendPolicy
  decision and a current Mandate check.
- In-memory replay is demonstrable, but crash durability remains blocked on the
  separately reviewed PostgreSQL repository and transactional outbox work.
- Production adapter certification, webhook verification, custody, pricing,
  compliance, and operational controls remain explicit future gates.
