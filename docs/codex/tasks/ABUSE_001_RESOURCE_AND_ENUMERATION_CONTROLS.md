# ABUSE-001: Resource, Cost, and Enumeration Controls

Status: Implemented and verified for the SECURITY-001 local non-funds boundary.
Authenticated gateway composition, production store/edge policy, and deployment
remain unapproved gates.

## Context

The public sandbox has process-level safety limits but they are not customer
identity quotas or DDoS protection. A closed pilot needs coordinated edge and
application controls across network, Actor, client, tenant, operation,
resource, concurrency, queue, export, and economic-cost dimensions without
revealing whether another tenant's object exists.

## Implemented Scope

- Implement the SEC-D08 actor/tenant/operation defaults as versioned policy,
  with environment-specific values and hard global ceilings.
- Add bounded concurrency, command/event/projection bytes, open obligations,
  Providers, credentials, AccessGrants, export rows, queue depth, execution
  time, retries, and upstream cost budgets.
- Use a replaceable distributed quota-store boundary with deterministic local
  fixtures; production provider selection is a deployment review.
- Bind limits to verified Actor/Tenant/client context and trusted edge network
  reference only. Never trust arbitrary forwarding headers.
- Make high-impact mutation/admin/credential paths fail closed when quota state
  is unavailable; define bounded health/discovery behavior separately.
- Coordinate idempotency and retry accounting so one economic command cannot
  bypass limits or execute twice.
- Return stable retry metadata without object existence, tenant utilization,
  precise security thresholds, or upstream topology.
- Emit bounded aggregate telemetry and security audit without request bodies,
  query values, raw IPs, tokens, sandbox IDs, PII, or high-cardinality labels.

## Non-Goals and Residual Gates

- No claim that application quotas replace Cloud Armor, load-balancer quotas,
  provider controls, WAF, autoscaling bounds, or upstream spend limits.
- No adaptive credit scoring, surveillance fingerprinting, raw-IP retention,
  CAPTCHA requirement for Agent APIs, or hidden throttling policy.
- No production quota store, cloud resource, secret, real funds, or deploy.

## Primary Files

- `modules/abuse-control/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `db/migrations/0007_abuse_control_runtime.*.sql`
- `schemas/v2/abuse-control-policy.schema.json`
- `security/test/*`
- `docs/security/*`
- `docs/architecture/ADR-021-atomic-resource-and-enumeration-control.md`

## Acceptance Criteria

- Actor, tenant, operation, global, concurrency, size, count, queue, export,
  retry, and cost limits are explicit, versioned, and independently tested.
- Concurrent distributed requests cannot exceed a hard mutation budget by more
  than the documented atomic reservation model permits.
- Credential/login, admin/risk, reconciliation/export, and credit/spend paths
  have stricter policies and no automatic high-impact retry.
- Cross-tenant valid/invalid IDs produce the same status, problem shape,
  retry metadata class, and bounded timing envelope under limit pressure.
- Quota-store timeout/partition/recovery, clock skew, eviction, hot key,
  rollback, restart, and failover behavior is deterministic and fail-closed for
  protected mutations.
- Idempotent replay returns the prior response without duplicating economic
  state and cannot be used as an unbounded read or storage oracle.
- Load and adversarial suites prove bounded memory, CPU, DB connections,
  response size, log volume, and upstream call count.

Local acceptance is implemented through a closed policy registry, a bounded
in-memory atomic fixture, a PostgreSQL serializable adapter, and adversarial
tests. The authenticated `DATA-003` command gateway must supply the durable
completed-response lookup and actual command/upstream cancellation boundary;
this issue does not claim that declaring an execution budget cancels arbitrary
work. Production cross-Tenant global quotas, load sizing, provider budgets,
edge tuning, and alert ownership remain deployment evidence.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Security Checklist

- [x] SECURITY-001 SEC-D08 values are approved for local non-funds implementation.
- [x] Limits derive from verified Authentication Context and branded hashed network/account contexts.
- [x] Protected mutations fail closed when quota state is unavailable.
- [x] Atomic concurrency and distributed PostgreSQL race tests pass.
- [x] Errors and admission ordering do not enumerate cross-Tenant state or thresholds.
- [x] Telemetry excludes raw IP, unsafe-cardinality identifiers, PII, and credentials.
- [x] Edge, provider, process, and authenticated application controls remain independent layers.
- [x] Production store, cross-Tenant global policy, cloud policy, and deployment remain approvals.

## Implementation Evidence

- `abuse_001.v1` covers all 27 current authenticated Tenant operations exactly
  once and preserves every approved SEC-D08 rate.
- Human/Agent ingress can add only a server-created trusted network context;
  Tenant, Actor, and client always derive from Authentication Context.
- Actor, client, Tenant, operation, service, network, account, concurrency,
  byte, resource, queue, export, retry, and upstream-cost dimensions are
  explicit and capped by policy hard ceilings.
- Economic command charges use pending/succeeded/failed state. Concurrent
  duplicates are excluded; successful replay bypasses execution and duplicate
  resource/cost charge; failed commands release persistent resource deltas.
- Migration `0007` adds four Tenant-owned forced-RLS tables with hashed
  references and guarded admission/charge transitions.
- The PostgreSQL suite proves two-adapter atomic concurrency, restart-retained
  rates, replay, rollback, migration reversal, and complete catalog RLS
  coverage. The security suite proves closed inputs, bounded transient-record
  eviction, generic retry metadata, and no raw identity/network persistence.
- The PostgreSQL race fixture reserves at least five seconds in the active
  fixed-rate window before asserting restart retention, so a legitimate window
  rollover cannot create a time-dependent false failure.

## Verification Record

Verified on 2026-07-14 with Node.js `v24.18.0`:

- `pnpm run check`: 152/152 tests passed; 21 schemas, 21 OpenAPI operations,
  seven ordered migration pairs, 27 classified Tenant operations, and all
  boundary/policy gates passed.
- `pnpm run test:security`: 14/14 adversarial and production-ingress tests
  passed with loopback binding enabled for the test harness.
- `pnpm run test:postgres`: 17/17 PostgreSQL integration tests passed against
  an isolated local cluster, including distributed quota races, restart,
  replay, rollback, RLS, and migration reversal.
- `pnpm run smoke:api`: the complete local Agent Lockbox flow settled and
  reached `fully_repaid`, with 63 Evidence Envelopes and two ledger
  transactions.
- `pnpm audit --prod`: no known production dependency vulnerabilities found.
- `git diff --check`: passed.
