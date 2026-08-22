# Product Constitution v1.3 M2 proposed diff

Status: Accepted 2026-08-22 and incorporated into `docs/PRODUCT_CONSTITUTION.md` v1.3

Decision required: IPO.ONE Founder / Product / Governance

## Document control proposal

```diff
- Version: v1.2
- Effective date: 2026-08-14
- Supersedes: Product Constitution v1.1
- Milestone: GOVERNANCE-001 / Recovery M0
+ Version: v1.3
+ Effective date: <ratification date>
+ Supersedes: Product Constitution v1.2 effective 2026-08-14
+ Milestone: M2 — Public Secured Liquidity & Delegated Agent Execution
```

Add to purpose: v1.3 approves only the M2 secured-pool architecture and bounded
implementation sequence described here. It does not prove or activate runtime,
testnet, hosting, real value or production.

## Normative invariant proposal

Replace invariant 8 only:

```diff
- No arbitrary withdrawal, unrestricted transfer, public LP/vault, token/DAO,
- black-box universal score, unbounded Human cash loan, or automatic model
- promotion is approved.
+ No arbitrary withdrawal, unrestricted transfer, generic/public real-value
+ LP/vault, market factory, token/DAO, black-box universal score, unbounded
+ Human cash loan, hybrid secured/unsecured Facility, or automatic model
+ promotion is approved. One curated, overcollateralized, public-participation
+ Base Sepolia test-asset pool may proceed through separately gated M2 modes.
+ That exception grants no mainnet, real-value, production, multi-market,
+ multi-asset, flash-loan, recursive-leverage or Agent-withdrawal authority.
```

Add invariants:

11. M2 is secured-only. Existing unsecured/synthetic credit remains no-funds;
    collateral deficiency never becomes silent unsecured exposure.
12. The secured pool is one Capital Facility domain behind an adapter, not a
    second Subject, Offer, Obligation, Ledger, Event, Evidence, Credit State or
    reconciliation kernel.
13. Public participation does not imply permissionless market creation or risk
    administration.
14. On-chain pool balances are authoritative for custody, LP shares,
    collateral, debt, interest and liquidation; the IPO.ONE kernel remains
    authoritative for identity, Mandate, cross-rail Obligation and portable
    Evidence. Discrepancies fail closed.

## Delivery-mode proposal

Retain `L0..L5`. Amend `L3_LIVE_TESTNET`:

```diff
- Each transaction, signer, account, adapter, and run requires its own approval.
+ Every live profile remains disabled until a named policy entry is unlocked.
+ A ratified `live_testnet_secured_pool` profile may authorize public test-asset
+ participation only for its exact chain, contracts, accounts, assets, oracle,
+ caps, owners and Evidence window. Deployment/admin/signers remain exact-run
+ approvals. Test assets are not real funds or Human production lending.
```

## Registry additions

Add the following stable rows after `REQ-TRADE-005`. Status approval grants
architecture/local deterministic implementation only unless the row says L3;
the launch policy remains the runtime gate.

| Requirement ID | Capability | Status | Earliest mode | Governing decision | Gate / boundary |
| --- | --- | --- | --- | --- | --- |
| REQ-POOL-001 | one curated secured market and pool solvency | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | DEC-M2-SECURED-POOL-001 | one market; no factory/proxy/multi-asset; L3 separately gated |
| REQ-POOL-002 | public testnet LP supply and liquidity-valid withdrawal | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | DEC-M2-SECURED-POOL-001 | exact test assets/caps/pause; no real funds |
| REQ-POOL-003 | deterministic LP/debt share and reserve/bad-debt accounting | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | explicit rounding and conservation invariants |
| REQ-COLL-001 | collateral deposit, capacity, health and valid release | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | secured-only; stale oracle denies new risk/release |
| REQ-COLL-002 | deterministic liquidation, surplus and bad debt | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | test fixtures only; L3 action separately gated |
| REQ-ORACLE-001 | source-bound valid/fresh/deviation-guarded price | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | exact L3 feed/address and recovery separately approved |
| REQ-RATE-001 | utilization rate and monotonic bounded accrual | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-005 | fixture curve; no commercial pricing inference |
| REQ-POOL-EVID-001 | pool event finality, Obligation mapping and reconciliation | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | ADR-M2-003 | finalized authenticated logs; discrepancy blocks new risk |
| REQ-POOL-UX-001 | LP, Human borrower and pool Risk/Ops journeys | ARCHITECTURE_APPROVED_RUNTIME_GATED | L0_LOCAL_NO_FUNDS | M2 alignment v1.0 | L3 candidate requires deployed visible-click Evidence |
| REQ-AGENT-POOL-001 | Principal-bound Agent use of secured Facility | ARCHITECTURE_APPROVED_RUNTIME_GATED | L3_LIVE_TESTNET | DEC-AGENT-VENUE-EXEC-001 plus M2 alignment | M2B after M2A; no withdrawal/transfer/leverage-on-leverage |

## New decision proposal

### DEC-M2-SECURED-POOL-001 — one secured testnet Capital Facility

1. M2 introduces one curated Base Sepolia WETH/test-USDC overcollateralized
   pool. Public users may participate only through the exact enabled L3 profile.
2. Market/asset/oracle/risk administration remains governed. No market factory,
   proxy, arbitrary asset or multi-market path is approved.
3. M2A proves LP and Human lifecycle before M2B composes Principal-bound
   Hyperliquid Testnet execution.
4. The pool is not the IPO.ONE kernel. It emits authenticated facts mapped by a
   fail-closed adapter to the existing shared Obligation/Ledger/Evidence model.
5. All numerical values before an exact run approval are test fixtures.
6. Testnet passage grants no real-value or mainnet authority. Real-value public
   liquidity requires a future Constitution revision and complete legal,
   custody, capital, risk, oracle, audit, incident and loss-bearer decision.

## Explicit non-goals amendment

Replace “public LP or Strategy Vault products” with “public real-value LP,
Strategy Vault, generic market factory, and any pool outside the exact M2 testnet
profile.” Retain every other v1.2 non-goal and gate.

## v1.2 -> v1.3 crosswalk

No v1.2 ID is deleted, repurposed, downgraded or broadened. `REQ-CREDIT-008` and
`REQ-TRADE-001` remain shared-kernel Facility requirements; the new rows add
pool-specific acceptance. `REQ-EXEC-004` continues to prohibit arbitrary
withdrawal; `REQ-POOL-002` permits only normal withdrawal of an LP's valid pool
claim under liquidity/pause rules.

## Companion AGENTS.md ratification patch

After v1.3 approval, add the M2 alignment, ADR set, threat model and traceability
paths to the guidance list, and replace only the blanket public-LP sentence with:

> M2 is secured-only and may implement one curated Base Sepolia test-asset pool
> after governance ratification. The pool is an adapter-connected Capital
> Facility, not a second kernel. No hybrid/unsecured real-value exposure,
> market factory, mainnet, real funds, multiple markets/assets, flash loans,
> recursive leverage or unrestricted withdrawal is authorized. Each L3 profile,
> contract, asset, oracle, account, signer and run remains separately reviewed.

All existing issue, completion, privacy, security and deployment gates remain.

Permission/funds/deployment impact: **none until separately activated**. This
historical proposal is not the canonical Constitution and cannot approve
runtime.
