# ABUSE-001: Resource, Cost, and Enumeration Controls

Status: Sequenced after SECURITY-001 approval and authenticated tenant context.
Implementation is not yet authorized.

## Context

The public sandbox has process-level safety limits but they are not customer
identity quotas or DDoS protection. A closed pilot needs coordinated edge and
application controls across network, Actor, client, tenant, operation,
resource, concurrency, queue, export, and economic-cost dimensions without
revealing whether another tenant's object exists.

## Scope After Approval

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

## Non-Goals

- No claim that application quotas replace Cloud Armor, load-balancer quotas,
  provider controls, WAF, autoscaling bounds, or upstream spend limits.
- No implementation before SECURITY-001 approval and verified context.
- No adaptive credit scoring, surveillance fingerprinting, raw-IP retention,
  CAPTCHA requirement for Agent APIs, or hidden throttling policy.
- No production quota store, cloud resource, secret, real funds, or deploy.

## Likely Files

- `modules/authorization/*`
- `modules/admin/*`
- `apps/api/src/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `security/test/*`
- `docs/security/*`
- `docs/operations/*`
- deployment templates after separate approval

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

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Security Checklist

- [ ] SECURITY-001 SEC-D08 values and owners are approved.
- [ ] Limits derive from verified context and trusted proxy configuration.
- [ ] Protected mutations fail closed when quota state is unavailable.
- [ ] Atomic concurrency and distributed race tests pass.
- [ ] Errors and timing do not enumerate cross-tenant state or thresholds.
- [ ] Telemetry excludes raw IP, identifiers with unsafe cardinality, PII, and credentials.
- [ ] Edge, provider, and application controls remain independent layers.
- [ ] Production store and cloud policy remain deployment approvals.
