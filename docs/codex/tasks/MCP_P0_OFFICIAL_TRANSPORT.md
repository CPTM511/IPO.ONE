# MCP-P0 — Inventory review candidate; SDK adoption deferred

Status: **BLOCKED — NOT COMPLETE**. This is a narrowed local review candidate,
approved only for an independent branch and draft PR, without merge or deployment.
Baseline main remains
572c22484603b8f19183d4836647654c2e2d4120. Constitution v1.6 and accepted ADRs
018/019/022/025/026/030/031/033/038 govern this local P0 slice.
The original implementation checkpoint and all failed runs remain preserved.

## Current scope

- Exact inventory and documentation drift checks for 66 existing MCP tools:
  Agent 15, Wallet Execution 13, Venue Execution 8, Trading Capital 28,
  Secured Pool 2. Only the existing 15 main Agent tools belong to the main Host.
- Schema references/fingerprints include resolved definitions and sibling
  constraints. Canonical operations, capability/resource/actor/ownership rules,
  idempotency and live checks remain the source, not this generated snapshot.
- Five predeclared framing admission regressions pin the existing line limit,
  newline accounting, coalescing, malformed/oversize recovery and fragmentation.
- A small Foundry test runner invokes the exact locked platform binary and
  propagates its failing exit status. The upstream npm wrapper dropped child
  status, allowing a failed build/test stage to appear successful.

Likely/current files: apps/agent-mcp README and tests, inventory generator and
artifacts, ADR031, package scripts, Foundry runner/test and this task document.
No runtime dependency, production transport, Host, Agent client, Gateway,
authorization, policy, ledger, risk, database migration or domain change remains.

## Deferred implementation and acceptance

The official SDK 2.4.0 experiment failed four of five exact framing admission
tests (the old transport passed five of five). Public SDK options cannot restore
syntax-error replies and per-line overflow recovery. Building a custom parser
and drain/recovery layer would substantially reimplement framing. The original
transport is restored byte-for-byte from main, and SDK declarations/lockfile
changes and SDK-specific durable test rewrites are removed. All experiment code
and evidence remain archived in the private implementation evidence.

The nine recorded advisories remain visible. Existing dependency paths are
separate from SDK-bundled fast-uri 3.1.8, which remains a blocker for any future
SDK adoption until exact safe mitigation or a fixed package is evidenced.
See [dependency review](../../architecture/MCP_P0_DEPENDENCY_REVIEW.md).

Acceptance for this narrower candidate: complete inventory/drift test, unchanged
transport passes the five framing tests, existing transport/security tests pass,
and runner regressions prove nonzero/signal/launch failures cannot pass or run
later stages. These checks do not complete the original SDK migration objective.

## Environment diagnosis and truthful gate

The original aggregate attempt passed 35 security, 112 transport and 116
PostgreSQL tests, then recorded Foundry read-only errors and 19 broader-suite
failures (15 private-directory fixtures, four missing Foundry artifacts).
The original broader suite passed 1513/1532. These are historical results for
the rejected SDK candidate, not proof of the current narrower candidate.

The corrected Foundry runner now exits 1 on the filesystem failure. An ordinary
--offline/--cache-path/--out diagnostic reports missing native solc 0.8.30 at the
SVM lookup boundary. Official compiler index retrieval returned HTTP403 and
stopped. No compiler download, privileged write or permission workaround followed.
/private/tmp tests enforce named signer scopes and owner-only files in product
code, including cross-scope and repository-path denial. They were not changed
into generic temporary-directory tests. The aggregate gate remains blocked.

## Permission, rollback and evidence

No credentials/security setting changes, protected-directory provisioning,
model runtime, new service, spending, provider activation or funds. Publication
is limited to an independent branch and draft PR; merge, auto-merge and deployment
remain outside scope. authorityId/subjectId remain untrusted references checked
against server context. Existing Offer pinning, exact command hashes, Gateway
commit-time authorization and single economic write are unchanged.

Rollback: close the draft PR and abandon the isolated branch. Original checkout
and previous evidence remain intact. No migration or production data changed.
Commands: pnpm run check:agent-mcp-registry; pnpm run test:transport;
pnpm run test:security; focused framing/registry/runner tests; pnpm run lint;
pnpm run test:contracts:foundry; git diff --check.

CODE: narrowed local changes only. RUNTIME: unchanged original transport with
local regression evidence. DEPLOYED: not attempted. REACHABLE: local test pipes
only. VERIFIED: bounded local checks; aggregate and full product acceptance
remain blocked. The narrowed candidate passed 110/110 transport, 35/35 security
and 9/9 focused registry/framing/runner tests. Detailed failed-run evidence and
publication receipts are retained privately. No prior result is overwritten.
