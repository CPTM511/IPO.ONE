# ADR-033: Evidence-Derived Risk Decision Passport

Status: Accepted for the local no-real-funds pilot

Date: 2026-07-17

## Context

ADR-030 established one deterministic Human/Agent Credit Decision and Offer.
That v2 Decision bound the Credit Intent and reason codes, but it did not freeze
the exact point-in-time source Evidence, feature definition, policy hash, or
reason-to-feature lineage. The older process-local score is educational DEMO
infrastructure and cannot satisfy the Product Charter v1.1 Evidence standard.

## Decision

The authenticated Tenant Gateway now creates `risk_decision.v3` through one
shared Human/Agent path. The Decision contains:

- one closed `credit-application-evidence-features.v1` snapshot;
- immutable source projection hashes, aggregate versions, source Event IDs,
  finalized Evidence hashes, and roles;
- one server-derived, Tenant-bound hash of the exact adverse-Obligation and
  frozen-CreditLine query result;
- one checked-in `credit-application-rules.v1` policy manifest and policy hash;
- a Decision hash bound to the policy and feature snapshot; and
- one `risk_decision_passport.v1` binding Decision, policy, feature set,
  reason-to-feature lineage, time, and non-authorizing safety flags.

The feature snapshot and passport remain embedded in the existing immutable
Risk Decision projection. They commit with the Decision Event, Evidence,
Outbox, aggregate version, command response, and idempotency record in the same
serializable transaction. No parallel risk source of truth is introduced.

The evaluated application result advances to
`tenant_credit_application_evaluated.v2`. Its bounded passport summary exposes
policy, feature-set, source Evidence hashes/finality, risk-state hash, and
reason lineage to both the Human UI workflow and Agent SDK/MCP workflow.

`risk_decision.v2` remains readable and usable only for historical fixture and
stored-row compatibility. The authenticated evaluation handler cannot create
it after this ADR.

## Invariants

- Callers submit no feature, score, policy, Evidence, Decision, or trusted time.
- Positive eligibility features require finalized source Evidence from locked
  Tenant projections in the evaluation transaction.
- The exact policy cap, term, rate table, fee, validity, disclosure, denial
  priority, reason codes, and feature lineage determine one policy hash.
- Human Consent/identity Evidence and Agent Mandate/principal-binding Evidence
  stay explicit while sharing one policy and economic kernel.
- The risk-state absence proof is a server query attestation; absence is never
  represented as a fabricated external event.
- Snapshot, passport, row, projection, Event, and Evidence are immutable.
- `sandboxOnly=true`, `productionAuthority=false`, and
  `nonAuthorizing=true` cannot be promoted through this path.

## Consequences

Benefits:

- An auditor, Human user, or Agent can identify which policy and Evidence
  produced a Decision without trusting UI text.
- Human/Agent parity now covers policy identity and feature-set identity, not
  only Offer economics.
- Policy drift changes a deterministic hash and becomes visible to contract and
  replay tests.
- No new permission, external data provider, or production underwriting service
  is required for this local increment.

Costs and limits:

- v3 rows and responses are larger and require bounded Evidence/lineage arrays.
- Source facts remain synthetic/private-pilot facts; the passport proves
  provenance, not production creditworthiness.
- Production policy registry, legal adverse-action handling, KYC/identity,
  model validation, overrides, risk limits, pricing, deployment, and real funds
  remain separate named approvals.

## Rejected Alternatives

- Keep only reason codes: insufficient point-in-time provenance.
- Add a second mutable risk-snapshot service: creates competing truth and
  replay drift.
- Accept caller feature vectors: permits score/feature forgery and breaks the
  shared kernel.
- Promote the educational score: conflicts with the no-black-box Product
  Charter constraint.
- Change caps or rates inside the provenance upgrade: would silently broaden a
  separately reviewed risk/pricing decision.
