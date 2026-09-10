# WEB-027I — 满足条件后正式发布与复验

Status: BLOCKED — NOT COMPLETE (original Principal visible browser acceptance remains)

## Context and scope

Execute the approved WEB-027 v1.0 directive, including the Founder addition requiring every previously usable Human, Agent and other capability to remain usable and be verified by visible browser clicks. This issue covers: 满足条件后正式发布与复验.

## Non-goals and permission boundary

No new financial products, permanent authority grants, real value, external services or deployment topology. Preserve server truth and all existing allowed entry points. The Founder's instruction to locate and handle the missing connection permits bounded acceptance using the existing Agent, controller, client and exact capability set; it does not permit a new Actor, ownership reassignment, broader Mandate or permanent credential. Temporary acceptance material must be revoked and destroyed afterward.

## Likely files

`apps/web/src/`, targeted `apps/web/test/`, shared asset delivery allowlists if needed, and this issue evidence. Runtime changes only where required for a separately described correct fix.

## Acceptance and evidence

Record changed controls, affected capability IDs, exact source/candidate version, actual clicks, observed results, persistence checks, screenshots, and unresolved items in the WEB-027 matrix. Fixture checks are component evidence only. All applicable original controls must remain reachable. No unverified or failed item counts as passed.

## Test command

Select relevant commands from the approved directive; all web tests and required CI before local handoff, actual durable browser journeys for product evidence. PostgreSQL tests only on isolated test databases. Record executed commands and results here.

## Security checklist

No credentials in output; no client-derived authority; role and tenant isolation; no hidden mutation; server-confirmed results; no local enrollment flags promoted to cloud.

## Migration impact and rollback

The hosted bundle retains the exact 75 approved migrations from formal baseline 7ce4b95 plus the narrowly guarded wallet recovery migration 0084. Local-only 0076–0083 remain excluded. Migration 0084 changes no account data or privileges. To roll back this repair, run its down migration and restore the compatible 75-migration deployment `dpl_8a3mueaSiCnnxNThJnVuh1nGi3MZ`; preserve recovered identities, business history and audit records.

## Completion evidence

### Current repair — legacy UI during startup (2026-09-10)

The Founder can now enter the original Principal workspace and reports old UI appearing during initial entry and the post-login reload. The source HTML initially exposes the legacy signed-out surface; the new presentation classes and layout are only installed after the application module graph loads. Authenticated reloads also initially render the public page before server recovery completes. Static assets use `no-store`; this is a startup sequencing defect, not evidence that a previous deployment was served.

Scope: present a theme-correct, accessible startup surface before application JavaScript; reveal the fully arranged public interface after synchronous initialization, or the authorized workspace after authenticated recovery and destination selection. Provide visible recovery on module failure/timeout and an explanation when JavaScript is disabled. Preserve all existing handlers, routes, server-truth recovery and financial controls. Tests cover held/failed module requests, light/dark first paint, authenticated reload, actual visible navigation and deployed wallet recovery. Reuse the current release issue; no new product, authority, dependency or database migration. Rollback restores the compatible 76-migration deployment `dpl_6C4nXHCG4P5QUhVdJ755xd88ZShK`. Completion requires the actual updated hosted SHA and browser evidence.

The small `app.js` growth is limited to its existing boot lifecycle's ready/failure signals and parallel execution of two independent read-only probes; startup styling and failure/retry handling remain outside the monolith. The action-contract test now reads the existing parser-blocking script that owns the reload button, retaining the requirement that every button has an actual handler.

### Current repair — expired original Principal login (2026-09-09)

The Founder reported a connected OKX wallet remaining at login with `credential is not active`. Read-only hosted inspection found the original Principal's active v2 SIWE credential and its two ordinary role enrollments still carried the obsolete 2026-09-04 pilot expiry; the Actor and Membership remain active. This is an authentication recovery defect, not missing browser access.

Under DEC-PUBLIC-NO-FUNDS-BETA-001, fresh valid SIWE for an ordinary workspace may remove that same historical invitation expiry while preserving the credential ID, Actor, permissions and all Agent/financial records. Rotate the sender binding and version to invalidate old sessions; retain an authentication audit event. Revoked/suspended credentials, inactive Actors/Memberships, independent role expiries, and special roles must still fail closed. No direct production account edit or test signature on behalf of the Founder is authorized or needed.

Implementation includes the wallet BFF/registry, focused browser and durable authentication regression, and migration `0084_verified_ordinary_wallet_expiry_recovery`. The hosted profile becomes exactly the existing 75 migrations plus 0084; local 0076–0083 remain excluded. Migration changes the guarded renewal path only and performs no data update or new privilege grant. Verify invalid signatures and revoked/disabled identities cannot renew, successful renewal keeps original ownership, concurrent login does not duplicate rotation, old sessions fail, and both ordinary workspaces recover after visible sign-in/refresh. Build and CI precede hosted migration/promotion. Rollback restores the original guard and compatible 75-migration release after migration rollback, preserving all user and audit records.

The repair source `d2b62728dc4238a004cac388e3efb0b2e877c37e` is running locally and on https://ipo.one through deployment `dpl_6C4nXHCG4P5QUhVdJ755xd88ZShK`. Both required CI runs passed (34370933134 / 34370928578), including the real browser gate. Focused authentication/profile checks passed 9/9 and the full isolated PostgreSQL suite passed 100/100. Initial migration-test failures were corrected by including 0084 in explicit migration lists and keeping their original rollback targets; behavioral assertions were retained. The two disposable test databases and runners were removed, and all local product runtimes remain available.

Normal hosted migration applied only 0084 on 2026-09-09, bringing the exact selected profile from 75 to 76. Staged readiness passed before promotion; formal readiness identifies the exact repair SHA and unauthenticated Cron remains rejected. Production environment values, scheduler secret and workload trust remain unchanged. No manual account update, local enrollment configuration, Passkey dependency, real funds or chain transaction was published.

On the actual new hosted SHA, visible Human login, modal dismissal, refresh, logout/login, the original fully-repaid $24.50 record and owner Evidence all passed without API mocks. Original Principal/OKX visible acceptance is still pending: native Chrome automation encountered concurrent user interaction before the signing step. The requested handoff is only to leave the original wallet page available and unlock OKX if prompted. Never substitute a QA identity or issue a test signature for the Founder. PR #87 remains open until the required original Principal browser evidence is available.

Founder approval and delegated acceptance remain recorded in the parent directive and local review. The earlier Agent lifecycle and cleanup below are evidence from `f4b883f`, not a claim that a permanent Agent runner was installed or that its complete lifecycle was rerun on this authentication repair.

References: `docs/design/WEB_027_CAPABILITY_AND_ROUTE_MATRIX.md`, `docs/design/WEB_027_LOCAL_REVIEW.md`, `docs/codex/tasks/WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md`. Runtime source and individual evidence are explicit; no formal five-state PASS is implied.


## Formal release checkpoint — 2026-09-08

Both required CI runs for `f4b883f` passed, including the repository gate and visible browser gate. The isolated PostgreSQL suite passed 99/99. The metered-usage handler now performs ledger reads on its existing transaction connection, fixing a production timeout when the pool has only one connection; focused regression verifies that both reads use that transaction. The original fix was recovered from the existing Phase 3 worktree without altering its uncommitted work.

The signed-but-locked Human defect was reproduced on baseline `7ce4b95` and repaired on `7e83916`. The hosted Human lifecycle created and fully repaid $24.50 synthetic credit. Current-source browser recovery uses visible controls and real hosted persistence. An early recovery assertion used Playwright's default five-second visibility timeout even though the page's timeout was thirty seconds; the verification now consistently waits up to thirty seconds and retains the exact visible status, amount and Evidence assertions. The initial failure is retained with the final results.

The existing hosted Agent and active Principal-approved Mandate were located autonomously. Through a bounded two-hour credential on that same identity, real HTTPS/DPoP and MCP calls read the Agent, original application and original Obligation, resumed its previously failed 250-token synthetic consumption, repaid the actual server balance, confirmed duplicate repayment replay, and read Evidence. The original $100 synthetic principal accrued $0.08 under its unchanged terms over the elapsed real days; total repayment is $100.08. The deployed worker materialized one terminal outcome; a fresh Agent process recovered the fully-repaid Obligation and exactly one on-time repayment entry.

The temporary credential was revoked by its exact ID, leaving all other credentials unchanged. A fresh request was rejected with `authentication_credential_rejected` (HTTP 400). Its private key and temporary Cron secret were destroyed, and all three temporary deployments were removed. The final deployment restores the original additional-workload trust and scheduler configuration; project environment values were never modified. This is bounded acceptance evidence, not a claim of a newly installed permanent Agent runner.

Remaining verification: visible clicks in the original controller's Principal workspace on the final hosted deployment. The separate QA Principal has no assigned Agent and must not inherit the original Actor's ownership. Browser tab automation timed out; native browser control encountered the user's active browsing. The user was asked only to make the original Principal wallet login available, not to find configuration files, disclose keys or repeat software QA. No full-site PASS or completed-acceptance merge is justified until that view is actually verified.

Exact source, receipts, cleanup and artifact hashes: `docs/design/web-027/formal-release-evidence.json`. PR: https://github.com/CPTM511/IPO.ONE/pull/87. Rollback deployments `dpl_4uUW4vPiME7BU3dsNZTz37RegP1k` (`7e83916`) and `dpl_Dj6MLKDAecHecFJmnRzX7sqS21L2` (`7ce4b95`) are retained. No database rollback is required; never erase acceptance or repayment history.
