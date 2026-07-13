# Abuse Control

`modules/abuse-control` is the approved local non-funds `ABUSE-001` request
admission boundary. It classifies every authenticated Tenant operation and
reserves bounded request, concurrency, resource, queue, export, retry, and
upstream-cost capacity before object resolution or business execution.

It is not the public sandbox's process limiter and it is not DDoS protection.
The anonymous sandbox remains isolated. Cloud Armor, load-balancer policy,
provider limits, autoscaling bounds, and a production distributed global quota
store remain independent deployment controls.

## Approved Defaults

| Class | Approved SEC-D08 default |
| --- | --- |
| Discovery/health | 30 requests/minute/trusted network reference |
| Human/Agent reads | 600/minute/Actor; 3,000/minute/Tenant |
| General mutations | 120/minute/Actor; 600/minute/Tenant |
| Credit/spend/capture/repay | 30/minute/Actor; idempotency required |
| Credential/login/recovery | 10 attempts/10 minutes/account and network |
| Admin/risk mutation | 30/minute/Actor; no automatic retry |
| Reconciliation/export | 6/minute/Tenant; queue, size, and time bounded |

`abuse-policy.js` adds conservative local-pilot operation, client, network,
service, concurrency, byte, count, and cost values under immutable hard
ceilings. `check:abuse-policy` rejects missing operation classifications,
weakened idempotency, automatic high-impact retries, SEC-D08 drift, schema
drift, or values above those ceilings.

## Admission Semantics

1. Tenant, Actor, and client come only from a process-branded Authentication
   Context. Network/account dimensions require separately branded contexts
   containing pre-hashed references; forwarding headers and raw IPs are not
   accepted.
2. Input shapes are closed and contain no resource identifier. Limit pressure
   therefore occurs before object lookup and cannot reveal whether another
   Tenant's object exists.
3. Rate attempts never roll back. Concurrency and queue capacity release on
   completion or lease expiry. Persistent resource deltas remain after success
   and roll back after failure.
4. A pending idempotent command excludes duplicates. A succeeded command
   produces a replay admission, so `executeAdmitted` calls only the supplied
   completed-response loader and never the mutation handler. The durable
   command response remains the responsibility of `DATA-003`, not the quota
   store.
5. Store failure is a generic `request_admission_unavailable`; budget denial is
   `request_budget_exceeded`. Problem Details expose only `manual`, `short`, or
   `long` retry guidance, never thresholds, utilization, identifiers, or
   topology.
6. Telemetry has a fixed low-cardinality surface/class/outcome/reason tuple and
   contains no Tenant, Actor, client, resource, network, credential, token, raw
   IP, request body, query, or PII value.

`InMemoryAtomicQuotaStore` is the deterministic fixture and enforces a bounded
entry count with completed-record eviction. `PostgresQuotaStore` is a local
multi-instance proof: it uses the existing serializable Tenant transaction,
forced RLS, transaction-local trusted context, atomic bucket updates, a bounded
statement timeout, restart-safe leases, and guarded admission/charge
transitions. PostgreSQL service-wide buckets remain Tenant-partitioned; a true
cross-Tenant distributed global layer is a deployment decision.

## Composition Boundary

This module is not wired to `apps/api` and does not authorize deployment. The
future `DATA-003` gateway must acquire admission before resource resolution,
load same-command completed responses through the durable command repository,
apply authorization/live checks, and coordinate successful quota completion
with the business transaction. It must also enforce actual execution and
upstream deadlines; declaring `executionMs` is not cancellation by itself.

Until that gateway is implemented and reviewed, do not place private Tenant
data, production credentials, external Providers, KYC/KYP, custody, credit, or
funds behind this boundary.

## Verification

```sh
pnpm run check:abuse-policy
pnpm run check
pnpm run test:security
DATABASE_URL=postgresql://127.0.0.1:5432/ipo_one_test pnpm run test:postgres
```
