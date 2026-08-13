# M1-B P0-3 — Canonical Product Runtime

Status: Complete in working tree; pending bounded commit

## Context

The M1-B release must have one canonical product truth: Human, Agent, Capital
Partner, and Risk/Admin transports route through the Tenant Protocol and one
shared obligation kernel, with PostgreSQL as canonical state. The root
development command and root Vercel configuration currently select the older
process-local demonstration server, while the durable M1-B runtime already
exists under the private-pilot and Vercel sandbox compositions.

## Scope

- Bind the root development command to the durable local PostgreSQL stack.
- Bind the root Vercel configuration to the durable M1-B serverless runtime.
- Publish one machine-checkable runtime map for local and hosted entry points.
- Mark the older in-memory API surface as a non-authoritative, non-release
  demonstration while preserving it for historical and compatibility use.
- Extend the release topology gate so drift fails closed.

## Non-goals

- No new product capability, A2A transport, subscription system, wallet model,
  MCP framework, chain, venue, scoring model, or Human CreditLine.
- No real funds, mainnet, signer, withdrawal, venue-write, or fee authority.
- No broad migration or service-boundary refactor.
- No cloud deployment or custom-domain mutation in this issue.

## Likely files

- `package.json`
- `vercel.json`
- `deploy/canonical-product-runtime.v1.json`
- `apps/api/src/runtime-config.js`
- `apps/api/src/server.js`
- `apps/private-pilot/test/canonical-product-runtime.test.js`
- `scripts/check-vercel-sandbox-deployment.mjs`
- `.github/workflows/quality.yml`
- `docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`
- `deploy/vercel/README.md`

## Acceptance criteria

1. `pnpm dev` selects the durable local stack and no longer selects
   `apps/api/src/server.js`.
2. The root Vercel catch-all selects `api/vercel-sandbox.mjs`; the primary and
   cron functions use the reviewed durable M1-B topology.
3. The canonical runtime map identifies Tenant Protocol, the shared kernel,
   PostgreSQL state, local and hosted entry points, and the legacy demo boundary.
4. The legacy demo's runtime and discovery documents state
   `canonicalProductTruth: false`, `releaseEligible: false`, and
   `process_local_ephemeral` durability.
5. Static tests and the M1-B Vercel release gate reject entry-point drift.
6. CI invokes the retained port-3000 demonstration smoke by its explicit
   `dev:legacy-demo` compatibility command and does not misrepresent it as the
   canonical root development runtime.

## Test commands

- `node --test apps/private-pilot/test/canonical-product-runtime.test.js`
- `node scripts/check-vercel-sandbox-deployment.mjs`
- `node --test apps/api/test/runtime-config.test.js`
- `pnpm test:security`
- `pnpm check`

## Security and permission checklist

- [ ] Canonical runtime remains synthetic/no-funds only.
- [ ] PostgreSQL tenant isolation and the Tenant Command Gateway remain intact.
- [ ] Legacy process memory cannot be represented as canonical release state.
- [ ] No secrets or participant data are added to tracked files.
- [ ] Wallet, Agent MCP, provider, A2A, and future adapter boundaries are
      preserved.
- [ ] Real-value and deployment authority flags remain false.

## Migration impact

None. This issue changes entry-point selection and release governance only; it
does not change the database schema or data ownership.

## Rollback plan

Revert this bounded issue commit. The durable local and hosted entry points
remain independently callable during rollback, and no data migration is
required.

## Completion Evidence

Root `pnpm dev` now selects the durable local PostgreSQL stack; `dev:api`
selects the same private-pilot composition directly; and `dev:legacy-demo`
is the only named entry for the retained process-local demonstration. Root
Vercel and the exact reviewed release bundle both select
`api/vercel-sandbox.mjs`, while the legacy bundle is explicitly
non-authoritative and non-release-eligible.

The machine-readable runtime map binds Human Web, Agent MCP, and API transports
to the Tenant Protocol, Tenant Command Gateway, shared Human/Agent Obligation
kernel, and PostgreSQL canonical state. It also records the root and exact
bundle configurations, exact bundle builder, rollback-compatible legacy demo,
and all unchanged no-funds authority flags.

Passing-after Evidence:

```text
node --test apps/private-pilot/test/canonical-product-runtime.test.js apps/api/test/runtime-config.test.js
7 passed, 0 failed

node scripts/check-vercel-sandbox-deployment.mjs
Vercel M1-B Sandbox static gate passed

pnpm test:security
34 passed, 0 failed
```

Migration impact remains none. Rollback is the bounded P0-3 commit and does not
require data rollback. Exact aggregate and deployment Evidence remain P0-4 and
P0-5 work.
