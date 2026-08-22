# M2 pre-development baseline checkpoint — 2026-08-21

Audit performed: 2026-08-22 (the requested checkpoint filename is retained)

Status: `DOCUMENTATION_ONLY_BASELINE`

## Exact source

| Field | Value |
| --- | --- |
| Repository | `CPTM511/IPO.ONE` |
| Base branch | `origin/main` |
| Base commit | `71786a3c72237320f7bacf77b64496dd1a0c526f` |
| Git tree | `615dd439bc2f49cf15cc4918b2c232001856b6f2` |
| Work branch | `codex/m2-predevelopment-alignment` |
| Worktree | isolated and clean before edits |
| Tracked files | 1,779 |
| Node / pnpm | `v26.5.0` / `11.1.3` |

The primary checkout was not a usable editing baseline: it was detached at
`330dd41027c75aa8c725ab3777121460ae131115` and contained 203 untracked files.
No pre-existing file was moved, deleted, staged, or copied. A separate worktree
was created from the exact required `origin/main` commit.

## Repository shape at the checkpoint

- Migrations: 63 ordered up/down pairs, `0001` through `0063`; combined sorted
  SHA-256 listing digest
  `bd2fa3a9d7efe73883cfeb17bce5f49398093dcb746dc6cfa1bcbbc16fdcde62`.
- Contracts: four Solidity 0.8.30 contracts and four Node contract-test files.
  They are non-custodial registries/verification artifacts, not a lending pool
  (`contracts/README.md:3-37`).
- Contract toolchain: pinned `solc@0.8.30`; no Foundry configuration and no
  OpenZeppelin dependency (`package.json:131-141`).
- Application contract: 21 OpenAPI paths/operations and the shared Tenant
  protocol; existing Trading Facility operations are private, no-funds
  operations (`packages/api-contract/src/tenant-protocol.js:962-1024`).
- Chain support: provider-neutral Base Sepolia/X Layer adapters plus bounded
  read/finality/indexer paths (`modules/chain-adapter/README.md:1-27`,
  `modules/event-indexer/README.md:1-31`).
- Deployment policy: only `public_sandbox` is enabled; it has
  `realFundsEnabled=false` and `humanCreditEnabled=false`.
  `closed_non_funds_pilot` and `controlled_agent_credit_pilot` are disabled
  (`deploy/launch-policy.v1.json`). No secured-pool profile exists.
- License: no repository root `LICENSE` file exists at this baseline.

## Exact-state capability audit

The labels below are deliberately independent. `NO` means no repository
evidence was found for that state at this exact commit; it does not predict
future implementation.

| M2 capability | Approved | Implemented | Locally verified | Testnet verified | Deployed | Reachable | User verified | Real-value active | Evidence / finding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared Human/Agent kernel | YES, L0 | YES | YES, prior sandbox evidence | bounded components only | public sandbox baseline only | existing product surfaces | prior no-funds journeys only | NO | Constitution `REQ-CORE-001`; M1 matrix `docs/traceability/M1_REQUIREMENT_TRACEABILITY_MATRIX.md:22-27` |
| Secured collateral position | NO for public pool | NO | NO | NO | NO | NO | NO | NO | existing Trading Facility is `syntheticOnly=true` and `realCollateral=false` (`packages/domain/src/trading-capital-facility.js:144-184`) |
| Public LP supply/share accounting | NO | NO | NO | NO | NO | NO | NO | NO | Constitution prohibits public LP/vault (`docs/PRODUCT_CONSTITUTION.md:72-74`, `332-344`); UI explicitly says public LP access is not enabled (`apps/web/test/static-ui.test.js:1890-1903`) |
| Pool utilization interest accrual | NO | NO | NO | NO | NO | NO | NO | NO | obligation interest and synthetic utilization exist, but no pool cash/debt-share/index accrual contract exists |
| Oracle validation | NO | NO | NO | NO | NO | NO | NO | NO | no price-feed adapter or collateral valuation module/contract found |
| Liquidation and pool bad debt | NO | NO | NO | NO | NO | NO | NO | NO | Trading risk states and liquidation-count Evidence fixtures are not secured-pool liquidation/accounting |
| Pool event normalization/reconciliation | proposal only | NO | NO | NO | NO | NO | NO | NO | reusable finality/reorg/indexer infrastructure exists; no pool ABI/event decoder exists |
| Human wallet secured-borrow journey | NO | NO | NO | NO | NO | NO | NO | NO | wallet connection and Human no-funds credit UI exist; no collateral/debt-health transaction journey exists |
| LP product surface | NO | NO | NO | NO | NO | NO | NO | NO | no LP workspace; disabled capability copy is truthful |
| Pool Risk/Ops surface | NO | NO | NO | NO | NO | NO | NO | NO | generic Risk/Ops exists, but no pool solvency/oracle/liquidation/discrepancy views |
| Hyperliquid authority/nonce/recovery reuse | YES, gated | YES for existing bounded profile | YES at documented local/testnet boundaries | historical exact bounded run only | not an M2 pool deployment | existing Agent surfaces only | not as M2B | NO | ADR-035/038/039 and HyperCore modules provide reusable exact approval, nonce, `UNKNOWN`, reconciliation and withdrawal-denial boundaries |
| Stateful Solidity fuzz/invariant toolchain | architecture precedent only | NO | NO | NO | NO | N/A | N/A | NO | Node `solc` tests exist; Foundry/OpenZeppelin are absent |

## Pre-change checks

| Command | Result |
| --- | --- |
| `pnpm run lint` | PASS: 722 JavaScript modules parsed; boundary lint passed |
| `node scripts/check-migrations.mjs` | PASS: 63 ordered up/down pairs |
| `node scripts/check-launch-policy.mjs` | PASS: policy valid and pending evidence fails closed |
| `node scripts/check-schemas.mjs` | PASS: 136 contracts |
| `node scripts/check-openapi.mjs` | PASS: 21 paths, 21 operations |
| `pnpm run typecheck` | BLOCKED before execution: existing dependency directory lacks `ajv`; no install performed |
| `node scripts/check-product-traceability.mjs` | BLOCKED for the same missing `ajv` package |

No PostgreSQL, browser, signer, chain, deployment, or external-provider command
was run. The existing release artifacts remain historical evidence and were not
relabelled as M2 evidence.

## Change boundary

Protocol semantics, runtime, schema, dependencies, authorization, funds
behavior, deployment configuration, and public narrative changed: **NO**.
This checkpoint records facts only and grants no M2 implementation or runtime
authority.
