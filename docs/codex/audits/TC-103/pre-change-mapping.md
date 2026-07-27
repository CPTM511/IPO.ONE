# TC-103 Pre-change Mapping

Recorded: 2026-07-25T06:38:51.611Z  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Prerequisite: TC-102 accepted by IPO.ONE Founder  
Task boundary: TC-103 only

## Runtime truth before TC-103

- Tenant protocol operations: 56.
- Trading Capital package candidates: 25.
- Trading Capital operations present: 10/25, exactly TC-101 operations 1-4
  and TC-102 operations 5-10.
- TC-103 candidate operations present: 0/10.
- TC-104 settlement/evidence candidates present: 0/5.
- Closed JSON Schemas: 59.
- Ordered migration pairs: 30.
- Complete local tests: 445/445.
- Security tests: 24/24.
- PostgreSQL tests: 72/72.

The ten TC-103 operations are absent from the protocol catalog, schemas,
capabilities, authorization policy, admission policy, handlers, clients,
traceability, and presentation:

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

No runtime source outside documentation contains these operation identifiers.
Prototype buttons and package specifications are not runtime authority.

## Existing foundations to reuse

- TC-102 supplies an immutable, bilaterally accepted no-funds Match Proposal
  linked to one Human or Agent Subject, Principal, Provider, finalized Trading
  Credit Profile, synthetic template terms, and point-in-time Evidence.
- The shared `obligation.v2` projection, Event/Evidence/outbox boundary,
  PostgreSQL unit of work, optimistic aggregate versions, idempotency,
  authorization resources, abuse admission, forced RLS, snapshots, and
  reconciliation already exist.
- Core persistence already supports TC-101 profiles and TC-102 requests,
  Provider mandates, and Match Proposals. It has no Trading Capital Facility,
  Order Intent, or Facility Risk Evaluation projection.
- Existing Human, Agent, Provider, Risk, and Operations clients use one closed
  Tenant protocol. TC-103 must extend these clients without creating a second
  Human/Agent economic kernel.
- The Capital Network presentation already labels TC-102 matching as
  synthetic/no-funds. It has no Facility execution or shadow-risk product
  truth.

## Frozen implementation boundary

TC-103 may add only synthetic, non-redeemable local state:

- one Facility linked to one bilaterally accepted TC-102 Match Proposal and
  exactly one existing canonical `obligation.v2`;
- simulated Subject contribution and Provider funding;
- activation after exact contribution/funding and Obligation linkage checks;
- closed synthetic Order Intents and cancellation;
- deterministic reason-coded Facility risk evaluation;
- monotonic protective state transitions:
  `NORMAL -> WARNING -> REDUCE_ONLY -> FLATTEN -> SETTLEMENT`;
- protective pause and flatten with no transfer, withdrawal, venue action,
  signing, or external call; and
- restart/replay/reconciliation proof.

The implementation must keep every amount visibly synthetic and
non-redeemable. The Facility is a projection and may not become a second
Ledger or monetary truth.

## Explicit exclusions

- No TC-104 settlement, close request, performance proof, or Facility Evidence
  operation.
- No external venue, Hyperliquid endpoint, account query, SDK, API wallet,
  private key, signer, nonce allocator, Exchange action, or network request.
- No Testnet or mainnet transaction.
- No redeemable asset, token, wallet balance, custody, transfer, withdrawal,
  Provider capital, or real collateral.
- No caller-provided equity, PnL, exposure truth, risk score, risk state,
  trusted time, or Evidence eligibility.
- No real risk limit, leverage, pricing, fee, first-loss, liquidation,
  settlement, or recovery-to-less-restrictive-state policy.
- No new dependency, deployment, production identity, public route, or remote
  MCP surface.

## Expected bounded change surface

- Domain: Facility, Order Intent, shadow-risk state machine, views, and
  property tests.
- Contracts: closed Facility, Order Intent, and risk-evaluation schemas plus
  ten protocol request/result branches.
- Database: one reversible migration for Tenant/RLS projections and database
  guards.
- Persistence: projection read/write mapping and reconciliation registration.
- Gateway: ten handlers, exact capabilities, AuthZ, abuse classes, resource
  bindings, and local Human/Agent/Provider/Risk clients.
- Presentation: shared Human/Agent Facility state with explicit synthetic and
  non-redeemable labels.
- Evidence: protocol fixtures, migration/schema/catalog/security tests,
  PostgreSQL concurrency/restart/RLS/reconciliation, traceability, and the
  final TC-103 audit.

TC-104 remains blocked before, during, and after implementation until TC-103
receives independent review and explicit Founder acceptance.
