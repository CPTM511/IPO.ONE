# EVENT-RUNTIME-DIAGNOSTIC-001 — bounded Ubuntu confirmation

Date: 2026-10-12. Status: prepared; remote execution is not yet established.

## Context and authority

Michael approved publication of candidate
`5cb16868a05fa23b9bec62975766e18b212492f2` plus temporary diagnostic changes on
`codex/event-runtime-diagnostic-20261012`, and one standard Ubuntu Actions run
with a 15-minute total cap and zero additional spend. The approval requires
verification that publication cannot trigger a deployment or additional cost.
No PR, merge, deployment, account-setting change, new credentials, production
data, chain writes, real funds or new paid resource is authorized.

The baseline is `bbd7ba2276b2ed295a72c2a2f965c191a62de391`. Prior cloud runs
reproduced the event test's 60-second timeout at the baseline and candidate.
The full Quality Gate remains unresolved; this diagnostic is not its replacement.

## Scope, files and non-goals

Reuse `.github/workflows/quality.yml` for one branch-scoped manual job. Ignore
automatic pushes for this branch and skip its broad verification job. Add the
documented exact-branch `git.deploymentEnabled: false` guard to root
`vercel.json`, with no conflicting matching rule. Add an external observer and
bounded driver under `scripts/ci/`. Only these CI/configuration files and this
issue change; application code, test assertions, deadlines and SQL are unchanged.
No dependency or schema migration changes. No artifacts, remote caches, browser
tests, full aggregates, retries, Vercel calls or hosted database access in CI.

## Acceptance and commands

Given verified public repository visibility, standard free GitHub-hosted Ubuntu,
no linked Vercel Git project in the connected account, the first pushed head
already carrying the suppression rules, and an exact verified remote SHA:

- When the sole manual dispatch runs, baseline and candidate each execute once
  against a fresh empty database and once against a fresh database with all
  existing 89 migrations applied, serially on the same runner.
- Then each command retains the original 60,000 ms root deadline, all 27 child
  cases, assertions, resets, migration cycles and transaction behavior.
- Each case records its source provenance before and after execution, synthetic
  starting condition, test exit/result, original root time and observer phases.
  Failures remain failures. The driver completes only the four approved cases
  and exits nonzero if any fail; unsafe provenance/condition/budget errors stop it.
- The entire single job has `timeout-minutes: 15`; the driver has an earlier
  shared deadline that includes setup and all cases, leaving cleanup time.

Commands: `bash -n scripts/ci/run-event-runtime-diagnostic.sh`,
`node --check scripts/ci/observe-event-runtime.mjs`, `git diff --check` and
structural workflow review. Remote: manual dispatch of the existing Quality Gate
at the diagnostic branch; driver invokes
`node --import <external observer> --test --test-reporter=tap modules/persistence/test-postgres/postgres-event-runtime.test.mjs`.
Do not repeat the full local aggregate.

## Security, evidence, rollback and remaining gates

Disposable PostgreSQL uses only synthetic fixtures and the existing pinned image.
The automatic checkout token has `contents: read`, with credentials persistence
disabled. No new secrets, OIDC grants, environment dump, SQL/bind logging or
production/private identity material. Use job logs and summaries only; no paid
artifact or cache storage. The observer performs read-only diagnostic sampling
and preserves existing query arguments, promises, callbacks, errors and order.
Its overhead qualifies timing results; it is not uninstrumented acceptance.

Inspect current connector/remote evidence before publishing. An omitted project
Git field or historical CLI deployment alone does not prove disconnected Git.
Any uncertain deployment, billing, publication or dispatch permission stops the
dependent action. Keep the existing local candidate and private evidence intact.
Record exact published SHA, run ID/URL, all case results and unexpected triggers.
Cleanup removes only run-labelled containers and temporary files. The temporary
branch can subsequently be deleted; published source cannot be fully retracted.
No main-branch rollback or production change is involved.

Full Quality Gate, deployed/reachable/real identity acceptance and full canonical
off-chain backup/restore remain separate gates. Final product verdict remains
`BLOCKED — NOT COMPLETE` until the required evidence exists.

## Preparation evidence and execution blocker

Read-only preflight confirms the repository is public and remote main remains
the baseline SHA. Its workflow directory contains only `quality.yml`; historical
manual run `38093215501` used workflow ID `311290096` and succeeded at that SHA.
The current Vercel Git deployment context explicitly returns no linked Git
projects for the connected team. Repository-ID and URL project filters also
return no matches; latest primary and risk deployments report `source: cli`.
This evidence applies to the connected account, not arbitrary other accounts.
No Vercel settings or login were changed. The documented branch guard is an
additional precaution carried by the first proposed published head.

Shell syntax, observer syntax, embedded Python syntax, workflow structure,
unchanged broad-job behavior, unchanged Vercel configuration apart from the exact
branch rule, observer lineage and diff whitespace checks passed. Parser replay
against preserved synthetic evidence retained three failures and one pass.
No new PostgreSQL case or full aggregate was run during this preparation.

Publication and manual dispatch remain NOT RUN. The cloud CLI's read-only GitHub
Actions API request returns `Forbidden`, including outside the filesystem
sandbox. The connected GitHub tools expose no manual-dispatch operation. This
does not establish an expired credential or an automatic approval rejection.
An authorized existing manual-dispatch transport/operator must be available
before publication; do not substitute an automatic push run or rerun the broad
gate. No new credential, browser login, PR, merge or deployment is authorized.
Exact connector receipts and local commit/diff evidence remain in the external
cloud handoff directory, outside the publicly proposed source tree.
