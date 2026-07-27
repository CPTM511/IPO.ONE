# TC-101 Pre-change Mapping

Captured: `2026-07-25T00:32:32.792Z`

Branch: `codex/commercial-access-release`

Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Authority

- TC-000 is accepted by the IPO.ONE Founder.
- The V9-009 standalone security expectation is corrected.
- `test:security` passes 24/24.
- TC-101 is authorized under a `review` gate.
- TC-102 and every later Trading Capital task remain blocked.

TC-101 authorizes only no-funds, synthetic/redacted Trading Capital Evidence
and profile contracts. It does not authorize a Hyperliquid call, endpoint,
credential, API wallet, signature, custody path, Testnet write, real account,
credit approval, limit, pricing, funds, deployment, or mainnet.

## Runtime before TC-101

| Boundary | Pre-change truth |
| --- | --- |
| Tenant protocol | 46 private operations |
| Trading Capital operations | 0/25 runtime; all package candidates absent |
| Schema contracts | 55 |
| Ordered migrations | 28 up/down pairs |
| Security suite | 24/24 pass |
| Exact repository gate | 427/427 local tests pass |
| Hyperliquid adapter | none in authenticated product runtime |
| Trading signer/credential | none |
| Real funds/mainnet | disabled |

The first four package candidates are absent from the catalog, request/result
schemas, TypeScript declarations, handler registry, AuthZ, admission policy,
PostgreSQL projections, SDK, MCP, UI, and public OpenAPI:

1. `tradingCreateAccountBindingChallenge`
2. `tradingImportHyperliquidHistory`
3. `tradingFinalizeEvidenceSnapshot`
4. `tradingReadCreditProfile`

## Shared-kernel components to reuse

| Concern | Existing implementation |
| --- | --- |
| Human/Agent identity | canonical Subject and Principal projections |
| Tenant isolation | trusted Authentication Context, Tenant Gateway and forced RLS |
| Authorization | deny-by-default operation policy and exact resource binding |
| Admission | per-operation quota class, byte/rate/concurrency controls |
| Atomic mutation | Tenant Gateway serializable command unit of work |
| Audit truth | Event, Evidence, outbox, projection snapshot and idempotency |
| Recovery | projection registry, replay and reconciliation |
| Machine contract | closed request/result JSON Schema and TypeScript declarations |

TC-101 will not create a second Subject, Principal, Obligation, Ledger, Event,
Evidence, or risk-decision kernel.

## Planned contract

One versioned `trading_credit_profile.v1` aggregate will move only forward:

`challenge_pending -> history_imported -> finalized`

- The challenge binds one existing Subject and Principal to a server-derived
  synthetic account-reference hash.
- History import accepts no history, performance, score, address, endpoint, or
  positive signal from the caller. A closed server-owned fixture is selected
  from the canonical Subject type.
- Finalization freezes the point-in-time source Event/Evidence lineage, data
  quality, freshness, and five-factor scorecard.
- Read returns the same Tenant-bound, non-authorizing projection.

The scorecard factors are Alpha Quality, Risk Reliability, Strategy Capacity,
Mandate Compliance, and Evidence Confidence. No composite/universal score,
credit approval, recommended limit, pricing, or funds authority will exist.
Synthetic-only source freshness is explicit `unknown`, so it cannot authorize
new risk.

## Planned persistence and security boundaries

- one new Tenant/RLS table with immutable identity and guarded forward-only
  transitions;
- one migration pair, numbered `0029`;
- three idempotent command handlers and one query handler;
- one Event/Evidence/outbox/projection commit for each mutation;
- exact Human-owner, Human-controller, or Agent-subject relationship checks;
- strict bounded empty payloads for the three mutations and query;
- no raw strategy/source code, raw transactions, PII, secret, account address,
  private key, signature, reusable challenge material, or external request;
- catalog/AuthZ/admission/type/handler parity and adversarial fixtures; and
- PostgreSQL RLS, replay, restart, concurrency, rollback, projection and
  reconciliation evidence.

## Explicit non-changes

- no public OpenAPI route;
- no Agent MCP or remote tool;
- no browser implementation or prototype-derived authority;
- no network adapter, dependency, environment variable, endpoint, signer, or
  credential;
- no Ledger/Obligation mutation;
- no risk threshold, model, factor weight, grade, credit decision, limit,
  pricing, fee, first loss, collateral, leverage, or funds logic; and
- no TC-102 work.

