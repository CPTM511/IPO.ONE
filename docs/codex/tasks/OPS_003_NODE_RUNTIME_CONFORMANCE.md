# OPS-003: Node Runtime Conformance Gate

Status: Implemented locally on 2026-07-16. This task changes only repository,
CI, and developer-runtime validation. It grants no product role, protocol
operation, credential, endpoint, deployment, chain, provider, obligation,
payment, repayment, or funds authority.

## Context

IPO.ONE already declares Node.js 24.18.0 in `.node-version`, the CI setup, and
the production build image. The repository engine range starts at 24.18.0, but
local pnpm execution on Node 26 only emitted a warning and still produced green
evidence. That allowed test evidence to be collected outside the reviewed
release runtime.

The Product Charter traceability therefore still listed runtime alignment as
an open release-risk gap. The quality gate needs to verify the actual process
and package-manager versions, not only inspect version declarations.

## Scope

- Add a closed executable runtime contract for Node 24.18.0 and pnpm 11.1.3.
- Run that contract first in the repository-wide quality gate.
- Publish the same Node pin for `.node-version` and nvm-compatible workflows.
- Extend deployment drift checks across the version, engine, package-manager,
  and CI setup declarations.
- Re-run the complete protocol, security, transport, and PostgreSQL matrix with
  a checksum-verified official Node 24.18.0 runtime.

## Non-Goals

- No production deployment, CI dispatch, package upgrade, dependency install,
  container publication, public exposure, remote transport, or credential.
- No product behavior, API, schema, policy, pricing, authority, chain, funds,
  lending, execution, repayment, or servicing change.
- No promise that an arbitrary developer shell is globally modified; the
  release-evidence quality gate fails closed until its reviewed runtime is
  activated.

## Likely Files

- `.node-version`
- `.nvmrc`
- `package.json`
- `scripts/check-runtime.mjs`
- `scripts/check-deploy.mjs`
- `.github/workflows/quality.yml`
- `README.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] `pnpm run check:runtime` verifies the actual Node and pnpm processes.
- [x] Node, nvm, package engine, package manager, and CI pins
  fail closed when they drift.
- [x] `pnpm run check` starts with the runtime gate and passes on Node 24.18.0.
- [x] Unsupported Node 26 execution is rejected before protocol evidence runs.
- [x] Security, transport, PostgreSQL, schema, and full repository suites pass
  under the reviewed runtime.
- [x] Documentation distinguishes repository conformance from globally changing
  a developer's shell.

## Test Commands

```sh
pnpm run check:runtime
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
git diff --check
```

## Security Checklist

- [x] Unsupported runtimes fail before producing release evidence.
- [x] CI resolves Node from one reviewed version file.
- [x] pnpm and Node declarations are exact and machine-checked.
- [x] No bypass environment variable or warning-only path is introduced.
- [x] No dependency, credential, network, protocol permission, deployment, or
  funds boundary changes.

## Verification Evidence

- The official `node-v24.18.0-darwin-arm64.tar.gz` matched its published
  SHA-256 `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1`.
- `pnpm run check:runtime` passes with actual Node `v24.18.0` and pnpm
  `11.1.3`; the same command under Node `v26.0.0` fails before any protocol
  check runs.
- `pnpm run check`: 218/218; all 34 schemas, 15 migration pairs, 21 OpenAPI
  operations, policy gates, protocol fixtures, unit, contract, SDK, and UI
  checks pass under Node 24.18.0.
- `pnpm run test:security`: 21/21 under Node 24.18.0. The HTTP cases used only
  ephemeral loopback listeners.
- `pnpm run test:transport`: 22/22 under Node 24.18.0, including the named Human
  Pilot Host, named Agent Pilot Host, actual local stdio, SDK, and four-tool
  Offer workflow.
- `pnpm run test:postgres`: 53/53 against a fresh PostgreSQL 17.10 cluster on
  `127.0.0.1:55440`. The destructive-test name guard rejected an unsafe database
  name before the successful isolated run; the server was stopped and its
  temporary data directory removed afterward.
- `git diff --check` passes.
