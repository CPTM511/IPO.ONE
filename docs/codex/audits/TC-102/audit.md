# TC-102 No-funds Capital Matching Audit

Recorded: 2026-07-25T03:20:27.000Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `IMPLEMENTED_UNVERIFIED`  
Gate: `review`  
Next task: `TC-103 BLOCKED_PENDING_INDEPENDENT_REVIEW_AND_FOUNDER_ACCEPTANCE`

## Authority and entry gate

The IPO.ONE Founder accepted TC-101 at `2026-07-25T02:35:42.218Z` and
authorized TC-102 only. TC-102 implements the next six no-funds Trading Capital
candidate operations:

5. `tradingCreateCapitalRequest`
6. `tradingCreateProviderMandate`
7. `tradingListCompatibleMandates`
8. `tradingCreateMatchProposal`
9. `tradingAcceptMatchAsProvider`
10. `tradingAcceptMatchAsSubject`

The task has stopped at its required independent-review gate. This audit is
self-authored engineering evidence, not independent review or Founder
acceptance. It does not authorize TC-103, external Hyperliquid access, an API
wallet, signing, a Testnet write, deployment, pricing, allocation, settlement,
custody, mainnet, or real funds.

The accepted stacked WALLET, V9, TC-000, and TC-101 dirty worktree was
preserved. It was not reset, cleaned, committed, deployed, or relabelled as
TC-102 work.

## Outcome

TC-102 adds one closed no-funds request-to-match lifecycle over the existing
shared Subject, Principal, Tenant, authorization, Event, Evidence, outbox,
projection, and reconciliation kernel:

```text
finalized Trading Credit Profile
  -> Capital Request
  -> compatible Provider Mandate discovery
  -> immutable Match Proposal
  -> Provider acceptance + Subject-side acceptance
  -> bilaterally_accepted
```

- Capital Requests are created only from an exact finalized TC-101 Trading
  Credit Profile.
- Provider Mandates express bounded eligibility ranges and never override
  server Evidence or assign a caller-authored risk class.
- Discovery applies every hard compatibility filter before deterministic
  ranking.
- Match Proposal terms freeze exact request, mandate, profile, Evidence, and
  template hashes.
- Provider and Subject-side acceptance can arrive in either order, but both
  must accept the exact immutable proposal and terms hashes.
- The Subject-side actor is frozen to the authenticated actor that created the
  Capital Request. For Agent Subjects, that actor may be the Agent or an
  authorized Principal Controller according to the existing relationship
  policy; the accepting actor cannot switch after proposal creation.
- A changed, inactive, or expired request, mandate, profile, or proposal makes
  acceptance fail closed.

No operation creates an allocation, Facility, Obligation, Ledger entry,
position, order, settlement, transfer, or funds authority.

## Closed template economics

The three templates carry deterministic synthetic illustration terms only:

| Template | Repayment mode | Fixed return | Performance participation |
| --- | --- | ---: | ---: |
| Credit | `synthetic_fixed_credit` | 500 bps | 0 bps |
| Performance Participation | `synthetic_performance_participation` | 0 bps | 1,500 bps |
| Hybrid | `synthetic_hybrid` | 250 bps | 750 bps |

These constants are not approved commercial pricing, a quote, a credit
decision, executable economics, or value authority. Each object declares
`sandboxOnly=true`, `syntheticOnly=true`, `realPricing=false`,
`realFunding=false`, `fundsAuthority=false`, and
`productionAuthority=false`.

Amounts are exact positive decimal minor-unit strings. Bps and duration values
are bounded integers. JavaScript floating-point money arithmetic is not used.

## Compatibility and deterministic ranking

The server applies these hard filters in the following closed order:

1. active and unexpired;
2. template compatible;
3. synthetic asset compatible;
4. amount range compatible;
5. duration range compatible;
6. Subject type compatible;
7. strategy class compatible; and
8. server Evidence eligible.

Only surviving candidates enter ranking. Ranking is non-authorizing and
deterministic: it uses stable server fields and a stable identifier
tie-breaker, so input order cannot change results. Discovery is Tenant-local,
bounded to 100 candidates and 20 results, and returns no cross-Tenant
existence signal.

The request schema has no risk-class input. `riskClassCallerSupplied` is
server-derived and must remain `false`. Unknown or stale Evidence cannot
improve eligibility.

## Bilateral exact-terms acceptance

A Match Proposal records exact hashes for:

- Capital Request;
- Provider Mandate;
- finalized Trading Credit Profile;
- point-in-time Evidence lineage;
- template terms; and
- the proposal itself.

Both acceptance operations submit the exact proposal and terms hashes.
Optimistic version checks serialize competing writes. The first side moves
version 1 to a one-sided version 2 state; the other side reloads that state and
moves it to the same `bilaterally_accepted` version 3 outcome. Reusing the same
idempotency key returns the exact prior response; conflicting reuse fails
closed.

Before either acceptance, the server revalidates the current request, mandate,
profile, proposal, actor, Tenant, hashes, active state, and trusted time.
Database triggers prohibit proposal identity or terms mutation and allow only
the reviewed forward transitions.

## Shared Human, Agent, and Provider semantics

TC-102 did not create a second matching or obligation kernel:

- Human and Agent Capital Requests use the same schemas, domain functions,
  Tenant protocol, persistence, Event/Evidence semantics, and presentation
  contract.
- Provider actions use the same Tenant boundary but a separate bounded
  Provider capability.
- Tenant, Actor, role, Subject, and Principal authority are never accepted from
  the request body.
- Human and Agent presentation parity is tested over the same Capital Network
  contract.
- No Human-only or Agent-only economics, ranking, risk, Ledger, or Obligation
  model was added.

## Persistence, RLS, and recovery

Migration pair `0030_trading_capital_matching` adds:

- `trading_capital_requests`;
- `trading_provider_mandates`; and
- `trading_match_proposals`.

All three tables are Tenant-owned and have forced row-level security. Request
and mandate identity/terms are immutable. Proposal identity and frozen terms
are immutable, and status transitions are guarded forward-only.

The three projections are registered in shared persistence and reconciliation
coverage. PostgreSQL verification proves:

- atomic projection, Event, Evidence, outbox, and idempotency writes;
- durable request, mandate, proposal, and both acceptance states;
- deterministic discovery;
- optimistic-concurrency serialization for competing acceptances;
- exact idempotent replay;
- restart-safe reload and completion;
- projection verification and clean reconciliation;
- database-enforced immutability; and
- cross-Tenant isolation through a dedicated `NOSUPERUSER NOBYPASSRLS` test
  role.

An initial RLS assertion was intentionally rejected as invalid evidence because
it queried through the database superuser, which PostgreSQL permits to bypass
RLS even when `FORCE ROW LEVEL SECURITY` is set. The test was corrected to use
a dedicated non-bypass role, a fresh database was migrated, and the entire
PostgreSQL suite then passed. Product authorization behavior was not weakened
to make the test pass.

## Protocol, authorization, admission, and clients

The checked-in Tenant protocol now contains 56 operations. Five TC-102
operations are idempotent mutations; compatible-mandate discovery is a bounded
query and rejects an idempotency key.

The six operations have matching:

- closed JSON Schema request/result/catalog contracts;
- TypeScript declarations;
- runtime and static catalog entries;
- safety metadata;
- deny-by-default capabilities and role policy;
- read/mutation abuse classifications;
- handler registration;
- local Human, Agent, and Provider client methods;
- product-traceability bindings; and
- valid and adversarial fixtures.

The protocol contains 76 request fixtures and 64 result fixtures. TC-102
negative fixtures cover caller risk-class injection, non-synthetic assets,
idempotency on the discovery query, and funds-authority injection.

## Candidate-operation proof

The package candidate list and runtime catalog were compared after
implementation:

- package candidates: 25;
- unique package candidates: 25;
- current Tenant protocol catalog: 56 operations;
- candidate/catalog intersection: exactly 10; and
- remaining Trading Capital candidates absent from runtime: 15.

The intersection is exactly TC-101 operations 1-4 and TC-102 operations 5-10.
Therefore Trading Capital runtime maturity is `10/25`, not `25/25`. TC-103 and
all later candidate operations remain absent and unauthorized.

## Change scope

The bounded TC-102 implementation adds or updates:

- `trading_capital_request.v1`, `trading_provider_mandate.v1`, and
  `trading_match_proposal.v1` domain lifecycles and schemas;
- deterministic hard-filter matching and synthetic template-term policy;
- migration pair `0030_trading_capital_matching`;
- PostgreSQL read/write mapping, restart, concurrency, RLS, immutability, and
  reconciliation coverage;
- six Tenant Gateway handlers and local Human, Agent, and Provider clients;
- capability, AuthZ, abuse-policy, handler-registry, protocol, and fixture
  parity;
- Capital Network Human/Agent presentation parity;
- six product-traceability bindings; and
- TC-102 pre-change and implementation audit evidence.

No dependency, secret, environment, external endpoint, public OpenAPI route,
remote MCP tool, wallet permission, signer, chain transaction, deployment,
real pricing, allocation, Ledger, Obligation, settlement, or funds path was
added.

## Verification

All repository commands used the exact runtime contract:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm ...
```

### Exact repository gate

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: **PASS**.

- schemas: 59;
- ordered migration pairs: 30;
- Tenant protocol: 56 operations, 76 request fixtures, and 64 result fixtures;
- abuse policy: 73 Tenant operations;
- product traceability: 13 destinations, 61 actions, and all 56 catalog
  operations bound;
- Trading Capital runtime: 10/25 candidate operations; and
- complete local tests: 445/445.

Focused domain tests passed 6/6, handler tests passed 2/2, and Human/Agent
presentation tests passed 2/2. Schema, migration, protocol, abuse-policy,
traceability, and web-bundle gates all passed.

### Security suite

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Result: **PASS, 24/24**.

### PostgreSQL

```text
DATABASE_URL=postgresql://localhost:55440/ipo_one_tc102_test_02?host=/private/tmp/ipo-one-tc102-pg.wpnhiD/socket \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: **PASS, 72/72** with PostgreSQL 17.10.

The temporary PostgreSQL server was stopped after verification. Its inert,
recoverable test cluster remains at
`/private/tmp/ipo-one-tc102-pg.wpnhiD`; it contains synthetic test data only
and is not a product or production dependency.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `packages/domain/src/trading-capital-matching.js` | `e91c6e10fd4e22da1ea3c006939f56b8311f23f469f471c64f343fb9d58e7a8c` |
| `schemas/v2/trading-capital-request.schema.json` | `4e7061724a7e56b642c56221e056c51fb69f502d110b7878bc2c2990957df237` |
| `schemas/v2/trading-provider-mandate.schema.json` | `a603db215d95f8037f1c26a302dad5eebf0e445a523afb9bb535a5d998cafe25` |
| `schemas/v2/trading-match-proposal.schema.json` | `6f337455cabfe1a20d644124e77aa543be08e077af346ca393140427dad4ccd2` |
| `db/migrations/0030_trading_capital_matching.up.sql` | `9ca256be03e91e57b0f9452dbd000db67aa110ad388442f9c1c3cc1edf6b5501` |
| `db/migrations/0030_trading_capital_matching.down.sql` | `fa26d16e2436b8895e287428f67fe9d33407a6827585a3a7514ee3d2256be4e3` |
| `modules/tenant-command-gateway/src/trading-capital-matching-handlers.js` | `b9f0601c9f35893319ad9a02981f03cd9c7abbb7e9a46a14e93fdcc6802e21eb` |
| `apps/web/src/trading-capital-matching-presentation.js` | `af9a6bde98ffa6f1829d6eb0b1b7c8d9d2cf9d315d0aee70b44110f28bff80ef` |
| `packages/api-contract/src/tenant-protocol.js` | `49cf4da75fd4feb5abf8ef3ab00b2b3e7b1d4a3c13764f32e77fc5e0a3c0ad53` |

## Security proof

- trusted Authentication Context supplies Tenant and Actor identity;
- exact Subject/Principal/Provider relationship is revalidated per operation;
- caller identity, role, Tenant, risk class, score, Evidence eligibility,
  ranking, and safety flags are excluded from request authority;
- hard filters run before deterministic, non-authorizing ranking;
- discovery is Tenant-local, bounded, and non-enumerating;
- request, mandate, profile, proposal, terms, actor, and time are revalidated
  immediately before acceptance;
- both sides accept exact immutable hashes and cannot mutate economics;
- mutations are serializable, idempotent, replay-safe, and auditable;
- forced RLS is proved through a role that cannot bypass it;
- database triggers independently guard immutable terms and forward state;
- Event, Evidence, outbox, projections, idempotency, and reconciliation remain
  inside the existing atomic command boundary;
- every safety object denies production, external-system, pricing, funding,
  and funds authority; and
- no credential, endpoint, signer, chain write, deployment, or real funds
  exists.

## PASS, FAIL, and UNVERIFIED

PASS:

- exact six-operation TC-102 scope;
- three synthetic, no-value template contracts;
- hard-filter-before-ranking determinism and property coverage;
- immutable proposal and bilateral exact-terms acceptance in either order;
- expiry, changed-mandate, stale-hash, wrong-actor, and caller-risk rejection;
- shared Human/Agent kernel and presentation parity;
- schema, protocol, TypeScript, capability, AuthZ, admission, abuse, handler,
  client, traceability, and fixture parity;
- atomic persistence, concurrency, idempotency, forced RLS, restart,
  immutability, reconstruction, and reconciliation;
- 445/445 exact repository tests;
- 24/24 security tests;
- 72/72 PostgreSQL tests; and
- temporary PostgreSQL shutdown.

FAIL:

- none.

UNVERIFIED:

- independent reviewer reproduction and security review;
- public browser journey, public OpenAPI, remote MCP, and external integration,
  which are outside this local no-funds task;
- real pricing, Provider capital, allocation, Facility, execution, settlement,
  and funds behavior, which are deliberately absent;
- any real Hyperliquid endpoint, account, credential, API wallet, signer,
  Testnet/mainnet action, custody, deployment, or real funds; and
- TC-103 and every later Trading Capital task.

## Rollback

Rollback TC-102 as one bounded no-funds unit:

1. remove the six Tenant operations, capabilities, policies, handlers,
   clients, fixtures, presentation, and traceability bindings;
2. roll back migration `0030_trading_capital_matching`;
3. remove the three matching schemas, domain lifecycle, projection mapping,
   and reconciliation support;
4. remove only TC-102 tests and protocol safety metadata; and
5. retain the pre-change mapping and this audit as historical evidence.

No credential destruction, chain rollback, deployment rollback, funds
recovery, Ledger reversal, Obligation repair, or external-provider action is
required because TC-102 created none. Earlier accepted stacked work must not
be removed as part of this rollback.

## Next task status

TC-102 is `IMPLEMENTED_UNVERIFIED` and stops at the required `review` gate.
TC-103 has not started and remains blocked until an independent reviewer
reproduces the evidence and the IPO.ONE Founder explicitly accepts TC-102.

This handoff does not claim production readiness.

## Founder acceptance

The IPO.ONE Founder accepted TC-102 at `2026-07-25T06:38:51.611Z` and
authorized TC-103 only. This acceptance does not authorize TC-104, external
Hyperliquid access, credentials, an API wallet, signing, a Testnet write,
deployment, real pricing, redeemable collateral or funding, settlement,
custody, mainnet, or real funds. TC-103 remains an entirely synthetic,
non-redeemable task with a required independent-review gate.
