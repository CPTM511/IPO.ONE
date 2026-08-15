# ADR-034: Trading Capital Shared Facility and Maturity Gates

Status: Accepted by IPO.ONE Founder under TC-000; architecture only; no runtime authority

Date: 2026-07-24

Decision owner: IPO.ONE Founder

Accepted at: 2026-07-25T00:32:32.792Z

## Context

Trading Capital is a focused product view over the IPO.ONE obligation protocol:
one Capital Provider, one segregated Facility, one Human Trader or Agent
Operator, and one Hyperliquid venue binding. It is not permission to create a
second ledger, obligation lifecycle, Evidence model, risk authority, or funds
system.

The candidate catalog contains 25 Trading Capital operations. Before TC-000
they are specifications only, with runtime maturity `specified_disabled` and
runtime count `0/25`.

## Accepted Architecture Decision

### Shared-kernel Facility

`TradingCapitalFacility` is proposed as an execution-and-risk aggregate that
references, but never replaces:

- the canonical Subject and Principal binding;
- the approved Consent or Mandate;
- the deterministic Decision and accepted Offer;
- exactly one canonical Obligation;
- the canonical Ledger and Event stream; and
- immutable Evidence.

Each Facility is segregated by Tenant and binds exactly one Provider, one
Obligation, one Human Trader or Agent Operator, one environment, and one
Hyperliquid master/subaccount identity. The actual venue account address, not
an API-wallet address, is the account identity used for account-state reads.

The Facility may project available capital, exposure, margin, orders, fills,
risk state, settlement state, and Evidence lineage. It is not monetary truth.
Every monetary posting remains in the canonical Ledger under the existing
serializable Tenant Command Gateway transaction boundary.

Human and Agent entry modes use the same Facility contract and shared kernel.
Their identity, Consent/Mandate, disclosure, and Evidence requirements remain
explicit instead of being flattened into a lowest-common-denominator flow.

### Product terms

The only proposed product-term shapes are:

1. fixed Credit;
2. fixed Performance Participation; and
3. fixed Hybrid.

Terms become immutable when a future, separately approved activation succeeds.
There is no automatic or PnL-driven repricing. A material term change requires
a new Offer and a new accepted Obligation; it cannot mutate an active Facility.

Exact rates, fees, caps, collateral, first-loss allocation, leverage, maturity,
loss bearer, pricing, and legal terms are not approved by this ADR.

### Five irreversible maturity gates

Trading Capital advances only through named, separately reviewed gates:

| Gate | Maximum permitted maturity | Required evidence before advancement |
| --- | --- | --- |
| TC-G0 | complete no-real-funds product | shared-kernel contracts, deterministic fixtures, UI/SDK parity, negative authorization and restart tests |
| TC-G1 | real Hyperliquid read-only data | account binding Evidence, signer-free Info Adapter, staleness/reconciliation tests, approved endpoint/environment |
| TC-G2 | protected Testnet writes | separately approved Testnet account and API wallet, typed action allowlist, durable nonce store, kill switch, unknown-outcome recovery, human E2E evidence |
| TC-G3 | complete Testnet Facility | accepted Testnet funding/collateral simulation, lifecycle, risk, settlement, Evidence, incident and restart drills |
| TC-G4 | real-value decision package only | named human decisions for legal, capital, custody, signer, account, pricing, caps, first loss, operations, monitoring, release, and rollback |

Completion of one gate does not authorize the next. TC-G4 authorizes preparation
of a decision package only; Codex cannot unlock real value, deploy production
credentials, or move funds.

All 25 candidate operations remain `specified_disabled` after TC-000. Founder
acceptance of this ADR may name TC-101 as the next task, but it does not make
any operation callable.

## Owner and Rationale

The IPO.ONE Founder owns acceptance, rejection, or amendment because the
Facility shape fixes product and governance boundaries. The rationale is to
preserve one auditable obligation kernel while allowing a narrow execution
projection to evolve behind reversible maturity gates.

## Alternatives Considered

- **Separate Trading Capital ledger:** rejected because it creates competing
  monetary truth and irreconcilable servicing behavior.
- **Independent Agent-only obligation model:** rejected because Human and Agent
  are parallel entry modes over one protocol.
- **Direct integration first:** rejected because endpoint access would precede
  authorization, nonce, Evidence, risk, and recovery controls.
- **Prototype clickability as completion:** rejected because presentation state
  is not runtime authority.
- **One approval for all gates:** rejected because each gate changes the
  consequence and credential boundary.
- **Dynamic PnL repricing:** rejected because it is procyclical, hard to explain,
  and silently mutates accepted economics.

## Rollback

Before acceptance, rollback is deletion of the proposal with no runtime effect.
After acceptance but before any later runtime task, rollback means superseding
this ADR and keeping all 25 operations disabled. After a future runtime task,
rollback must disable admission, revoke relevant environment credentials, stop
new risk, reconcile outstanding effects, preserve immutable Event/Evidence
history, and restore the last accepted shared-kernel release. Rollback never
deletes audit history or rewrites Ledger/Event facts.

## Explicitly Unapproved Decisions

- any Trading Capital runtime operation or route;
- any schema, migration, capability, AuthZ, admission, SDK, UI, MCP, worker, or
  Hyperliquid adapter implementation;
- any Hyperliquid credential, API wallet, private key, master/subaccount, RPC,
  endpoint, chain, product, asset, or venue commitment;
- any Testnet write, production deployment, mainnet interaction, or real funds;
- any provider, jurisdiction, legal structure, custody model, loss bearer,
  pricing, fee, first loss, collateral, cap, leverage, threshold, or stop loss;
- any automatic facility activation, repricing, withdrawal, transfer, or
  settlement authority; and
- any claim that prototype views or ADR acceptance constitute implementation.

## Consequences

The proposal supplies a traceable architecture target for TC-101 and later
tasks without expanding runtime authority. Its cost is deliberate sequencing:
the product cannot skip directly from documentation to a signer or live venue.
