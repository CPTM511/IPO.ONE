# Authorization

The authorization module owns delegated `Mandate` state. A Mandate binds an
economic Principal to a Subject and constrains which protocol capabilities may
be used, against which providers/categories/assets, during what time window,
and within what monetary limits.

Authorization is fail-closed. Risk and spend modules consume this service
through an injected interface so they always evaluate current revocation,
expiry, scope, and utilization state. Reservation IDs make retries idempotent.

This local implementation is in-memory and demo-only. Production authorization
requires authenticated callers, signed mandate proofs, durable nonce handling,
transactional reservations, and human review of permission changes.
