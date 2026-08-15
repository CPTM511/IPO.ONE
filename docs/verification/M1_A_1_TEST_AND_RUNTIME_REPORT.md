# M1-A.1 Test and Runtime Report

Audit date: 2026-08-04

Source baseline:

- Branch: `codex/checkpoint-20260727-pre-strategy`
- HEAD: `4b0e41dde352283e0d27228d51d1fb99f04c97a8`
- HEAD tree: `907820553598ff50ff0446c1c4c365247a074fe8`
- Worktree: intentionally dirty; no branch, commit, tag, reset, clean, merge,
  dependency upgrade, or release operation was performed.

Toolchain:

- Node.js `v26.5.0`
- pnpm `11.1.3`
- Local PostgreSQL runtime `17`

## Current verification outcomes

| Command or runtime check | Result | Exact evidence |
| --- | --- | --- |
| `pnpm run lint` | `PASS` | 560 JavaScript modules parsed; boundary lint passed. |
| `pnpm run typecheck` | `PASS` | Three package export surfaces and 68 runtime exports match parseable declarations. |
| `pnpm run check:migrations` | `PASS` | 49 ordered up/down migration pairs. |
| `pnpm test` | `PASS` | 698 passed, 0 failed. |
| `DATABASE_URL=<isolated-temporary-database> pnpm run test:postgres` | `PASS` | 82 passed, 0 failed; includes durable authentication, forced RLS, restart/replay, shared Human/Agent credit, and Lockbox assertions. |
| `pnpm run local:acceptance` | `PASS` | PostgreSQL 17, 49 migrations, wallet gates, Agent proof, forced RLS, worker heartbeat, reconciliation, Evidence anchor coverage, and empty pending outbox. |
| first `pnpm run local:agent:acceptance` | `FAIL_RETAINED` | Principal had 35 active resources; the 32-item resume window omitted its only verified Agent Subject. |
| rerun `pnpm run local:agent:acceptance` | `PASS` | Fresh Mandate `mandate_58f6c51c-4f49-45b3-a50a-18c2135f49b8`, Obligation `obligation_e28493a5-6ece-4a08-8e83-fb2631e82e6f`, 13 Evidence events, `sandboxOnly=true`, `productionFundsMoved=false`. |
| real Chrome Human lifecycle | `PASS_WITH_CANONICAL_STOP` | SIWE through fully repaid Credit Outcome passed; Dispute/Correction is absent. |
| real Chrome Agent lifecycle | `PASS` | Principal binding, CAIP-10 proof, Mandate, Offer, non-withdrawable execution, full repayment, reload recovery, and 14 latest verified Evidence events passed. |
| `pnpm run check:m1-requirements` | `PASS` | Exact 44 Constitution IDs; 35 `VERIFIED_SANDBOX`, 8 `IMPLEMENTED_UNVERIFIED`, 1 `NOT_IMPLEMENTED`. |
| `pnpm run check:schemas` | `PASS` | 85 contracts. |
| `pnpm run check:openapi` | `PASS` | 21 paths and 21 operations. |
| `pnpm run check:tenant-protocol` | `PASS` | 76 operations with closed request/result, handoff, capability, and workflow fixtures. |
| `pnpm run check:web-bundle` | `PASS` | One external module, 28 authored modules, 850 unique IDs. |
| `pnpm run check` | `FAIL_EXPECTED_RELEASE_GATE` | The immutable older v2 RC expects 48 migrations while the current dirty candidate has 49. The old sealed manifest was not rewritten or weakened. |

## Retained logs

- `artifacts/m1-a-1/logs/pnpm-lint-20260804.log`
- `artifacts/m1-a-1/logs/pnpm-typecheck-20260804.log`
- `artifacts/m1-a-1/logs/pnpm-check-migrations-20260804.log`
- `artifacts/m1-a-1/logs/pnpm-test-20260804.log`
- `artifacts/m1-a-1/logs/pnpm-test-postgres-20260804.log`
- `artifacts/m1-a-1/logs/local-acceptance-20260804.log`
- `artifacts/m1-a-1/logs/local-agent-acceptance-20260804.log`
- `artifacts/m1-a-1/logs/local-agent-acceptance-20260804-rerun.log`

The failing Agent acceptance log is intentionally retained. It was not replaced
or relabelled as a pass.

## Lockbox runtime boundary

The durable Agent Lockbox remains bounded to the existing authenticated Agent
execution and repayment commands. PostgreSQL binds Subject, Principal,
AccountBinding, Mandate, Credit Intent, Offer, Obligation, Ledger accounts,
purpose/provider scope, captured revenue, repayment, and closure. Database and
domain guards keep `withdrawable=false`, `custodyAuthority=false`,
`unrestrictedTransfersAllowed=false`, `sandboxOnly=true`, and
`productionFundsMoved=false`.

It is not a wallet, custody product, capital pool, Strategy Vault, or source of
independent credit authority.

## Install and release boundaries

The rebuilt container completed `pnpm install --frozen-lockfile --prod
--ignore-scripts` against the configured registries. This proves the observed
online install only. Offline or air-gapped installation is not classified as a
release gate, and no dependency was vendored or upgraded. That decision remains
reserved for the Founder.

M1-B remains blocked and no production, mainnet, custody, KYC, external signer,
external Provider write, withdrawal, or real-funds operation occurred.
