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

The Chain Profile and Chain Finality Proof contracts define the local
CHAIN-001A portability boundary for Base Sepolia and X Layer Testnet. Profiles
contain logical provider slots and synthetic safety policy, never RPC URLs or
credentials. Finality Proofs retain chain and transaction evidence while the
canonical Payment reference excludes chain/provider details. This boundary
makes no network call and always reports that no production funds moved.
The Sandbox Obligation Portability Receipt composes that boundary with a
validated Human or Agent no-funds lifecycle receipt. It binds the source
Obligation, repayment, and Ledger references to both ratified profiles while
requiring one canonical Payment reference and two profile-specific synthetic
Finality/Evidence hashes; it explicitly denies live testnet execution, keys,
credentials, withdrawals, network calls, and funds authority.

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
API-002 Human/Operator/Agent application boundary. Each of the 15 implemented
operations has one closed request and result branch. Requests carry an explicit
schema version but no Authentication Context, Tenant, Actor, Credential, role,
authorization decision, or network-trust field. Results are validated before
durable commit. The protective Subject-freeze branch permits only reviewed
Risk/Operations actor types, reasons, and a `suspended` result; no unfreeze
branch exists. The catalog enables only `local_in_process`; it does not expose
an authenticated endpoint or authorize production credit, Offer acceptance,
Obligation creation, execution, private data, or real funds. Its shared
Credit Intent branches accept an owned Human Consent or scoped Agent draft
Mandate and always emit `sandboxOnly = true` and
`productionFundsRequested = false`. The Tenant risk branch is a recent-MFA,
Risk/Auditor-only aggregate read with exact minor-unit totals, a 50-asset bound,
and no Tenant, Subject, Principal, account, Provider, Event/Evidence, KYC/KYP,
or PII detail.

The Agent Credit Offer workflow receipt contract closes the composed
TRANSPORT-001C output after the four reviewed local MCP tools. It reuses the
Tenant Credit Intent, Decision, and Offer summaries; fixes tool order and
response versions; and explicitly disables credentials, public/remote MCP,
production funds, and funds authority. The receipt is not acceptance,
Obligation, execution, Evidence, or a real credit approval.

The Agent Pilot Capability Manifest is a closed discovery packet over one
validated Agent Handoff Manifest. It freezes the exact six-tool local MCP
registry plus three staged SDK workflows: Offer, sandbox
Obligation/repayment, and local dual-chain portability conformance.
Availability is derived from draft/active Handoff state and exact Mandate
capabilities; the contract grants no operation, credential, endpoint,
economic MCP tool, live-chain execution, withdrawal, or funds authority.

The Agent Sandbox Obligation workflow receipt contract closes the subsequent
three-operation local Tenant protocol composition. It binds the accepted Offer
to one Mandate-owned shared `obligation.v2`, signed sandbox execution receipt,
principal Ledger transaction reference, and synthetic repayment. The contract
requires an executed partially or fully repaid Obligation and fixes
`productionFundsMoved = false` and `withdrawable = false`; it grants no MCP,
authentication, deployment, production credit, or funds authority.

The Human Credit Offer workflow receipt contract closes the authenticated
loopback `Human self-read -> Credit Intent -> application read -> deterministic
Decision/Offer` composition. It binds one owned Consent and current synthetic
identity-reference ID to canonical economic summaries while carrying no
credential, acceptance, execution, or funds authority.

The Human Sandbox Obligation workflow receipt contract closes the following
authenticated loopback composition: exact Offer acceptance, shared
`obligation.v2`, signed sandbox execution, principal Ledger reference, and one
sequenced synthetic repayment. It binds every step to the verified Human Offer
receipt, one Subject and Consent, one correlation identity, and deterministic
request identities. It fixes `productionFundsMoved = false`,
`withdrawable = false`, `fundsAuthority = false`, and contains no credential,
raw KYC/PII, session, or CSRF material.

The Provider Intent View, Provider Intent Acknowledgement, and signed Provider
Sandbox Callback contracts define the approved PROVIDER-001A loopback boundary.
They expose one AccessGrant-bound, redacted TransferIntent; treat acknowledgement
as receipt only; and bind a five-minute Ed25519 callback to the exact Provider,
intent, delivery hash, nonce, key ID, and canonical payload hash. They cannot
carry account destinations, credentials, PII, withdrawals, settlement authority,
or production funds state.

The operations-control contracts separate an ephemeral `operational_alert.v1`
candidate from durable `operational_alert_state.v1`. Durable state adds a
monotonic version and lifecycle while preserving only bounded source hashes;
the linked dual-native synthetic result proves Human Offer, Agent Offer,
shared Obligation/repayment parity, receipt linkage, and zero-difference full
reconciliation against one exact release. Neither contract grants notification,
acknowledgement, resolution, automatic action, deployment, or funds authority.
