# DATA-003: Durable Tenant Command Gateway

Status: In progress for the SECURITY-001 local non-funds boundary. The durable
transaction foundation, Human Agent-Subject creation, Human-controlled draft
Mandate creation, bounded Agent self-read, and protective Agent Subject freeze
are implemented and verified. Remaining Agent Lockbox, worker, approval,
unfreeze/limit, and administrative handlers are not yet composed. No public
route or deployment is approved.

## Context

DATA-002 and RECON-001 provide durable normalized repositories, immutable
snapshots, reconciliation, and approval-gated repair. TENANT-001, AUTHN-001,
AUTHZ-001, APPROVAL-001, and ABUSE-001 now provide approved local non-funds
security boundaries. The public API still uses isolated process-local sandbox
sessions because those boundaries have deliberately not been composed into an
authenticated Tenant gateway. Wiring PostgreSQL directly into that anonymous
API would turn a safe demo into shared unauthenticated customer state.

## Scope After Approval

- Compose the durable core repositories behind authenticated tenant command
  handlers, not behind the public demo session controller.
- Derive Actor and Tenant only from the verified security context.
- Acquire an ABUSE-001 admission before any resource lookup, bind it to the
  same Actor/client/operation/idempotency identity, and coordinate successful
  persistent-resource accounting with the business transaction. Lease expiry
  must never roll back a resource count for a business mutation that committed.
- Load current normalized state inside the serializable command transaction.
- Execute shared domain invariants and commit the full event/projection write
  set through the DATA-002 unit of work.
- Require command idempotency, object ownership, live Mandate/SpendPolicy/risk
  checks, reason/approval fields, and authorization audit events.
- After authenticating the current Actor/Tenant, recover an already-completed
  same-command idempotent response before mutable resource/live-state checks
  can misclassify a post-restart retry. Unseen or conflicting commands must
  still pass full authorization and revalidation before any mutation.
- For break-glass protective commands, bind the configured requester plus the
  current incident status, version, expiry, exact action, and exact resource in
  the same transaction as the business mutation; a process-branded
  authorization is not durable authority after restart.
- Expose separate Human BFF and Agent API clients over the same tenant-scoped
  protocol commands.
- Keep the current no-auth public sandbox isolated and clearly labelled.

## Implemented Foundation

- Migration `0008_durable_tenant_command_gateway` adds versioned Membership
  client/policy facts, immutable Human-to-Agent controller assignment,
  versioned AccessGrants, authorization resources, multi-Actor resource
  bindings, append-only authorization audit, and append-only command execution
  authority with forced RLS. Legacy Memberships fail closed until explicitly
  provisioned to a client.
- `TenantCommandGateway` acquires a distributed admission before lookup and
  owns the serializable transaction through admission completion.
- Existing event/core repositories support caller-owned transaction methods;
  the legacy standalone transaction API remains compatible.
- Exact payload hashes now bind authorization decisions, revalidation, and
  approval command hashes.
- Human, Operator, and Agent protocol clients share one closed handler
  registry. The reviewed operations implement `pilotCreateAgentSubject`,
  `pilotCreateDraftMandate`, `pilotReadMandate`,
  `pilotRevokeDraftMandate`, `pilotReadAgentSelf`, and `pilotFreezeSubject`.
- API-002 publishes closed `tenant_protocol_request.v1`,
  `tenant_protocol_result.v1`, and `tenant_protocol_catalog.v1` contracts for
  exactly those six operations. Caller validation precedes trusted AuthN/
  network-context injection and admission; result validation precedes command
  commit. The request schema version is part of exact command identity.
- Repository conformance proves catalog parity with handlers, authorization,
  abuse classification, fixtures, and public-sandbox isolation. TypeScript
  discriminated unions expose the same operation/result mapping without adding
  a network endpoint.
- Migration `0009_durable_identity_resource_capacity` adds conservative Agent
  Subject and Mandate resource ceilings. Handler baseline loaders reconcile
  durable Tenant counts during pre-lookup admission and again inside the
  business transaction before a new projection commits.
- Two-Tenant, same-Tenant controller-confusion, concurrent Membership
  revocation, Subject-state race, Principal nonce/revocation races, replay after
  authorization-resource closure, protective draft revocation under inactive
  Subject/Principal state, conflicting reuse, persistent-capacity boundary,
  denial-only audit, append-only tamper, bounded-read, and reconciliation tests
  pass.
- DATA-003C composes `pilotFreezeSubject` for Risk/Operations Operators with
  strong recent MFA, a reviewed protective reason, privileged admission,
  row-locked live state, atomic Event/Evidence/projection/audit completion,
  exact replay, Agent visibility, and concurrent single-transition proof.
- ADR-022 records transaction ownership, replay ordering, advisory/row lock,
  and public-sandbox isolation decisions.

## Remaining Composition

- Signed Mandate activation, active-Mandate lifecycle, and verified CAIP-10
  binding setup under AUTH-002.
- Agent credit request, allowlisted spend, Lockbox revenue capture, automated
  repayment, and associated live-state adapters.
- Worker, approval, unfreeze/limit risk, audit/export, and reconciliation
  command handlers over the same Gateway protocol.
- Complete two-Tenant negative coverage for each newly composed operation.
- Deployment-specific IdP, Credential persistence/provisioning, least-
  privilege role manifest, retention jobs, alerting, and edge controls.

## Non-Goals

- No implementation outside the approved SECURITY-001 SEC-D01 through SEC-D09
  local non-funds boundary.
- No real funds, custody, Human lending, production provider, or raw PII.
- No migration of anonymous sandbox sessions into tenant customer records.
- No direct database access from browser or Agent clients.

## Likely Files After Approval

- `apps/api/src/*`
- `modules/authorization/*`
- `modules/identity/*`
- `modules/persistence/*`
- `packages/api-contract/*`
- `api/openapi/ipo-one.v1.json`
- `db/migrations/*`
- `security/test/*`
- `docs/architecture/*`

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

- [x] SECURITY-001 local non-funds approval is recorded.
- [x] Tenant derives from verified context, never request data.
- [x] Implemented object ownership and RLS both fail closed.
- [x] No token, secret, signature, raw account proof, or PII is persisted by
  the Gateway.
- [x] Public sandbox and Tenant Gateway use separate state boundaries.
- [ ] Production activation remains a separate deployment approval.
