# M1-B Canonical Closure Evidence

## Evidence status

Status: `IMPLEMENTED_UNVERIFIED_AT_EXACT_DEPLOYED_COMMIT`

This report records reproducible local implementation evidence for
`REQ-CREDIT-009` and `REQ-UX-005`. It does not upgrade either Requirement and
does not claim deployment, RC, release, production, real funds, or mainnet
readiness. The final classification remains gated on one exact deployed commit
and the authenticated browser evidence required by the approved M1-B profile.

Base checkpoint:
`59dc448576553537b9bb4b702b308e461734dee3`

Working branch: `codex/m1-b-deployable-sandbox`

## REQ-CREDIT-009

### Implemented invariant

`credit_line.v2` is derived from the exact current Credit Intent, deterministic
Decision and policy hash, Capital Partner Offer, Offer Acceptance, Obligation,
Mandate, Facility, and canonical outstanding exposure. It is a capacity and
utilization projection only. It is not an independent credit authority.

Every Agent sandbox execution now performs the following checks before the
signed no-funds rail executes:

1. authenticated Agent and owned Obligation;
2. active Subject and Principal status;
3. current active Mandate and execution capability;
4. non-frozen current credit state;
5. exact Credit Intent, Decision, Offer, Acceptance, and Facility provenance;
6. current policy, terms, authority, and projection hashes;
7. current canonical outstanding exposure and committed limit;
8. allowlisted Provider ID in both Mandate and derived Facility;
9. Provider category in the current Mandate;
10. server-derived Facility purpose;
11. pending executable Obligation and absence of a prior execution receipt.

A missing, legacy, stale, inconsistent, frozen, closed, or over-cap projection
fails closed before execution. The caller cannot provide a CreditLine limit,
Facility purpose, exposure, or authority value.

### Signed Provider target

Agent sandbox execution requires the caller to select a Provider ID and
Provider category from the current Mandate. The server derives the purpose from
the verified Facility. The signed no-funds rail receipt and durable execution
receipt bind all three values:

- `providerId`
- `providerCategory`
- `purposeCode`

Mutation of any target field invalidates receipt verification. Human sandbox
execution remains on the shared Obligation and Ledger kernel without inventing
an Agent Provider target.

### Projection parity evidence

The PostgreSQL integration suite derives the current CreditLine, reads the
`credit_line_utilized` and `credit_line_released` Events, replays them through
the domain replay function, compares the replayed object with the latest
PostgreSQL projection snapshot, verifies its projection hash, and verifies the
expected utilization and limit.

The same suite proves that missing Provider input, a non-allowlisted Provider,
and a non-allowlisted category all fail with
`credit_facility_scope_mismatch` before the successful execution. It then
verifies the exact Provider target and purpose in
`sandbox_execution_receipts`.

## REQ-UX-005

### Implemented invariant

Agent Offer continuation is persisted as a server-side
`workspace_continuation_receipt.v1`. Each receipt is bound to:

- Tenant;
- authenticated Actor and Actor type;
- Subject;
- Mandate;
- Credit Intent;
- Risk Decision;
- Credit Offer ID and hash;
- terms hash;
- Offer schema version and aggregate version;
- issued time, expiry, status, and version.

The browser may cache a receipt, but cache content cannot create, change, or
restore canonical lifecycle truth. Workspace recovery reads current
authenticated server state.

### Authorization and lifecycle evidence

The PostgreSQL suite proves:

- exact persistence and idempotent replay;
- mismatched receipt rejection;
- cross-Actor and cross-Tenant invisibility;
- recovery after a new Gateway/repository instance;
- expiry exclusion;
- invalidation after Offer acceptance;
- explicit revocation exclusion;
- immutable binding fields and monotonic terminal state;
- forced RLS and the standard Tenant write guard.

Migration `0053_workspace_continuation_tenant_guard` deliberately adds the
Tenant write guard as a forward migration. It preserves the checksum of the
already-applied `0051` migration.

## Reproducible verification results

### Fresh PostgreSQL 17

Database:
`ipo_one_m1b_provider_v3_test_20260805` on an isolated local Unix socket.

Command shape:

```bash
DATABASE_URL='<fresh-postgresql-17-test-url>' pnpm run test:postgres
```

Result:

```text
tests 83
pass 83
fail 0
duration_ms 24926.146458
```

Coverage includes 53 migration pairs, full up/down/up checksums, non-superuser
migration, forced RLS, Tenant write guards, authentication restart safety,
event/outbox/inbox recovery, crash rollback, idempotency, shared Human and Agent
credit kernel, Provider target binding, continuation receipts, CreditLine replay
parity, Lockbox persistence, reconciliation, and the complete Tenant Gateway.

### Static and unit gates

Commands:

```bash
pnpm run lint
pnpm run typecheck
pnpm run check:schemas
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run check:m1-requirements
node scripts/check-m1-b-gate-profile.mjs
pnpm run check:web-bundle
pnpm test
```

Results:

```text
Source lint: PASS (574 JavaScript modules)
Boundary lint: PASS
Contract typecheck: PASS (3 export surfaces, 68 runtime exports)
Schemas: PASS (85 contracts)
OpenAPI: PASS (21 paths, 21 operations)
Migrations: PASS (53 ordered up/down pairs)
Tenant protocol: PASS (77 operations)
M1 Requirement gate: PASS (44/44 exact IDs)
M1-B Gate Profile validation: PASS (44/44 exact IDs)
Web bundle integrity: PASS (1 external module, 28 authored modules, 850 IDs)
Unit and contract tests: PASS (717/717)
```

The M1 Requirement gate continued to report:

```text
NOT_IMPLEMENTED: 1
WIRED_MOCK: 0
IMPLEMENTED_UNVERIFIED: 8
VERIFIED_SANDBOX: 35
VERIFIED_REAL: 0
PRODUCTION_READY: 0
```

No Requirement was upgraded by these test counts alone.

### Rebuilt local runtime

Commands:

```bash
pnpm local:up
pnpm local:acceptance
```

Result:

```text
Local stack: healthy at 127.0.0.1 ports 8787-8790
Local acceptance: PASS
PostgreSQL: 17
Migrations: 53
Worker heartbeat: PASS
Reconciliation: PASS
Pending outbox: empty
```

The local acceptance includes wallet-gated role workspaces, forced RLS, API and
worker runtime recovery, durable Agent proof, and Evidence anchor coverage. It
does not replace the required real authenticated Golden Flow.

## Preserved negative evidence

The retained local database contains one historical `credit_line.v1` row for
the seeded Agent Subject. The Reference Agent acceptance selects that historical
Subject and fails with `agent_obligation_workflow_failed`. A read-only database
query confirms the sole Agent CreditLine is `credit_line.v1` with zero
utilization.

This failure is expected fail-closed behavior under the canonical v2 rule. The
historical row was not deleted, rewritten, migrated by assertion, or treated as
authority. The fresh PostgreSQL suite and a fresh Agent Subject are the valid
paths for current v2 evidence.

## Remaining evidence gates

- real wallet browser authentication;
- fresh Agent browser lifecycle and fresh-browser continuation recovery;
- Risk/Admin authenticated view, freeze, and subsequent spend rejection;
- Playwright trace and screenshots;
- exact normal Git commit;
- explicitly authorized remote staging deployment and URL;
- deployed migration, database, restart, log, secret, health, and rollback
  evidence.

Until those gates close, `REQ-CREDIT-009`, `REQ-UX-004`, and `REQ-UX-005`
remain `IMPLEMENTED_UNVERIFIED` in the machine-readable Requirement evidence
registry.
