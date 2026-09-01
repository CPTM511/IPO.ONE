# RISK-003B final Evidence

Verdict: `PASS — SHADOW EVALUATION COMPLETE`

Date: 2026-09-01

## Authority and scope

Founder authorization `同意，开搞` authorizes this exact finalized-Testnet
shadow-learning task only. The work does not authorize or perform an active
policy change, Offer/limit/pricing change, external action, production-risk
claim, mainnet or real-value operation, Phase 3 closure, or M3 work.

## Exact input and output

| Binding | Exact value |
| --- | --- |
| Source Evidence | `artifacts/testnet/hl-testnet-001b-live-20260901-001.json` |
| Source SHA-256 | `eeb1f5e77de5397d7f2317c080770da44412cca3876145752ad1a2837f50aaa3` |
| Shadow artifact | `artifacts/risk-003b/risk-003b-shadow-run-20260901-001.json` |
| Shadow artifact SHA-256 | `97f7a6a8821203455fd71a958b5cb81cda42f3fa00e04c09fb048d87bd22e20b` |
| Shadow run hash | `0x30989bd247b0e355f29f26331e30df7e3e52af405a607b12bfe6189d20b780a2` |
| Source-manifest hash | `0x55ca98c3bb7443e516a22808f9e3ca934fc800155d93faac6afc4e6fab2853af` |
| Feature-snapshot hash | `0x748ee978b08aa55981555afe695742796eedf9cc7d91aec9ac5c0df84301ac6c` |
| Outcome-label hash | `0xea507b4a47217679b41b2214f6201dd6b811bd33e3e0c4dfb39bac10b2dc66d7` |
| Challenger hash | `0x6c4881b89e309c33cc71f0af2de2716618e67f8e21b8ea079afef5d65ad25dbe` |
| Offline-report hash | `0x81e2980193f89598133145712ed6b44b9a46138dade706f32719d7df7bc4d6cf` |
| Idempotency key | `0xef84ba58bdcc6e2e077decdde5658d06f2ffcaec29689f84c6a26c6bb098dec7` |

Admission verifies the exact source bytes, finalized and reconciled state,
closed fills, zero unresolved unknown outcomes, the one-run boundary, signer
retirement, privacy review, and pseudonymous Subject/Principal scope hashes.
Pending, revoked, invalidated, wrong-scope, policy-drifted, conflicting
duplicate, unreconciled, or byte-drifted input fails closed.

## Truthful result

- Sample size: `1` Agent, `0` Human.
- Market outcome: one bounded BTC open/close cycle, closed and reconciled.
- Repayment: `1198/1200`, or `99.83%` at report precision.
- Outstanding loss: `2` minor units; outcome label `loss_outstanding`.
- Decision-time utilization: `8538` bps.
- Effective leverage: `103` bps.
- Loss rate: `16` bps.
- Unknown outcome count: `0`; manual intervention count: `0`.
- Challenger verdict: `insufficient_sample` with `very_high` uncertainty.
- Calibration, drift, false-approval and false-rejection metrics remain
  unavailable because one Testnet observation cannot support those claims.
- No capacity multiplier or policy-change recommendation was emitted.

The source outcome is not falsely converted to `fully_repaid` or
`written_off`. Decision-time features and the later outcome window remain
separate to prevent look-ahead leakage.

## Active-policy immutability

Active policy before and after shadow evaluation is
`agent_credit_hyperliquid_testnet.v2`, with identical hash:

`0xd91aa0acf5ee8e10aa18fac3b48614c341c0666b1669da2216ac6973961b194e`

The challenger remains optional and `shadow`; `promotionAllowed`,
`autoApplied`, and `autoLoosening` are all false. Disabling the challenger
leaves the active product and active credit authority unchanged. The adapter
has no policy, Offer, Facility, Ledger, signer, Venue, transfer, withdrawal, or
other external mutation interface.

## Verification

| Command / gate | Result |
| --- | --- |
| Focused domain and runner/report suite (`13` tests) | PASS |
| `pnpm check` with isolated PostgreSQL 17 test database | PASS |
| PostgreSQL/RLS integration suite (`95` tests) | PASS |
| Security suite (`34` tests) | PASS |
| Transport/SDK/MCP suite (`89` tests) | PASS |
| Root test suite (`1247` tests) | PASS |
| Foundry contracts (`25` runnable tests) | PASS |
| Base Sepolia fork-only tests (`2`) | SKIPPED — no explicit fork URL; no local failure |
| Runtime, source/boundary lint, types, schemas, OpenAPI, migrations, Tenant protocol, product traceability, deployment topology, launch policy, local stack and web bundle | PASS |
| `git diff --check` | PASS |

The PostgreSQL suite ran against an isolated disposable local database whose
name contains `test`. The temporary server was stopped after the check and its
directory was moved to the local Trash for recoverability.

## Data, deployment and rollback

- Database migration impact: none.
- New production dependency: none.
- Deployment impact: none.
- Funds, signer or Venue mutation: none.
- Aggregate report contains no raw participant, account, Facility, Obligation,
  credential, signer, PII, KYC, transaction-payload or private-policy value.
- Rollback: stop shadow evaluation/report generation and preserve the immutable
  source and shadow artifacts. Active deterministic policy remains unchanged.

Next gate: `PHASE3-CLOSE-001` is ready but not started. `M3-000` remains not
authorized.
