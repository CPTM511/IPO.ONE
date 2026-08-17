# FINAL-CREDIT-LOOP-001 Completion Report

Final verdict: **BLOCKED — NOT COMPLETE**

Base SHA: `024ef08cd63682dc15a950d0b3667966982dec4a`

PR SHAs:

- PR 1 / UX reachability: `6c11a7fd23a815a8ae2a4c9ff1d08670eea1132a`
- PR 2 / durable Credit State: `faf29321b3ee1de722ab41bceac3a8feed89d9ed`
- PR 3 / truthful chain capability: `a1319d30ebc38de94bf7e9546919471587ab10de`

Target URL: `https://ipo.one`

Active deployed SHA: `6c11a7fd23a815a8ae2a4c9ff1d08670eea1132a`

Required final candidate SHA: `a1319d30ebc38de94bf7e9546919471587ab10de`

Test time: `2026-08-17T16:36:59+08:00`

Human test identity/role: Founder wallet / Principal Controller; final target-SHA
wallet signature and role recovery were not completed because the target SHA
could not be promoted.

Agent test identity/Principal: reviewed DPoP-bound no-funds sandbox Agent / its
bound Principal Controller; local and CI protocol parity passed, but target-SHA
remote acceptance could not run because the target SHA could not be promoted.

## Pull requests and deployments

| Stage | Pull request | Exact deployment | Status |
|---|---|---|---|
| PR 1 | `#23` | `dpl_48YWsQfqWBnYgHy5jZ6wjDSVCMVS` | Active at `ipo.one`; `/livez` and `/readyz` return the exact PR 1 SHA |
| PR 2 | `#24` | `dpl_DbrnZMfPG9Ya1KvvAjf6vmukE7fj` | Built and staged; not promoted because migration 0062 is unapplied |
| PR 3 | `#25` | `dpl_9B4meZBVqZ29fXJorsdTQbmsBa2K` | Built and staged; not promoted because migration 0062 is unapplied |

Vercel `READY` for PR 2 and PR 3 records build completion only. It is not used
as application-readiness or user-verification Evidence.

## Five-state matrix

| Capability | CODE | RUNTIME | DEPLOYED | REACHABLE | VERIFIED | Evidence |
|---|---|---|---|---|---|---|
| Visible final-loop navigation and Human actions | PASS | PASS | PASS on PR 1 | PASS on PR 1 | BLOCKED for full authenticated loop | PR 1 exact deployment; real Chromium 4/4 on final branch |
| Shared Human/Agent Obligation lifecycle | PASS | PASS | Existing baseline only | BLOCKED on required final SHA | BLOCKED | PostgreSQL/transport/CI tests; no final deployed authenticated run |
| Terminal Credit Outcome | PASS | PASS | Existing baseline only | BLOCKED on required final SHA | BLOCKED | fresh PostgreSQL suite and exact outcome uniqueness tests |
| Durable Credit State and Track Record | PASS | PASS | NO — staged only | NO | NO | migration 0062, deterministic projection, PR 2 CI and staged deployment |
| Credit Passport and Evidence lineage | PASS | PASS | Existing baseline only | BLOCKED on required final SHA | BLOCKED | Human click path and Agent protocol tests; no final deployed authenticated run |
| Truthful current-user chain capability | PASS | PASS as `DISABLED` | NO — staged only | NO | NO | PR 3 discovery/OpenAPI/UI tests and staged deployment |
| Logout/login/restart recovery | PASS in code/tests | PASS locally | NO on required final SHA | NO | NO | deterministic replay/restart tests; no final deployed recovery run |

## Human journey

| ID | Result | Visible control/action | Persisted evidence |
|---|---|---|---|
| H-01 | PASS on active PR 1 | Open `https://ipo.one` | `/livez`, `/readyz`, deployment capability all bind PR 1 SHA |
| H-02 | BLOCKED | Visible wallet sign-in | Final candidate not promoted; no final target-SHA authenticated session |
| H-03 | BLOCKED | Request Credit is visible and browser-tested | Not exercised on final deployed SHA |
| H-04 | BLOCKED | Decision factors and Evidence UI are composed | Not exercised on final deployed SHA |
| H-05 | BLOCKED | Offer review is composed | Not exercised on final deployed SHA |
| H-06 | BLOCKED | Explicit Accept control is composed | Not exercised on final deployed SHA |
| H-07 | BLOCKED | Obligation workspace and recovery are composed | Not exercised on final deployed SHA |
| H-08 | BLOCKED | Repay & Settle is directly reachable | Not exercised on final deployed SHA |
| H-09 | BLOCKED | Terminal outcome materializer is composed | Not exercised on final deployed SHA |
| H-10 | BLOCKED | Load verified Credit State control is composed | Migration 0062 not applied to target database |
| H-11 | BLOCKED | Credit Track Record is reachable by click | Migration 0062 not applied to target database |
| H-12 | BLOCKED | Credit Passport is reachable by click | Not exercised on final deployed SHA |
| H-13 | BLOCKED | Exact-release `DISABLED` state is visible in PR 3 | PR 3 not promoted; no chain transaction was sent |
| H-14 | BLOCKED | Logout/login and recovery paths exist | No final deployed authenticated recovery run |

## Agent journey

| ID | Result | API/MCP action | Persisted evidence |
|---|---|---|---|
| A-01 | BLOCKED | sender-constrained authentication contract | No final deployed Agent authentication run |
| A-02 | PASS in code/tests | exact Mandate scope/cap/expiry | local and CI protocol suites |
| A-03 | PASS in code/tests | MCP Credit Intent and rejection cases | thirteen-tool parity tests |
| A-04 | PASS in code/tests | exact Offer binding and replay prevention | unit, transport and PostgreSQL tests |
| A-05 | PASS in code/tests | shared Obligation object | Human/Agent parity tests |
| A-06 | PASS in code/tests | idempotent sandbox repayment | PostgreSQL and MCP lifecycle tests |
| A-07 | PASS in code/tests | `ipo_one_read_credit_state` | deterministic outcome/projection tests |
| A-08 | PASS in code/tests | owned Evidence, Credit State and discovery API | Tenant/Principal isolation and OpenAPI tests |
| A-09 | PASS in code/tests | restart/retry canonical reads | replay/restart tests |

Every Agent item remains release-blocking until the exact final deployed SHA is
authenticated and exercised remotely.

## Credit State proof

Before: no durable outcome-derived Subject projection existed.

Repayment/outcome: the terminal repayment materializer creates exactly one
finalized outcome per Obligation and refreshes the Subject projection.

After: migration 0062 stores deterministic metrics, qualitative factors,
chronological Track Record, Evidence lineage and a stable projection hash. It
is explicitly non-authorizing, non-scoring, no-funds and incapable of an
automatic limit change.

Replay/restart result: fresh PostgreSQL verification passed 87/87, including
duplicate materialization, missing-projection repair, restart/replay parity and
cross-Tenant denial. Repository tests passed 1,012/1,012 and transport passed
80/80. This is implementation Evidence, not deployed-user Evidence.

## Chain status

**DISABLED / BLOCKED**

Network/contract: none configured for current-user writes.

Transaction/finality/reconciliation evidence: none. No transaction was sent.
PR 3 publishes the exact-release status through
`/.well-known/ipo-one.json`, the Agent OpenAPI document and the visible Human
receipt. It distinguishes Evidence digest, submission, observation, finality
and reconciliation, and declares historical artifacts non-current.

## Failure and recovery tests

- duplicate outcomes and projection replay: pass;
- delayed/reordered terminal outcomes: deterministic pass;
- cross-Tenant and wrong-Subject reads: denied;
- disabled chain composition: pass;
- unsafe or partial enabled chain composition: fail closed;
- real-browser visible disabled state: pass;
- target deployment migration mismatch: correctly blocks promotion;
- rollback point: active PR 1 deployment remains ready and unchanged.

## Mock/synthetic disclosure

All lifecycle data, repayments and test identities are synthetic or redacted.
Browser fixtures, local tests, CI, historical CHAIN artifacts and Vercel build
status are not counted as deployed-user verification. No real funds, mainnet,
custody, arbitrary spend, withdrawal or signer authority was enabled.

## Remaining blockers

1. The production database is at the checksum-locked PR 1/0061 head. The
   additive migration `0062_durable_credit_state_projection` requires the
   owner-only one-shot database credential. That credential was intentionally
   removed from Vercel runtime and is not available in the current execution
   environment. Runtime Gateway/authentication roles correctly cannot migrate.
2. After an owner-controlled migration applies 0062, PR 3 must be rebuilt or
   revalidated, promoted, and checked through `/livez`, `/readyz`, discovery,
   Human wallet sign-in, the full Human loop, the equivalent Agent loop, logout,
   login and worker/service restart.
3. The final Founder wallet signature is an unavoidable user-presence action;
   it must be completed against the final promoted SHA.

No waiver converts these items to PASS.

## Rollback boundary

The current active rollback-safe application deployment is
`dpl_48YWsQfqWBnYgHy5jZ6wjDSVCMVS` at PR 1 SHA
`6c11a7fd23a815a8ae2a4c9ff1d08670eea1132a`. PR 2 and PR 3 were staged with
`--skip-domain` and never received production-domain traffic. PostgreSQL was
not changed. Rollback must never delete Events, Evidence, repayments, outcomes,
projections, authentication records or outbox state, and Cron compatibility
must be rechecked after any promotion or rollback.
