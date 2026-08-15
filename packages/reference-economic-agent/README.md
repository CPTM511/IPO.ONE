# Reference Economic Agent

This package is an intentionally isolated third-party-style client for
`AGENT-CREDIT-EXEC-001`.

It knows only four generic concepts:

- a wallet-capable economic Agent identity;
- a `CreditProvider` port;
- an `ExecutionVenue` port;
- immutable receipts returned by those ports.

It does not import IPO.ONE domain, database, Gateway, signer, policy or storage
implementations. The server derives all authority, venue actions, accounts,
limits and settlement values. Replacing IPO.ONE or Hyperliquid requires an
adapter change, not a change to this Agent.

The reference strategy is deliberately minimal: request a purpose-bound
Facility, request one bounded BTC open intent, request a close, reconcile, and
repay. It contains no alpha, portfolio or custody behavior.
