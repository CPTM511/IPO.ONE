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

The Membership, AccessGrant, authorization decision, and authorization audit
contracts describe the approved local non-funds AUTHZ-001 boundary. Runtime
authority is the intersection of an active credential, active Membership,
versioned operation policy, exact object ownership or AccessGrant, and current
domain controls. An authorization decision is short-lived, server-created, and
must be revalidated inside a durable command transaction before any mutation.

ApprovalProposal, ApprovalDecision, ApprovalExecution, break-glass incident,
custodian decision, and review contracts describe the local non-funds
APPROVAL-001 boundary. Proposals bind the exact command and current versions;
decisions bind distinct Actor, role, Credential, Membership, and MFA evidence;
execution links the two approvals to one idempotent business event set. Break
glass is represented separately because it can authorize only fixed protective
actions and never grants general or exposure-increasing authority. Production
roles, named custodians, notification delivery, and deployment activation are
not implied by these schemas.

The Abuse Control Policy contract freezes the approved local non-funds
ABUSE-001 classifications, hard ceilings, and public credential/discovery
profiles. Runtime counters store only tenant scope, low-cardinality policy
fields, and irreversible Actor/client/network/account references. Production
edge policy and a cross-tenant distributed global store remain deployment
decisions.

The Tenant protocol request, result, and catalog contracts define the local
API-002 Human/Operator/Agent application boundary. Each of the six implemented
operations has one closed request and result branch. Requests carry an explicit
schema version but no Authentication Context, Tenant, Actor, Credential, role,
authorization decision, or network-trust field. Results are validated before
durable commit. The protective Subject-freeze branch permits only reviewed
Risk/Operations actor types, reasons, and a `suspended` result; no unfreeze
branch exists. The catalog enables only `local_in_process`; it does not expose
an authenticated endpoint or authorize activation, credit, Human lending,
private data, or real funds.
