# WEB-027A — 基线、完整能力与可见操作盘点

Status: LOCAL BASELINE RECORDED — full capability acceptance remains open

## Context and scope

Execute the approved WEB-027 v1.0 directive, including the Founder addition requiring every previously usable Human, Agent and other capability to remain usable and be verified by visible browser clicks. This issue covers: 基线、完整能力与可见操作盘点.

## Non-goals and permission boundary

No new financial products, authority grants, signers, real value, external services or deployment topology. No production promotion before local tests and Founder review. Preserve server truth and all existing allowed entry points.

## Likely files

`apps/web/src/`, targeted `apps/web/test/`, shared asset delivery allowlists if needed, and this issue evidence. Runtime changes only where required for a separately described correct fix.

## Acceptance and evidence

Record changed controls, affected capability IDs, exact source/candidate version, actual clicks, observed results, persistence checks, screenshots, and unresolved items in the WEB-027 matrix. Fixture checks are component evidence only. All applicable original controls must remain reachable. No unverified or failed item counts as passed.

## Test command

Select relevant commands from the approved directive; all web tests and required CI before local handoff, actual durable browser journeys for product evidence. PostgreSQL tests only on isolated test databases. Record executed commands and results here.

## Security checklist

No credentials in output; no client-derived authority; role and tenant isolation; no hidden mutation; server-confirmed results; no local enrollment flags promoted to cloud.

## Migration impact and rollback

No new schema migration planned. Preserve previously approved migrations from main. Existing runtime/data remain untouched during candidate work. Revert issue commit or restore prior compatible image without erasing data.

## Completion evidence

Main 7ce4b95 plus the seven WEB-026 commits were integrated as c585b50. The original Founder runtime is untouched. Baseline 330 controls are preserved exactly once. The expanded semantic matrix separates local passes, known denials and unverified roles.

References: `docs/design/WEB_027_CAPABILITY_AND_ROUTE_MATRIX.md`, `docs/design/WEB_027_LOCAL_REVIEW.md`, `docs/codex/tasks/WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md`. Runtime source and individual evidence are explicit; no formal five-state PASS is implied.
