# IPO.ONE M2 pre-development alignment v1.0

Status: `FOUNDER_APPROVED_FOR_REPOSITORY_RATIFICATION_2026_08_22`

Decision owner: IPO.ONE Founder / Product / Governance

Base commit: `71786a3c72237320f7bacf77b64496dd1a0c526f`

## Authority and conflict

This document translates the supplied M2 alignment package into a bounded
repository direction. Product Constitution v1.3 is the canonical authority;
this document cannot activate runtime, testnet, contracts, dependencies,
signers, risk values, real funds, or production by itself.

The conflict is explicit: v1.2 prohibits public LP/vault capability
(`docs/PRODUCT_CONSTITUTION.md:72-74`, `332-344`), and the launch policy has no
live-testnet secured-pool profile. Therefore this PR changes no runtime and
authorizes no pool.

## Ratified bounded direction

> One kernel. One active risk mode. One curated market. Human first. Delegated
> Agent execution second.

- Milestone: `M2 — Public Secured Liquidity & Delegated Agent Execution`.
- Risk mode: secured only. No hybrid Facility and no unsecured real-value
  activation.
- Capital: one curated, overcollateralized public testnet pool.
- Participation: public supply, valid withdrawal, collateral deposit, borrow,
  repay, collateral release, and eligible liquidation on the approved market.
- Governance: market creation, asset admission, oracle, LTV, liquidation, caps,
  pause and administration remain governed.
- Profile: Base Sepolia (`eip155:84532`), canonical Base Sepolia WETH9 test
  collateral, one separately admitted test-USDC debt token, one market.
- M2A: complete Human secured borrowing and LP/pool operations.
- M2B: Principal-bound Hyperliquid Testnet execution after M2A.
- Task/API/Compute Agent credit: deferred to M3.
- Architecture: the pool is a Capital Facility domain connected by an adapter;
  it never replaces or forks Subject, Mandate, Offer, Obligation, Ledger,
  Evidence, Credit State, or reconciliation truth.
- Mainnet, real funds, a market factory, multiple assets/markets, flash loans,
  recursive leverage, token/DAO and unrestricted transfers remain unapproved.

## Separate tracks

Founder-owned commercial decisions include capital sources, LP acquisition,
commercial pricing, partners, jurisdiction/legal structure, real-value timing,
loss bearing and go-to-market. Engineering must not invent them.

The product/engineering track may, after repository ratification and issue approval, build
versioned contracts, adapters, accounting, indexers, Human/Agent interfaces,
security controls, tests and an explicitly approved testnet deployment. All
numbers in Phase 0 are test fixtures, not commercial terms.

## M2A boundary

M2A proves one public overcollateralized testnet market and two visible paths:

1. LP: connect -> supply test-USDC -> inspect shares/claim/utilization ->
   withdraw subject to liquidity/pause.
2. Human borrower: self-Principal wallet -> deposit WETH -> review capacity and
   projected health -> borrow test-USDC -> observe debt/interest/health -> repay
   -> release collateral.

A forced adverse path must progress from healthy through warning, risk denial,
liquidatable, liquidation, proceeds allocation and surplus or bad-debt Evidence.
All final pool economics are on-chain; identity, authority, canonical
Obligation, portable Evidence and Credit State remain in IPO.ONE.

## M2B boundary

M2B composes the same secured Facility with an accountable Principal and a
delegated Agent. Existing exact Mandate, sender-constrained authentication,
account binding, one-use approval, nonce, `UNKNOWN`, cancel/reduce/flatten,
reconciliation and withdrawal-denial controls are reused, not rebuilt.

Responsibility remains:

```text
Principal = accountable Obligor
Agent = bounded delegated Executor
IPO.ONE = identity, authority, Obligation, Evidence and reconciliation
Secured pool = capital facility
Hyperliquid = external execution venue
```

## Delivery gates

| Stage | Earliest authority after ratification | Required evidence |
| --- | --- | --- |
| Phase 0 | documentation only | this proposal set, exact audit, accepted governance diff |
| M2A local | `L0_LOCAL_NO_FUNDS` deterministic model | reference-model, unit, fuzz, invariant, integration and browser evidence |
| M2A live testnet | new `L3_LIVE_TESTNET` pool profile | exact contracts, assets, oracle, accounts, caps, owner, finality and reconciliation evidence |
| M2B testnet | separately approved exact Agent run | Principal/Mandate, signer, nonce, venue and recovery evidence |
| Real value / mainnet | not approved in M2 | new Constitution, policy, legal/custody/risk/security/audit and Founder go/no-go |

Phase 0 stops for repository review and merge. Implementation may begin only
after the Constitution, AGENTS.md, and launch-policy direction are merged in the
sequence defined by `docs/codex/tasks/M2_EXECUTION_PLAN_v0.1.md`.

## Explicit non-goals

No runtime code, contract, schema, dependency, OpenAPI/SDK behavior,
authorization, funds behavior, deployment, signer, transaction, website,
README, whitepaper, PDF, license, generic pool, Aave fork, M2A or M2B
implementation is part of this document.

Permission/funds/deployment impact: **none**. This proposal grants no chain,
asset, signer, credential, deployment, custody, public-access or real-value
authority.
