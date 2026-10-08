# RECORD-RECOVERY-001 — visible owner-authorized historical record recovery

Status: RELEASE_REVIEW_IN_PROGRESS — production and real-record verification pending.
Base: 7e667e3d27e4db22c9cd923feb58010b914d1d46.
Founder approval: 2026-10-08 06:11:55 UTC, “同意”, for local code/tests and record recovery fixes only.
Publication approval: 2026-10-08 08:46:59 UTC, “继续往下，把他们都上线”,
authorizes this repair and the separately reviewed default-off Anvil module to
be published after exact CI review. This supersedes the earlier local-only
publication boundary; it grants no economic execution or trust-evidence bypass.

## Context and authority

Workspace resume returns recent references (usually the latest per resource type),
not an exhaustive historical Obligation index. The existing exact owner read is
available, but its input and submit button are hidden. Older authorized records
absent from the reference list therefore have no visible recovery entry.
Apply AGENTS.md, Product Constitution sections 3–4 (L0 local no-funds), guidance
gate and WEB-027 Precision Terminal. Raw IDs belong in progressive disclosure.

## Scope / likely files

- Add an expandable recovery-by-ID entry in the shared Obligations view, for
  authenticated Human/Principal workspaces with the existing owned-read catalog.
- Keep the recent-reference boundary explicit. Reuse pilotReadOwnObligation;
  no new endpoint, identity, authorization, economic command or full-history claim.
- Clear previous selection while a different ID is authorized; uniform errors
  for not found/denied; prevent late session responses from changing new state.
- Preserve a successful exact selection across reload only after current server
  reauthorization; do not revive removed authority or browser-cached values.
- Files: apps/web/src/{index.html,app.js,styles.css}, affected browser/static
  tests and dedicated local recovery fixture/config if needed.

Non-goals: Anvil configuration (separate task), original dirty repo, chain writes,
new loans, Mandates or credentials, marketing, production data changes.

## Acceptance and evidence

1. Visible keyboard-operable advanced entry at desktop/narrow widths, light/dark.
2. Exact historical ID outside resume references can be loaded by authorized read.
3. Bad syntax performs no query; missing/denied IDs reveal identical safe messages
   and no previous position values; transient read failure allows explicit retry.
4. Account/chain change while pending clears private state; a late success or
   error cannot repopulate it or clear a newer request's busy state.
5. Refresh reauthorizes the successful old ID even when absent from resume;
   a now-denied ID does not fall back to displaying stale financial state.
6. Network assertions permit only existing query operations, never economic
   commands. Synthetic fixtures are explicitly labeled, not real-record proof.
7. Preserve current principal assignment boundaries and actionable Offer priority.

Tests: pnpm check:ui-baseline; affected static/servicing/owner-read tests;
dedicated browser recovery tests with query-only fixtures and screenshots.
Local experience must stay available for review. No secrets in logs/artifacts.

## Security / permission / migration / rollback

Current application session + CSRF and Actor ownership remain authoritative.
Browser storage is only an opaque navigation hint, purged on session changes.
No DB/schema/migration, grants, dependencies or server policy changes.
Rollback is removal/reversion of this isolated uncommitted local diff.
Production and real-user acceptance remain BLOCKED — NOT COMPLETE until exact
authorized deployment and real-record verification. Local fixture results do
not satisfy production truth gates. Stage final reviewed main, verify candidate,
then promote with an identified same-project rollback deployment. Keep the
separately prepared Anvil code default-off with no ingestion or anchor queue.

## Completion

Local implementation and checks completed 2026-10-08 UTC:

- Shared My credit / Obligations page has a visible expandable entry and existing
  exact owner query. Recent-reference coverage is explicitly not full history.
- Human and selected-Subject Principal historical locators reauthorize on reload.
  Exact response identity/trusted time are validated before selecting state.
- A different requested ID clears old selected state/Evidence before the query;
  failure cannot reveal another owner or resurrect a former session.
- 15 browser cases passed, 0 skipped/flaky: visible navigation, light/dark,
  desktop/narrow, owner Evidence, malformed/missing/denied IDs, retry, refresh,
  account/chain changes with consumed late success/error, Principal Subject
  isolation, wrong-record and trusted-time drift.
- 55 affected static/portfolio/index/owner-read/workspace tests passed plus
  2 compiled/current UI asset tests; UI baseline, source/boundary lint,
  web-bundle integrity and diff whitespace checks passed.
- Isolated regression has an explicit package script and local CI workflow step;
  no cloud CI run or publication was initiated.
- Review: http://127.0.0.1:42933/ (synthetic read-only fixture; rejects economic
  gateway commands). Use My credit → Find an older record by ID, then
  `obligation_human_contract_fixture_secondary`. Root runtime still requires
  the Mac to remain on; this is a local review URL, not cloud availability.
- Screenshots and browser JSON: output/record-recovery/; served app.js/CSS
  hashes match local files in runtime-assets.json.

CODE / local RUNTIME / local REACHABLE / synthetic VERIFIED have evidence.
DEPLOYED and real existing-user record VERIFIED are unavailable under this
local-only authorization; not claimed complete. No server authorization,
database, Anvil configuration, credentials or browser permission was changed.
