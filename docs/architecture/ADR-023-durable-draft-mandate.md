# ADR-023: Durable Draft Mandate and Domain-Anchored Capacity

Status: Accepted for local non-funds implementation under SECURITY-001
Date: 2026-07-14

## Context

ADR-022 established one serializable command boundary for authorization,
events, projections, Evidence, idempotency, audit, and abuse admission. The
first composed command creates a Human-controlled Agent Subject. The next
Developer Control Plane primitive is a Mandate, but cryptographic activation
and account ownership proof are not yet approved or implemented.

ADR-021 persistent counters reserve a delta before object lookup. A counter
introduced after durable rows already exist can be lower than domain truth,
and a request-only rate limit does not bound persistent Agent Subjects or
Mandates. The fix must preserve pre-lookup admission while preventing both
legacy undercount and concurrent oversubscription.

## Decision

1. DATA-003A composes only Mandate creation in `draft` status. Draft Mandates
   cannot authorize credit, spend, payment, custody, or withdrawal.
2. The command is Human-only, requires `mandate.draft.create`, and authorizes
   against the existing Agent Subject resource. Tenant, Subject, Principal,
   controller, and bindings derive from trusted context and durable state.
3. The payload is closed and bounded. Capabilities, provider/category scopes,
   assets, integer limits, validity window, nonce, and opaque terms reference
   are normalized before `mandate.v2` construction. Raw PII and secrets remain
   prohibited.
4. Subject projection state is integrity checked and row locked during both
   authorization and revalidation. Only `pending` or `active` Agent Subjects
   with an active Principal may receive a draft.
5. Principal-plus-nonce reuse is protected by a transaction advisory lock and
   the database uniqueness constraint. Completed exact retries are recovered
   before mutable checks; any unseen command reusing the nonce fails closed.
6. Successful creation registers the Mandate as an authorization resource
   bound to the Human controller and Agent subject for future reviewed
   operations. Registration grants no capability by itself.
7. `agent_subjects` and `mandates` become bounded persistent resource kinds.
   Every handler declaring a positive persistent delta must also provide an
   exact, closed baseline loader for the same resource kinds.
8. Before object resolution, the quota store invokes that loader inside its
   serializable admission transaction. The loader takes a Tenant-and-kind
   advisory lock and counts durable rows under RLS; admission reserves only if
   `max(existing counter, durable baseline) + admitted delta` is within the
   immutable ceiling. No resource ID is accepted or inspected on this path.
9. The business transaction repeats the same locked count and synchronizes the
   counter to at least `durable baseline + admitted delta` before writing the
   new projection. On failure, only the admitted delta is released. On success
   it is retained; exact replay loads neither a new baseline nor a new delta.
   Existing rows, concurrent commands, stale counters, and retries therefore
   converge on one conservative count.
10. Agent self-read returns at most 50 integrity-checked Mandate summaries and
    an explicit `hasMoreMandates` flag. A dedicated paginated contract remains
    future API work.
11. AUTH-002 retains ownership of signed Mandates, account challenges,
    CAIP-10 proof, nonce/key rotation, activation, and revocation authority.
12. No public route, deployment, provider execution, KYC/KYP, Human lending,
    custody, chain transaction, credit, or real funds are activated here.

## Consequences

- The Human and Agent surfaces now share a durable, replay-safe Mandate draft
  without implying that unsigned data is executable authority.
- Persistent resource enforcement is anchored to domain truth even when a
  counter is introduced after existing records.
- Append-retained Agent Subject and Mandate counts are monotonic. Any future
  deletion, archival, or lifecycle release requires an explicit domain command
  plus reconciliation evidence.
- Production cap calibration, paging, signed activation, provider selection,
  and public routing remain named gates rather than hidden follow-up work.

## Verification

- Unit tests cover closed payloads, derived authority, bounded self-read, and
  resource-delta declarations.
- PostgreSQL tests cover two-Tenant and same-Tenant denial, state rejection,
  nonce replay/conflict, concurrent mutation, counter floor/retention/rollback,
  migration reversal, forced RLS, and reconciliation.
- Full commands: `pnpm run check`, `pnpm run test:security`,
  `pnpm run test:postgres`, `pnpm run smoke:api`, and `pnpm audit --prod`.
