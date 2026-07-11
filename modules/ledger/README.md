# Ledger

The ledger module is the accounting source of truth for demo monetary state.
It records immutable, asset-scoped double-entry transactions and exposes
derived balances, turnover, trial balances, and integrity checks.

Every posting requires:

- a unique idempotency key;
- at least two distinct active accounts;
- positive unsigned integer minor-unit amounts;
- one asset across all accounts; and
- equal debit and credit totals.

The module is in-memory and is not custody. Production use requires a durable
database transaction spanning journal rows, domain state, and an outbox, plus
reconciliation, access controls, operational approvals, and independent audit.
