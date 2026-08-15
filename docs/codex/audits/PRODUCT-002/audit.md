# PRODUCT-002 audit

Date: 2026-07-23  
Status: `IMPLEMENTED_UNVERIFIED`  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

`PRODUCT-002` is implemented and locally verified, but it has not received the
required independent review. This record does not approve `WALLET-001`, a
private pilot, production credit, real funds, Testnet mutation, mainnet,
deployment, pricing, capital, or release.

## Accepted pre-change drift

The package expected the branch and commit shown above. The branch and commit
matched. Its source-drift command returned nonzero only because the worktree
contained the accepted output of `AUDIT-001`:

- `pnpm-workspace.yaml`;
- `pnpm-lock.yaml`;
- `docs/codex/audits/AUDIT-001/`.

The user explicitly accepted `AUDIT-001` and its `fast-uri@3.1.4` override
before authorizing `PRODUCT-002`. The exact pre-change record is
`docs/codex/audits/PRODUCT-002/source-drift.md`. Those prerequisite changes were
preserved and were not relabelled as `PRODUCT-002`.

## Delivered diff

Added:

- `product/traceability/ipo-one.v9-product-traceability.v1.json`;
- `schemas/v2/v9-product-traceability.schema.json`;
- `scripts/check-product-traceability.mjs`;
- `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md`;
- `docs/codex/audits/PRODUCT-002/source-drift.md`;
- `docs/codex/audits/PRODUCT-002/audit.md`.

Modified:

- `package.json` adds `check:product-traceability` and includes it in
  `pnpm check`;
- `scripts/check-schemas.mjs` makes the new manifest schema a required
  versioned contract.

No dependency, lockfile, workspace override, application handler, catalog,
authorization, admission, persistence, OpenAPI, deployment, or release-policy
change belongs to this task.

## Product traceability result

The manifest covers:

- 13 ordered V9 destinations;
- one cross-cutting fee and revenue area;
- 59 material actions;
- all 38 closed Tenant protocol operations;
- 25 `REAL_LOCAL` actions;
- zero `REAL_TESTNET_READ` actions;
- 14 `SIMULATION_ONLY` actions;
- 9 `SPECIFIED_DISABLED` actions;
- 11 `ABSENT` actions.

Zero `REAL_TESTNET_READ` is intentional. The repository has a read-only chain
observer, but no catalogued, authenticated, V9-integrated product action
exposes live Testnet output. The V9 action therefore remains `ABSENT` rather
than being promoted from infrastructure capability.

Every catalog operation binding records the request/result schema versions,
handler source, AuthZ source, admission source, core and event/outbox
persistence sources, UI/transport adapter, and affected tests. The gate
requires the union of `REAL_LOCAL` Tenant-backed actions to account for the
exact closed catalog, so an existing operation cannot disappear from the
product map silently.

## Catalog, schema, handler, AuthZ, and admission evidence

Catalog:

- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`;
- 38 operations before and after this task;
- maturity remains `local_non_funds`;
- every operation remains `public: false`;
- every operation remains `fundsAuthority: false`.

Schemas:

- shared request contract remains `tenant_protocol_request.v1`;
- operation-specific result schema versions are copied into each binding and
  compared against the runtime catalog;
- the new manifest is validated against
  `v9_product_traceability.v1`.

Handlers:

- `createTenantFoundationHandlers()` is loaded at gate runtime;
- the exact handler set is compared with the 38 manifest bindings;
- handler kind is compared with the catalog;
- the declared handler module must exist and name the bound operation.

AuthZ:

- `TENANT_OPERATION_POLICIES` is loaded at gate runtime;
- allowed Actor types, capability, and resource type are compared with each
  catalog operation;
- no policy was added, removed, or weakened by this task.

Admission:

- `TENANT_ABUSE_OPERATION_POLICIES` is loaded at gate runtime;
- every bound operation must have an admission policy;
- quota class is compared with the catalog;
- no quota, hard ceiling, or admission behavior changed.

Persistence:

- every operation binding names the durable core projection and event/outbox
  repositories;
- the manifest also names the reconciliation service;
- browser-only state is not an allowed authority type.

## Migrations and data

- New migrations: none.
- Modified migrations: none.
- Database writes performed by this task: none.
- Backfill: none.
- Production or private data accessed: none.
- Raw KYC, PII, wallet secrets, credentials, and signing keys added: none.

## Commands and results

Package preparation:

```sh
npm run validate
```

Passed all 11 package checks before implementation.

```sh
npm run check:source-drift -- /Users/cptmao/Documents/IPO.ONE
```

Exited 1 only for the accepted `AUDIT-001` worktree changes documented above.
Branch and commit identity matched.

Exact required runtime:

```sh
env PATH=/private/tmp/ipo-one-audit-001-runtime/node-v24.18.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm run check:runtime
```

Passed with Node `v24.18.0` and pnpm `11.1.3`.

Focused static gates:

```sh
pnpm run check:schemas
pnpm run check:tenant-protocol
pnpm run check:product-traceability
```

Passed:

- 47 schema contracts;
- 38 Tenant operations and all catalog conformance fixtures;
- 13 destinations, 59 actions, and 38 bound operations.

Affected protocol, browser, SDK, MCP, Provider, and handler tests:

```sh
node --test modules/tenant-command-gateway/test/*.test.js \
  apps/tenant-api/test/transport-conformance.test.mjs \
  apps/agent-mcp/test/agent-mcp.test.mjs \
  apps/web/test/*.test.js \
  packages/sdk/test/*.test.js \
  apps/provider-sandbox/test/*.test.mjs \
  modules/provider-sandbox/test/*.test.js
```

The sandboxed run reported 101 passing and 7 failing tests. All seven failures
were `EPERM` while binding `127.0.0.1`; no assertion failed. The exact command
was rerun outside the network sandbox with the same Node 24.18.0 runtime:
108 passed, 0 failed.

Full repository gate:

```sh
pnpm check
```

Passed every static gate and 344 tests with 0 failures.

Security suite:

```sh
pnpm test:security
```

The sandboxed run reported 16 passing and 2 failing top-level tests. Both
failures were `EPERM` while starting local security servers. The exact command
was rerun outside the network sandbox: 24 passed, 0 failed.

Repository hygiene:

```sh
git diff --check
```

Passed.

## Failures encountered and resolved

1. The first traceability-gate run imported `ajv` from the repository root and
   failed with `ERR_MODULE_NOT_FOUND`. The gate now resolves the already
   declared `@ipo-one/api-contract` package dependency with `createRequire`.
   No new dependency or lockfile change was introduced.
2. Ajv strict mode rejected three `allOf` branches whose `minItems` clauses did
   not restate `type: array`. The schema was corrected and then compiled and
   validated successfully.
3. Local-loopback affected and security tests were denied by the network
   sandbox. Exact unsandboxed reruns passed 108/108 and 24/24 respectively.

Open test failures: none.

## Security and product-boundary review

- The reference prototype remains explicitly non-authoritative.
- A `REAL_LOCAL` Tenant action must name at least one closed catalog operation.
- A non-Tenant `REAL_LOCAL` action must name a checked-in contract or reviewed
  authentication source.
- `SIMULATION_ONLY`, `SPECIFIED_DISABLED`, and `ABSENT` actions cannot claim a
  server operation, runtime authority reference, UI adapter, or runtime test.
- All non-real actions must name at least one successor task.
- Browser state and browser-generated downloads cannot be financial truth or
  Evidence.
- The shared Human/Agent obligation kernel, ledger, Evidence, and repayment
  economy remain unchanged.
- Provider execution remains a fixed loopback no-funds sandbox.
- Wallet authentication remains distinct from asset, signing, withdrawal, or
  session-key authority.
- Production fee policy, Provider economics, public capital, real bank rails,
  remote MCP/A2A, arbitrary wallet permissions, and real funds remain disabled
  or absent.
- The only release-enabled launch profile remains `public_sandbox`.
- `closed_non_funds_pilot` and `controlled_agent_credit_pilot` remain locked.

## Rollback

Rollback is code-only and requires no data restoration:

1. remove the PRODUCT-002 manifest, schema, gate, product document, and audit
   directory;
2. remove `check:product-traceability` from `package.json` and from
   `pnpm check`;
3. remove `v9-product-traceability.schema.json` from the required schema set;
4. preserve the separately accepted `AUDIT-001` dependency override and
   evidence;
5. rerun `pnpm check` and `pnpm test:security`.

There is no migration rollback, external message reversal, Provider reversal,
fund movement reversal, deployment rollback, or release-policy rollback.

## Independent review and next task

Use the package `CODEX_REVIEW_PROMPT.md` for an independent review of
`PRODUCT-002`. The reviewer should specifically attempt to:

- find an unclassified material V9 success action;
- find a binding that overstates persistence, UI integration, Testnet
  availability, or release maturity;
- mutate a catalog schema, handler, AuthZ rule, admission quota, file path, or
  launch profile and confirm the gate fails closed;
- confirm the prototype labels are intent evidence only;
- confirm all 38 operations are covered without creating a second Human or
  Agent kernel.

After independent review and explicit human acceptance, the next manifest task
is `WALLET-001`. This audit does not authorize it to start automatically.
