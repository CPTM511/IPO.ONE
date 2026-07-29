# CREDIT-OUTCOME-001 — Durable Local Credit Outcome Materialization

## Status

Implemented locally. This issue grants no remote worker, production model,
capital, signer, deployment, or real-funds authority.

## Context

The local closed-pilot path already persists the shared Human/Agent decision,
Offer, Obligation, synthetic execution, repayment, servicing state and
Evidence. The protected local worker did not yet turn terminal repayment or
write-off facts into a durable outcome label. Without that boundary, later
credit-model iteration could use unverifiable labels, substitute future
features into an earlier decision, or accidentally make a demo score
authoritative.

## Scope

- Add an immutable Tenant-scoped `credit_outcomes` projection.
- Materialize only approved `risk_decision.v3` decisions whose bound
  `obligation.v2` is `fully_repaid` or `written_off`.
- Preserve the exact decision-time feature snapshot and its hashes.
- Bind the terminal Obligation, decision Evidence and Obligation Evidence.
- Emit a Domain Event, Evidence envelope and outbox message atomically with the
  outcome.
- Run the bounded materializer from the existing unsigned local worker.
- Make duplicate workers safe with row locks, deterministic idempotency and one
  outcome per Tenant/Obligation.
- Prove transaction rollback followed by safe retry.

## Non-goals

- No score update, limit increase, Offer, Facility or lending authority.
- No self-training or automatic model promotion.
- No raw transaction history, raw KYC/PII or strategy storage.
- No remote worker activation or deployment change.
- No real funds, signer, Hyperliquid write, or contract mutation.

## Likely files

- `packages/domain/src/credit-outcome.js`
- `modules/credit-learning/src/postgres-credit-outcome-materializer.js`
- `apps/private-pilot/src/local-worker.js`
- `db/migrations/0043_durable_credit_outcomes.*.sql`
- related unit and PostgreSQL integration tests

## Acceptance criteria

1. Human and Agent terminal sandbox Obligations produce the same
   `credit_outcome.v1` shape.
2. Non-terminal or production-authorizing sources are rejected closed.
3. Each outcome copies the immutable decision-time feature snapshot.
4. Outcome labels are limited to `on_time_repaid`,
   `late_or_modified_repaid`, and `written_off`.
5. Outcome, Domain Event, Evidence and outbox are one atomic transaction.
6. A process failure rolls back all partial state and a later run succeeds.
7. Repeated runs do not duplicate outcomes, events, Evidence or outbox.
8. Tenant RLS and append-only guards protect the projection.
9. All authority, funds, economic mutation, PII/raw-transaction and
   authoritative-score flags remain false.
10. Migration up/down/up, static checks, unit tests and PostgreSQL tests pass
    under the repository Node 26.5.x runtime.

## Test commands

```sh
pnpm run check:migrations
pnpm test
DATABASE_URL=postgresql://..._test pnpm run test:postgres
pnpm run check
```

## Security checklist

- [x] Shared Human/Agent obligation kernel; no forked credit semantics.
- [x] No raw PII, KYC payload, account address, strategy or raw transactions.
- [x] Decision snapshot and Evidence hashes are immutable.
- [x] No automatic authorization, funds movement or economic mutation.
- [x] No model release or next-limit recommendation.
- [x] Tenant RLS, deterministic idempotency and `SKIP LOCKED`.
- [x] Transaction fault retry is covered.
- [x] Remote access and deployment stay disabled.

## Rollback

Disable the materializer in the local worker first. Migration rollback is
allowed only while `credit_outcomes` is empty; once outcomes exist they are
Evidence and must not be silently deleted.
