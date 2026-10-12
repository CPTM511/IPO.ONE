# HISTORY-SNAPSHOT-001 — Authorized history and snapshot recovery

Date: 2026-10-12. Base: bbd7ba2276b2ed295a72c2a2f965c191a62de391.
Branch: codex/history-snapshot-recovery-20261012.
Authority: Michael approved bounded cloud-only development and the chain/off-chain
boundary on 2026-10-12, relayed by the parent task. Engineering artifacts must be
in English. No publication, deployment, production identity or credential use is
authorized in this iteration. Historical task permissions are not reused.

## Context and scope

Apply AGENTS.md, Product Constitution v1.6, REQ-CORE-001, REQ-ID-001/002,
REQ-CREDIT-003/007, REQ-EVID-004, the engineering standard, guidance-gate skill,
and the current WEB-027 UI baseline. Recent workspace references and an exact
receipt locator do not provide full history discovery.

- Extend the existing workspace read with optional Subject-scoped Obligation
  history discovery, bounded keyset pagination, lifecycle state and creation
  date filters. Use existing capabilities and active Actor resource bindings;
  Principal reads require the selected controlled Agent's Subject. Existing
  exact reads reauthorize the opened record. No permission policy changes.
- Add visible history browse, filter, next and previous controls in My credit.
  Pages contain discovery metadata, never partial credit aggregates. Each read
  has its own database as-of boundary; changing records requires a new search.
- Clear credit snapshots while updating and on read failure. Distinguish empty,
  awaiting complete refresh, resource blocked and transient failure states.
  Discard late responses after identity, role or Subject changes. Worker attempt
  metadata is opt-in; existing empty-payload credit reads retain their response
  shape for strict existing clients.
- Preserve complete credit hashes, source completeness checks, >512 outcomes,
  deterministic replay and the 16 MiB complete-history budget. Repair the stale
  protocol response schema's 512 ceiling.
- Extend synthetic browser, protocol and real local PostgreSQL tests for
  pagination, identity changes, replay and recovery.

Likely files: workspace-resume handler and a focused history query module;
tenant request/result schemas and clients; focused web history/snapshot modules,
app.js wiring, markup/styles, targeted browser fixtures/tests; existing credit
boundary and pool replay tests. Temporary app.js growth is limited to adapter
wiring and extraction of its existing snapshot renderer/loader into a feature
module. New modules stay below 500 lines.

## Accepted storage and recovery boundary

On-chain pool balances/facts and minimal hash/attestation proofs are distinct from
off-chain canonical original Evidence, accepted Offers, identity/authorization
mappings, risk policy/decision sources and servicing facts. PostgreSQL/Neon remains
canonical off-chain storage. Statistics, history projections and indexes are
rebuildable. Chain event replay can recover chain-derived pool projections;
canonical off-chain recovery requires retained original records/backups and
integrity validation. Hashes cannot restore full records. No storage removal or
new architecture is included.

## Acceptance and verification

1. Human and selected-Agent Principal can discover older authorized records
   without typing IDs. Traverse stable histories beyond one page without gaps or
   duplicates, including tied timestamps. State/date filters are explicit.
2. Missing, revoked, foreign Actor/Tenant and unselected Subject scopes reveal no
   rows. Cursors are scoped to Actor/Tenant/role/Subject/filters/selected Agent;
   cursor scope is validation, never authority. Malformed inputs fail closed.
3. Identity changes clear rows, snapshots and in-flight ownership. Late success,
   error and finally blocks cannot repopulate or alter newer request state.
4. Snapshot copy identifies read as-of and last worker attempt, says the hosted
   materializer runs every 15 minutes, and provides explicit read-only retry.
   Failure/empty states show no zero-loss inference or old projection.
5. Full credit aggregates are independent of history pagination. >512 outcomes
   pass both the existing PostgreSQL regression and protocol response schema.
6. Synthetic projection loss/rebuild preserves deterministic hashes and records;
   chain replay does not claim to recover off-chain records or identity.
7. Relevant unit, protocol, security, PostgreSQL, browser, UI baseline, source and
   boundary lint checks pass; git diff --check and added-line Chinese scan pass.

Commands: pnpm test; pnpm test:postgres; pnpm test:security; pnpm test:transport;
pnpm test:browser:record-recovery; pnpm test:browser:click-path; pnpm lint;
pnpm typecheck; pnpm check:schemas; pnpm check:tenant-protocol;
pnpm check:web-bundle. Record exact executed commands/results in completion.

## Permission, migration, maintenance and rollback

Synthetic cloud loopback PostgreSQL/browser tests only. No Mac, real/private user
data, old Agent credentials, chain writes, real funds, new paid dependencies,
security changes, new chains, Poppy issuer/auth/revoke, payment integrations or
automatic credit limits. No database migration; reuse existing Subject/status and
binding indexes with a 5-second statement cap. Production query cost remains an
acceptance gate. Rollback is reverting this isolated commit; canonical storage,
policy and deployment configuration are unchanged.

Publication and actual deployed Human/Agent identity acceptance remain separate
parent-authorized gates. Local fixture URLs prove local reachability only.
Final product verdict remains BLOCKED — NOT COMPLETE until deployed exact-SHA
and real identity acceptance are available.

## Completion evidence

Local candidate only; product verdict: BLOCKED — NOT COMPLETE. No publication,
deployment, production identity/data access or chain write was performed.

- Human and selected-Agent Principal browse all supported authorized v2
  Obligation records for the current Subject, with 25-row UI pages, 1–50-row
  machine pages, lifecycle and UTC creation-date filters, next/previous controls,
  and current exact-owner reauthorization when opening a row.
- Cursor scope includes Tenant, Actor, role, selected Agent, Subject and filters.
  PostgreSQL microseconds are retained. Each page has its own read boundary;
  refresh the search for changed records. No credit aggregate is calculated from
  these pages. Existing complete materialization, hashes and budgets are intact.
- Snapshot loading, empty, awaiting complete refresh, resource blocked, denied
  and transport failure states clear prior values. Identity/Subject changes
  invalidate request ownership, including late finally blocks. Worker timing is
  described as a 15-minute hosted cadence with possible backlog/failure delays.
- Existing 512 response-schema ceilings were repaired. No risk policy, automatic
  limits, canonical storage, authorization policy, migration or dependency changed.
- At the initial local seal, three feature modules totaled 299 lines and app.js shrank by 82 lines. Review fixes
  include exact static-asset registration, correct controller initialization,
  explicit filter labeling, native dark date controls, SQL timeout before locks,
  opt-in worker metadata and a deterministic startup test clock. Integration
  test deadlines were expanded to 180 seconds for the added cloud regressions;
  the worker's 30-second run budget and 5-second SQL cap were not relaxed.

The following evidence records the initial local candidate and its follow-up checks. It is preserved as historical evidence; final review and aggregate results are recorded in the private handoff package.

| Verification stage | Evidence |
| --- | --- |
| Affected web/gateway/protocol unit suite | 431 passed; later final focused component/protocol/chain suite: 33 passed |
| Credit PostgreSQL boundary suite | 14 passed, including 513 records, complete protocol read, 16 MiB refusal, source drift, timeout, replay and 53-row authorized history traversal |
| Gateway PostgreSQL suite | 44 passed, including Human/Agent/selected Principal, foreign Actor/Tenant and wrong/unselected Agent history refusals |
| Opt-in metadata and original-record projection rebuild | 2 passed in an explicitly selected real PostgreSQL follow-up; other cases were excluded from that invocation |
| Security | 35 passed on retry |
| Transport | 99 passed after correcting the static-module inventory order |
| Recovery browser | 29 passed; final history theme/accessibility follow-up: 4 passed |
| Full click-path browser | Initial final run: 65 passed, 1 failed in existing clock setup; deterministic clock and affected snapshot follow-up passed 3 cases; final metadata follow-up passed the same 3 cases |
| Runtime / types / schema / protocol / OpenAPI / abuse / web bundle | Passed; final schema/protocol/bundle checks include opt-in metadata |
| UI baseline / source lint / boundaries | Passed; final repeat parsed 936 JavaScript modules |
| Whitespace / English added-line scan | Passed; no newly introduced Chinese text |

Browser commands used temporary cloud-only configurations with system Chromium
154, Playwright 1.62.1, 15-second assertions, 60-second cases and 90-second server
startup bounds. Repository browser assertions remain intact. The standard
Playwright browser download was denied by the environment's network policy;
no network or credential boundary was bypassed. Node 26.5.0 and pnpm 11.11.0
were used for sealed verification; PostgreSQL is the pinned 17.10 Docker image.

Initial aggregate `pnpm test` and `pnpm test:postgres` attempts failed/terminated
under overlapping load and missing prerequisites. Unit failures also include
unchanged tests requiring `/private/tmp`, outside this task's writable roots.
The full aggregates and `pnpm check` are not claimed passing. All failed attempts
are preserved separately from accepted logs. The full TC-403 canonical backup
restore drill was not run; host `pg_dump`/`pg_restore` are unavailable. The added
restore test rebuilds a derived projection from retained original off-chain
outcomes/Evidence; it does not prove restoration of a lost canonical database.
Chain replay separately reconstructs only chain-derived pool state.

Review evidence is a separate implementing-agent review pass, not independent
review approval. Independent parent/human review, exact candidate CI, authorized
publication/deployment, production query-cost measurement and fresh explicitly
approved real Human/Agent identity acceptance remain gates. Previously denied
Human production access and revoked/expired Agent credentials were never reused.
Historical quoted Chinese approvals in RECORD_RECOVERY_001_LOCAL_OWNER_READ.md
and CREDIT_STATE_002_SUMMARY_BOUNDARIES.md were read for context and left intact.

Synthetic review experience: http://127.0.0.1:42934/#obligations, in this cloud
workspace only. My credit → Browse your credit records; Credit Track Record →
Load verified record. The fixture rejects economic commands. Local reachability
and synthetic data do not establish deployed or real-user verification.

Next small recommendation: expose read-only worker age/backlog diagnostics
through the existing authorized operations surfaces, then exercise a full
synthetic canonical backup/restore with the required local PostgreSQL tools.
That work should preserve the original-record and chain-projection distinction.
Exact commit, diff, changed-file inventory, command results and log digests are
in the external cloud handoff manifest so this document has no self-referential
commit hash.


## Independent review closure

A separate native reviewer examined the initial local candidate and confirmed
three defects: cached Obligation-read capabilities could outlive current
membership authority, the filter timestamp parser was narrower than the schema,
and a late Human historical detail could restore a previous Subject. The
bounded follow-up rechecks current membership in the existing transaction,
normalizes RFC3339 offsets to six-digit UTC timestamps with an explicit
microsecond precision contract, and binds historical detail responses to the
current identity, Subject, request owner and monotonic navigation generation.
A Subject round trip invalidates the pending read even within one session. No authorization policy or
credential-binding exception changes.

Regression coverage includes current selected Human enrollment and Agent
membership capability removal with cached contexts, timestamp offsets and
fraction precision, and late Human detail successes and errors after a
same-session Subject change. Final aggregate verification is performed serially;
prior failed attempts remain preserved and are never promoted to passing results
by combining focused reruns. Exact candidate hashes, independent review closure,
check outcomes and logs are delivered together in the private handoff package.
