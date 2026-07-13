# IPO.ONE Protocol Schemas

`schemas/v2` contains the language-neutral contracts introduced by Protocol
Kernel v0.2. Runtime builders perform the same fail-closed checks in the domain
package; these JSON Schemas are the interoperability surface for SDKs,
adapters, plugins, storage, and external review.

JSON Schema cannot enforce double-entry debit/credit equality by itself. That
invariant is enforced by the ledger service and is also represented by a
deferred database constraint in the baseline migration.

The Rail contracts model payment transport without claiming settlement by
implication. `transfer-intent.v2` is the event-sourced aggregate,
`transfer-quote.v2` contains exact integer/rational economics, and
`settlement-receipt.v2` records outcome and finality as immutable evidence. The
only current descriptor is sandbox-only; production Rail schemas and adapter
certification remain review-gated.

The authentication context and lifecycle-event contracts describe the approved
local non-funds AUTHN-001 boundary. They contain keyed references and security
metadata only, never bearer tokens, cookies, authorization codes, signatures,
private keys, raw external subjects, or PII. They are not exposed by the public
sandbox and do not represent an authorization decision.
