# M1 Test and Build Report

Historical-snapshot notice: this report preserves the original M1-A command
results. Current M1-A.1 results and retained log paths are recorded in
`docs/verification/M1_A_1_TEST_AND_RUNTIME_REPORT.md`.

Audit ID: `M1-A-20260803T132413Z`

Overall result: `FAIL`

The overall result is `FAIL` because install reproducibility, the aggregate
release check, and byte-reproducible web bundle rebuilding did not pass. Passing
sub-suites are recorded independently and are not used to override that result.

## Summary

| Verification | Result | Evidence |
| --- | --- | --- |
| Toolchain contract | PASS | Node `v26.5.0`, pnpm `11.1.3` |
| Clean/offline install reproducibility | FAIL | exact offline tarball for `@reown/appkit@1.8.19` was absent in the first isolated clean attempt |
| Dependency-store status | PASS | `pnpm store status`: packages in store untouched |
| Installed dependency inventory | FAIL | `pnpm list --depth 0 --json` returned `ERR_SQLITE_ERROR: unable to open database file` |
| Conventional compile build | NOT AVAILABLE | no root `build` script; checked-in source is mostly direct ESM |
| WalletConnect browser bundle build | FAIL | build executes in an isolated linked-dependency snapshot, but rebuilt SHA differs from checked-in bundle |
| Boundary lint | PASS | `pnpm run lint:boundaries` |
| General lint | NOT AVAILABLE | no general `lint` script or tool configuration |
| Typecheck | NOT AVAILABLE | no `typecheck` script; no claim made from JavaScript execution |
| Schemas | PASS | 85 contracts |
| OpenAPI | PASS | 21 legacy/demo paths and operations |
| Tenant protocol | PASS | 76 operations and conformance fixtures |
| Migrations | PASS | 48 ordered up/down pairs |
| Aggregate unit suite | PASS | 695/695 |
| PostgreSQL integration | PASS | 82/82 against fresh PostgreSQL 17 test database |
| Security suite | PASS on host | 33/33; initial sandbox run failed on loopback `EPERM` |
| Transport contracts | PASS on host | 59/59; initial sandbox run failed on loopback `EPERM` |
| Provider integration | PASS on host | 5/5; initial sandbox run failed on loopback `EPERM` |
| Chain conformance | PASS | 6/6 |
| Reorg/indexer | PASS | 5/5 |
| Contract/Testnet live-unit suite | PASS | 21/21; no live transaction or live RPC run |
| Product traceability checker | PASS | 13 destinations, 67 actions, 76 bound operations |
| Web bundle integrity catalog | PASS | 1 external module, 28 authored modules, 848 unique IDs |
| Aggregate `pnpm run check` | FAIL | stopped at local RC HTML hash mismatch |
| Existing local host health | PASS | four loopback Tenant health endpoints returned 200 ready |
| `pnpm run local:status` | FAIL in sandbox | Lima attempted access to protected host state and returned operation not permitted |
| Real-browser public shell | PASS | four role URLs loaded; private journey remained sign-in blocked |
| Authenticated E2E journey | BLOCKED | read-only audit had no authority to consume invitation/session or mutate product state |

## Full failure evidence

### Clean offline install

The first clean isolated workspace attempt used:

```sh
pnpm install --frozen-lockfile --offline --ignore-scripts
```

It failed because the offline store did not contain the exact
`@reown/appkit@1.8.19` tarball. This is the controlling install result. A later
attempt in a snapshot that had been linked to the existing dependency tree
reported `Already up to date`; that was not a fresh clone and is explicitly not
accepted as reproducibility proof.

No lockfile or dependency version was changed.

### Installed dependency inventory

Complete output:

```text
{
  "error": {
    "code": "ERR_SQLITE_ERROR",
    "message": "unable to open database file"
  }
}
```

### Aggregate release check

Complete failing portion:

```text
$ node scripts/check-local-release-candidate-v2.mjs
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: apps/web/src/index.html drifted
+ actual - expected

+ 'dc3ba3e35ab0af9fa83cdf7a36b3e4688e0ea445a4971b632f09d7b8993ae994'
- 'd60f2dc9e0ea3021a72747e93893a4e6a9ed077ce8844e6533ef45d3c402b85a'

    at file:///Users/cptmao/Documents/IPO.ONE/scripts/check-local-release-candidate-v2.mjs:94:10 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'dc3ba3e35ab0af9fa83cdf7a36b3e4688e0ea445a4971b632f09d7b8993ae994',
  expected: 'd60f2dc9e0ea3021a72747e93893a4e6a9ed077ce8844e6533ef45d3c402b85a',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v26.5.0
[ELIFECYCLE] Command failed with exit code 1.
```

All preceding commands in the aggregate chain passed: runtime, boundary lint,
schemas, OpenAPI, migrations, deploy topology, Provider selection,
closed-pilot operations contract, and local-stack static contract. Commands
after `check:local-rc` were run separately; they are not represented as an
aggregate pass.

### WalletConnect build reproducibility

The direct isolated build completed with 1,999,095 bytes and 1,548 inputs, but
the rebuilt browser bundle did not match the checked-in bundle:

| Artifact | SHA-256 |
| --- | --- |
| checked-in/source bundle | `b1b3761ef4ceb33f080bea9b91dec8eca47f1a39e4a88f1736f95f0340c5be1b` |
| isolated rebuilt bundle | `35951a81b538748fe103a0a57bf8efdb26f0306915d709fcf400e3c13cc171c8` |
| checked-in and rebuilt license file | `1cb6f8cfe21f54ab1105105717eaa2ba08343037a2a9c41dfd5ab09e3ce270fc` |

The wrapper attempt without a TTY also emitted:

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

The rebuild occurred only in `/private/tmp`. The checked-in bundle was not
overwritten.

### Local stack status command

Complete output:

```text
time="2026-08-03T21:37:00+08:00" level=warning msg="failed to detect whether running under rosetta, assuming false" error="failed to read sysctl \"sysctl.proc_translated\": operation not permitted"
time="2026-08-03T21:37:00+08:00" level=info msg="Using the existing instance `ipo-one-local`"
time="2026-08-03T21:37:00+08:00" level=info msg="Starting the instance `ipo-one-local` with internal VM driver `vz`"
time="2026-08-03T21:37:00+08:00" level=fatal msg="unlinkat /Users/cptmao/.lima/ipo-one-local/ha.stdout.log: operation not permitted"
LOCAL-STACK-001: limactl exited with status 1
[ELIFECYCLE] Command failed with exit code 1.
```

This command is not accepted as a startup pass. Independent port and HTTP
checks established that four Tenant listeners were already running and healthy.

## Test suite detail

| Command | Result | Count / note |
| --- | --- | --- |
| `pnpm test` | PASS | 695 pass, 0 fail |
| `pnpm run test:postgres` | PASS | 82 pass, 0 fail; fresh `ipo_one_m1a_test` database |
| `pnpm run test:security` | PASS on host | 33 pass, 0 fail |
| `pnpm run test:transport` | PASS on host | 59 pass, 0 fail |
| `pnpm run test:provider` | PASS on host | 5 pass, 0 fail |
| `pnpm run test:chain:conformance` | PASS | 6 pass, 0 fail |
| `pnpm run test:indexer:reorg` | PASS | 5 pass, 0 fail |
| `pnpm run test:chain:live-unit` | PASS | 21 pass, 0 fail |

Initial sandbox executions of the security, transport, and Provider suites had
2, 9, and 3 failures respectively because binding `127.0.0.1` returned `EPERM`.
The unchanged commands passed after rerun in the approved host context. Both
observations are retained; the failures were not product assertions.

## Route and API inventory

### Legacy/demo OpenAPI

`api/openapi/ipo-one.v1.json` contains 21 paths/operations. They include demo
mutations such as `/v1/demo/reset`, `/v1/demo/cycles/*`, direct Agent Lockbox,
credit-line, spend, settlement, revenue-capture, and automatic repayment paths.
The implementation is in `apps/api/src/server.js:551-673`.

This API is a legacy public-sandbox/demo surface and is not the canonical
authenticated Tenant protocol.

### Canonical Tenant transport

The loopback Tenant transport exposes the closed route set at
`apps/tenant-api/src/tenant-http-adapter.js:13-19`:

```text
POST /tenant/v1/operations
GET  /tenant/v1/catalog
GET  /tenant/v1/healthz
GET  /openapi.json
```

Its operation catalog contains 76 typed operations. The production-shaped host
adds `/livez`, `/readyz`, and `/agent-openapi.json` at
`apps/tenant-api/src/production-tenant-host.js:18-25`, but the remote Agent
transport remains disabled.

## Database/schema inventory

- 85 schema contracts passed validation.
- 48 ordered migration up/down pairs passed static checks.
- PostgreSQL 17 fresh migration, down/up checks, RLS, event/outbox/inbox,
  idempotency, restart, reconciliation, Human authentication, shared
  Human/Agent credit, Capital Partner, Trading Capital, Evidence, and operations
  paths passed the 82-test integration suite.
- Table presence is not capability proof. Notably, `lockboxes` exists at
  `db/migrations/0001_mvp_foundation.up.sql:199-211`, while the active
  `LockboxService` remains process-local.
- No dispute/appeal case table was found.

## Mock, stub, demo, and hard-coded inventory

Material non-real paths include:

| Path | Truth mode |
| --- | --- |
| `packages/mvp-flow/src/interactive-demo.js` | scripted demo, fake wallet signature, process-local Maps |
| `packages/mvp-flow/src/vertical-slice.js` | scripted demo vertical slice |
| `modules/lockbox/src/lockbox-service.js` | process-local Map; not durable Tenant truth |
| `apps/api/src/server.js:551-673` | legacy demo API and reset/cycle routes |
| `apps/web/test/support/*browser-host*` | fixture host, not current runtime |
| browser-generated export actions | `SIMULATION_ONLY` in machine traceability |
| `modules/credit-learning/src/credit-learning-service.js:72-99` | legacy 300-850 score and automatic limit recommendations; not canonical policy |
| `modules/hyperliquid-settlement/src/index.js:234-305` | simulation-only fee policy; no economic/funds authority |

The machine traceability checker reports 12 `SIMULATION_ONLY`, 7
`SPECIFIED_DISABLED`, and 7 `ABSENT` actions.

## Feature and release gates

The machine release profile states:

```json
{
  "enabledReleaseProfile": "public_sandbox",
  "closedPilotReleaseEnabled": false,
  "controlledCreditReleaseEnabled": false,
  "realFundsEnabled": false,
  "productionCreditEnabled": false
}
```

Environment-controlled approval names were inventoried without values. Names
that can gate testnet or local evidence actions include
`IPO_ONE_APPROVE_EPHEMERAL_TESTNET_KEY`,
`IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ`,
`IPO_ONE_APPROVE_LOCAL_EVIDENCE_ANCHOR_WRITES`, and
`IPO_ONE_APPROVE_LOCAL_EVIDENCE_ATTESTOR`. M1-A did not enable them.

## Unreachable UI inventory

The real browser exposed navigation for Credit, Obligations, Activity & Proofs,
and, on port 8790, additional Trading Capital, Capital Partners, Repay & Settle,
Credit Passport, Credit Track Record, Agent Console, Wallet & Permissions,
Provider Network, Architecture, Reports & Exports, and Risk & Operations.

All private destinations were unreachable without sign-in. No conclusion about
their current authenticated behavior was inferred from navigation visibility.
