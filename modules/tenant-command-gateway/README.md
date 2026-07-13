# Tenant Command Gateway

The Tenant Command Gateway is the authenticated, PostgreSQL-backed composition
boundary for IPO.ONE pilot commands. It is intentionally separate from the
anonymous, process-local public sandbox.

For every supported operation it derives Tenant, Actor, and client authority
only from a verified Authentication Context, acquires an ABUSE-001 admission
before object lookup, and composes authorization audit, event append,
projection writes, durable idempotency, command evidence, and quota completion
inside one serializable transaction.

Authorization facts use advisory locks for deterministic cross-table ordering
and PostgreSQL row locks for MVCC conflict detection. Agent Memberships carry an
immutable Human controller, so a same-Tenant developer cannot claim another
controller's Agent Actor. Existing non-system Memberships migrate with no
allowed client until explicitly provisioned.

The first DATA-003 handlers cover a Human-controlled Agent Subject creation
command and the Agent's self-read query. Both Human BFF and Agent clients use
the same protocol envelope and have no direct database access. This module is
local non-funds infrastructure only; it does not expose a public route or
authorize production deployment.
