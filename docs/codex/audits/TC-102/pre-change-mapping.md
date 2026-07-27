# TC-102 Pre-change Mapping

Captured: `2026-07-25T02:35:42.218Z`

Branch: `codex/commercial-access-release`

Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

## Authority

- TC-101 is accepted by the IPO.ONE Founder with implementation Evidence.
- TC-102 is authorized under a `review` gate.
- TC-103 and every later Trading Capital task remain blocked.
- The accepted stacked WALLET, V9, TC-000, and TC-101 dirty worktree must be
  preserved.

TC-102 authorizes only closed no-funds Capital Requests, Provider Mandates,
compatible-mandate discovery, deterministic match proposals, and exact
bilateral acceptance for synthetic Credit, Performance Participation, and
Hybrid templates. It does not authorize a real price, funding, Ledger or
Obligation mutation, Facility activation, Hyperliquid call, credential,
signer, Testnet write, deployment, mainnet, custody, settlement, or real funds.

## Runtime before TC-102

| Boundary | Pre-change truth |
| --- | --- |
| Tenant protocol | 50 private operations |
| Trading Capital operations | 4/25 runtime |
| TC-102 operations | 0/6 runtime; all six package candidates absent |
| Schema contracts | 56 |
| Ordered migrations | 29 up/down pairs |
| Security suite | 24/24 pass |
| Exact repository gate | 434/434 local tests pass |
| PostgreSQL gate | 71/71 pass |
| Hyperliquid adapter/signer | absent |
| Real funds/mainnet | disabled |

The following six package candidates are absent from the runtime catalog,
request/result schemas, TypeScript declarations, handler registry, AuthZ,
admission, PostgreSQL projections, clients, UI, MCP, and public OpenAPI:

1. `tradingCreateCapitalRequest`
2. `tradingCreateProviderMandate`
3. `tradingListCompatibleMandates`
4. `tradingCreateMatchProposal`
5. `tradingAcceptMatchAsProvider`
6. `tradingAcceptMatchAsSubject`

## Shared-kernel components to reuse

| Concern | Existing implementation |
| --- | --- |
| Human/Agent identity | canonical Subject and Principal projections |
| Evidence eligibility | finalized `trading_credit_profile.v1` |
| Provider identity | canonical Provider projection and authenticated Provider Actor |
| Tenant isolation | trusted Authentication Context, Tenant Gateway, and forced RLS |
| Authorization | deny-by-default operation policy and exact resource binding |
| Admission | resource-blind per-operation quota classes |
| Atomic mutation | serializable Tenant Gateway command unit of work |
| Audit truth | Event, Evidence, outbox, projection snapshot, and idempotency |
| Recovery | projection registry, restart, replay, and reconciliation |
| Machine contract | closed request/result JSON Schema and TypeScript declarations |

TC-102 must not create a second Subject, Principal, Consent/Mandate,
Obligation, Ledger, Event, Evidence, or risk-decision kernel.

## Planned contract

Three immutable no-funds projection types will be added:

1. `trading_capital_request.v1`
2. `trading_provider_mandate.v1`
3. `trading_match_proposal.v1`

Capital Requests are owned by one existing Human or Agent Subject and bind the
exact finalized Trading Credit Profile snapshot. Provider Mandates are owned
by one existing Provider and authenticated Provider Actor. Match Proposals
freeze exact request and mandate versions, hashes, compatibility Evidence, and
server-owned illustrative terms.

Hard filters will run before deterministic ranking. They will cover:

- exact template compatibility;
- synthetic asset and amount range;
- duration range;
- Subject type;
- strategy class;
- finalized, server-derived Evidence eligibility;
- active status and expiry; and
- same-Tenant ownership.

Neither Capital Request nor Provider Mandate will accept a caller-supplied risk
class, factor result, score, pricing policy, Provider rank, identity, Tenant,
or acceptance.

Provider and Subject/Principal acceptance will each bind the exact immutable
proposal and terms hashes. Either side may accept first. Final bilateral state
requires both acceptances. Expired or projection-hash/version-drifted requests
or mandates invalidate the proposal.

## Planned persistence and security boundaries

- one forward-only migration pair, numbered `0030`;
- three forced-RLS Tenant tables with immutable identity and guarded proposal
  transitions;
- five idempotent command handlers and one bounded query handler;
- one Event/Evidence/outbox/projection commit for every mutation;
- exact owner/controller/subject or Provider-Actor relationship checks;
- non-enumerating discovery anchored to one exact owned Capital Request;
- bounded closed template and mandate inputs using decimal-string minor units
  and integer basis points;
- deterministic property tests proving hard-filter-before-ranking behavior;
- Human and Agent presentation parity over the same contract; and
- PostgreSQL idempotency, concurrency, RLS, restart, replay, rollback, and
  reconciliation Evidence.

## Explicit non-changes

- no open marketplace or unbounded Provider search;
- no arbitrary contract/economics DSL;
- no real pricing, funding, Facility, Obligation, Ledger, settlement, or funds;
- no public OpenAPI route, remote MCP tool, or external network integration;
- no dependency, environment variable, endpoint, credential, signer, or
  account binding;
- no self-declared risk class or black-box matching authority;
- no automatic proposal or bilateral acceptance; and
- no TC-103 work.
