# settlement

Provides the `settlement.v1` compatibility view over Rail submission and
immutable `settlement_receipt.v2` evidence. It has no independent settlement
map or source of truth. All current execution is deterministic and sandbox-only;
no provider network or production funds are involved.

Public interface: `SettlementService`.
