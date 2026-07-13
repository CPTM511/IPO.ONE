# ADR-021: Atomic Resource and Enumeration Control

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

The public sandbox's process-level request and session bounds protect a
synthetic demo, but they are not customer identity quotas or a closed-pilot
admission system. A Human/Agent protocol must bound network, account, Actor,
client, Tenant, operation, service, concurrency, storage, export, queue,
execution, retry, and upstream cost without turning limits into an object
existence, Tenant utilization, or infrastructure oracle.

Naive middleware is unsafe here. Client-supplied Tenant or Actor values are
forgeable; checking an object before a quota can enumerate it; per-process
counters oversubscribe across replicas; rolling a rate attempt back after a
capacity denial rewards abusive retries; and timing out with `Promise.race`
can return a denial while an uncancelled datastore reservation commits later.

## Decision

1. `abuse_001.v1` classifies all current authenticated Tenant operations
   exactly once as read, mutation, economic, privileged, batch, or worker.
   Separate closed profiles cover discovery and credential attempts.
2. SEC-D08 values are preserved exactly. Additional local-pilot client,
   network, operation, service, concurrency, byte, count, queue, execution, and
   cost bounds sit below immutable hard ceilings and remain subject to load
   evidence before deployment.
3. Tenant, Actor, and client derive only from a server-created Authentication
   Context. Network and account dimensions accept only branded pre-hashed
   references from a reviewed ingress/authentication adapter. No forwarding
   header, raw IP, resource ID, request body, query, token, PII, or credential
   enters admission state or telemetry.
4. Admission runs before resource resolution. A denial therefore has one
   stable code, problem shape, and coarse retry class regardless of whether a
   probed resource is valid, missing, or belongs to another Tenant.
5. Rate attempts are non-refundable. Concurrency and queue units release on
   completion or lease expiry. Persistent resource deltas reserve before a
   command, remain after success, and roll back after failure. Explicit domain
   lifecycle transitions release retained resource counts.
6. Economic and other mutation classes require idempotency. One pending command
   excludes a duplicate. One succeeded command returns a replay disposition
   and does not reserve its economic cost or persistent resource delta again.
   Durable response storage and lookup remain in the command repository.
7. High-impact economic, privileged, and batch commands prohibit automatic
   retry. Errors expose only `manual`, `short`, or `long`; precise thresholds,
   utilization, resource existence, and topology remain private.
8. The deterministic in-memory adapter performs one synchronous atomic
   reservation step, clamps backward clock movement, bounds entries, evicts
   only completed/expired transient admissions, and fails closed before
   evicting active leases or command charges.
9. PostgreSQL migration `0007_abuse_control_runtime` adds rate, capacity,
   admission, and command-charge tables with forced RLS, Tenant write guards,
   hashed references, guarded transitions, bounded arrays/values, and
   reversible migration. `PostgresQuotaStore` uses serializable retries,
   conditional atomic updates, restart lease cleanup, and a database statement
   timeout. It never uses an uncancelled application timeout race.
10. Aggregate telemetry uses only fixed surface, quota-class, outcome, and
    reason dimensions. Security audit and command Evidence remain separate
    concerns; quota rows are transient controls, not an audit source.
11. The local PostgreSQL adapter proves shared per-Tenant quotas across
    instances. Its service dimension is still Tenant-partitioned by RLS. A
    production cross-Tenant global store, edge policy, provider budgets,
    autoscaling limits, and notification ownership remain deployment gates.
12. No public route, production store, cloud policy, private data, external
    Provider, KYC/KYP, custody, credit, or funds are activated by this ADR.

## Consequences

- Human and Agent commands share one policy and one non-enumerating admission
  model without embedding product-specific checks in HTTP middleware.
- Current process and edge limits remain independent layers instead of being
  mislabeled as authenticated customer quotas.
- ADR-022 and the DATA-003 foundation now compose admission before
  authorization/resource lookup and coordinate admission completion with the
  local non-funds business transaction. Production deadline cancellation,
  cross-Tenant global limits, and deployment atomicity remain unapproved.
- Resource counters need lifecycle release and reconciliation against durable
  domain truth. They do not replace Obligation, Provider, Credential, or
  AccessGrant repositories.
- Capacity values are conservative pilot defaults, not production sizing or an
  SLA. Load tests, false-positive review, provider selection, multi-region
  behavior, alerting, and independent security review remain required.

## Verification

- `pnpm run check:abuse-policy`
- `pnpm run check`
- `pnpm run test:security`
- `pnpm run test:postgres`
- `pnpm run smoke:api`

The tests prove closed classification, approved defaults, hard ceilings,
trusted-context derivation, resource-blind denial, low-cardinality telemetry,
bounded eviction, failure rollback, idempotent replay, shared-store atomic
concurrency, migration up/down/up, forced RLS, restart persistence, and
PostgreSQL multi-adapter races.
