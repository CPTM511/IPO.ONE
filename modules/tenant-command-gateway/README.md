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
suspended state. Unfreeze remains absent and dual-control gated. Revocation
atomically closes the authorization resource while retaining
bindings for historical owner reads. Persistent Agent Subject and Mandate
admission is anchored to Tenant-scoped durable row counts before object lookup
and synchronized again inside the business transaction. Human BFF, Operator,
and Agent clients use the same protocol envelope and have no direct database
access. This module is local non-funds infrastructure only; it does not expose
a public route, activate a Mandate, or authorize production deployment.
