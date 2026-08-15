# TRUST-002 — Latest authorized Evidence visibility

Status: Completed locally — release reseal deferred
Created: 2026-07-31
Baseline commit: 4b0e41dde352283e0d27228d51d1fb99f04c97a8
Depends on: UX-SAFE-002 completed
Phase: Product Optimization Phase 1 / L0 local integration

## Implementation baseline

- Branch: `codex/checkpoint-20260727-pre-strategy`
- HEAD remains `4b0e41dde352283e0d27228d51d1fb99f04c97a8`.
- The worktree contains the locally completed GATE-001, UX-SAFE-001 and
  UX-SAFE-002 slice plus pre-existing user artifact directories. TRUST-002
  will not rewrite, stage or seal those changes.
- The completed slice passed the aggregate, security and Web checks recorded
  in its Issue Evidence. The release-manifest drift remains an intentional
  NO-GO until RELEASE-001 and is not a reason to rewrite the manifest here.
- This Issue is presentation and browser-fixture work over the existing
  owner/controller query. Any need to change cursor, authorization,
  persistence ordering or protocol response semantics stops implementation
  and returns the Issue to review.

## Context

Human and Agent lifecycle commands already create canonical Event and Evidence
records, and the browser performs an owner-authorized Evidence read after key
operations. However, the current first-page presentation can still show the
oldest bounded records and omit the event for the action that just completed.

The 2026-07-31 Human browser verification posted one 60.00 synthetic
repayment. The Obligation and schedule immediately showed the correct new
state, while the owner Evidence table remained at the three pre-repayment
events. The information remained queryable through Load more, but the default
view did not prove the latest action to the user.

This is a visibility and trust gap, not evidence that the repayment command
failed. TRUST-002 must preserve the distinction and must not retry an economic
command merely because its follow-up Evidence read is delayed or incomplete.

## Scope

- Reset the current Evidence projection before switching to another
  Obligation so records from one resource are never shown under another.
- After Offer acceptance, execution and repayment, run one bounded,
  owner-authorized Evidence refresh for the affected Obligation.
- Make the latest authorized records visible first in the Human and Agent
  activity projections.
- Reuse one Evidence state-reset helper instead of duplicating browser state
  cleanup.
- Replace the first-page hard-coded limit with the existing bounded display
  limit where compatible with the current protocol.
- If the service cannot prove that the bounded page includes the latest event,
  display an explicit partial-timeline state and retain Load more.
- Extend the browser hosts and tests so the successful repayment response is
  followed by a queryable repayment Evidence event.

## Non-goals

- No new Event, Evidence, Ledger or reconciliation model.
- No weakening of owner/controller authorization, RLS or redaction.
- No unbounded history query or eager download.
- No automatic retry of Offer acceptance, execution or repayment.
- No protocol cursor change unless the existing contract cannot satisfy the
  acceptance criteria; such a change requires a separately reviewed Issue.
- No chain anchoring claim, chain transaction, signer, deployment or real
  funds.

## Changed files

- `apps/web/src/app.js`
- `apps/web/src/owned-evidence-presentation.js`
- `apps/web/test/owned-evidence-presentation.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`

No domain, protocol, authorization, persistence, migration, dependency or
chain file changed for TRUST-002.

## Acceptance criteria

1. Given Obligation A Evidence is visible, when the workspace switches to
   Obligation B, then no A record is rendered under B at any time.
2. Given an authorized Human repayment succeeds, when its follow-up Evidence
   read completes, then the repayment receipt and Obligation state show the
   exact applied amount, while canonical `repayment_posted` Evidence is visible
   without Load more and matches the same Obligation, server time and positive
   aggregate version. The redacted Evidence summary is not expanded to repeat
   transaction amounts.
3. Given an authorized Agent lifecycle step succeeds, when its Evidence read
   completes, then the latest matching event is visible without an unrelated
   mutation.
4. Given the follow-up read fails or returns a bounded partial page, then the
   completed economic action remains reported as successful and the Evidence
   panel reports delayed or partial verification with a safe retry action.
5. Every read remains owner/controller-scoped, redacted, bounded and
   non-enumerating.
6. The default presentation is latest-first without changing canonical event
   chronology or Evidence hashes.
7. No View, Open, Load or Refresh control invokes a lifecycle mutation.

## Test commands

node --test apps/web/test/static-ui.test.js

node --test apps/web/test/*.test.js

pnpm run test:postgres

pnpm run test:security

pnpm run check:web-bundle

git diff --check

Real browser:

- complete one Human partial repayment and one Agent runtime step;
- verify each newest matching event appears automatically;
- switch between two owned Obligations and verify no cross-resource flash;
- simulate a failed follow-up read and verify the mutation result remains
  successful while Evidence is labelled delayed and safely retryable.

## Security checklist

- [x] Reads remain owner/controller-authorized through the existing Gateway.
- [x] Results remain redacted and bounded.
- [x] A failed read cannot trigger or retry an economic command.
- [x] Canonical order, event hashes and Evidence hashes remain unchanged.
- [x] Cross-Obligation state is cleared before presentation.
- [x] No chain, signer, credential, deployment or real-funds path is added.

## Permission boundary

Owner-authorized Evidence read and presentation only. This issue grants no new
role, capability, resource scope, mutation, export or external access.

## Data and migration impact

Expected to require no migration. If repository ordering or cursor semantics
must change, stop and create a separate reviewed protocol/persistence Issue
before implementation.

## Rollback plan

Revert the presentation refresh, ordering and browser-host assertions together.
No canonical Event or Evidence record may be deleted or rewritten.

## Required Evidence

- Unit and browser tests for latest-event visibility and cross-resource reset.
- Network trace proving follow-up calls are reads only.
- Browser capture after Human repayment and Agent runtime action.
- Failure-path evidence proving a read failure does not retry the economic
  command or misreport its accepted result.

## Implementation result

- A focused 158-line presentation module owns bounded merge, duplicate-drift
  rejection, latest-first display projection, expected-event matching,
  verification-state derivation and anchor filtering. Canonical server order is
  copied for display and never mutated.
- One reset helper clears resource-specific Evidence and anchor projection
  state. A query epoch plus the authenticated-data epoch quarantines stale
  responses after resource, role or session changes.
- Human and Agent Offer acceptance, sandbox execution and repayment each run
  exactly one post-commit Obligation read and one bounded owner/controller
  Evidence read. These follow-up reads never retry the economic operation.
- The expected marker binds event type, exact Obligation, canonical server time
  and a positive aggregate version. A complete page that lacks the marker is
  labelled delayed rather than verified.
- A server cursor produces an explicit partial state and keeps the read-only
  Load more action. A failed read preserves the successful lifecycle result and
  offers only Retry Evidence read.
- The browser cap remains 50. If merged pages exceed it, the newest canonical
  window is retained and anchor state for evicted hashes is removed.
- The new browser module is in the fixed same-origin asset allowlist. Real
  browser testing found the initially missing allowlist entry; transport
  conformance now prevents that 404 regression.

## Acceptance result

| Criterion | Result | Current executable Evidence |
| --- | --- | --- |
| A cannot appear under B | Pass | Delayed A response returned after B rendered; B stayed at zero Evidence rows before and after the response |
| Human repayment is visible | Pass | `$60.00` receipt/state plus newest `Repayment Posted`, exact Obligation and `Obligation v3` |
| Agent latest step is visible | Pass | Accept, execute and repay each projected the matching newest event; final state was `Repayment Posted · v3 · 4 latest verified` |
| Failure and partial states are honest | Pass | 500 path retained repayment success and read-only Retry; cursor path said partial until Load more completed it |
| Reads stay scoped and bounded | Pass | All Evidence requests used the exact resource and `limit: 50`; authorization and PostgreSQL suites passed |
| Display is latest-first only | Pass | Focused unit tests prove canonical chronology is unchanged |
| Read controls do not mutate | Pass | Request traces show only the expected Evidence read on Retry/Load more and no lifecycle mutation |

## Standards exception — Section 7.3 frontend boundary

Exact rule: a touched monolithic file SHOULD have non-positive net growth
unless the active Issue documents why growth is temporarily necessary.

- Measurement: against baseline HEAD
  `4b0e41dde352283e0d27228d51d1fb99f04c97a8`, `apps/web/src/app.js` is
  `+602/-181`, net `+421` lines at completion. This is a conservative aggregate
  measurement because the uncommitted worktree also contains the completed
  GATE-001, UX-SAFE-001 and UX-SAFE-002 slices; no intermediate commit exists
  from which to claim a smaller TRUST-002-only number.
- Why temporary growth is necessary: TRUST-002 must coordinate six existing
  Human/Agent post-commit boundaries, preserve their current receipts, and
  guard resource plus session races. Extracting the entire stateful shell now
  would start WEB-024 out of sequence and combine a broad refactor with the
  trust fix.
- Added risk: more orchestration in `app.js` increases review cost and the
  chance of stale-state regressions.
- Compensating controls: all reusable pure logic is in the 158-line focused
  module; no domain rule, transport, service or dependency was duplicated;
  query/session epochs fail closed; 11 focused unit tests, static contract
  tests, four real-browser scenarios and the complete repository gates cover
  the new behavior.
- Expiry/removal owner: WEB-024 MUST extract the Evidence controller/state
  slice from `app.js` while preserving these tests. This exception permits no
  unrelated monolith growth before WEB-024.
- Review boundary: this is a local presentation-only exception, not an ADR or
  production permission. RELEASE-001 MUST NOT seal the slice if the Human
  reviewer rejects it.

## Issue Evidence

### Automated gates

All commands ran on 2026-07-31 against the current worktree:

- `node --test apps/web/test/owned-evidence-presentation.test.js apps/web/test/static-ui.test.js`
  — 27/27 passed.
- `node --test apps/web/test/*.test.js` — 123/123 passed.
- `node --test apps/tenant-api/test/transport-conformance.test.mjs` — 6/6
  passed after adding the focused module to the fixed asset allowlist.
- `pnpm test` — 695/695 passed.
- `pnpm run test:security` — 33/33 passed with the loopback test server allowed
  by the local sandbox.
- `pnpm run test:postgres` — 82/82 passed against an isolated temporary
  PostgreSQL cluster.
- `pnpm run check:web-bundle` — passed: 1 external module, 28 authored modules
  and 848 unique element IDs.
- `node --check` passed for `app.js`, the focused module and both browser hosts.
- `git diff --check` — passed.

### Real browser — Human complete and partial

- A real Human flow accepted the Offer, executed the sandbox Obligation and
  posted `$60.00`. The UI retained `Partially Repaid`, `$60.00` outstanding and
  `$60.00` total repaid while the newest Evidence row showed
  `Repayment Posted`, the exact Obligation and `Obligation v3`.
- Network requests were one `pilotPostSandboxRepayment` with
  `amountMinor: "6000"`, followed by one `pilotReadOwnObligation` and one
  `pilotReadOwnObligationEvidence` with `limit: 50`.
- A separate partial scenario returned two records plus a cursor. The UI said
  that the absolute latest event was not proven and exposed Load more. The
  read-only continuation then showed `Obligation Sandbox Executed · v2`
  newest-first without a mutation.
- Captures:
  - `output/playwright/trust-002-human-complete/.playwright-cli/page-2026-07-31T15-38-01-586Z.yml`
  - `output/playwright/trust-002-human-complete/.playwright-cli/page-2026-07-31T15-38-31-975Z.png`
  - `output/playwright/trust-002-human-complete/.playwright-cli/page-2026-07-31T15-41-21-495Z.png`
  - `output/playwright/trust-002-human-partial/.playwright-cli/page-2026-07-31T15-46-13-439Z.yml`
  - `output/playwright/trust-002-human-partial/.playwright-cli/page-2026-07-31T15-46-33-926Z.png`
  - `output/playwright/trust-002-human-partial/.playwright-cli/page-2026-07-31T15-47-06-514Z.yml`
  - `output/playwright/trust-002-human-partial/.playwright-cli/page-2026-07-31T15-48-12-285Z.png`

The 640x720 capture is a constrained-density check, not a claim that the full
product has completed exact 200% browser-zoom accessibility acceptance.

### Real browser — failed read and safe Retry

- The only repayment mutation was request 49:
  `pilotPostSandboxRepayment`, `amountMinor: "6000"`, HTTP 200,
  `replayed: false`.
- Request 50 read the Obligation successfully; request 51 was the injected
  Evidence HTTP 500. The UI kept the successful repayment state and said that
  latest Evidence verification was delayed and the economic command was not
  resubmitted.
- Clicking Retry issued only request 52,
  `pilotReadOwnObligationEvidence`, HTTP 200. It did not issue another
  repayment. The newest row then showed `Repayment Posted · Obligation v3`.
- Captures:
  - `output/playwright/trust-002-human-fail/repayment-60-success-evidence-delayed.png`
  - `output/playwright/trust-002-human-fail/retry-success-repayment-posted-v3.png`

### Real browser — cross-resource slow response

- A was `obligation_human_contract_fixture`; B was
  `obligation_human_contract_fixture_secondary`.
- The A Evidence request was delayed 250ms. B completed rendering in 171ms.
  The A response returned three records, but B had zero Evidence rows and no A
  event both before and after that response.
- Request order was exactly `pilotReadOwnObligationEvidence(A, limit=50)` then
  `pilotReadOwnObligation(B)`. No economic or lifecycle mutation occurred.
- Switching back to A and explicitly loading Evidence returned its three
  events newest-first, proving that quarantine did not corrupt later reads.
- Captures:
  - `output/playwright/trust-002-human-slow-switch/02-secondary-mid-before-a-response.png`
  - `output/playwright/trust-002-human-slow-switch/03-secondary-final-after-a-response.png`
  - `output/playwright/trust-002-human-slow-switch/04-primary-a-reloaded-normal.png`

### Real browser — Agent complete

- The browser requested Agent credit, the Human Principal activated the exact
  Mandate, and the Agent created, executed and fully repaid the shared
  Obligation. Final UI state was `$100.00` posted, `$0.00` principal remaining
  and `Repayment Posted · v3 · 4 latest verified`.
- Accept request 37 was followed only by owner reads 38/39; execute request 41
  by reads 42/43; repayment request 45 by reads 46/47. Each Evidence read used
  the exact Agent Obligation and `limit: 50`.
- The shared Obligation screen showed newest-first `Repayment Posted`,
  `Obligation v3`, followed by execution and creation history.
- Captures:
  - `output/playwright/trust-002-agent-complete/.playwright-cli/page-2026-07-31T15-56-49-312Z.yml`
  - `output/playwright/trust-002-agent-complete/.playwright-cli/page-2026-07-31T15-57-10-479Z.yml`
  - `output/playwright/trust-002-agent-complete/.playwright-cli/page-2026-07-31T15-57-35-749Z.png`

### Test-data and process cleanup

- Browser hosts used in-memory synthetic fixtures only. All TRUST-002 browser
  sessions and hosts were closed and their loopback ports stopped listening.
- The PostgreSQL suite used a new isolated `/private/tmp` cluster. The server
  was stopped and the cluster directory was permanently removed after the
  suite passed, so no database test records remain.
- Only the requested test records under `output/playwright/` and this Issue
  Evidence remain. No production or normal local product record was created.

### Non-blocking observation

The intentionally minimal browser hosts do not serve the optional
`/chain/v1/evidence-anchors/config` route, so it returned 404 and the UI
correctly displayed `Anchor service unavailable`. No anchor observation,
transaction or chain claim occurred. Chain anchoring remains separate from
TRUST-002.

## Residual risks

- The browser intentionally retains at most 50 Evidence items. Earlier events
  remain server-queryable and canonical, but are not all retained in browser
  memory after the cap.
- The `app.js` extraction debt is explicitly assigned to WEB-024 under the
  exception above.
- Optional chain-anchor status requires a separately configured service and is
  not evidence of server-timeline failure.
- Exact 200% zoom, full keyboard traversal and product-wide accessibility are
  broader release criteria; the TRUST-002 controls and constrained viewport
  were checked, but this Issue does not claim product-wide completion.

## Readiness decision

TRUST-002 passes its local acceptance criteria. It adds no cursor, repository,
permission, migration, signer, deployment or funds semantics. The current
candidate remains intentionally unsealed and release NO-GO until the Human
accepts this Issue and RELEASE-001 reseals exact committed source. No file was
staged, committed, pushed or deployed as part of TRUST-002.
