# RAIL-001: Sandbox Rail Kernel

Status: Complete for the local interactive MVP; production rail adoption is not
approved.

## Context

IPO.ONE must bridge Web2 and Web3 payment systems without making a provider,
chain, or settlement mechanism part of the protocol core. The architecture
review calls for a versioned `RailAdapter` boundary and explicit
`TransferIntent` and `SettlementReceipt` objects. The current demo only records
an unrelated payment instruction and settlement row, so it cannot prove
idempotency, finality, replay, or adapter portability.

## Scope

- Define closed, versioned schemas for Rail descriptors, Transfer Intents,
  Transfer Quotes, and Settlement Receipts.
- Add an event-sourced Rail Service whose state is rebuilt from protocol events.
- Require an approved SpendPolicy decision and a live, in-scope Mandate before
  an Agent provider-spend transfer may be authorized or submitted.
- Add optimistic aggregate versions and command idempotency conflict detection.
- Add a trusted, in-process sandbox adapter and a conformance harness.
- Make quote expiry, amount/rate arithmetic, settlement finality, failure,
  reversal, and terminal-state behavior explicit.
- Route the existing payment and settlement demo APIs through the Rail Service
  while retaining their response shapes as compatibility projections.
- Expose rail state, receipts, and replay integrity in the API and public demo.
- Add SQL migration structures, adversarial tests, and architecture docs.

## Non-Goals

- No real funds, custody, bank account, stablecoin transfer, swap, bridge, or
  provider network request.
- No production webhook trust, signature verification, credential storage,
  remote adapter execution, or dynamic code loading.
- No new production dependency, database runtime, chain client, or deployment.
- No change to the canonical Obligation lifecycle or production permissions.
- No claim that the in-memory EventStore is durable or transactionally backed
  by PostgreSQL.
- No Human credit, KYC/KYP decision, raw PII, or fiat account data.

## Likely Files

- `packages/domain/src/*`
- `modules/rail/*`
- `modules/payment/*`
- `modules/settlement/*`
- `modules/event-audit/*`
- `packages/mvp-flow/*`
- `schemas/v2/*`
- `db/migrations/0001_mvp_foundation.*.sql`
- `apps/api/*`
- `apps/web/*`
- `docs/architecture/*`
- `README.md`

## Acceptance Criteria

- Given a provider spend without an approved policy decision or live Mandate,
  when authorization or submission is attempted, then the transfer fails
  closed without appending a transfer-state event.
- Given an idempotency key reused with the same command, when it is replayed,
  then no duplicate event or receipt is created; conflicting reuse is rejected.
- Given a stale aggregate version, an expired quote, invalid amount arithmetic,
  or a terminal transfer, when a mutation is attempted, then it is rejected.
- Given a submitted sandbox transfer, when finalized success evidence arrives,
  then one immutable Settlement Receipt is appended and state becomes settled.
- Given the same append-only events in a fresh Rail Service instance, when the
  aggregate is read, then the rebuilt intent and receipt state are identical.
- Given a finalized settlement, when a finalized reversal is recorded, then the
  intent becomes reversed without deleting or rewriting prior evidence.
- The public vertical slice shows the Rail, Transfer Intent, finality, and replay
  proof while continuing to state that no production funds moved.
- `npm run check`, `npm run demo`, API smoke tests, and browser verification pass.

## Test Command

```sh
npm run check
npm run demo
```

## Security Checklist

- [x] SpendPolicy cannot be bypassed by creating a Transfer Intent directly.
- [x] Mandate revocation and expiry are rechecked immediately before submit.
- [x] Raw account details, PII, secrets, and signatures are not stored in rail
      events; only opaque hashes and references are accepted.
- [x] Amounts use integer minor units and exact rational quote arithmetic.
- [x] Adapter and receipt idempotency conflicts fail closed.
- [x] Settlement finality and reversal remain explicit and append-only.
- [x] Third-party executable code cannot be registered or loaded.
- [x] Every adapter and receipt is visibly sandbox-only and reports
      `productionFundsMoved: false`.
- [x] Production rails, permissions, custody, dependencies, and deployment stay
      gated by human review.

## Verification Evidence

- `npm run check`: boundary lint, 8 schema contracts, migration parity, and 59
  tests passed.
- `npm run demo`: settled Transfer Intent, finalized receipt, balanced ledger,
  fully repaid Obligation, and `railReplayable: true`.
- Local API flow: Rail direction `native`, settled/finalized receipt,
  `productionFundsMoved: false`, and replay proof passed.
- Browser flow: Create Agent -> Provider Spend -> Settlement -> Revenue ->
  Repayment passed at 1440px desktop and 390px mobile with no horizontal
  overflow or browser console warnings/errors.
- PostgreSQL execution was not claimed: no local `psql` runtime is installed,
  so the SQL gate is structural/parity validation only.
