# Rail Module

The Rail module is the sandbox-only reference implementation of IPO.ONE's
provider-neutral transfer boundary. It models policy-bound Transfer Intents,
exact quotes, submission references, immutable Settlement Receipts, finality,
reversal, idempotency, optimistic versions, and event replay.

The module does not transfer funds, call a provider, load plugin code, verify a
production webhook, or persist events durably. Its in-process adapter is a
deterministic conformance fixture and always returns `productionFundsMoved:
false`. Production Rail adapters require separate human review.
