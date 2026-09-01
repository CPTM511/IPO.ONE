# credit-learning

Owns transparent rule-based credit learning and reputation updates for the public MVP demo.

It demonstrates a feedback loop:

behavior -> signal -> score -> risk tier -> next credit terms

This module is deterministic and auditable. It is not production reinforcement learning, not black-box AI scoring, and not financial advice.

`PostgresCreditOutcomeMaterializer` is the durable no-funds boundary for the
shared Human/Agent kernel. It turns only finalized repayment or write-off
Evidence into an immutable `credit_outcome.v1` record. The record preserves the
decision-time feature snapshot, is retry-safe and explicitly has no authority
to change limits, approve credit, move funds or release a model.

Public interfaces: `CreditLearningService`,
`PostgresCreditOutcomeMaterializer`.

`RISK-003B` adds one deliberately narrow finalized-Testnet shadow adapter in
`packages/domain/src/risk-003b-shadow-learning.js`. It preserves a reconciled
`loss_outstanding` outcome without falsely mapping it to `fully_repaid` or
`written_off`, separates decision-time features from the outcome window, and
produces only versioned, privacy-safe, non-authorizing offline Evidence. A
single sample must remain `insufficient_sample`; it cannot promote a model,
loosen a limit, change the deterministic active policy, or call an external
action.
