# RELEASE-DEPS-20261107 — Production dependency security repair

Status: LOCAL GATES PASSED — HOSTED VERIFICATION PENDING

## Context and authorization

The reviewed PR93/94 source is `572c22484603b8f19183d4836647654c2e2d4120`.
Its protected staged deployment starts successfully, but the refreshed
production audit reports eight advisories across follow-redirects, Zod and
fast-uri. Michael explicitly approved repair of these three production
dependency chains in this chat on 2026-11-07 and retained the reviewed
Primary deployment and verification scope.

## Scope and implementation boundary

Update only the affected dependency resolutions and the required wallet
compatibility treatment. Rebuild the pinned same-origin wallet browser bundle
and update its integrity assertions. Reuse the shared kernel, current
Precision Terminal UI and existing release tooling. The source checkout
retains its governing Constitution and approved requirements. The existing
Binance no-funds scope and current user authorization continue to apply within
their recorded boundaries.

Likely files are `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the wallet vendor
bundle, its existing integrity test, and focused dependency regressions.
Dependency patches are allowed only when needed to preserve an actual caller's
behavior and the security fix. Record the package and compatibility evidence.

## Acceptance

- Given the approved candidate dependency graph, when the production audit
  runs, all eight recorded advisories are resolved without ignored findings
  or a weakened audit gate.
- Given the installed wallet SDK, when valid or invalid wallet messages and
  schemas are processed, preserve accepted inputs and structured rejection.
  Exercise the real installed dependency chain for major-version compatibility.
- Given bounded collection validation, URI normalization or redirected
  credential headers, when regression inputs reach the patched package,
  fail closed according to the upstream security fix.
- Given the browser adapter, when connect, reject, cancel, reconnect or
  account/chain changes occur, retain existing authority and stale-result
  protections. The rebuilt vendor bundle is deterministic and same-origin.
- Given the exact sealed source, all applicable repository, PostgreSQL,
  security, protocol and browser release gates pass.
- Given the new production-stage deployment, startup migration/configuration
  checks and source binding pass. After authorized promotion, verify the
  actual served assets, canonical public origin, safety flags and available
  authenticated Human/Principal/Agent journeys.

## Commands and evidence

Run `pnpm audit --prod --json`, focused tests in
`apps/web/test/wallet-dependency-security-regression.test.js`, required
dependency compatibility regressions, `pnpm build:web:walletconnect`,
`pnpm check`, `pnpm test:browser:click-path`,
`pnpm test:browser:wallet-sign-in` and
`pnpm test:browser:record-recovery`.
Use only a disposable database whose name contains `test`.
Record failures, exact commands, source SHA, bundle/migration digests and
actual deployment results in the release evidence directory.

## Security, migration and rollback

The approved change grants dependency repair and the existing Primary release.
Runtime identity, permissions, risk limits, chain execution, real-funds flags
and schema semantics stay governed by existing policy. No new credentials,
providers or paid resources are part of this issue.

There is no planned schema migration. Confirm the unchanged 78-migration
profile against the existing runtime. Roll back to deployment
`dpl_DZdWYtxvBEtMy6du3yFsMi7abKau` with its original environment and
`bbd7ba2` source binding if the new public release fails. Preserve database
history and immutable Evidence.

## Completion evidence

Production resolutions are `follow-redirects 1.16.2`, `zod 4.6.6` and
`fast-uri 3.1.9`. The existing Axios resolution remains unchanged.
The production audit reports zero advisories. Actual AppKit messages,
ABI tuples/typed data, and Coinbase ESM/CJS record schemas preserve valid
inputs and reject invalid inputs with the resolved Zod version; no SDK patch
was needed. Bounded arrays reject before element parsing, and redirect and
URI regressions cover the actual installed dependency chains.

The deterministic wallet browser bundle is 2,011,840 bytes with SHA256
`3d1e62f3349351209db14b42a6a1bcec93b36e44864715dea69dc75e209b216e`.
Its original license is unchanged. Existing bundle and URI version assertions
bind to the reviewed generated artifact and dependency versions.

`pnpm check` passed using Node 26.5.0, pnpm 11.11.0 and a private disposable
PostgreSQL 17.10 database: 35 security, 103 transport, 116 PostgreSQL and
1,539 main tests passed. Foundry passed 25 tests; two external fork tests
remain explicitly skipped without authorized RPC inputs. Browser gates passed
42 wallet sign-in, 71 click-path and 33 record-recovery tests. Focused dependency
and bundle regressions passed 21 tests. These local hosts are not deployed-user
acceptance evidence.

The release ledger at `output/release-20261107-pr93-pr94/` in the original
workspace records exact source, archive, deployment, promotion and rollback
bindings. Hosted startup and final visible-user acceptance remain separate gates.

