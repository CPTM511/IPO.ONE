# DATA-003: Durable Tenant Command Gateway

Status: Sequenced after SECURITY-001 approval; implementation is not yet
authorized.

## Context

DATA-002 and RECON-001 provide durable normalized repositories, immutable
snapshots, reconciliation, and approval-gated repair. The public API still uses
isolated process-local sandbox sessions because no approved Tenant/Actor/AuthN/
AuthZ model exists. Wiring PostgreSQL directly into that unauthenticated API
would turn a safe demo into shared unauthenticated customer state.

## Scope After Approval

- Compose the durable core repositories behind authenticated tenant command
  handlers, not behind the public demo session controller.
- Derive Actor and Tenant only from the verified security context.
- Load current normalized state inside the serializable command transaction.
- Execute shared domain invariants and commit the full event/projection write
  set through the DATA-002 unit of work.
- Require command idempotency, object ownership, live Mandate/SpendPolicy/risk
  checks, reason/approval fields, and authorization audit events.
- Expose separate Human BFF and Agent API clients over the same tenant-scoped
  protocol commands.
- Keep the current no-auth public sandbox isolated and clearly labelled.

## Non-Goals

- No implementation before SECURITY-001 SEC-D01 through SEC-D09 approval.
- No real funds, custody, Human lending, production provider, or raw PII.
- No migration of anonymous sandbox sessions into tenant customer records.
- No direct database access from browser or Agent clients.

## Acceptance Criteria

- Two-tenant negative tests cover every object route and command.
- A process restart preserves command state and idempotent response.
- Concurrent mutations serialize or fail with a stable stale-version response.
- Authorization denial commits no business projection and emits bounded audit.
- Reconciliation passes after every complete Agent Lockbox command sequence.
- The unauthenticated public sandbox cannot address durable tenant objects.

## Planned Test Commands

```sh
pnpm run check
pnpm run test:postgres
pnpm run test:security
pnpm run smoke:api
```

## Security Checklist

- [ ] SECURITY-001 approval is recorded.
- [ ] Tenant derives from verified context, never request data.
- [ ] Object ownership and RLS both fail closed.
- [ ] No token, secret, signature, raw account proof, or PII is persisted.
- [ ] Public sandbox and tenant command routes use separate state boundaries.
- [ ] Production activation remains a separate deployment approval.
