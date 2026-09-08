# WEB-027I — 满足条件后正式发布与复验

Status: IN PROGRESS — staged candidate verified; formal acceptance pending

## Context and scope

Execute the approved WEB-027 v1.0 directive, including the Founder addition requiring every previously usable Human, Agent and other capability to remain usable and be verified by visible browser clicks. This issue covers: 满足条件后正式发布与复验.

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

The hosted bundle retains the exact 75 approved migrations from formal baseline 7ce4b95. Eight separately approved local-only migrations remain excluded from the hosted profile; no production schema mutation is planned. Existing runtime/data remain untouched during candidate work. Revert issue commit or restore prior compatible image without erasing data.

## Completion evidence

Founder approval and delegated local acceptance are recorded in the parent directive and local review. PR #87 is open; the Primary candidate has been staged and returns ready against existing hosted services. Formal domain remains at 7ce4b95 pending required CI and promotion. Preserve rollback deployment dpl_Dj6MLKDAecHecFJmnRzX7sqS21L2. The staged build contains no local enrollment configuration, new credentials or local Passkey dependency. No production database mutation or funds operation occurred.

References: `docs/design/WEB_027_CAPABILITY_AND_ROUTE_MATRIX.md`, `docs/design/WEB_027_LOCAL_REVIEW.md`, `docs/codex/tasks/WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md`. Runtime source and individual evidence are explicit; no formal five-state PASS is implied.
