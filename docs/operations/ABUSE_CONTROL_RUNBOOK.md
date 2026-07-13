# ABUSE-001 Local Admission Runbook

Status: Local non-funds verification runbook; not production operations approval
Date: 2026-07-14

## Boundary

`ABUSE-001` is an authenticated command-admission control. It does not replace
Cloud Armor, load-balancer policy, process limits, provider budgets, database
connection limits, autoscaling limits, incident response, or a production
distributed global quota store. It is not connected to the anonymous public
sandbox.

## Expected Signals

Only aggregate low-cardinality telemetry is allowed:

- surface: `tenant`, `discovery`, or `credential`;
- quota class: `read`, `mutation`, `economic`, `privileged`, `batch`, `worker`,
  `discovery`, or `credential`;
- outcome: admitted, denied, completed, failed, or expired; and
- reason: rate, capacity, size, retry, idempotency, unavailable, execution, or
  none.

Do not add Tenant, Actor, client, command, resource, network/account hash, raw
IP, token, credential, request body/query, PII, configured threshold, current
utilization, database host, or provider topology as a metric or log label.
Investigations that need command evidence must use separately authorized audit
records, not quota rows.

## Triage

1. `request_budget_exceeded`: inspect aggregate class/reason trends and edge
   traffic independently. Do not confirm object existence or reveal a limit.
2. `idempotency_in_progress`: verify the command gateway does not execute the
   mutation and uses bounded retry guidance. A completed command must use the
   durable response path, not a second mutation.
3. `request_admission_unavailable`: fail protected commands closed. Check the
   quota datastore, statement-timeout rate, pool saturation, and database
   health without switching to an uncoordinated in-process counter.
4. Rising `expired`: investigate handlers exceeding their approved execution
   lease, worker loss, or completion failures. Do not increase leases above the
   hard ceiling without policy review.
5. Resource-counter underflow/corruption: pause affected creation commands,
   compare counters with durable domain truth, retain audit evidence, and repair
   only through a reviewed idempotent reconciliation command. Never clamp or
   delete a live counter by hand.

## Recovery Semantics

- Expired pending admissions release concurrency/queue and roll back pending
  persistent-resource deltas; their command charge becomes failed.
- Successful persistent-resource deltas remain until an authorized domain
  lifecycle command explicitly releases them.
- Successful idempotent command charges remain for the bounded replay window.
  Expired charges and unreferenced completed admissions are transient and may
  be cleaned after 24 hours.
- Rate attempts are not refunded after capacity denial or handler failure.
- Backward application clock movement must not reopen in-memory windows.
  PostgreSQL time is authoritative for durable buckets and leases.

## Deployment Gates

Before any private pilot, require reviewed evidence for:

- `DATA-003` transactional composition and durable completed-response replay;
- production Human IdP and workload credentials;
- production quota/global store and region/failover behavior;
- edge policy, provider/upstream budgets, connection/autoscaling bounds, and
  actual execution cancellation;
- load results and false-positive review for each Actor/client/Tenant class;
- resource-counter reconciliation and operator repair authority;
- dashboards, alerts, named on-call/incident/takedown owners, retention, backup,
  restore, and disaster recovery; and
- independent security review with no open P0/P1 finding.

No limit increase, fail-open fallback, private data, external Provider, KYC/KYP,
custody, credit, or fund path is authorized by this runbook.
