# CREDIT-STATE-002 — Complete credit summaries and fair refresh

Date: 2026-10-09. Scope: local code and synthetic verification only.
Authority: Michael's explicit “好的，修复” authorization, relayed in this task.
Applicable guidance: this checkout's Product Constitution v1.6, REQ-EVID-004,
REQ-CREDIT-003, tenant/privacy invariants, engineering standard and guidance gate.
This is the active scoped repair; it does not authorize push, PR, merge or deployment.

## Baseline and finding

- Independent checkout: `codex/credit-summary-boundaries-20261009`, based on
  `30c49a81a119255db099cf98e887340ffd820486` in CPTM511/IPO.ONE.
- Original `/Users/cptmao/Documents/IPO.ONE` remains on
  `codex/whitepaper-founding-edition-iii` at
  `9636ec2d8edcf93dff8b5c73da83d5899b80b988`; its 363 dirty/untracked entries
  were not edited. The clean release checkout used as the clone source remains clean.
- GitHub `main` was independently read as `30c49a81…`.
- `ipo.one` alias resolved to deployment `dpl_DVa16tCyavGZhm6jX6DFMkcFRvia`.
  Vercel metadata is a CLI deployment without Git SHA; separately fetched public
  `/livez` and `/readyz` both reported `30c49a81…`, with
  `realFundsEnabled: false`. These are point-in-time version/health observations,
  not identity, loan, production-database or end-user acceptance evidence.
- The old source truncates a subject to its earliest 512 outcomes, while its
  reducer also rejects more than 512. Subject batches repeatedly select the
  earliest subjects. In a separate PostgreSQL database the unchanged baseline
  failed the same regression assertions: `512 !== 513`, and `25 !== 107`
  after five default-size runs.
- Verified calling chain: materializer default 25, local worker default 100,
  hosted cron passes 64 through `runLocalWorkerCycle`. Limits remain 1–100.
  Tenant context, serializable write transactions and forced RLS remain intact.
  This confirms reproducible code defects, not a proven production incident or
  cross-tenant disclosure.

## Change and compatibility

1. Read all finalized outcomes through a transaction-local cursor, 64 rows per
   fetch, with one consistent snapshot even under READ COMMITTED. Late inserts
   appear in a later refresh. Preserve the full `credit_state_projection.v1`
   JSON, hashes, counts, earliest adverse records, latest outcome and complete
   `trackRecord`; no recent-only window or silent prefix is published.
2. Add migration `0088_credit_state_refresh_rotation`: two internal scheduling
   fields on `subjects` and a tenant/refresh index. Order least-recently attempted
   subjects first; use `FOR NO KEY UPDATE ... SKIP LOCKED` to serialize subject
   refreshes without blocking concurrent FK key-share inserts. A fixed backlog
   of eligible/unlocked subjects advances across repeated runs, including when
   early subjects keep receiving records. No new role or permission is added.
3. Bound outcome input at 128 KiB per row and 16 MiB per complete subject history.
   A SQL page therefore returns at most 8 MiB of outcome text. These are input
   byte budgets, not a claim that total process RSS is 16 MiB. Complete v1 output
   still costs O(history size) within that budget. Oversized histories are
   explicitly blocked, never truncated. Record the reason, preserve the prior
   projection, rotate the subject and continue the batch. Batch results expose
   `creditStateBlockedCount` and subject/reason entries.
4. Limit SQL statements to 5 seconds, respecting stricter caller settings. A
   cooperative 30-second run budget is checked between subjects/pages/candidates
   and includes repository retries; an in-flight statement or bounded synchronous
   projection may finish after that check deadline. SQL/time failures roll back
   the transaction. Byte-budget failures are isolated to their subject.
5. Owned-state reads require canonical outcome count equality, no recorded
   resource block, and complete coverage of eligible terminal sources in the
   same database snapshot (see the freshness follow-up below). Incomplete state
   raises `credit_state_projection_incomplete`. On read failure the existing UI
   clears its previous projection/as-of value. A loaded view explicitly shows
   its UTC as-of time and requires a visible reload to check for newer records.
6. Update exact hosted candidate migration count/digest (78 retained migrations)
   and assert the previously deployed 77-migration set remains an exact prefix.
   This prepares a reviewable candidate; it does not approve or apply a hosted
   migration. Existing migration rollback tests retain their original target
   versions with the additional step included.

## Initial revision validation (8e5e1c3)

Runtime: Node v26.5.0, pinned pnpm 11.11.0, PostgreSQL 17.10. Reused installed
locked dependencies with local workspace links; no dependency/lockfile change.
PostgreSQL ran on an isolated loopback-only instance at port 55439 with separate
`*_test` databases. Upstream large-history fixtures follow the existing pool
integration fixture approach: unrelated Consent/Offer FK triggers are bypassed
only during synthetic source seeding. Tested outcome/projection writes use the
real constraints, event repository, tenant roles and forced RLS. The complete
suite separately covers canonical synthetic lifecycle commands.

| Check | Result |
| --- | --- |
| `pnpm test` | 1507 passed, 0 failed/skipped |
| `pnpm test:postgres` after final concurrency/timeout additions | 110 passed, 0 failed/skipped |
| Credit/PostgreSQL regressions within that suite | >512 including early/latest loss, late arrival, full v1 read, deterministic replay, 107 subjects at 25/64/100, hot early subject, missing projection repair, same-subject writers, locked subject, cross-tenant invisibility, concurrent late insert, resource block/no starvation, stricter actual SQL timeout/rollback, migration down/up |
| `pnpm test:security` | 35 passed |
| `pnpm test:transport` | 99 passed |
| Final affected web/credit unit run | 252 passed |
| `pnpm test:browser:click-path` | 66 passed, including stale credit UI removal |
| `pnpm test:browser:record-recovery` | 15 passed |
| `pnpm lint` | UI baseline, 928 source modules and boundaries passed |
| `pnpm audit --prod --json` | 0 reported vulnerabilities, 288 dependency entries |
| Foundry formatting/build/test | 25 passed; 2 explicit Base Sepolia fork tests skipped (no fork URL supplied) |
| Runtime, types, schemas, OpenAPI, migrations, tenant protocol, traceability, topology, local stack, launch policy, closed-pilot operations, pilot Gate 0, toolchain, whitepaper, web bundle | Passed individually |
| Extra approval/operations policy checks | Passed |
| Extra `check:abuse-policy` | FAILED on both original baseline and candidate: schema operation coverage/classification drift for `pilotActivateSandboxHumanSubject` |

All components of the repository's `check` script were run individually; the
aggregate `pnpm check` command was not represented as having run. The additional
abuse-policy failure was not hidden or weakened and remains separate work.
Early preparation attempts failed on local dependency links, missing Foundry
build artifacts, fixture setup or migration expectations. Those were corrected
and the relevant suites rerun; final evidence above supersedes those attempts.

Selected full logs and exact execution status are in the sibling `evidence/`
directory of the task workspace, including `baseline-regression.log`,
`full-unit-pass.log`, `full-postgres-final.log`, `security-verified.log`,
`transport.log`, `browser-credit.log`, `lint-final.log`, `dependency-audit.json`
and `baseline-abuse-policy.log`. The accompanying handoff report records any
additional final browser recovery result and the exact local commit.

## Freshness follow-up

The initial count/error check did not cover committed terminal source records
whose derived outcomes rolled back with a failed materializer transaction. Two
real-PostgreSQL regression assertions failed against that initial revision:
a newly committed 513th write-off was readable as the old 512-record state, and
the old state was readable after an actual SQL timeout rolled back the new
outcome. This is reproduced locally, not evidence of a production incident.

The reader now checks the complete source -> outcome -> projection relationship
in one tenant read snapshot. The worker and reader share one static source
eligibility predicate: executed sandbox obligation.v2 terminal records with
approved, non-production risk_decision.v3 sources. An anti-join rejects a read
if any eligible source lacks its tenant/subject/obligation/decision outcome,
matching the original decision hash and terminal finalization time at the
materializer's existing JavaScript millisecond precision. PostgreSQL source
microseconds are normalized for this comparison, preserving v1 compatibility.
It does not
use a maximum timestamp: a new source with an older date still blocks the old
projection. The source is the canonical obligations/risk_decisions layer, whose
projection writes and domain events commit in the same repository transaction.
A failed materializer therefore cannot erase the committed pending source.

Outcomes are immutable and unique by tenant/obligation. Combined with the
existing exact outcome count check, this covers both a not-yet-derived outcome
and an already-derived outcome omitted by a skipped/stale projection refresh.
No persisted failure marker outside the failed transaction is needed. The
existing v1 terminal-obligation hash is a composite digest, not obligation_hash;
these different hash types must not be compared. Existing outcome JSON, hashes,
projection hashes, schema versions and API envelope fields remain unchanged.

Reader statements use the same transaction-local 5-second cap as the worker,
preserving stricter caller caps. The anti-join and scalar count use existing
subject/status and tenant/outcome identity indexes; no entire source history is
loaded into JavaScript, and no row-count cap silently treats a prefix as complete.
Timeouts fail the request. Actual production query cost remains unmeasured.
No additional migration or dependency is introduced by this follow-up.

The existing `asOf` response field now comes from the database transaction start,
the conservative boundary of the repository's repeatable-read snapshot, rather
than the caller's wall clock. The UI calls the result a verified snapshot,
displays its UTC time, and provides "Reload verified record". It explicitly says
the view does not update automatically. An already-open snapshot can remain
visible while new sources commit; it is never labeled a realtime feed. A failed
reload clears the record and timestamp.

The follow-up regression suite adds pre-materialization and late-source refusal,
actual stricter SQL cancellation, a controlled cooperative-deadline expiry,
actual PostgreSQL 40001 serialization failure, recovery/replay, unaffected other
subjects/tenants, the database as-of boundary and a bounded read timeout. The
original >512, old-loss, rotation, concurrency, byte-budget and migration checks
remain enabled. A PostgreSQL microsecond fixture confirms existing v1 reads
remain compatible; a changed terminal source is refused without mutating its
immutable old outcome or projection. Such source drift needs reconciliation,
not automatic rewriting of old credit history. Browser coverage checks the
timestamp, snapshot label, reload control and failure clearing.

Final follow-up validation on 2026-10-09:

| Check | Result |
| --- | --- |
| Complete `pnpm check` on final code | PASS, exit 0 (`freshness-full-check-final.log`) |
| Included PostgreSQL suite | 114 passed, 0 failed/skipped; all 12 credit-boundary tests passed |
| Included complete unit suite | 1507 passed, 0 failed/skipped |
| Included security / transport | 35 / 99 passed |
| Included lint / contract / migration checks | Passed; 929 source modules, 89 migration pairs |
| Included Foundry | 25 passed, 2 fork-dependent tests skipped; no external fork URL |
| Full browser click-path / record-recovery | 66 / 15 passed |
| Loaded credit snapshot visual QA | 1440px and 390px, dark/light: 4 layout/contrast checks passed; screenshots inspected |
| Production dependency audit | 0 reported vulnerabilities, 288 dependency entries |
| Extra approval / operations policy | Passed |
| Extra abuse policy | FAILED, unchanged pre-existing coverage/classification drift; not modified |

`freshness-before-fix.log` preserves the two expected regression failures on
8e5e1c3. An intermediate hash comparison failed compatibility tests and was
removed; final checks use the existing v1 timestamp semantics. Final exact
commit and log checksums are recorded in the task's `FRESHNESS_VALIDATION.json`.
The local synthetic UI preview is `http://127.0.0.1:4173/` (More tools -> Credit
Track Record -> Load verified record); it is fixture-backed and does not prove
production data freshness. PostgreSQL coverage is reported separately above.

Independent read-only rechecks at about 05:08 UTC still found GitHub main and
the online `/livez`/`/readyz` release ID at `30c49a81…`, with real funds disabled.
The user's original checkout remains on 9636ec2… with its same 363 dirty entries;
the source release checkout remains clean. These point-in-time observations do
not assert online identity or lending acceptance, and this fix is still local.

## Migration, rollback, permissions and remaining gates

- Apply 0088 before running the new worker/query code. For a separately approved
  rollback, restore old worker/query code before removing the scheduling columns.
  Down migration preserves outcome records and public v1 projection JSON; old
  code would reintroduce the original boundary bugs. Exact down/up preservation
  and non-superuser upgrade paths were tested locally.
- Histories over the byte budgets require an explicit future scalable summary/
  paginated-history design. Until then they are visibly blocked; the worker's
  blocked count/reason should be monitored during any later rollout. Actual
  production data volume, query plans, latency and rollout backfill remain
  unmeasured. No production database was read or modified.
- Anvil remains default-off. No real funds, chain write, external credential,
  provider enrollment, outreach, push, PR, merge or deployment was performed.
  Only the test suites' disposable synthetic database roles/identity material
  were created for local verification and cleaned up by their fixtures.
- Local CODE/RUNTIME verification is complete at the stated boundary. The fix
  is not DEPLOYED/REACHABLE/USER-VERIFIED. Product release verdict remains
  `BLOCKED — NOT COMPLETE` until separately authorized release and acceptance.
  Green local checks do not establish online identity or real lending readiness.
