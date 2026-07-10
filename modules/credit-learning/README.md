# credit-learning

Owns transparent rule-based credit learning and reputation updates for the public MVP demo.

It demonstrates a feedback loop:

behavior -> signal -> score -> risk tier -> next credit terms

This module is deterministic and auditable. It is not production reinforcement learning, not black-box AI scoring, and not financial advice.

Public interface: `CreditLearningService`.
