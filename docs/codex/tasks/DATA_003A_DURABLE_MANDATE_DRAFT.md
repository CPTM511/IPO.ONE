# DATA-003A: Durable Draft Mandate

Status: Implemented and verified locally under the approved SECURITY-001
non-funds boundary. This task is stacked on DATA-003 and does not approve a
public route or production activation.

## Context

DATA-003 provides an authenticated, PostgreSQL-backed Tenant Command Gateway
for Human Agent-Subject creation and Agent self-read. The next safe vertical
slice is a durable draft Mandate. A draft records intended authority but grants
no executable credit, spend, payment, custody, or withdrawal permission.

The existing abuse-control resource counters reserve command deltas, but a new
counter can understate pre-existing durable rows. This task therefore anchors
Agent-Subject and Mandate counters to domain truth in the serializable
pre-lookup admission transaction, then rechecks the same baseline and lock
order inside the business transaction before a projection commits.

## Scope

- Add a Human-only `pilotCreateDraftMandate` Gateway handler authorized against
  an existing Human-controlled Agent Subject.
- Derive Tenant, Principal, Subject, controller, and all authority fields from
  trusted context and durable state; accept none of them in the command payload.
- Validate a closed, bounded Mandate payload and persist one `mandate.v2`
  projection, event, Evidence envelope, outbox record, replay response, audit
  decision, authorization resource, and retained resource count atomically.
- Permit draft creation only while the Agent Subject is `pending` or `active`
  and its Principal is active.
- Serialize Principal-plus-nonce reuse and reject every non-idempotent reuse
  with `mandate_nonce_conflict`.
- Add conservative local hard ceilings for Agent Subjects and Mandates. Before
  object lookup, load the exact Tenant-scoped durable baseline under the
  Tenant-and-kind advisory lock and reserve `max(counter, baseline) + delta`.
  Recount and synchronize the same baseline inside the business transaction.
- Include at most 50 integrity-checked Mandate summaries in Agent self-read,
  with an explicit continuation indicator.
- Keep the anonymous public sandbox isolated and process-local.

## Non-Goals

- No Mandate activation, cryptographic signature, account challenge, CAIP-10
  binding, key rotation, or remote attestation; those remain AUTH-002.
- No credit approval, spend execution, Lockbox movement, payment, custody,
  withdrawal, provider call, chain transaction, or real funds.
- No Human credit, KYC/KYP, raw PII, production IdP, public API route, DNS,
  cloud resource, or deployment change.
- No lifecycle release for append-retained Agent Subject or Mandate records.

## Likely Files

- `modules/tenant-command-gateway/src/*`
- `modules/tenant-command-gateway/test*/*`
- `modules/abuse-control/src/*`
- `modules/persistence/src/postgres-core-repository.js`
- `db/migrations/0009_durable_identity_resource_capacity.*.sql`
- `schemas/v2/abuse-control-policy.schema.json`
- `docs/architecture/ADR-023-durable-draft-mandate.md`
- `README.md` and versioned guidance/status documents

## Acceptance Criteria

- A Human controller creates a draft Mandate for its Agent Subject, and the
  Agent can read a bounded summary through the shared protocol.
- A different Tenant, another same-Tenant controller, an Agent Actor, a
  suspended/closed Subject, an inactive Principal, and invalid payloads fail
  closed without a business write.
- Exact retries return the original response; changed payloads and reused
  Principal nonces do not create a second Mandate.
- Concurrent creation cannot bypass nonce serialization or persistent resource
  limits. Failed commands release their admitted delta; successful and replayed
  commands count exactly once.
- Projection registry/snapshot integrity, authorization audit, command
  authority, Evidence, outbox, RLS, and reconciliation remain clean.
- Migration up/down/up, unit/security/PostgreSQL tests, API smoke, dependency
  audit, and `git diff --check` pass.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run smoke:api
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] Work is inside the SECURITY-001 approved local non-funds boundary.
- [x] Draft status grants no executable authority.
- [x] Tenant, Actor, Subject, and Principal authority are not caller supplied.
- [x] Resource admission precedes object lookup and remains resource blind.
- [x] Live Subject state and Principal state are re-read under transaction locks.
- [x] Nonce reuse and resource baselines are serialized.
- [x] Payload, response, and Agent self-read are closed and bounded.
- [x] No signature, token, secret, raw account proof, KYC data, or PII is stored.
- [x] AUTH-002 and production deployment remain separate human approval gates.
