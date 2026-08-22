# M2A-006 — Canonical Obligation and Evidence integration

Status: `IMPLEMENTED_AND_LOCALLY_VERIFIED — L0_LOCAL_NO_FUNDS`

Issue owner: IPO.ONE Founder / Product / Engineering

Founder instruction: `继续M2A-006` on 2026-08-23

Baseline: `origin/main` at `6f4a1e0b98676e37bd8d39b05daf66145cfbd03b`

## Context

M2A-005 durably normalizes and finalizes one closed Pool V1 event stream, but
its hash-only finalized-effect outbox is not yet connected to the canonical
IPO.ONE Subject, Principal, AccountBinding, Obligation, Ledger, Evidence or
Credit State. ADR-M2-003 requires finalized authenticated pool effects to enter
the existing Event/Evidence/outbox unit of work without creating a second
economic kernel.

This issue is an `L0_LOCAL_NO_FUNDS` integration slice. All inputs are local,
deterministic and synthetic. It selects no provider, RPC, signer, credential,
asset deployment, contract deployment, transaction, public endpoint,
commercial parameter or real value.

## Scope

- Add one exact, Tenant-isolated binding from an active dual-native execution
  AccountBinding and its self-Principal Subject to one existing canonical
  `obligation.v2` and one configured Pool V1 position tuple.
- Admit only a matching chain, contract, market and position account.
- Consume only an M2A-005 `finalized` effect backed by its normalized finalized
  observation; pending, safe, invalidated or missing observations fail closed.
- Import each admitted effect exactly once through the existing PostgreSQL
  Event, Evidence, outbox and canonical Ledger transaction boundary.
- Maintain one rebuildable pool-to-Obligation projection linked to the
  canonical Obligation rather than creating a new Obligation or Ledger.
- Materialize non-authorizing Credit State linkage only for a terminal,
  finalized position outcome; it must never increase or create credit
  authority.
- Preserve restart, replay, concurrency, RLS and additive Evidence behavior.

## Non-goals

- No second Subject, Principal, AccountBinding, Obligation, Ledger, Evidence,
  Credit State or reconciliation truth.
- No browser-owned state, new Human/Agent UX, public API, SDK or MCP surface;
  those are M2A-007.
- No pool contract change, wallet call, RPC read, signer, transaction,
  deployment, public endpoint, testnet run or funds movement.
- No automatic CreditLine or Offer increase and no credit decision derived
  from pool history.
- No inference of commercial price, caps, asset admission, legal treatment,
  loss bearing or production permissions.

## Files likely to modify

- `packages/domain/src/` — closed pool/Obligation binding and effect mapping.
- `modules/tenant-command-gateway/src/` — Gateway-owned system integration
  service over the existing persistence boundary.
- `modules/persistence/src/` and `db/migrations/0065_*` — additive binding,
  projection and receipt persistence with forced RLS.
- `modules/event-indexer/src/` — exact finalized-effect claim/read interface if
  required; no new RPC reader.
- focused domain, Gateway and PostgreSQL tests.
- M2 execution-plan and requirement-traceability evidence updates.

## Acceptance criteria

1. Given an existing active Human or Agent Subject whose primary Principal is
   the Obligation Principal, and an active `account_binding.v3` for the exact
   CAIP-10 pool position account, when the binding is created, then exactly one
   immutable binding links that position to exactly one `obligation.v2`.
2. Given a wrong Subject, wrong Principal, revoked binding, wrong chain, wrong
   contract, wrong market or wrong position account, binding or ingestion fails
   closed without any partial write.
3. Given a matching finalized Pool V1 effect and its finalized normalized
   observation, when integration runs, then one canonical domain Event, one
   portable Evidence envelope, one canonical outbox message, one balanced
   Ledger transaction where the effect has an attributable economic amount,
   one effect receipt and one rebuilt Obligation projection commit atomically.
4. Given a duplicate or concurrent replay of the same effect, then the original
   response is returned and no Event, Evidence, Ledger entry, receipt or
   projection version is duplicated.
5. Given a pending, safe, invalidated, missing, malformed or mismatched effect,
   then no canonical economic Event or Evidence is finalized.
6. Given process restart or database restore followed by replay, then the same
   ordered finalized effects reproduce the same projection and state hash.
7. Human direct-wallet and Agent authenticated entry fixtures converge at the
   same binding and integration contract; neither creates a separate kernel.
8. Any terminal Credit State linkage is explicitly non-authorizing,
   non-scoring, no-limit-change, no-funds and Evidence-derived.
9. No raw PII, KYC, signature, RPC payload, transaction calldata or secret is
   persisted by this slice.

## Test commands

```bash
node --test packages/domain/test/pool-obligation-integration.test.js
node --test packages/domain/test/sandbox-credit.test.js
DATABASE_URL=<isolated-local-test-db> node --test modules/tenant-command-gateway/test-postgres/pool-obligation-integration.test.mjs
pnpm run check:migrations
pnpm run test:postgres
pnpm run check
pnpm audit --prod
```

The PostgreSQL suite must explicitly cover forced RLS, atomic rollback,
idempotency/concurrency, restart/replay and wrong-Subject/wrong-chain denial.

## Security checklist

- [x] Exact active `account_binding.v3`, Subject, primary Principal,
  Obligation, chain, contract, market and CAIP-10 position are revalidated in
  the write transaction.
- [x] Only finalized M2A-005 effects backed by finalized normalized
  observations are admitted.
- [x] Event identity is the M2A-005 `(chain, contract, tx hash, log index)`
  identity; duplicates cannot create another economic effect.
- [x] Writes use the existing Tenant security context and forced RLS.
- [x] Domain Event, Evidence, canonical outbox, Ledger, effect receipt and
  projection are one atomic unit of work.
- [x] Ledger postings are balanced, attributable and idempotent; non-economic
  or non-position events do not fabricate amounts.
- [x] Credit State remains outcome-derived, non-authorizing and incapable of
  changing limits or policy.
- [x] Raw PII/KYC/signatures/provider payloads/calldata/secrets are absent.
- [x] No RPC, signer, transaction, deployment, public endpoint or funds action
  is introduced.

## Permission boundary

The Founder instruction authorizes this exact local, synthetic, no-funds issue.
It does not authorize live RPC access, a contract or asset deployment, a
signer, transaction, public endpoint, testnet run, commercial/risk parameter,
real value or production. Each such step remains separately named and reviewed.

## Migration impact

Migration `0065` is additive. It may add Tenant-scoped pool/Obligation bindings,
rebuildable current projections and append-only integration receipts. Existing
Obligation, Ledger, Event, Evidence, outbox and Credit State tables remain the
canonical stores. The application role receives only the exact new-table
privileges required by the local integration worker.

## Rollback plan

Disable the integration adapter and stop claiming new finalized-effect outbox
records. Preserve M2A-005 observations/finalized effects and all already
committed Event, Evidence and Ledger history. Rebuild the additive projection
from immutable finalized effects. Migration down is allowed only when no
binding, receipt or projection rows exist; otherwise it must fail closed.

## Completion Evidence

- focused protocol and mapping conformance tests;
- PostgreSQL forced-RLS, atomicity, concurrency, replay, restart and restore
  evidence;
- linked M2A-005 effect, domain Event, Evidence, Ledger transaction, projection
  and state hashes;
- full migration, lint, typecheck, unit and production-dependency audit output;
- one issue-sized PR with required remote checks passing before merge; and
- a still-working local IPO.ONE Human and Agent experience link, while
  truthfully stating this backend slice has no new user-facing surface.

Local implementation Evidence on 2026-08-23:

- six focused Pool/Obligation domain cases and five shared sandbox accounting
  cases pass, including execution-rail exclusivity, finalized source ordering,
  exact CAIP-19 debt-asset matching and terminal installment settlement;
- the isolated PostgreSQL case passes atomic rollback, concurrent replay,
  restart replay, forced RLS, Event/Evidence/outbox/Ledger linkage and terminal
  non-authorizing Credit State materialization;
- a fresh database applies all 65 migrations; migration 0065 rolls down and up
  on an empty database; the complete PostgreSQL suite passes 90/90;
- production-runtime EIP-191 verification remains real cryptographic
  verification while its EOA classification RPC is a deterministic local
  read-only fixture, so this L0 suite performs no public RPC access; and
- full repository `pnpm run check` passes, including 90/90 PostgreSQL and
  1129/1129 unit tests; `pnpm audit --prod` reports no known vulnerabilities;
  remote checks, merge SHA and browser/local-link Evidence are recorded at
  final handoff.

Dependencies: M2A-005 is merged at `6f4a1e0`. M2A-007 and every live reader,
testnet, deployment, signer, transaction, public endpoint or real-value step
remain separately gated.
