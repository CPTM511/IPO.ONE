# ADR-M2-002: One curated public secured pool

Status: Proposed; governance ratification required

## Context

The proposed market must reconcile public testnet participation with governed
risk configuration. Current Capital Partner flows are bilateral and synthetic;
current UI truthfully disables public LP access
(`apps/web/test/static-ui.test.js:1890-1903`).

## Decision

Build one native, non-proxy, overcollateralized testnet pool as a Capital
Facility domain. On the approved market, any wallet may call supply, liquidity-
valid withdrawal, collateral deposit, policy-valid borrow, repay, valid
collateral release and eligible liquidation. Public participation does not
grant market-creation or administrative authority.

The governed configuration admits exactly:

- chain: Base Sepolia (`eip155:84532`);
- collateral: canonical Base Sepolia WETH9
  `0x4200000000000000000000000000000000000006`;
- debt asset: one separately deployed/admitted standard 6-decimal test-USDC;
- one reviewed oracle adapter and one rate curve;
- one set of fixture caps, LTV, liquidation and pause roles; and
- one versioned pool deployment.

No generic market factory exists. Configuration is constructor-bound wherever
practical; mutable risk controls may only narrow exposure or pause new risk
until a separately reviewed redeployment.

The chain ID and WETH9 address are taken from the official
[Base network and contract documentation](https://docs.base.org/base-chain/network-information/base-contracts);
they still require exact L3 preflight and do not authorize a deployment.

## Exact first-version decomposition

- `IpoOneSecuredPoolV1`: the only economic-state contract. It holds test assets,
  keeps non-transferable internal LP and debt shares, positions, global indexes,
  reserves/bad debt, caps and pause state, and emits the complete event set.
- `IpoOnePriceOracleAdapterV1`: an immutable chain/source/asset-bound read-only
  adapter returning normalized price, observation time and source identity. It
  holds no token, share, position or administrative balance.
- WETH9 and the admitted test-USDC remain external standard tokens. No IPO.ONE
  token, transferable LP receipt, debt token or share-as-collateral path exists.
- The off-chain `SecuredPoolAdapterV1` observes/finalizes/reconciles events and
  maps them into the existing kernel; it is not a contract and cannot mutate
  pool economics.

The pool constructor fixes asset/oracle identities, rate/LTV/liquidation
fixtures, market cap and role addresses. A pause guardian may only enter a more
restrictive pool state. A separately named recovery authority may unpause after
Evidence-backed review; cap/parameter increases require a new reviewed contract
version rather than an in-place expansion.

## Product boundary

The pool owns token custody, LP shares, cash, collateral, debt, interest,
liquidation and pool solvency. IPO.ONE owns identity, authority, the cross-rail
Obligation envelope, portable Evidence and Credit State. The adapter imports
authenticated finalized events and cannot fabricate or edit pool economics.

## Novelty, risk and mitigation

- Novel element: publicly callable testnet capital actions.
- Risk: public calling can expose accounting, oracle, token and privilege bugs.
- Mitigation: one immutable market, standard tokens only, caps, pause/recovery,
  adversarial tests and independent review before any real-value proposal.
- Simpler safe alternative: an allowlisted-user testnet pool. It reduces public
  abuse exposure but does not test permissionless participation, so it is kept
  as a fallback if the public gate fails.

## Alternatives rejected

- Bilateral-only funding: does not prove public pool share/liquidity mechanics.
- Aave fork: excessive inherited scope, upgrade/governance assumptions and
  licensing/supply-chain complexity for one market.
- Permissionless market factory: expands assets, oracles and risk parameters
  beyond reviewable bounds.
- Multi-market or multi-chain launch: multiplies configuration and finality
  risk before one market reconciles.

## Consequences

Public UI must show testnet/non-real-value status, exact asset and health impact,
pause state and transaction/reconciliation maturity. Direct wallet positions
are valid pool positions but do not acquire Principal-bound Agent semantics.

Permission/funds/deployment impact: **none in this ADR**. The test-USDC address,
oracle source, fixture parameters, role accounts, contracts and deployment each
require exact preflight and a separately approved L3 run. Mainnet and real value
remain prohibited.
