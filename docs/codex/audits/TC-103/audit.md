# TC-103 Implementation Audit

## Status

`IMPLEMENTED_UNVERIFIED`

Implementation and self-verification finished at
`2026-07-25T07:44:17.087Z`. This is the implementation handoff status recorded
before the Founder decision below; the decision does not relabel self-review
as independent verification.

## Source identity and authority

- Repository: `/Users/cptmao/Documents/IPO.ONE`
- Branch: `codex/commercial-access-release`
- Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- Prerequisite: TC-102 accepted by the Founder before TC-103 began.
- Task source:
  `IPO_ONE_V9_V10_Codex_Product_Basis_10.1.0/prompts/TC-103.md`
- Pre-change evidence:
  `docs/codex/audits/TC-103/pre-change-mapping.md`
- Runtime: Node `24.18.0`, pnpm `11.1.3`, PostgreSQL `17.10`.

The repository remains a deliberately stacked dirty worktree containing prior
accepted tasks. No commit, branch change, deployment, external network call,
Testnet action, signer, credential, private key, wallet action, or funds
movement was performed for TC-103.

## Delivered boundary

TC-103 implements candidate operations 11 through 20:

1. `tradingCreateFacility`
2. `tradingContributeSubjectCollateral`
3. `tradingRecordProviderFunding`
4. `tradingActivateFacility`
5. `tradingSubmitOrderIntent`
6. `tradingCancelOrderIntent`
7. `tradingReadFacilityState`
8. `tradingEvaluateRisk`
9. `tradingPauseNewRisk`
10. `tradingFlattenFacility`

Runtime truth after implementation:

- Tenant protocol: 66 operations.
- Trading Capital: 20/25 operations.
- TC-103: 10/10 operations.
- TC-104 operations 21 through 25: 0/5 and absent from runtime source.
- Every Facility amount uses the canonical shared synthetic asset identifier
  `urn:ipo-one:sandbox-asset:usd-cent`.
- Every Facility and Order Intent is synthetic, non-redeemable,
  non-withdrawable, nontransferable, non-production, and non-authorizing.

The five absent TC-104 operation identifiers are:

- `tradingRequestClose`
- `tradingRunSettlement`
- `tradingReadSettlement`
- `tradingIssuePerformanceProof`
- `tradingReadFacilityEvidence`

## Shared-kernel correction

The initial TC-101/TC-102 implementation used a Trading-only asset label,
`sandbox:USD`. PostgreSQL canonical-Obligation construction proved that this
would fork the shared Obligation Kernel from the existing canonical sandbox
asset.

TC-103 corrects that implementation choice by using the existing canonical
asset identifier everywhere in Trading Capital. It does not raise the shared
credit policy cap. The durable TC-103 PostgreSQL scenario uses the existing
`500000` synthetic principal limit and one existing shared `obligation.v2`,
Credit Line, Ledger, Event, Evidence, outbox, projection, and reconciliation
path. No second Ledger or second monetary truth was created.

## Domain and state machine

Primary implementation:

- `packages/domain/src/trading-capital-facility.js`
- `packages/domain/src/enums.js`
- `packages/domain/src/index.js`
- `packages/domain/test/trading-capital-facility.test.js`

The domain provides:

- one Facility bound to one bilaterally accepted Match Proposal and one
  canonical `obligation.v2`;
- exact synthetic Subject contribution and Provider funding;
- activation only after both contributions and an active, executed,
  unrepaid, nonwithdrawable Obligation;
- closed long/short synthetic Order Intents and cancellation;
- server-derived exposure, equity, and local risk observation;
- deterministic risk thresholds;
- monotonic `NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`
  ordering, with `SETTLEMENT` reserved for TC-104;
- stale or missing-current risk evidence failing closed to `REDUCE_ONLY`;
- reason-coded protective pause and flatten; and
- a flatten invariant that reconciles all open synthetic exposure to zero.

Caller-provided PnL, equity, risk score, risk state, venue action, wallet
balance, raw order, transfer, withdrawal, external price, or trusted time is
not accepted.

## Contracts and protocol

New closed schemas:

- `schemas/v2/trading-facility.schema.json`
- `schemas/v2/trading-order-intent.schema.json`
- `schemas/v2/trading-facility-risk-evaluation.schema.json`

Updated closed surfaces:

- `schemas/v2/tenant-protocol-request.schema.json`
- `schemas/v2/tenant-protocol-result.schema.json`
- `schemas/v2/tenant-protocol-catalog.schema.json`
- `schemas/v2/abuse-control-policy.schema.json`
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`
- `api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- the four Human/Agent workflow validator registries.

All ten requests and results are closed, versioned, schema-validated, and
bound to the catalog. Unknown operations and fields fail closed.

## Authorization, approval, and admission

Updated boundaries:

- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/src/authorization-policy.js`
- `modules/authorization/test/authorization-policy.test.js`
- `modules/approval/src/approval-policy.js`
- `modules/abuse-control/src/abuse-policy.js`
- `schemas/v2/abuse-control-policy.schema.json`

Separation:

- Human/Agent Subject actors may create, contribute, activate, submit,
  cancel, and read only their bound resources.
- Provider actors may record only their exact bound synthetic funding and
  read bound Facility state.
- Risk/Operations actors may evaluate Tenant risk.
- Pause and flatten are separately classified protective operations,
  require reason codes, idempotency, recent MFA, and live risk plus
  reconciliation checks.
- Pause and flatten were added to the closed approval-classification
  registry as protective-only actions.

The final approval-policy gate covers 11 high-impact operations. The final
abuse-policy gate covers 83 Tenant operations.

## Gateway and clients

Primary handler implementation:

- `modules/tenant-command-gateway/src/trading-capital-facility-handlers.js`
- `modules/tenant-command-gateway/src/index.js`
- `modules/tenant-command-gateway/src/tenant-foundation-handlers.js`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/src/tenant-command-handler-registry.js`

Every mutation plans:

- an exact authorization resource;
- current actor/resource binding checks where applicable;
- locked durable projection reads;
- expected state hash and version checks;
- idempotent Event/Evidence/outbox writes in the PostgreSQL unit of work;
- bounded result views with safety flags; and
- resource creation or transition metadata where required.

Canonical Obligation reads intentionally validate the Obligation's own
`obligation.v2` safety contract instead of requiring Trading-only projection
fields. Facility and Order Intent projections continue to require the full
Trading safety envelope.

## Persistence and migration

Migration:

- `db/migrations/0031_trading_capital_facilities.up.sql`
- `db/migrations/0031_trading_capital_facilities.down.sql`

Tables:

- `trading_facilities`
- `trading_order_intents`
- `trading_facility_risk_evaluations`

All three tables:

- are Tenant-owned;
- enable and force RLS;
- require exact safety flags;
- retain normalized identity plus bounded JSON projection state; and
- are registered with projection snapshots and reconciliation.

Database guards reject:

- Facility identity or canonical-link mutation;
- version skips;
- lifecycle reversal;
- risk recovery to a less restrictive state;
- Order Intent identity mutation or invalid terminal transitions;
- risk-evaluation mutation/deletion; and
- rollback while TC-103 rows exist.

Persistence changes:

- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/src/postgres-reconciliation-service.js`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `apps/private-pilot/test-postgres/production-bootstrap.test.mjs`
- `scripts/check-migrations.mjs`

The PostgreSQL scenario proves:

- a canonical executed `obligation.v2` and shared Credit Line/Ledger path;
- contribution/funding race serialization;
- concurrent Order Intent/risk-evaluation serialization;
- exact activation;
- deterministic `REDUCE_ONLY`;
- protective pause and flatten;
- exact idempotent replay;
- process-restart reads;
- projection hash verification;
- RLS cross-Tenant invisibility;
- database rejection of risk/lifecycle reversal; and
- a clean full reconciliation run.

## Presentation and traceability

Presentation:

- `apps/web/src/trading-capital-facility-presentation.js`
- `apps/web/test/trading-capital-facility-presentation.test.js`

Human and Agent entry modes render the same Facility contract. Presentation
fails closed if any funds, venue, raw order, authority, redeemability, or
shared-kernel flag drifts. `REDUCE_ONLY` cannot advertise new-risk actions.

Traceability:

- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `scripts/check-product-traceability.mjs`

Final traceability covers 13 destinations, 63 actions, and all 66 catalog
operations:

- `REAL_LOCAL=36`
- `SIMULATION_ONLY=12`
- `SPECIFIED_DISABLED=7`
- `ABSENT=8`
- `REAL_TESTNET_READ=0`

## Verification evidence

### Complete local runtime

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test
```

Result: **PASS, 455/455**.

TC-103 contributes seven state-machine/property tests and three presentation
tests. The domain cases cover both contribution orders, exact activation,
Order Intent cancellation, deterministic/monotonic risk, stale-risk
fail-closed behavior, and protective pause/flatten.

### PostgreSQL

```text
DATABASE_URL=postgresql://localhost:55441/ipo_one_tc103_test?host=/private/tmp/ipo-one-tc103-pg.PecMpp/socket \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: **PASS, 73/73** with PostgreSQL `17.10`.

The TC-103 PostgreSQL case includes concurrent contribution/funding and
concurrent Order Intent/risk evaluation, restart, replay, RLS, database
guards, projection verification, and reconciliation.

### Security

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Result: **PASS, 24/24**.

### Transport

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
```

Result: **PASS, 49/49**.

### Static and conformance gates

All passed:

- boundary lint;
- 62 closed schemas;
- 31 ordered migration pairs;
- approval policy: 11 high-impact operations;
- abuse policy: 83 Tenant operations;
- operations policy: 7 event-presence rules;
- Tenant protocol: 66 operations, 86 request fixtures, 74 result fixtures;
- product traceability: 13 destinations, 63 actions, 66 bound operations;
- web bundle: 1 external module, 23 authored modules, 679 unique IDs; and
- `git diff --check`.

Runtime-source search found zero occurrences of all five TC-104 operation
identifiers. Focused TC-103 domain/presentation plus affected matching,
authorization, approval, handler-registry, schema, and protocol tests also
passed.

## Failures found and resolved

Self-verification exposed and resolved:

1. production-bootstrap and forced-RLS expected lists stopped at migration
   0030;
2. canonical Obligation reads incorrectly required Trading projection fields;
3. the Trading-only `sandbox:USD` label forked the shared Obligation asset;
4. the first durable scenario exceeded the existing shared synthetic cap;
5. accepted Offer/Acceptance persistence needed the existing two-step FK
   order;
6. sandbox receipt fixtures violated database key/signature constraints;
7. multi-stream commands initially reused an Event ID;
8. risk-state test values did not use the closed uppercase enum;
9. reconciliation lacked the three TC-103 projection tables and shared
   Credit Line utilization;
10. pause/flatten were missing from the closed approval classification; and
11. the migration checker did not handle functions with arguments or
    multiline drop formatting.

All listed failures were corrected and the affected full gates rerun to
green. No failed assertion is reclassified as PASS.

## Primary artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `packages/domain/src/trading-capital-facility.js` | `d7c2632c1fe44a4e80e7020d4380bd51f72d0e68761345e3363ba789af53f0e6` |
| `modules/tenant-command-gateway/src/trading-capital-facility-handlers.js` | `471f07f4a9d2f06a6d7261fa5c8319b8c2b1df24988053074d19bb2ea995d0b1` |
| `modules/persistence/src/postgres-core-repository.js` | `cdfd2c7a3dd17445de0794ac4f4727c6acd7e2ec5823330bd1c252085a79b9f4` |
| `modules/persistence/src/postgres-reconciliation-service.js` | `1a8464c2b04c421a03ac06e9ecf1cefcec998772297723d16be1e752c4e537fb` |
| `db/migrations/0031_trading_capital_facilities.up.sql` | `490d27f64aeffa4fe5165e202c365b1f04ed852cbcc16914e3bf0a4309312fe7` |
| `db/migrations/0031_trading_capital_facilities.down.sql` | `d46daffc9ad89aa3950a5d6127db4d34bfaae1180b1e0264bc96d8245b6b1ee2` |
| `schemas/v2/trading-facility.schema.json` | `2bb8f873785bf1a9ca15497be2ca112b6e0fe5616a338f76d63621cd90dca527` |
| `schemas/v2/trading-order-intent.schema.json` | `f200231283c7f3b2eb4ec06838b24af6da74ce6f4717ab2c7a4f3951f035dc42` |
| `schemas/v2/trading-facility-risk-evaluation.schema.json` | `673c42079767514674e9f835eebac8d9a844630e23f8ca66deb8f214e455c209` |
| `apps/web/src/trading-capital-facility-presentation.js` | `b44f3c0ce9c6e949c54ede49b189eef434d7fae23f5b0fc265f37d7d93b7a67d` |
| `product/traceability/ipo-one.v9-product-traceability.v1.json` | `bcc7b2971ceb6e85b958870f441a7c014cbe752f040c1fd336a5828ddb4a4aab` |

## Rollback

Migration 0031 is reversible only when its three tables contain no rows. The
down migration deliberately refuses to discard synthetic audit state
silently. A rollback reviewer must first preserve required Evidence, approve
the exact synthetic-row disposition, run the down migration, and reverse the
TC-103 catalog/handler/schema code as one reviewed change. No `git reset`,
production-data deletion, or implicit funds action is part of this handoff.

The temporary PostgreSQL cluster contains synthetic test data only. It is not
a product dependency and is stopped after verification; the inert cluster may
be removed later under the existing temporary-test-data approval.

## Independent review gate

Review must verify at least:

- all ten operation contracts and role separations;
- canonical Obligation/Credit Line/Ledger linkage;
- monotonic risk and stale-data behavior;
- pause/flatten non-withdrawal and non-transfer guarantees;
- PostgreSQL RLS, concurrency, restart, replay, and reconciliation evidence;
- no TC-104, venue, signer, network, Testnet, mainnet, or real-funds path; and
- artifact hashes and commands in this audit.

Only an independent review plus explicit Founder acceptance may change
TC-103 from `IMPLEMENTED_UNVERIFIED` or authorize TC-104.

## Founder acceptance

The IPO.ONE Founder accepted TC-103 and authorized TC-104 at
`2026-07-25T07:57:58.241Z` through the instruction `接受，开始TC-104`.
This decision unlocks TC-104 only. It does not authorize TC-105 or any later
task, an external venue, credentials, signing, Testnet or mainnet writes,
deployment, redeemable settlement, custody, withdrawals, or real funds.
