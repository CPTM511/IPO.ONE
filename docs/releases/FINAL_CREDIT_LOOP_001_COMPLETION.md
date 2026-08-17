# FINAL-CREDIT-LOOP-001 Completion Report

Final verdict: **BLOCKED — NOT COMPLETE**

Base SHA: `024ef08cd63682dc15a950d0b3667966982dec4a`

PR SHAs:

- PR 1 / UX reachability: `6c11a7fd23a815a8ae2a4c9ff1d08670eea1132a`
- PR 2 / durable Credit State: `faf29321b3ee1de722ab41bceac3a8feed89d9ed`
- PR 3 / truthful chain capability: `a1319d30ebc38de94bf7e9546919471587ab10de`

Deployed SHA: `a1319d30ebc38de94bf7e9546919471587ab10de`

Target URL: `https://ipo.one`

Test time: `2026-08-17T23:50:12+08:00`

Human test identity/role: Founder wallet / Principal Controller. Real OKX SIWE,
server workspace recovery and logout passed on the deployed SHA. This role is
not an invited Human Borrower and is correctly denied Human Subject creation.

Agent test identity/Principal: the pre-provisioned DPoP Agent credential and
its bound Principal Controller exist and remain active, but the external
workload private JWK is unavailable. No browser or Vercel runtime copy is
permitted, so deployed sender-constrained Agent authentication could not run.

## Pull requests and deployments

| Stage | Pull request | Exact deployment | Status |
|---|---|---|---|
| PR 1 | `#23` | `dpl_48YWsQfqWBnYgHy5jZ6wjDSVCMVS` | Superseded; compatible only with migration head 0061 |
| PR 2 | `#24` | `dpl_DbrnZMfPG9Ya1KvvAjf6vmukE7fj` | Ready rollback candidate at migration head 0062 |
| PR 3 | `#25` | `dpl_9B4meZBVqZ29fXJorsdTQbmsBa2K` | Promoted and application-ready on migration head 0062 |
| PR 3 restart | `#25` | `dpl_7F6VsiYf21y4FaFiRxsBGHjjkiXE` | Active at `ipo.one`; exact-source cold rebuild/redeploy |

Vercel `READY` is not treated as product proof. The active deployment also
passed `/livez`, `/readyz`, exact-release discovery, real Chrome SIWE/navigation,
database recovery checks and a zero-error recent production-log query.

## Five-state matrix

| Capability | CODE | RUNTIME | DEPLOYED | REACHABLE | VERIFIED | Evidence |
|---|---|---|---|---|---|---|
| Visible final-loop navigation and Human actions | PASS | PASS | PASS | PASS for Principal Controller | BLOCKED for full Borrower loop | Real Chrome: primary navigation, More tools, Human/Agent mode, Obligations and Track Record |
| Shared Human/Agent Obligation lifecycle | PASS | PASS | PASS | BLOCKED for required identities | BLOCKED | No invited Human Borrower; external Agent private JWK unavailable |
| Terminal Credit Outcome | PASS | PASS | PASS | BLOCKED | BLOCKED | Materializer is composed; production has no qualifying terminal Obligation |
| Durable Credit State and Track Record | PASS | PASS | PASS | PASS for visible empty-state and versioned API | BLOCKED for outcome update | Migration 0062, forced RLS, exact runtime grants, visible deployed Track Record |
| Credit Passport and Evidence lineage | PASS | PASS | PASS | BLOCKED for lifecycle owner | BLOCKED | No production Borrower/Agent lifecycle to verify |
| Truthful current-user chain capability | PASS | PASS as `DISABLED` | PASS | PASS through exact-release discovery; Human receipt requires an owned Obligation | BLOCKED for full H-13 | No transaction, observation, finality or reconciliation is claimed |
| Logout/login/restart recovery | PASS | PASS | PASS | PASS | BLOCKED at final re-login signature | Logout and cold redeploy passed; final OKX extension approval remains pending |

## Human journey

| ID | Result | Visible control/action | Persisted evidence |
|---|---|---|---|
| H-01 | PASS | Open `https://ipo.one` | `/livez`, `/readyz` and discovery bind active SHA `a1319d30...` |
| H-02 | PASS | Sign in → select OKX → real SIWE | `session_created`; Principal Controller workspace recovered two Actor-bound references |
| H-03 | BLOCKED | Request Credit is visible; create controls are disabled with role reason | No invited Human Borrower credential exists |
| H-04 | BLOCKED | Decision panel is deployed and reachable from the Borrower flow | H-03 cannot run under Principal Controller authority |
| H-05 | BLOCKED | Offer terms and exact binding UI are deployed | No deployed Borrower Decision |
| H-06 | BLOCKED | Explicit acceptance acknowledgement/control is deployed | No deployed Borrower Offer |
| H-07 | BLOCKED | Human and Agent Obligation workspaces are visible | No accepted deployed Offer |
| H-08 | BLOCKED | Repay & Settle control is deployed for an owned Obligation | No deployed Obligation |
| H-09 | BLOCKED | Terminal outcome materializer is composed | No qualifying repayment event |
| H-10 | BLOCKED | Credit State read is deployed | Production projection table is empty because H-09 did not occur |
| H-11 | PASS for reachability; BLOCKED for update | More tools → Credit Track Record → Load verified record | Visible server-operation status, empty chronology and non-authorizing explanation |
| H-12 | BLOCKED | Credit Passport is deployed for the lifecycle owner | No lifecycle owner/Decision artifact available |
| H-13 | BLOCKED | Exact release reports chain writing `DISABLED` | Discovery is verified; the Human per-Obligation receipt cannot render without H-07 |
| H-14 | BLOCKED | Visible Sign out succeeded; cold redeploy preserved database state | `session_revoked/human_logout` persisted; final post-restart OKX approval remains pending |

## Agent journey

| ID | Result | API/MCP action | Persisted evidence |
|---|---|---|---|
| A-01 | BLOCKED | Sender-constrained DPoP authentication | Active credential exists; external private JWK is unavailable by design |
| A-02 | PASS in code/runtime; remote BLOCKED | Mandate scope/cap/venue/expiry | Five durable draft Mandates survived cold redeploy |
| A-03 | PASS in code/runtime; remote BLOCKED | MCP Credit Intent and rejection cases | Thirteen-tool parity tests; unauthenticated deployed request fails closed |
| A-04 | PASS in code/runtime; remote BLOCKED | Exact Offer binding and replay prevention | Unit, transport and PostgreSQL tests |
| A-05 | PASS in code/runtime; remote BLOCKED | Shared Obligation object | Human/Agent parity tests |
| A-06 | PASS in code/runtime; remote BLOCKED | Idempotent sandbox repayment | PostgreSQL and MCP lifecycle tests |
| A-07 | PASS in code/runtime; remote BLOCKED | `ipo_one_read_credit_state` | Operation is present in deployed tenant OpenAPI; no authenticated runner |
| A-08 | PASS in code/runtime; remote BLOCKED | Owned Passport/Evidence/Credit State | Tenant and Principal isolation tests; deployed API rejects unauthenticated access |
| A-09 | PASS in code/runtime; remote BLOCKED | Restart/retry canonical reads | Cold redeploy preserved Subject, Mandate and authentication rows |

Every remote Agent item remains release-blocking until the reviewed external
runner supplies the matching private workload JWK. That key must not be copied
into the browser, repository, Vercel environment or this report.

## Credit State proof

Before: production was at checksum-locked migration head 0061 and had no
durable Subject-level outcome projection table.

Repayment/outcome: the terminal repayment materializer creates exactly one
finalized outcome per Obligation and refreshes the Subject projection.

After: owner-controlled migration 0062 is applied. `credit_state_projections`
has forced RLS and the Gateway has only `SELECT`, `INSERT`, `UPDATE`, and
`DELETE` on that table. Gateway and authentication roles remain non-owner,
non-superuser, non-`BYPASSRLS`, non-`CREATEDB`, and non-`CREATEROLE`.

Replay/restart result: fresh PostgreSQL verification passed 87/87; repository
tests passed 1,012/1,012; transport passed 80/80. The active cold redeploy is
ready at 62/62 and preserved one Agent Subject, five draft Mandates, sessions
and authentication Events. Production contains zero outcomes and zero Credit
State rows because no authorized deployed lifecycle reached terminal repayment.

## Chain status

**DISABLED / BLOCKED for full Human acceptance**

Network/contract: none configured for current-user writes.

Transaction/finality/reconciliation evidence: none. No transaction was sent.
The active exact-release discovery and Agent OpenAPI report `DISABLED`, null
network/contract, and false submission, observation, finality and reconciliation
configuration. Historical artifacts are explicitly not current-user Evidence.

## Failure and recovery tests

- migration upgrade: 61/62 → 62/62 pass;
- runtime-role RLS posture and least-privilege grants: pass;
- duplicate outcomes and projection replay: automated pass;
- delayed/reordered terminal outcomes: deterministic automated pass;
- cross-Tenant and wrong-Subject reads: denied;
- unauthenticated deployed Credit State request: fail closed with a bounded problem response;
- visible logout: pass with durable `human_logout` invalidation;
- exact-source Vercel cold redeploy: pass; active SHA and database state unchanged;
- recent active-deployment Vercel error log count: zero;
- final wallet re-login: blocked at the protected OKX extension approval;
- deployed Agent authentication: blocked because the external private JWK is unavailable.

## Mock/synthetic disclosure

All lifecycle data, repayments and test identities are synthetic or redacted.
Browser fixtures, local tests, CI, historical CHAIN artifacts and Vercel build
status are not counted as deployed-user verification. No real funds, mainnet,
custody, arbitrary spend, withdrawal or signer authority was enabled.

## Remaining blockers

1. Provision or supply an invited Human Borrower wallet credential, then run
   H-03 through H-13 through visible controls. The Founder Principal Controller
   credential is intentionally not allowed to impersonate a Borrower.
2. Supply the reviewed external Agent workload private JWK to the authorized
   runner, then run A-01 through A-09 against `https://ipo.one`. Do not upload
   that key to the browser, repository or Vercel.
3. Complete the currently open OKX extension confirmation for the final
   post-logout/post-redeploy SIWE recovery check.

No waiver converts these items to PASS.

## Rollback boundary

The active exact-source deployment is
`dpl_7F6VsiYf21y4FaFiRxsBGHjjkiXE`. The immediate same-SHA rollback point is
`dpl_9B4meZBVqZ29fXJorsdTQbmsBa2K`; the migration-0062-compatible prior feature
rollback is `dpl_DbrnZMfPG9Ya1KvvAjf6vmukE7fj`.

Do not promote PR 1 while the database remains at 0062 because its exact
migration assertion expects 0061. Rolling the database back is allowed only
while the projection table is empty and only through the reviewed owner path.
Rollback must never delete Events, Evidence, repayments, outcomes, projections,
authentication records or outbox state.
