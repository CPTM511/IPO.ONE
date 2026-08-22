# ADR-M2-003: Pool/kernel source-of-truth split

Status: Proposed; governance ratification required

## Context

ADR-010 makes the IPO.ONE Ledger canonical for application economic truth;
ADR-029 separates observation, inclusion, finality and reorg; ADR-034 prohibits
a second Facility ledger. A secured pool adds authoritative on-chain balances
that cannot be overwritten by an off-chain projection.

## Decision

| Domain | Authority |
| --- | --- |
| Pool token custody and cash | on-chain pool |
| LP shares, exchange rate and claims | on-chain pool |
| Collateral, debt shares and accrued debt | on-chain pool |
| Oracle-accepted price, health and liquidation | on-chain pool |
| Subject, Principal and AccountBinding | IPO.ONE kernel |
| Consent/Mandate, Offer and authorization | IPO.ONE kernel |
| Cross-rail Obligation and servicing projection | IPO.ONE kernel, derived from authenticated finalized pool events |
| Portable Evidence, Credit State and disclosure | IPO.ONE kernel |
| Observation, finality and discrepancy state | durable adapter/indexer/reconciliation system |

Every pool mutation maps to one chain transaction receipt, zero or more ordered
logs and exactly one idempotent normalized IPO.ONE event per admitted log. The
event identity is `(chainId, contractAddress, transactionHash, logIndex)`; its
payload binds block hash, ABI/version, position/market reference and finality.
No digest, pending transaction or provider acknowledgement is canonical
Evidence of a completed economic effect.

The adapter must:

1. admit only the configured chain, contracts and event topics;
2. decode closed ABI shapes and reject ambiguous or duplicate logs;
3. persist observation before projection;
4. advance inclusion -> safe -> finalized monotonically;
5. invalidate non-final observations on reorg without deleting history;
6. import finalized effects into the existing Event/Evidence/outbox unit of
   work; and
7. reproduce the same projection after replay, restart and database restore.

## Discrepancy protocol

Any non-rounding discrepancy is material:

```text
freeze new off-chain risk authorization
-> preserve repay/add-collateral/protective operations where safe
-> re-read chain state through two configured RPC observations
-> compare event-derived and direct-read state
-> append reason-coded discrepancy Evidence
-> repair only through authenticated chain facts or additive correction
-> resume only after zero unexplained discrepancy and approved recovery
```

The expected tolerance is zero base units except a formula-specific, documented
rounding bound. Off-chain state never writes back over chain state. The pool
cannot accept an off-chain balance assertion as economic truth.

## Novelty, risk and mitigation

- Novel element: two authoritative domains with a canonical mapping rather than
  one database-only economy.
- Risk: reorg, missed/duplicated logs or stale RPC reads diverge the Obligation.
- Mitigation: log identity, finality states, idempotency, direct-read
  reconciliation, replay and monotonic freeze.
- Simpler safe alternative: expose chain state without creating IPO.ONE
  Obligations. Rejected for M2 because it would not prove composition with the
  shared kernel, but retained as a diagnostic fallback.

## Alternatives rejected

- PostgreSQL as pool balance authority: cannot override token custody.
- Chain events as the sole IPO.ONE identity/authority model: leaks wallet
  identity into protocol semantics and omits Mandate/privacy controls.
- Silent last-write-wins repair: destroys auditability.
- Immediate finality at transaction inclusion: unsafe under reorg/replacement.

Permission/funds/deployment impact: **none in this ADR**. It authorizes no RPC,
contract, indexer deployment, transaction or repair. Exact finality depths,
RPCs and contract addresses require the proposed L3 launch profile and run
approval.
