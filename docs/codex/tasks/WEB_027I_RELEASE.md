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

The hosted bundle retains the exact 75 approved migrations from formal baseline 7ce4b95. Eight separately approved local-only migrations remain excluded from the hosted profile; no production schema mutation is planned. Existing runtime/data remain untouched during candidate work. Revert issue commit or restore prior compatible image without erasing data.

## Completion evidence

Founder approval and delegated local acceptance are recorded in the parent directive and local review. PR #87 remains open. The current formal and local API/worker source is `f4b883f2799fa8b22d708cc0dadaa24966c464fe`. Formal deployment `dpl_8a3mueaSiCnnxNThJnVuh1nGi3MZ` serves https://ipo.one, retaining the existing production environment, 75-migration profile and default scheduler secret. No local enrollment configuration or local Passkey dependency was published. Synthetic business writes and one temporary existing-Agent credential lifecycle occurred; no schema, membership, ownership, Mandate, real funds or chain transaction changed.

References: `docs/design/WEB_027_CAPABILITY_AND_ROUTE_MATRIX.md`, `docs/design/WEB_027_LOCAL_REVIEW.md`, `docs/codex/tasks/WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md`. Runtime source and individual evidence are explicit; no formal five-state PASS is implied.


## Formal release checkpoint — 2026-09-08

Both required CI runs for `f4b883f` passed, including the repository gate and visible browser gate. The isolated PostgreSQL suite passed 99/99. The metered-usage handler now performs ledger reads on its existing transaction connection, fixing a production timeout when the pool has only one connection; focused regression verifies that both reads use that transaction. The original fix was recovered from the existing Phase 3 worktree without altering its uncommitted work.

The signed-but-locked Human defect was reproduced on baseline `7ce4b95` and repaired on `7e83916`. The hosted Human lifecycle created and fully repaid $24.50 synthetic credit. Current-source browser recovery uses visible controls and real hosted persistence. An early recovery assertion used Playwright's default five-second visibility timeout even though the page's timeout was thirty seconds; the verification now consistently waits up to thirty seconds and retains the exact visible status, amount and Evidence assertions. The initial failure is retained with the final results.

The existing hosted Agent and active Principal-approved Mandate were located autonomously. Through a bounded two-hour credential on that same identity, real HTTPS/DPoP and MCP calls read the Agent, original application and original Obligation, resumed its previously failed 250-token synthetic consumption, repaid the actual server balance, confirmed duplicate repayment replay, and read Evidence. The original $100 synthetic principal accrued $0.08 under its unchanged terms over the elapsed real days; total repayment is $100.08. The deployed worker materialized one terminal outcome; a fresh Agent process recovered the fully-repaid Obligation and exactly one on-time repayment entry.

The temporary credential was revoked by its exact ID, leaving all other credentials unchanged. A fresh request was rejected with `authentication_credential_rejected` (HTTP 400). Its private key and temporary Cron secret were destroyed, and all three temporary deployments were removed. The final deployment restores the original additional-workload trust and scheduler configuration; project environment values were never modified. This is bounded acceptance evidence, not a claim of a newly installed permanent Agent runner.

Remaining verification: visible clicks in the original controller's Principal workspace on the final hosted deployment. The separate QA Principal has no assigned Agent and must not inherit the original Actor's ownership. Browser tab automation timed out; native browser control encountered the user's active browsing. The user was asked only to make the original Principal wallet login available, not to find configuration files, disclose keys or repeat software QA. No full-site PASS or completed-acceptance merge is justified until that view is actually verified.

Exact source, receipts, cleanup and artifact hashes: `docs/design/web-027/formal-release-evidence.json`. PR: https://github.com/CPTM511/IPO.ONE/pull/87. Rollback deployments `dpl_4uUW4vPiME7BU3dsNZTz37RegP1k` (`7e83916`) and `dpl_Dj6MLKDAecHecFJmnRzX7sqS21L2` (`7ce4b95`) are retained. No database rollback is required; never erase acceptance or repayment history.
