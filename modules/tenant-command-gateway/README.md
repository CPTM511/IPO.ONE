# Tenant Command Gateway

The Tenant Command Gateway is the authenticated, PostgreSQL-backed composition
boundary for IPO.ONE pilot commands. It is intentionally separate from the
anonymous, process-local public sandbox.

For every supported operation it derives Tenant, Actor, and client authority
only from a verified Authentication Context. API-002 first validates the
authority-free `tenant_protocol_request.v1` caller view, then acquires an
ABUSE-001 admission before object lookup, and composes authorization audit, event append,
projection writes, durable idempotency, command evidence, and quota completion
inside one serializable transaction.

The request schema version is bound into durable command identity. Every query,
planned command, committed command, and replay response must satisfy the closed
`tenant_protocol_result.v1` operation branch; a malformed handler result aborts
the transaction before business state can commit. The static catalog is checked
against handlers, authorization policy, abuse classification, conformance
fixtures, and the isolated public server in CI.

Authorization facts use advisory locks for deterministic cross-table ordering
and PostgreSQL row locks for MVCC conflict detection. Agent Memberships carry an
immutable Human controller, so a same-Tenant developer cannot claim another
controller's Agent Actor. Existing non-system Memberships migrate with no
allowed client until explicitly provisioned.

The reviewed DATA-003 operations cover Human-controlled Agent Subject creation,
Human-only creation and integrity-checked reading of a durable unsigned Mandate
draft, terminal reason-coded draft revocation, and the Agent's bounded self-read
query. DATA-003C also composes one strong-MFA, reason-coded protective Agent
Subject freeze for Risk and Operations Operators. Exact replay succeeds after
suspension, fresh freeze commands fail closed, and the Agent can still read its
suspended state. DATA-003D adds a recent-MFA `pilotReadTenantRisk` query for
Risk Operators and Auditors. It reads one serializable, forced-RLS snapshot of
Agent Subject, CreditLine, and Obligation projections; returns exact aggregate
minor-unit totals plus at most 50 deterministic asset exposures; and exposes no
Subject, Principal, account, Provider, Event/Evidence, KYC/KYP, Tenant, or PII
detail. The query records bounded admission and authorization audit only, never
a business Event, projection, execution, or idempotency record.

The later Human, Identity, Credit, Servicing, Evidence, and Pilot slices expand
the same closed boundary to 38 operations: Human Consent/identity references,
CAIP-10 Agent account proof, active sandbox Mandate acknowledgement, shared
Intent/Decision/Offer/Obligation, signed non-redeemable execution, balanced
repayment, deterministic DPD/cure/default, dual-controlled sandbox resolutions,
bounded Auditor plus exact owner/controller Evidence reads, exact owned current
Obligation read, the private Servicing Operations queue, and bounded Actor-bound
Human/Principal workspace recovery from durable server truth, an aggregate
Pilot Health funnel, and categorical Human/Agent design-partner feedback with an
aggregate-only Risk summary and no identifiers, free text, PII, or third-party analytics. The Auditor query
uses the existing recent-MFA capability, while owner/controller access is bound
to the exact Obligation. The queue separately requires recent phishing-resistant
MFA from Risk or Operations, returns bounded adverse sandbox cases without PII,
and grants no assignment, resolution, disposition, funds, or Agent MCP authority.

`RISK-002A` upgrades new authenticated evaluations to `risk_decision.v3`. One
server-derived point-in-time feature snapshot binds finalized source Evidence,
the Tenant-bound live risk-state query, and the exact checked-in policy hash;
one immutable Decision Passport exposes bounded reason lineage to Human and
Agent clients. The cap, term, rate, fee, permissions, and no-funds boundary are
unchanged, and the older educational score remains outside product truth.

Unfreeze remains absent and dual-control gated. Revocation
atomically closes the authorization resource while retaining
bindings for historical owner reads. Persistent Agent Subject and Mandate
admission is anchored to Tenant-scoped durable row counts before object lookup
and synchronized again inside the business transaction. Human BFF, Operator,
Risk/Auditor, and Agent clients use the same protocol envelope and have no direct database
access. This module is local non-funds infrastructure only; it does not expose
a public/private production route or authorize production deployment or funds.
