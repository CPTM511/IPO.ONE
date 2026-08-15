# TC-403 audit

Status: `IMPLEMENTED_UNVERIFIED`

Release status: `BLOCKED_INDEPENDENT_REVIEW`

Completed at: `2026-07-26T03:58:49Z`

## Source identity and human gate

- Branch: `codex/commercial-access-release`
- Baseline/source commit:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The IPO.ONE Founder accepted TC-402 and explicitly authorized TC-403.
- The accepted stacked worktree remains intentionally uncommitted. Existing
  changes were preserved; no reset, checkout, commit, push, deployment,
  credential operation, API Wallet operation, live Hyperliquid write,
  mainnet action, payout, withdrawal, transfer, or funds movement was
  performed.
- Approval was applied only to local/offline implementation, fault injection,
  one temporary localhost PostgreSQL cluster, physical database
  dump/restore/restart exercises, and repository security regression.
- Pre-change mapping:
  `docs/codex/audits/TC-403/pre-change-mapping.md`.

## Outcome

TC-403 adds a closed local/Testnet operability assurance boundary over the
accepted TC-301 through TC-402 Trading Capital controls. It covers:

- complete Facility/Ledger/Evidence database backup and restore;
- application and database process restart;
- signer loss, venue outage, adapter staleness, and unknown Exchange outcome;
- source-fixed risk-data, reconciliation, unknown-outcome, signer, venue,
  restore-integrity, and capacity alert candidates;
- Testnet-only warning/critical objectives and reconciliation SLOs;
- bounded assurance input, finding, alert, failure-drill, concurrency, and load
  limits;
- a P0/P1 finding and release gate;
- named interim Testnet accountability;
- current incident, recovery, signer, venue, unknown-outcome, and capacity
  runbooks; and
- an external independent-review handoff and separation-of-duties gate.

The implementation creates no new product operation or economic state. It does
not compose a route, worker, SDK, UI, MCP, signer, Exchange transport,
notification provider, protected scheduler, payout service, or production
runtime.

## Closed operability contract

New schema:

`schemas/v2/hyperliquid-testnet-operability-assurance.schema.json`

Schema version:

`hyperliquid_testnet_operability_assurance.v1`

New internal module:

`modules/hyperliquid-operability`

The evaluator:

- validates a closed source-fixed Testnet policy;
- rejects assurance input over 2 MiB;
- requires all seven failure scenarios;
- requires all seven named alert/runbook bindings;
- makes every failed or missing drill launch-blocking;
- makes any open or accepted-launch-blocker P0/P1 finding launch-blocking;
- recomputes complete restore-manifest hashes before comparing them;
- rejects a self-declared reviewer unless that reviewer is first assigned in
  the policy and differs from the commissioning owner;
- cannot mark `PASSED` independent review from the current policy because its
  reviewer is deliberately `null`; and
- keeps automatic recovery, automatic unfreeze, automatic key operations,
  notification delivery, protected scheduling, Exchange writes, API Wallet
  operations, mainnet, production, and funds authority false.

The checked-in assurance result is:

`docs/codex/audits/TC-403/operability-assurance.json`

Its identity is:

- assurance ID:
  `hyperliquid_testnet_operability_8bad2dce477e84d726b07f20277a841ec3d81f2b6613521b8f8c998b05785124`
- assurance hash:
  `0x8bad2dce477e84d726b07f20277a841ec3d81f2b6613521b8f8c998b05785124`
- policy hash:
  `0x295c4e61e823694e62795af6d977649eceb420a93aec0ff3510c8b69e0bd9da0`
- reviewed artifact-set hash:
  `0x19d3fb26a3343354cf0cd98e3433b30313fd132a715083198dc5361fe936ffd3`
- local implementation:
  `IMPLEMENTED_UNVERIFIED`
- release:
  `BLOCKED_INDEPENDENT_REVIEW`
- launch blocked: `true`
- local self-review open P0: `0`
- local self-review open P1: `0`
- independent review: `NOT_PERFORMED`

Zero self-found P0/P1 is not represented as independent assurance.

## Alert and SLO behavior

Policy:

`modules/hyperliquid-operability/policy/testnet-facility-operability-policy.v1.json`

Interim accountable owner ID:

`ipo_one_founder`

That ID is accountability only. It is not a Credential, RBAC assignment,
signer, pager, database permission, or bypass.

Source-fixed local/Testnet objectives:

| Control | Warning | Critical | Effect |
| --- | ---: | ---: | --- |
| Risk/required venue data age | 30s | 120s | Block new risk |
| Unknown Exchange outcome age | 30s | 120s | Block new risk; never resend |
| Reconciliation age | 30s | 120s | Block new risk |
| Backup maximum age | n/a | 24h | Block restore/release if exceeded |
| Local restore exercise | RPO 0ms | RTO 900000ms | Mismatch or breach blocks release |

Signer, venue, restore-integrity, and capacity signals alert immediately.
Alert age is derived from trusted evaluator time, not caller-supplied age.
Unknown signals fail closed.

The evaluator produces privacy-minimized alert candidates with owner, runbook,
Evidence hash, age, threshold, severity, and fail-closed posture. It never
sends a notification or executes an action. Notification delivery and
protected scheduling remain false because no provider, target, protected job,
or operations credential was approved.

## Failure and recovery drills

All seven source-fixed local drills passed:

| Scenario | Safe state | New risk | Unknown retry | History | External write | Credential operation |
| --- | --- | --- | --- | --- | --- | --- |
| Application process restart | `SETTLEMENT` | blocked | none | preserved | none | none |
| Database process restart | `SETTLEMENT` | blocked | none | preserved | none | none |
| Database backup/restore | `SETTLEMENT` | blocked | none | preserved | none | none |
| Signer loss | `REDUCE_ONLY` | blocked | none | preserved | none | none |
| Venue outage | `REDUCE_ONLY` | blocked | none | preserved | none | none |
| Adapter staleness | `REDUCE_ONLY` | blocked | none | preserved | none | none |
| Unknown Exchange outcome | `REDUCE_ONLY` | blocked | none | preserved | none | none |

Signer loss is a state and control drill only. No real signer existed and no
key was provisioned, rotated, revoked, destroyed, or used. Venue-outage and
unknown-outcome drills used the existing network-disabled TC-301/302/303
simulation boundary and submitted no action.

## Physical PostgreSQL disaster-recovery evidence

A temporary PostgreSQL 17.10 cluster was initialized under:

`/private/tmp/ipo-one-tc403-pg.uozkSy`

The drill:

1. populated the complete TC-402 canonical Testnet settlement fixture;
2. computed source fingerprints;
3. created a custom-format mode-0600 `pg_dump` inside a mode-0700 directory;
4. created a new ephemeral localhost test database;
5. restored the complete database using `pg_restore --no-owner
   --no-privileges --exit-on-error`;
6. recomputed complete fingerprints;
7. compared Facility/close, Ledger, Event/Evidence/snapshot, execution/nonce,
   risk, reconciliation, funding, settlement, and row-count truth;
8. removed the ephemeral restore database and temporary backup directory; and
9. left the source database unchanged.

Latest captured result:

- status: `EXACT_MATCH`
- mismatch fields: `[]`
- duration: `812 ms`
- source manifest:
  `0x8a6e6e51e59c37961f75ea40ebbc09f2eddaa175e3422e3efe8a0eb436ec6b01`
- restored manifest:
  `0x01d80dc38610a53a9be271d6c726d97291e9fae59fa8a50016e625490c3545a9`
- Facilities: `1`
- Ledger transactions: `3`
- Ledger entries: `15`
- Evidence envelopes: `45`
- Testnet settlement records: `1`
- raw rows in assurance output: `false`
- source database mutated: `false`
- external system queried: `false`
- Exchange write submitted: `false`
- credential operation performed: `false`
- production funds moved: `false`

The database process was then stopped with fast shutdown, confirmed
unreachable with `pg_isready`, restarted from the same physical data
directory, and the complete 75-test PostgreSQL suite passed again. The
post-restart suite repeated the exact dump/restore exercise.

An earlier standalone drill attempt failed closed because the full test suite
had already cleaned its TC-402 settlement fixture, leaving settlement count
zero. The script rejected the incomplete source. This was fixed by binding the
drill to the TC-402 durable fixture before later test cleanup; no acceptance
criterion was weakened.

## Capacity and abuse evidence

- Assurance input ceiling: 2 MiB.
- Finding ceiling: 256.
- Alert-route ceiling: 16.
- Failure-drill ceiling: 16.
- Configured concurrency policy ceiling: 8.
- Deterministic boundary-arithmetic self-test: 2,048 cases.
- Completed within bounds: 2,040.
- Oversize cases rejected before evaluation: 8.
- Oversize full assurance payload: rejected.
- Open shapes, duplicate/missing routes, forged restore manifests, excessive
  findings, unknown signals, future observations, and self-review: rejected.

The concurrency value is a policy ceiling, not a claim that this synchronous
local evaluator is a distributed quota service or production load test.

## Runbooks and independent-review handoff

Current Trading Capital Testnet runbook:

`docs/operations/TRADING_CAPITAL_TESTNET_OPERABILITY_RUNBOOK.md`

Independent-review handoff:

`docs/security/TC_403_INDEPENDENT_REVIEW_HANDOFF.md`

The handoff enumerates source scope, 14 adversarial test families, required
finding/retest/report evidence, separation of duties, and the exact acceptance
gate. It does not appoint a reviewer, share credentials, authorize testing of
a hosted target, or constitute the review.

## Contract, catalog, AuthZ, admission, and dependencies

- Trading Capital Tenant operation count: unchanged at `25`.
- Total Tenant operation count: unchanged at `71`.
- OpenAPI paths/operations: unchanged at `21/21`.
- Migration count: unchanged at `38` ordered up/down pairs.
- AuthZ capability or external actor change: none.
- Tenant admission/quota change: none.
- Approval-policy change: none.
- SDK/UI/browser/MCP change: none.
- Runtime dependency change: none.
- New database table or migration: none.
- New deployment, route, worker, or external integration: none.

## Diff summary

Added:

- `modules/hyperliquid-operability/src/index.js`
- `modules/hyperliquid-operability/test/hyperliquid-operability.test.js`
- `modules/hyperliquid-operability/policy/testnet-facility-operability-policy.v1.json`
- `modules/hyperliquid-operability/README.md`
- `schemas/v2/hyperliquid-testnet-operability-assurance.schema.json`
- `scripts/run-tc403-disaster-recovery-drill.mjs`
- `docs/operations/TRADING_CAPITAL_TESTNET_OPERABILITY_RUNBOOK.md`
- `docs/security/TC_403_INDEPENDENT_REVIEW_HANDOFF.md`
- `docs/codex/audits/TC-403/pre-change-mapping.md`
- `docs/codex/audits/TC-403/operability-assurance.json`
- `docs/codex/audits/TC-403/audit.md`

Updated:

- package script and schema registry;
- TC-402 PostgreSQL integration to run the TC-403 physical DR exercise only
  under the exact explicit drill acknowledgement; and
- security source/contract boundary coverage.

No accepted production file was replaced and no external state was changed.

## Test evidence

PASS:

1. TC-403 unit, schema, checked-in assurance, alert, review, failure, restore,
   and capacity suite:

   `npx -y node@24.18.0 --test modules/hyperliquid-operability/test/hyperliquid-operability.test.js`

   - 11/11 passed.

2. PostgreSQL:

   `DATABASE_URL='postgresql://127.0.0.1:55440/ipo_one_tc403_test'
   IPO_ONE_TC403_DRILL_APPROVAL='TC-403'
   PG_DUMP_BIN='/opt/homebrew/bin/pg_dump'
   PG_RESTORE_BIN='/opt/homebrew/bin/pg_restore'
   npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres`

   - 75/75 passed.
   - Five full 75-test runs passed during TC-403 work.
   - Four approved runs exercised physical dump/restore.
   - One complete run occurred after a real PostgreSQL process stop/restart.

3. Security:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`

   - 33/33 passed.

4. Full exact runtime gate:

   `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check`

   - Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary, 73 schemas, 21 OpenAPI operations, 38 migration pairs, deploy,
     launch, approval, abuse, operations, 71-operation Tenant protocol,
     product traceability, web-bundle, and 544/544 repository tests passed.

5. `git diff --check`, JavaScript syntax checks, JSON parsing, checked-in
   assurance hash recomputation, manifest hash recomputation, and schema
   validation passed.

Resolved failures:

- A first standalone DR attempt correctly rejected an incomplete post-suite
  database with zero settlement records.
- The first security static check expected a phrase that a Markdown bullet had
  split; README wording was made exact.
- Final self-review added restore-manifest hash recomputation, assurance byte
  limits, source-fixed reviewer assignment, and explicit
  notification/scheduling false flags.
- One new forged-manifest unit test initially referenced a helper outside its
  scope; the fixture was made explicit and the test passed.

FAIL:

- None remaining in implemented/local scope.

## UNVERIFIED and prohibited

- Independent penetration/security review: `NOT_PERFORMED`.
- Independent reviewer: unassigned.
- External review report/retest hash: absent.
- Real notification delivery, pager target, escalation rota, and protected
  scheduling.
- Production backup service, HA, PITR, regional failover, KMS, IAM, and
  operations credentials.
- Founder-controlled qualified Hyperliquid Testnet master/subaccount and
  complete non-empty authoritative venue history.
- Real Hyperliquid Testnet Exchange E2E, close/cancel/flatten, and finality.
- Real API Wallet, signer, nonce, HSM/KMS/MPC, custody, rotation, revocation,
  emergency retirement, or pruning exercise.
- Live Tenant Gateway/AuthZ/admission composition for Exchange writes.
- Production fee, price, tax, loss-allocation, payout, servicing, accounting,
  legal, custody, and capital policy.
- Deployment, mainnet, production, payout, withdrawal, transfer, real capital,
  or real funds.

No checked-in assurance, PostgreSQL drill, clickable interface, Codex test, or
self-authored audit is Evidence for an item above.

## Rollback

- Remove only the TC-403 module, policy, schema, test, local DR script,
  runbook, review handoff, audit artifacts, package script registration,
  schema registration, PostgreSQL conditional drill hook, and TC-403 security
  assertions.
- No migration, row, product operation, catalog, AuthZ, admission, route, SDK,
  UI, MCP, signer, API Wallet, venue, Ledger, deployment, or funds rollback is
  required because TC-403 adds none.
- If an external review or incident record is later created, retain or
  supersede it append-only rather than deleting history.
- Accepted stacked changes from earlier tasks must remain untouched.

## Temporary PostgreSQL cleanup

The temporary PostgreSQL 17.10 process was stopped. Its exact directory was
moved, not deleted, to:

`/Users/cptmao/.Trash/ipo-one-tc403-pg.uozkSy`

It remains recoverable from the user's Trash. The ephemeral restore databases
and mode-0600 dump files were deleted by the bounded drill after exact
comparison; the source test cluster remains recoverable.

## Artifact identities

- Pre-change mapping:
  `54c883efcbeb3eb790e34ffa19af5ca590decc9912201d2eaa0fdc525719b8b1`
- Checked-in assurance:
  `8ad7df2f00fa67f9f7ba7c84b46fe8a1fafa0e2a1aa881187cece8629a0117de`
- Reviewed artifact manifest:
  `1ed5d781221a60451d89a612e8b47db97fee751be411262a98fe72f3028e70c9`
- Operability module:
  `95f1ecb4b5572f2a80c4d0c895012ace849c223a46e19d604f148c4ebe9ca442`
- Policy:
  `67e0c01abc33aff4ace9169abf9264b10cbbdc03e1912ee8d814cc21384e229e`
- Task tests:
  `b1a2c9f18633caeffaefff7326739dc8a088c15d802aab59fa1b72b9102ff353`
- Module README:
  `3588515b9349bc7f71e66e41c27974e4310b1efc7d406984fd94856b85ba3a50`
- Closed schema:
  `0330298beee8909b6491a20001e7f6d166d846e4a529782be5c166732261c487`
- Disaster-recovery script:
  `48de8890fe4b789ca8cff7be279352168fbb24bec6c68c6f581aac9f2cf34c25`
- Artifact-manifest builder:
  `a6dea55512d8cb045414ef82d8d2d0659b92466c01fdf0668ec943764e7653f0`
- Assurance builder:
  `897cc8c0d789d0f5e56f3139a10d665e5332eda0109000009583cafe800408e0`
- Operations runbook:
  `fe735684de96e327cea85c7954ad82b8114652784753281092fdee198e018d84`
- Independent-review handoff:
  `a39c5158e9d05eda2ce9b64801c73f37fc0778c545a06c084acfa8b940daed94`
- GPT Agent supplementary review:
  `d6d231c88739882e5a97c4985f269b57cb32ffe4a17a85df54c0b1f4c6d7ce6c`

The hashes above were recomputed after the final hardening pass and before the
audit file itself was finalized.

## GPT Agent supplementary review addendum

At the Founder's request, two separate GPT Agent executions performed
supplementary read-only adversarial review. They are not organizationally
independent human/external reviewers and cannot satisfy the formal gate.

The first pass reproduced assurance forgery and source/review identity
weaknesses. A narrower second pass recorded four P1 findings:

- `TC403-GATE-P1-001`: forged restore/capacity/drill assurance;
- `TC403-GATE-P1-002`: review identity and report replay;
- `TC403-GATE-P1-003`: dirty worktree not content-addressed; and
- `TC403-GATE-P1-004`: findings and retests not bound.

All four were remediated and independently retested by the second GPT Agent.
Final supplementary technical counts are:

- open P0: `0`;
- open P1: `0`; and
- open P2: `1`.

The remaining P2,
`TC403-REV-P2-002 runtime_alert_provenance_not_composed`, is explicit in the
checked assurance. The alert evaluator is not runtime-composed and grants no
authority.

The remediated gate now:

- recomputes complete restore manifests and canonical comparison fields;
- enforces backup age, RTO, and zero RPO;
- binds drills to source-fixed runners and the exact artifact set;
- recomputes capacity arithmetic and Evidence hashes;
- content-addresses all 300-plus stacked-worktree files relative to the exact
  baseline;
- pins the source-approved policy hash;
- binds future external review to release, artifact set, policy, findings,
  timestamps, report, and attestation;
- requires retest Evidence for resolved findings; and
- always emits `launchBlocked=true`, which the schema also fixes with
  `const: true`.

Supplementary review:

`docs/codex/audits/TC-403/ai-supplementary-review.md`

The GPT retest digest is:

`e1583b0f7a158c965a9d3aa55fec4887393bea0a365778676e4d51040ff83d9b`

This clears the machine-gate P0/P1 defects. It does not change
`independentReview.status=NOT_PERFORMED`.

Founder decision package:

`docs/codex/audits/TC-403/founder-acceptance-decision.md`

Its SHA-256 is:

`78cdeceb315384a4624b39594cc3c100c626b0ac39fd31d00fbc5a429b670857`

## Next gate

TC-403 stops here with status `IMPLEMENTED_UNVERIFIED` and
`BLOCKED_INDEPENDENT_REVIEW`.

RELEASE-001 was not started. It remains
`BLOCKED_PENDING_TC403_INDEPENDENT_REVIEW_AND_FOUNDER_ACCEPTANCE`.

The next authorized action is to appoint a reviewer separate from
`ipo_one_founder`, update the source-fixed policy with that reviewer, conduct
the bounded independent review, resolve/retest every P0/P1, record the report
hash, and present the exact TC-403 evidence to the Founder. That work still
does not authorize Exchange writes, API Wallets, signers, mainnet, deployment,
payout, or funds.
