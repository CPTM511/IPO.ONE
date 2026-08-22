# IPO.ONE M2 public secured pool threat model v0.1 DRAFT

Status: Accepted as the M2 baseline; not an independent security review

Scope: one Base Sepolia WETH/test-USDC secured testnet market, its adapter,
indexer, IPO.ONE kernel integration, Human/LP/Risk surfaces and later M2B Agent
composition. Real value and mainnet are out of scope and unapproved.

## Assets and trust boundaries

Protected assets are test-token custody, LP claims, collateral, debt, protocol
reserves, canonical Obligation/Ledger/Evidence integrity, Subject/Principal and
Mandate bindings, signing authority, configuration, pause/recovery authority,
and user transaction intent.

Trust boundaries:

```text
wallet/user -> web transaction preparation -> EVM wallet -> Base Sepolia pool
pool -> RPC observations -> indexer/finality -> adapter -> Tenant Gateway
Tenant Gateway -> PostgreSQL/RLS -> Ledger/Event/Evidence projections
Principal -> Agent workload -> exact policy signer -> Hyperliquid Testnet (M2B)
Risk/Ops -> reviewed controls -> pool/kernel recovery
```

On-chain state is public. PII, raw KYC, credentials, private keys, signatures
and private policy must remain off-chain and out of logs/Evidence.

## Threat register

| ID | Threat / precondition | Impact | Required controls | Residual risk / required evidence |
| --- | --- | --- | --- | --- |
| SC-01 | reentrancy or callback token | duplicate withdrawal/borrow/liquidation | checks-effects-interactions, `ReentrancyGuard`, standard-token admission, failed transfer reverts all accounting | malicious-token harness and call-trace review |
| SC-02 | share inflation/donation attack | later LPs receive near-zero shares | virtual/minimum initial liquidity rule, floor/ceil policy, minimum shares, invariant `claims <= assets` | stateful first-depositor/donation fuzz |
| SC-03 | debt/share rounding extraction | unbacked claims or underpaid debt | `mulDiv`, solvency-favoring directions, exact close paths, reserve dust attribution | differential reference-model fuzz at min/max amounts |
| SC-04 | timestamp jump or repeated accrual | excess/negative interest | monotonic time, bounded accrual chunks, one accrual per mutation | warp/fuzz and replay invariants |
| SC-05 | storage/config collision or hidden upgrade | mutable economics | no proxy/factory, constructor-bound market identity, bytecode/config hash Evidence | deployment bytecode verification |
| SC-06 | unbounded iteration/gas DoS | pool becomes unusable | global indexes; no user loops; bounded event/indexer batches | gas ceilings at cap-scale fixtures |
| ECON-01 | liquidity exhaustion/withdrawal run | LP cannot withdraw | cash check, transparent utilization, no promise of immediate liquidity, repay/liquidate remain open | full-utilization and queued-user UX tests; no hidden IOU |
| ECON-02 | insolvency/bad-debt concealment | overstated LP claims | explicit reserves and bad debt, one-time recognition, exchange rate includes loss | loss socialization invariant and Evidence |
| ECON-03 | recursive leverage/LP share collateral | amplified exposure | LP shares not collateral; no flash loans, callbacks or rehypothecation | forbidden-call and asset admission tests |
| ECON-04 | cap bypass through concurrency | exposure over limit | contract-atomic caps and current-state checks | same-block multi-actor fuzz |
| ORA-01 | stale/zero/negative/wrong-decimal price | unsafe borrow or seizure | closed adapter, positive price, decimals normalization, 3,600s fixture freshness, chain/source binding | stale/wrong-decimal/adversarial adapter tests |
| ORA-02 | price manipulation/deviation | bad debt or wrongful liquidation | 20% fixture deviation halt, caps, no caller price, reviewed recovery | shock/manipulation vectors; live-source review |
| ORA-03 | oracle outage | risk controls unavailable | fail closed for borrow/release/liquidation; repay/add collateral available; pause and alert | outage/recovery browser and contract tests |
| TOK-01 | fee-on-transfer/rebasing/ERC-777 token | accounting mismatch/reentrancy | exact standard WETH and one reviewed standard test-USDC only; balance-delta checks | adversarial token rejection tests |
| TOK-02 | token mint/admin compromise | artificial liquidity or debt repayment | test-only labels, admitted token bytecode/admin disclosure, caps | unavoidable testnet issuer trust is explicit |
| LIQ-01 | excess seizure/rounding | borrower loss | close factor, bonus formula, ceiling bounded by collateral, slippage/min-out | differential liquidation vectors |
| LIQ-02 | liquidation grief/front-run | reverted or worse execution | current price/health check, liquidator max repay/min collateral, deadline | concurrent liquidator and sandwich simulations |
| PRIV-01 | admin changes terms or drains funds | loss/censorship | no arbitrary transfer, immutable assets/core math, role separation, pause narrows risk only | privilege surface inventory and access tests |
| PRIV-02 | pause blocks repayment | traps borrower | repay/add collateral/risk-reducing liquidation stay open whenever safe | every pool state action matrix test |
| CHAIN-01 | reorg/replaced transaction | false Obligation/Evidence | inclusion/safe/finalized states, block-hash binding, append-only invalidation | reorg/replacement/restart tests |
| CHAIN-02 | RPC disagreement or forged response | false projection | bounded two-provider observation at discrepancy, direct contract reads, closed ABI | provider disagreement drill |
| IDX-01 | missed/duplicate/out-of-order logs | divergent Ledger | `(chain,contract,tx,logIndex)` identity, cursor/block hash, idempotent import, replay | restore/replay produces exact state hash |
| IDX-02 | off-chain projection overwrites chain | fabricated exposure | chain remains authoritative; discrepancy freezes new off-chain risk | mutation-denial tests and additive repair evidence |
| AUTH-01 | wrong Tenant/Subject/wallet binding | cross-user access | authenticated server context, CAIP-10 proof, RLS, object authorization | negative cross-Tenant/Subject suite |
| UI-01 | substituted calldata/chain/address | user signs unintended action | transaction review shows chain, contract, function, amount, asset, resulting health; re-derive after wallet switch | real-wallet visible-click rejection tests |
| UI-02 | pending/digest shown as final | false safety claim | distinct digest/transaction/observation/finality/reconciliation states | copy and state-transition browser tests |
| UI-03 | stale browser health/capacity | unsafe choice | server/chain refresh before preparation and wallet confirmation; expiry | refresh/relogin/restart tests |
| AG-01 | Agent credential or delegate compromise | unauthorized orders | sender-constrained workload identity, exact Mandate, fresh per-Facility delegate, no withdrawal/transfer | revocation/replay/credential-destruction drills |
| AG-02 | nonce replay or unknown submission | duplicate risk | durable monotonic nonce, one-use approval, `UNKNOWN` terminal until read reconciliation | crash-after-send and ambiguous-response tests |
| AG-03 | pool health and venue margin diverge | dual insolvency | independent monitors; freeze -> cancel -> reduce/flatten -> reconcile -> repay -> pool liquidation order | dual-risk recovery drill |
| OPS-01 | denial of service during a risk event | inability to protect | bounded calls, multiple read providers, local read fallback, named on-call and emergency runbook | load/failure drill before L3 |
| SUP-01 | compromised dependency/tool binary | malicious bytecode/tests | exact pins, checksums/Sigstore/SBOM, minimal imports, reproducible bytecode | supply-chain review in M2A-002 |

## Mandatory invariants

1. Assets received and claims/debt created conserve value within documented
   rounding.
2. No borrow exceeds cash, market cap, borrower cap or collateral capacity.
3. Encumbered collateral cannot be released below policy.
4. Invalid oracle state never authorizes new debt, release or seizure.
5. Repayment and liquidation cannot apply twice or drive debt below zero.
6. Pausing does not erase balances or silently change terms.
7. Failed token transfer commits no partial accounting state.
8. No user iteration is required for accrual or solvency.
9. Every finalized mutation maps to authenticated, idempotent chain Evidence.
10. Indexer replay/reorg/restart cannot duplicate Obligation/Ledger effects.
11. A discrepancy blocks new off-chain risk until additive reconciliation.
12. Agent authority never includes pool/venue withdrawal or authority expansion.

## Assurance plan

- independent reference-model and formula vectors;
- Solidity unit, fuzz and stateful invariant tests;
- adversarial token/oracle/reentrancy and privilege tests;
- Node ABI/adapter/indexer/finality/reorg integration;
- PostgreSQL RLS/idempotency/concurrency/restart/restore tests;
- real-browser LP, Human and Risk/Ops happy, denial and recovery paths;
- Base Sepolia deployment/config/bytecode verification and recovery drill; and
- independent smart-contract review before any real-value proposal.

No testnet result proves real-value safety. Residual risks include test token
issuer control, testnet instability, oracle/source availability, economic
behavior not represented by fixtures, smart-contract defects, privileged pause
abuse and external venue/custody risk. A future real-value decision requires a
new threat model, legal/custody/role mapping, production oracle/assets/caps,
multisig/timelock, audit, vulnerability disclosure, incident owner and explicit
loss bearer.

Permission/funds/deployment impact: **none**. This document authorizes no test
asset, account, signer, oracle, deployment, transaction or public endpoint.
