# FINAL-CREDIT-LOOP-001 Completion Report

Final verdict: **PASS — DEPLOYED AND USER-VERIFIED**

Target: [https://ipo.one](https://ipo.one)

Final deployed `main` SHA:
`f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194`

Production deployment: `dpl_B7VcAfv5CHrHrermwr8K71aswDNp`

Final verification time: `2026-08-20T16:30:35+08:00`

The accepted profile is the durable closed no-real-funds production sandbox.
No real funds, mainnet, custody, withdrawals, arbitrary spend, production
signer authority, transaction submission or current-user chain write was
enabled.

## Release chain

| Stage | PR head | Merge commit | Result |
|---|---|---|---|
| PR #23 · visible UX reachability | `b536b96ef10cb1d250eda8b355a6c05583139709` | `e8e2082dab6637292b0857c25cffef90c0222142` | Merged in dependency order |
| PR #24 · durable Credit State | `32a69123536cef6156b14c2d4a5e616e514bc2ef` | `b9c9ef92481a8a8c0ea6e499f93eeda47aecb02f` | Merged in dependency order |
| PR #25 · truthful chain capability | `63975dd5135e382a9f773d27194953c3cc0ff6be` | `c2f343bec4de49e2fea2621b0b208f28a670c054` | Merged in dependency order |
| PR #26 · selected Human roles and Golden Agent | `9aff7b9466dc36c3d8057c4568b491aed8560892` | `e5bccd12a2bcfb7e22579f184af5517db3a7e0e7` | Merged after PostgreSQL nonce-race repair |
| PR #27 · Vercel Node 24 compatibility | `691d0eb17633dbf053986d92a6017ca00e58ef04` | `f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194` | Merged after exact hosted-runtime gate |

Final `main` CI run `32330356721` passed the repository quality gate,
PostgreSQL coverage and real browser click-path gate. A first deployment of
`e5bccd1...` correctly failed before build because Vercel did not support the
repository-only Node 26 engine declaration. PR #27 admitted current Vercel
Node 24 while retaining the reviewed Node 26 development/CI lane. The
unaliased stage deployment `dpl_Gom6g7NPDQpwyTh345eEcCVxz9nZ` verified
`nodeVersion: 24.x` and `nodejs24.x` functions before the final `main`
deployment was promoted.

Production `/livez`, `/readyz` and `/.well-known/ipo-one.json` all reported the
exact final SHA. Vercel inspection reported `READY`, production target, and
three Node 24 functions. Vercel `READY` was treated only as deployment
evidence; the Human and Agent journeys below supplied user verification.

## Five-state release gate

| Capability | CODE | RUNTIME | DEPLOYED | REACHABLE | VERIFIED |
|---|---|---|---|---|---|
| Visible Human lifecycle controls | PASS | PASS | PASS | PASS | PASS |
| Equivalent authorized Agent API/MCP lifecycle | PASS | PASS | PASS | PASS | PASS |
| Terminal Credit Outcome | PASS | PASS | PASS | PASS | PASS |
| Durable Credit State and Track Record | PASS | PASS | PASS | PASS | PASS |
| Decision Passport and Evidence lineage | PASS | PASS | PASS | PASS | PASS |
| Truthful chain capability | PASS | PASS | PASS | PASS | PASS as `DISABLED` |
| Logout/login/restart/refresh recovery | PASS | PASS | PASS | PASS | PASS |

## Human acceptance

The Founder OKX wallet is one canonical verified Human identity with durable
`principal_controller` and `human_borrower` enrollments. Each SIWE transaction
and session selected exactly one role. The accepted Human session selected
`human_borrower`; it did not receive a union of Principal and Borrower
capabilities. Role enrollment and selection are durable authentication events,
and Tenant, Subject, ownership, Consent and least-privilege checks remained in
force.

Human Obligation:
`obligation_652c9a56-9d73-41f5-92cc-c2d389a361e6`

| ID | Result | Visible Human evidence |
|---|---|---|
| H-01 | PASS | Opened the final-SHA [production product](https://ipo.one); health and discovery bound the same SHA |
| H-02 | PASS | Selected Human Borrower, selected OKX, approved one-use SIWE, and recovered the secure server session |
| H-03 | PASS | Created the Human Credit Intent through the visible application control |
| H-04 | PASS | Read the deterministic explainable Decision in the visible workflow |
| H-05 | PASS | Reviewed the exact Offer terms and schedule |
| H-06 | PASS | Used the explicit acknowledgement and acceptance control |
| H-07 | PASS | Reached the shared Human-owned Obligation and signed no-funds sandbox execution receipt |
| H-08 | PASS | Posted two visible synthetic repayments of `$55.50`; total repaid `$111.00` |
| H-09 | PASS | Visible Evidence ended with `Credit Outcome Finalized` |
| H-10 | PASS | Loaded durable Credit State: one completed cycle, `On Time Repaid`, total loss `$0.00` |
| H-11 | PASS | Opened More tools → Credit Track Record → Load verified record; DPD `0`, repaid `100%` |
| H-12 | PASS | Opened Credit Passport → Load my latest Decision; server reported `Verified Decision Passport ready` |
| H-13 | PASS | Visible permissions and exact-release discovery reported no transaction submission, arbitrary spend, withdrawal or chain write; current-user chain capability is `DISABLED` |
| H-14 | PASS | Visible logout/login recovery was completed; after final-main deployment a fresh OKX SIWE and page refresh restored four Actor-bound resources from durable server truth |

Final visible Obligation evidence showed one of one owned positions, `Fully
Repaid`, outstanding `$0.00`, past due `$0.00`, two paid installments, DPD `0`,
and thirteen finalized hash-only Events. Digests were explicitly described as
offchain Evidence, not blockchain transactions.

## Agent acceptance

The owner-controlled deterministic workload runner generated a new P-256 DPoP
key pair. Only the public JWK/thumbprint was registered through the reviewed
bootstrap. The private JWK remained in an owner-only temporary directory and
was never committed, logged, printed, uploaded, put in browser storage, placed
in a Vercel environment variable, written to the database, included in
Evidence, or copied into this report.

Safe acceptance identifiers:

- Actor: `actor_golden_flow_20260818`
- Subject: `subject_67818767-615c-450c-b5b7-6733eb1967b6`
- Mandate: `mandate_8748af17-2472-4325-b3c4-0283d1fb9ec4`
- Obligation: `obligation_c4b021dc-47a8-48ba-9f41-a2186ca2abc2`

| ID | Result | Deployed SDK/MCP evidence |
|---|---|---|
| A-01 | PASS | Sender-constrained DPoP authenticated against `https://ipo.one` with a distinct API audience |
| A-02 | PASS | Principal-created Agent Subject and bounded active sandbox Mandate were read through authorized operations |
| A-03 | PASS | Credit Intent ran through the production Agent transport with reviewed failure boundaries |
| A-04 | PASS | Deterministic Decision/Offer and exact binding completed with replay protection |
| A-05 | PASS | Shared `obligation.v2` was created under the Agent Mandate |
| A-06 | PASS | Synthetic repayment completed; duplicate replay was idempotent |
| A-07 | PASS | Durable Credit State returned `on_time_repaid`, one completed cycle, 10,000 bps repayment and max DPD `0` |
| A-08 | PASS | Owned Decision Passport, 21 finalized Evidence items and terminal Credit Outcome lineage were returned |
| A-09 | PASS | A separate-process recovery run against the final main-derived deployment returned canonical fully-repaid state and zero outstanding balances |

The final recovery reported `terminal_state_recovered`, `retrySafe: true`,
`sandboxOnly: true`, `privateKeyIncluded: false`, and
`productionFundsMoved: false`.

After acceptance, the temporary Credential was durably changed to `revoked`
and a `credential_revoked` authentication Event was recorded. A subsequent
real DPoP request failed closed with `authentication_credential_rejected` and
`credential is not active`. The two unaliased one-time revocation deployments
and their temporary alias were removed. The private JWK, account proof key,
one-time revocation token, owner-only runner directory and temporary pulled
environment files were then deleted from exact `/private/tmp` paths. Those
private files are intentionally not recoverable.

## Reliability and security evidence

- Local repository tests: `1,097/1,097` pass after the runtime compatibility repair.
- Final `main` CI: pass on `f8bc87c...`, including PostgreSQL and real browser gates.
- Concurrent Hyperliquid nonce reservation race: repaired with a transaction-scoped advisory lock before durable read/upsert and regression coverage.
- Migration 0063: selected-role enrollment projection, one-use SIWE role binding, forced RLS and least-privilege checks pass.
- Cross-Tenant, wrong-Subject, stale enrollment, revoked credential, replay and unauthorized role paths fail closed.
- Human and Agent terminal outcomes are durable, replay-safe and recover after a new process/session.
- No mock, fixture, local result, historical testnet artifact or build status substituted for deployed acceptance.

## Chain and real-value status

Current-user chain Evidence is **DISABLED**. Network and contract are null for
current-user writes; submission, observation, finality and reconciliation are
all false. No transaction was sent. Historical Base Sepolia Registry artifacts
remain a separate authenticated read-only synthetic proof and are explicitly
not the current Human or Agent repayment record.

Real funds remain disabled. The deployment grants no custody, withdrawal,
token approval, arbitrary transaction, venue write, production signer or
human cash-credit authority.

## Rollback boundary

Active product deployment:
`dpl_B7VcAfv5CHrHrermwr8K71aswDNp` at `f8bc87c...`.

Immediate application rollback candidate:
`dpl_8eG1M2rLmB5qu6kgQXokfd8cFYdi` at `1504bc3...`. The unaliased Node 24 stage
`dpl_Gom6g7NPDQpwyTh345eEcCVxz9nZ` is retained as build/runtime evidence and
was never a production-domain alias.

Migration 0063 now has durable role-enrollment and role-selection Events. Do
not destructively downgrade or delete authentication, Obligation, repayment,
Outcome, Credit State, Evidence, outbox or revocation history. Roll back the
application only to a schema-compatible release, revoke affected sessions,
and repair forward through the reviewed owner path.
