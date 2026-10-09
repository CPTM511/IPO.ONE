# ABUSE-002 — Close policy declaration drift and enforce the CI gate

Date: 2026-10-09. Authority: Michael's explicit “同意，继续” at 05:19 UTC,
authorizing this repair, CI integration, push and a draft PR. Continue the
existing credit-summary branch after 3438059; do not merge or deploy. Apply this
checkout's Product Constitution v1.6, SEC-D08 and tenant/ownership invariants.

## Context and scope

The previously separate `check:abuse-policy` failed because
`pilotActivateSandboxHumanSubject` was classified by the runtime but absent from
the policy schema. It was not included in `pnpm check` or the actual CI gate.
Remote main remains 30c49a81…; the branch was not yet present remotely. The
original user checkout and its 363 dirty entries are untouched.

The operation is a general `mutation`, not a read or funds operation. Preserve
the existing 120/minute/Actor and 600/minute/Tenant quotas, four concurrent
Actor requests, mandatory idempotency and zero automatic retries. Authorization
requires a Human Actor, actor-owned Subject, explicit
`subject.activate.sandbox.self` capability and live Subject/Principal checks.
No default role bundle grants that capability. The command also requires Human
Borrower role, the exact acknowledgement, valid matching Consent and synthetic
identity, no adverse/frozen credit state, the explicit runtime flag and the
existing exact local database allowlist. Those runtime restrictions are unchanged.

The stronger required-key check also exposed twelve existing operations declared
in schema properties but missing from `required`: secured-Pool reads/review,
closed-pilot readiness, case reads/mutations, owned Credit State and secured
facility authorization reads/mutations. Require the complete existing 135-key
set; do not introduce operations, change quotas, broaden grants or merely raise
a count. No policy version, dependency, role grant or database migration changes.

## Implementation and acceptance

- Add the activation operation as `mutation` in both schema properties and
  required keys. Fill the twelve already-declared required-key omissions.
- Retain all original classification, SEC-D08, hard-ceiling and retry checks.
  Additionally require a closed operation object, exact required-key coverage
  without duplicates, and no duplicate runtime classifications.
- Add `check:abuse-policy` to the real `pnpm check` chain and an unconditional
  Quality Gate push/PR step. The explicit step also runs its CLI drift regressions.
- Test the actual CLI against isolated schema fixtures: valid, added, deleted,
  same-count replacement, wrong classification, optional/extra/duplicate required
  keys and opened operation set. Each negative must exit 1 with its diagnostic;
  production schema/runtime files are not changed by tests.
- Preserve runtime authorization boundaries and enforce the operation's actual
  mutation concurrency/rate/retry admission. Existing activation rejection
  regressions stay enabled. Admission alone never authorizes command execution.
- Retain all complete-credit-history, fair-rotation, source-freshness and UI
  snapshot changes from CREDIT-STATE-002.

## Validation, release boundary and rollback

Local verification passed on Node 26.5.0, pnpm 11.11.0 and PostgreSQL 17.10:

| Check | Result |
| --- | --- |
| Focused abuse/authorization/activation | 70 passed, including all 10 CLI gate/wiring regressions |
| Complete `pnpm check` | Passed, exit 0; policy gate actually ran for all 135 operations |
| Included full unit / PostgreSQL | 1519 / 114 passed, no failed/skipped Node tests |
| Included security / transport | 35 / 99 passed |
| Lint / contracts / migrations | Passed; 930 modules, 147 schemas, 89 migration pairs |
| Foundry | 25 passed; 2 external fork tests skipped without a supplied fork URL |
| Browser click path / wallet sign-in / record recovery | 66 / 42 / 15 passed |
| Production dependency audit | 0 reported vulnerabilities, 288 dependency entries |

All previously completed credit regressions remain enabled. The first focused
run correctly exposed the twelve missing required declarations; after their
repair the whole suite passed. A local edit-tool transport failure during the
brief Mac disconnect made no file changes; state was checked before retry. No
uncertain remote write was retried. Pushed PR head SHA, exact GitHub Actions
results, URLs and log hashes are recorded in the task handoff rather than
assumed from these local results.

Production DB checks, deployment and deployed-SHA identity/lending acceptance
were not run. Manual workflow-dispatch-only container/live-ingress smoke is
outside the push/PR gate and has not been invoked by this task.

Security review: no quotas or grants are weakened, unknown operations still fail
closed, idempotency/retry limits stay unchanged, and no real funds, Anvil,
external credentials, chain writes, merge or deployment is authorized. Synthetic
disposable test roles remain local. A draft PR and green CI are not production
identity or lending acceptance.

Rollback of this addition is code/schema/workflow-only; it must not remove the
credit fixes or silently reintroduce omitted policy requirements. The combined
PR retains migration 0088: apply it before new worker/query code and review
backfill, production query costs and byte-budget handling before any separately
approved release. Product release remains BLOCKED — NOT COMPLETE until deployed
SHA acceptance is separately authorized and completed.
