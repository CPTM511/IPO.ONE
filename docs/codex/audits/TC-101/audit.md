# TC-101 No-funds Trading Capital Evidence Audit

Recorded: 2026-07-25T01:10:53.184Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `IMPLEMENTED_UNVERIFIED`  
Gate: `review`  
Next task: `TC-102 BLOCKED_PENDING_INDEPENDENT_REVIEW_AND_FOUNDER_ACCEPTANCE`

## Authority and entry gate

The IPO.ONE Founder accepted ADR-034 through ADR-037 and the Trading Capital
threat model, authorized the isolated V9-009 security-test expectation repair,
and required `test:security` to be fully green before TC-101 could start. The
expectation repair changed no production behavior and the security suite
passed 24/24 before TC-101 began.

TC-101 implements only the first four no-funds Trading Capital candidate
operations:

1. `tradingCreateAccountBindingChallenge`
2. `tradingImportHyperliquidHistory`
3. `tradingFinalizeEvidenceSnapshot`
4. `tradingReadCreditProfile`

The task has stopped at its required independent-review gate. This audit is
self-authored engineering evidence, not independent review or Founder
acceptance. It does not authorize TC-102 or any external Hyperliquid call,
credential, API wallet, signer, Testnet write, production deployment, mainnet
action, custody, credit approval, limit, pricing, settlement, or real funds.

The accepted stacked WALLET and V9 dirty worktree was preserved. It was not
reset, cleaned, committed, deployed, or relabelled as TC-101 work.

## Outcome

TC-101 adds one closed `trading_credit_profile.v1` lifecycle over the existing
shared Subject, Principal, Tenant, Event, Evidence, outbox, projection, and
authorization kernel:

```text
challenge_pending -> history_imported -> finalized
```

- Challenge creation binds an existing Human or Agent Subject and its
  authorized Principal to a server-derived synthetic account-reference hash.
- Import accepts an empty payload only. The server selects a closed,
  Subject-type-specific synthetic/redacted fixture; the caller cannot submit
  an address, history, PnL, score, performance signal, or source data.
- Finalization freezes point-in-time Event/Evidence lineage, data-quality
  declarations, freshness, and the five-factor profile.
- Read returns the exact owned durable projection and cannot mutate it.
- Every mutation commits its projection, Event, Evidence, outbox message, and
  idempotency result through the existing serializable command boundary.

The five qualitative factors are:

1. Alpha Quality
2. Risk Reliability
3. Strategy Capacity
4. Mandate Compliance
5. Evidence Confidence

The response explicitly makes universal/composite score, credit decision,
recommended limit, pricing, and funds authority unavailable. Synthetic source
freshness is `unknown`; it cannot authorize or loosen risk.

## Shared Human and Agent semantics

TC-101 did not create a Trading Capital identity fork:

- Human access requires the existing Human Subject owner/controller
  relationship and the relevant authenticated Human capability.
- Agent access requires the existing Agent Subject and active authorized
  Principal relationship and the relevant authenticated Agent capability.
- Tenant and Actor identity come only from trusted Authentication Context.
- Cross-Actor and cross-Tenant access fails closed and remains
  non-enumerating.
- Human and Agent typed local clients call the same four protocol operations
  and return the same versioned projection contract.

No second Subject, Principal, Consent/Mandate, Obligation, Ledger, Event,
Evidence, or risk-decision kernel was added.

## Closed data and authority boundary

The implementation contains no external adapter or network request. Despite
the package operation name `tradingImportHyperliquidHistory`, its TC-101
behavior is intentionally a closed, server-owned synthetic fixture import.

The following remain absent:

- Hyperliquid endpoint, SDK, dependency, environment variable, credential,
  account query, API wallet, signature, nonce writer, or Exchange action;
- caller-provided address, raw transaction, raw strategy/source code, PnL,
  trade history, KYC/PII, secret, private key, or reusable challenge material;
- public OpenAPI route, browser UI, Agent MCP tool, or remote tool;
- Ledger or Obligation mutation;
- factor weights, opaque model, universal score, grade, approval, limit,
  pricing, fee, first loss, collateral, leverage, settlement, or funds logic;
  and
- deployment, Testnet write, mainnet, custody, or real-value authority.

Challenge material is one-use, synthetic, five-minute bounded, and only its
hash is persisted. Unknown or stale Evidence cannot become positive authority.

## Persistence and recovery

Migration `0029_trading_credit_profiles` adds one Tenant-owned profile table
with:

- forced row-level security and Tenant-context enforcement;
- a Tenant/Subject relationship;
- one profile per Subject;
- immutable identity and source binding;
- database-enforced safety declarations;
- guarded forward-only lifecycle transitions;
- no delete or backward-transition path; and
- production-role grants consistent with the existing projection boundary.

The profile is registered in the shared projection registry and reconciliation
coverage. PostgreSQL verification proves:

- atomic projection, Event, Evidence, outbox, and idempotency writes;
- exact replay for duplicate mutation requests;
- rollback on failed command work;
- cross-Tenant RLS isolation;
- durable Human and Agent lifecycle state;
- restart-safe read and mutation continuation;
- projection replay/reconstruction; and
- complete reconciliation with no unexplained drift.

## Protocol, authorization, and admission

The checked-in Tenant protocol now contains 50 operations. The first three
TC-101 operations are idempotent mutations; the fourth is a non-idempotent-key
query. Request and result contracts are closed and stage-aware.

The four operations have matching:

- JSON Schema request/result/catalog entries;
- TypeScript declarations;
- runtime catalog entries and safety metadata;
- deny-by-default capabilities and Human/Agent authorization policy;
- mutation/read abuse classes;
- handler registration;
- local typed Human and Agent clients;
- product-traceability bindings; and
- valid and adversarial fixtures.

Admission, capability, resource binding, subject relationship, current
projection state, payload shape, and idempotency rules all fail closed before
business mutation.

## Candidate-operation proof

The package candidate list and runtime catalog were compared after
implementation:

- package candidates: 25;
- unique package candidates: 25;
- current Tenant protocol catalog: 50 operations;
- candidate/catalog intersection: exactly 4; and
- remaining Trading Capital candidates absent from runtime: 21.

The intersection is exactly the four TC-101 operations listed above.
Therefore Trading Capital runtime maturity is `4/25`, not `25/25`. TC-102 and
all later candidate operations remain absent and unauthorized.

## Change scope

The bounded implementation adds or updates:

- the `trading_credit_profile.v1` domain lifecycle, enums, exports, and tests;
- the closed profile schema and Tenant protocol request/result/catalog
  contracts;
- migration pair `0029_trading_credit_profiles`;
- PostgreSQL projection mapping, write/read support, reconciliation coverage,
  and restart/RLS/replay tests;
- the four Tenant Gateway handlers and local Human/Agent client methods;
- capability, AuthZ, abuse-policy, handler-registry, and fixture parity;
- four Credit Passport traceability bindings; and
- TC-101 pre-change and implementation audit evidence.

No dependency, secret, environment, public route, MCP surface, browser surface,
wallet permission, signer, external endpoint, chain transaction, deployment,
Ledger, Obligation, pricing, or funds path changed.

## Verification

All repository commands used the exact runtime contract:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm ...
```

### Required security entry gate

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Result: **PASS, 24/24**.

### Exact repository gate

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: **PASS**.

- schemas: 56;
- ordered migration pairs: 29;
- Tenant protocol: 50 operations, 66 request fixtures, and 58 result fixtures;
- abuse policy: 67 Tenant operations;
- product traceability: 13 destinations, 61 actions, and all 50 catalog
  operations bound;
- transport: 49/49; and
- complete local tests: 434/434.

Focused domain, handler, and runtime-profile schema tests passed 7/7.
`check:schemas`, `check:migrations`, `check:tenant-protocol`,
`check:abuse-policy`, and `check:product-traceability` all passed.

### PostgreSQL

```text
DATABASE_URL=postgresql://localhost:55439/ipo_one_tc101_test?host=/private/tmp/ipo-one-tc101-pg.hqr8AR/socket \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: **PASS, 71/71**.

The run included fresh non-superuser migrations, forced-RLS table coverage,
the TC-101 atomic/RLS/restart/replay scenario, the full Tenant Gateway suite,
and reconciliation. PostgreSQL 17.10 was used.

The temporary server was stopped after verification. Its inert, recoverable
test cluster remains under `/private/tmp/ipo-one-tc101-pg.hqr8AR`; it contains
synthetic test data only and is not a product or production dependency.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `packages/domain/src/trading-capital-evidence.js` | `b38ca13423b6b4f37434c480cc6af86cb776fe1f61d2a78b78148dd650836fd7` |
| `schemas/v2/trading-credit-profile.schema.json` | `96aa2084905f95b0af53aa89a12082c704fd9032fd79dedf37e24af77df2284a` |
| `db/migrations/0029_trading_credit_profiles.up.sql` | `fb9422338587d4430da381040d769d0b3ff1d127cfde3469037994f1cddfbe81` |
| `db/migrations/0029_trading_credit_profiles.down.sql` | `d906633fc61688874c7b881ae2f4c3eb81cebde130df943073f4161376651314` |
| `modules/tenant-command-gateway/src/trading-capital-evidence-handlers.js` | `9de921cc422337e4cdbf00955e920d168d5d1169e01fc30c349a8a7719352b41` |
| `packages/api-contract/src/tenant-protocol.js` | `697022bdad65487e1bafa1e7207d015370d9e9ddf2df8736a80b9bcb6d1e85e6` |

## Security proof

- trusted Authentication Context supplies Tenant and Actor identity;
- exact Subject/Principal relationship is revalidated per operation;
- caller authority and trading signals are excluded from request payloads;
- the server owns fixtures, timestamps, lineage, safety flags, and factors;
- challenge material is bounded, one-use, synthetic, and hash-only at rest;
- profile transitions are forward-only in both domain and database layers;
- mutations are serializable, idempotent, replay-safe, and auditable;
- forced RLS and cross-Tenant tests prove isolation;
- point-in-time Event/Evidence lineage is frozen at finalization;
- unknown freshness cannot grant or loosen authority;
- universal score, approval, limit, pricing, and funds fields are unavailable;
  and
- no external call, credential, signer, chain write, deployment, or real funds
  exists.

## PASS, FAIL, and UNVERIFIED

PASS:

- ADR/threat-model acceptance and the 24/24 security entry condition;
- exact four-operation runtime scope;
- closed Human/Agent shared-kernel lifecycle;
- five-factor explainable, non-authorizing profile;
- strict caller-input and data-minimization boundary;
- schema, protocol, TypeScript, capability, AuthZ, abuse, handler, client, and
  traceability parity;
- atomic persistence, forced RLS, idempotency, restart, replay, and
  reconciliation;
- 434/434 exact repository tests;
- 71/71 PostgreSQL tests; and
- temporary PostgreSQL shutdown.

FAIL:

- none.

UNVERIFIED:

- independent reviewer reproduction and security review;
- any real Hyperliquid endpoint, account, data, credential, or API wallet,
  which are deliberately absent;
- browser/UI, public OpenAPI, remote MCP, and external integration behavior,
  which are out of TC-101 scope;
- Testnet or mainnet writes, signer/custody behavior, deployment, and real
  funds, which remain prohibited; and
- TC-102 and every later Trading Capital task.

## Rollback

Rollback TC-101 as one bounded no-funds unit:

1. remove the four Tenant operations, capabilities, policies, handlers,
   clients, fixtures, and traceability bindings;
2. roll back migration `0029_trading_credit_profiles`;
3. remove the profile domain lifecycle, schema, projection registration, and
   reconciliation support;
4. remove only the TC-101 tests and protocol safety metadata; and
5. retain the pre-change mapping and this audit as historical evidence.

No credential destruction, chain rollback, deployment rollback, funds
recovery, Ledger reversal, or Obligation repair is required because TC-101
created none. Earlier accepted stacked WALLET and V9 work must not be removed
as part of this rollback.

## Next task status

TC-101 is `IMPLEMENTED_UNVERIFIED` and stops at the required `review` gate.
TC-102 has not started and remains blocked until an independent reviewer
reproduces the evidence and the IPO.ONE Founder explicitly accepts TC-101.

This handoff does not claim production readiness.

## Founder acceptance

The IPO.ONE Founder accepted TC-101 at `2026-07-25T02:35:42.218Z` and
authorized TC-102 only. This acceptance does not authorize TC-103, a real
Hyperliquid endpoint or account, credentials, an API wallet, signing, a
Testnet write, production deployment, mainnet, custody, pricing, limits,
settlement, or real funds. TC-102 remains a no-funds task with a required
independent-review gate.
