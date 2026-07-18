# API Contract Package

Defines two authority-free API contract layers:

- transport-level request correlation and RFC 9457-compatible Problem Details
  for the anonymous public sandbox; and
- the closed, transport-neutral `tenant_protocol_request.v1`,
  `tenant_protocol_result.v1`, and `tenant_protocol_catalog.v1` contracts for
  the 34 reviewed local durable Tenant operations, including the shared
  no-funds credit/servicing lifecycle, protective controls, aggregate
  Risk/Auditor portfolio read, and redacted owner/controller plus Auditor
  Obligation Evidence views and the private read-only PII-free Servicing
  Operations queue.

The package also validates the separate Human HTTP and Agent MCP Credit Offer
Workflow Receipts plus the local Human and Agent sandbox Obligation workflow
receipts. Those close approved Offer acceptance, shared `obligation.v2`,
signed non-withdrawable sandbox execution, Ledger reference, and synthetic
repayment result without adding a remote endpoint or funds authority. The
separately approved local MCP registry v2 exposes the corresponding bounded
self-owned tools, including exact current Obligation read. `assertDualNativeCreditOfferParity(...)` reduces two valid
Offer Receipts to one closed `dual_native_offer_economics.v1` view and fails if
principal, purpose, term, schedule, policy, approved amount, APR, fee,
disclosure, schedule offsets, or no-funds flags drift. Subject/authority IDs,
hashes, transport steps, absolute timestamps, and authority-specific reason
evidence are intentionally excluded from the shared economic truth.
The evaluated application response is now
`tenant_credit_application_evaluated.v2`; both entry modes must carry one
bounded `risk_decision_passport.v1`. Offer parity compares the exact policy hash
and feature-set identity before emitting its hash-free economic summary.
`assertDualNativeSandboxObligationParity(...)` performs the corresponding
closed comparison after acceptance and proves that Human Consent and Agent
Mandate entries preserve one principal/schedule, execution amount/adapter,
repayment waterfall/result, servicing classification, DPD state, and no-funds
safety profile. Entry-specific IDs, hashes, source codes, transport steps, and
absolute timestamps are excluded.

`agent_pilot_capability_manifest.v1` is the non-authorizing discovery contract
for those existing Agent surfaces. It nests one validated handoff, pins the
exact eleven-tool local MCP registry, and lists the Offer,
Obligation/repayment, and dual-chain portability SDK workflows with derived
availability. Validator logic regenerates the manifest from its handoff so
tool, entry-point, receipt-version, availability, next-action, endpoint,
credential, live-chain, or funds drift fails closed. The three economic
lifecycle tools remain authenticated, self-owned, sandbox-only,
nonwithdrawable, and local-stdio-only.

`sandbox_obligation_portability_receipt.v1` then binds either validated
lifecycle receipt to the Base Sepolia and X Layer Testnet CHAIN-001A profiles.
The validator recomputes the chain-neutral canonical Payment reference, kernel
invariant, and whole-receipt integrity hash; it rejects profile identity,
source-entry, or safety drift. The contract contains synthetic Finality Proof
and Evidence hashes only and states that no network call, live testnet
execution, credential, private key, withdrawal, or production-funds movement
occurred.

The Tenant protocol validator uses pinned Ajv with strict schemas, no type
coercion, defaults, additional-field removal, or remote schema loading. Human,
Operator, Risk/Auditor, and Agent clients validate caller data before a trusted adapter injects
Authentication Context or network facts. The Gateway validates results before
a command can commit. The catalog and TypeScript declarations grant no
authentication, authorization, tenant, billing, deployment, or fund-movement
behavior.

Unknown server failures are deliberately redacted. Domain errors retain stable
machine codes and client-actionable descriptions without exposing stacks,
database errors, filesystem paths, or secrets. Approved admission errors may
add only the closed `manual`, `short`, or `long` retry class; configured limits,
Tenant utilization, object existence, and infrastructure topology are never
serialized.

Run catalog, handler, policy, fixture, dual-native economic parity, and
public-boundary conformance with
`pnpm run check:tenant-protocol`.
