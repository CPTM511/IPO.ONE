# Agent Credit Execution Boundary

This module composes the existing shared IPO.ONE credit, Trading Capital,
Hyperliquid simulation, reconciliation, Ledger, repayment and Evidence
capabilities for `AGENT-CREDIT-EXEC-001`.

The runtime is deliberately `L0_LOCAL_NO_FUNDS`:

- all capital, fills, PnL and repayments are synthetic and non-redeemable;
- the Agent supplies an intent, never a venue action, account, target or signer;
- the isolated signer is simulated and non-exportable;
- unknown, stale, unauthorized, frozen or unreconciled state fails closed;
- mainnet, network transport, production credentials and real value are absent.

After a canonical full repayment, the runtime finalizes the shared
`credit_outcome.v1` and rebuilds the shared `credit_state_projection.v1` from
finalized Evidence. Both records are non-authorizing: they cannot change a
limit, release collateral, unfreeze risk or create a new Facility. A partial
repayment remains non-terminal and produces no positive Credit Outcome.

The sibling `@ipo-one/reference-economic-agent` package is the independent
client. It does not import this module or any IPO.ONE internals.
