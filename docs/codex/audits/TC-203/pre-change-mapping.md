# TC-203 pre-change mapping

Recorded before TC-203 implementation on
`codex/commercial-access-release` at source identity
`de5e72d5a912d2d55c2ce86570408f37c07d4a4f`.

## Runtime truth

- The accepted stacked worktree exposes the exact 25 Trading Capital
  operations through the closed Tenant catalog.
- `tradingFinalizeEvidenceSnapshot` already creates the finalized,
  point-in-time, non-authorizing Hyperliquid Testnet Evidence snapshot and its
  five-factor scorecard.
- `tradingEvaluateRisk` is a separate local no-funds Facility command. It
  mutates the synthetic Facility risk state and therefore is not a valid
  carrier for TC-203 real read-only Shadow Risk.
- The v2 real profile persists hashes, bounded aggregate metrics, data-quality
  gaps, and reconciliation state. It does not persist raw fills, account
  addresses, raw signatures, strategy code, private keys, or credentials.
- The current real scorecard is descriptive and non-authorizing but does not
  expose versioned feature vectors, stress-window availability, temporal
  leakage checks, or drift-monitor state.

## Contract and implementation decision

- Preserve the exact 25-operation catalog; add no Tenant operation, capability,
  admission rule, or economic permission.
- Upgrade only the nested factor-scorecard contract with a backward-readable
  `trading_real_factor_scorecard.v2` branch.
- Generate v2 only from an already finalized, source-linked Evidence snapshot.
  Existing v1 finalized profiles remain readable.
- Publish descriptive values and explicit `observed`, `insufficient`,
  `unknown`, or `stale` states. Do not publish weights, cutoffs, grades,
  approval decisions, limits, leverage, prices, or automatic recovery.
- Keep Facility, Ledger, Obligation, settlement, order, and capital state
  unchanged.

## Expected files

- `schemas/v2/trading-real-credit-profile.schema.json`
- `packages/domain/src/trading-capital-real-evidence.js`
- `packages/api-contract/index.d.ts`
- domain, contract, handler, conformance, and PostgreSQL tests as affected
- `docs/codex/audits/TC-203/audit.md`

## Human gate interpretation

The Founder instruction unlocks the TC-203 review-gated, non-authorizing
implementation only. Numeric risk policy, production score, Facility mutation,
capital decisions, API-wallet signing, Exchange writes, real value, and TC-301
remain unapproved.
