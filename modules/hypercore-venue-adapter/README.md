# HyperCore Venue Adapter

This module implements the repository-local, no-funds slice of
`HYPERLIQUID-002`.

It adds the ADR-038 Venue Execution Provider SPI, a hash-only
master/subaccount binding, a one-use API-wallet delegate lifecycle, exact
order/cancel/modify action compilation, and explicit `l1_action` versus
`user_signed_action` signing-request contracts. It reuses the existing
Hyperliquid Info, execution, risk and reconciliation modules as downstream
fixtures; it does not create a second Facility, CreditLine, Obligation, Ledger
or Evidence kernel.

## Deliberately disabled

- `approveAgent` and external delegate deregistration;
- private-key generation, import, export, persistence or logging;
- official live signature computation;
- `/exchange` network transport or any Hyperliquid Testnet write;
- withdrawal, transfer, leverage and account-mode actions;
- HyperEVM, mainnet, production and real-value authority.

`SIMULATED_ACTIVE` means only that local lifecycle invariants were exercised.
It never claims that Hyperliquid registered the API wallet. Terminal delegate
addresses are durably tombstoned and cannot be reused.

The live Testnet proof remains a separate Founder review gate under ADR-035 and
ADR-038.
