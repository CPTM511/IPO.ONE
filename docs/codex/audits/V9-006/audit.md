# V9-006 implementation audit

Recorded: 2026-07-24T14:18:30.545Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Next task: `V9-007 AUTHORIZED`

## Gate

The IPO.ONE Founder accepted V9-005 at
`2026-07-24T13:46:27.622Z`, authorizing V9-006 only. The branch and source
commit match the task package exactly. The worktree contains accepted stacked
changes from prior tasks; it was not reset, cleaned, committed, deployed, or
treated as source drift.

The IPO.ONE Founder independently accepted V9-006 at
`2026-07-24T14:43:24.082Z`, authorizing V9-007 only. That acceptance does not
authorize V9-008, public/remote Provider access, Provider funding, pricing,
capital, custody, production credentials, deployment, mainnet, or real funds.

## Outcome

Agent Console is now one truthful integration workspace over the existing
shared Human/Agent obligation kernel. It presents:

- exact Principal binding and active Agent Subject state;
- hash-only CAIP-10 AccountBinding state, chain and verification method;
- exact draft or active sandbox Mandate state, capabilities, limits, use,
  expiry, and immutable hashes;
- the current `agent_pilot_capability_manifest.v1` and exact
  `agent_mcp_registry.v2` eleven-tool local stdio registry;
- three typed local SDK workflow compositions;
- idempotency, stable errors, owned Evidence and conformance boundaries;
- same-origin loopback OpenAPI discovery;
- explicit unavailable states for remote MCP, A2A, production workload
  credentials, a public Agent endpoint, real Provider execution, real funds,
  and active-Mandate editing.

The browser does not execute Agent workflows, create credentials, select a
production endpoint, edit authority, or move funds. Human Principal setup
remains explicitly labeled and routes to the existing Human-controlled
authority workbench.

## Closed presentation contract

`agent_console_presentation.v1` accepts only a closed input containing:

1. the canonical capability manifest derived from its exact handoff;
2. the current authenticated Tenant catalog operation IDs;
3. one matching Subject snapshot;
4. one matching hash-only AccountBinding snapshot; and
5. one matching sandbox Mandate snapshot.

It returns `null` on extra fields, accessors, manifest drift, catalog drift,
Subject/Principal/Mandate mismatch, unsafe hashes or amounts, unsupported chain
or state, production authority, or non-sandbox scope. Catalog presence is
displayed separately from authorization. The local Host and Gateway still
recheck authentication, Subject, Mandate, AuthZ, admission and policy on every
command.

The presentation contains no raw account, signature, reusable proof, Tenant
selector, role, token, cookie, private key, client secret, endpoint credential,
production funds authority, or browser Agent execution path.

## Local OpenAPI composition

The existing Tenant OpenAPI document was factored into
`tenant_openapi.v1` and is now served at `/openapi.json` by the approved
loopback development Host as well as the existing production composition.
Loopback Host/port validation remains exact, production configuration is still
rejected by the loopback adapter, and the document contains:

- the current same-origin server origin only;
- the two existing Tenant protocol paths;
- current request/result contracts and authentication requirements;
- `closed_non_funds_pilot`;
- `x-real-funds-enabled: false`.

No credential or fixed external endpoint is embedded in the UI example,
handoff, screenshot, or audit. `/favicon.ico` maps to the existing fixed SVG
asset so raw OpenAPI browser inspection remains console-clean; it adds no
route authority.

## Change scope

V9-006 implementation and evidence are scoped to:

- `apps/web/src/agent-console-presentation.js`
- `apps/web/test/agent-console-presentation.test.js`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/src/tenant-openapi.js`
- `apps/tenant-api/src/index.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/src/tenant-http-adapter.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `security/test/gateway-security.test.mjs`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `docs/product/IPO_ONE_V9_PRODUCT_TRACEABILITY_v1.md`
- `docs/security/IPO_ONE_AUTHENTICATED_TRANSPORT_BOUNDARY_v0.1_DRAFT.md`
- `docs/codex/audits/V9-006/pre-change-mapping.md`
- `docs/codex/audits/V9-006/audit.md`
- `output/playwright/V9-006-agent-console-*.png`

Because the accepted stacked worktree predates V9-006, repository-wide
`git diff` totals are not represented as V9-006-only totals.

## Authority and durable-model diff

| Boundary | V9-006 change |
| --- | --- |
| Tenant operations/catalog | None; remains 42 operations |
| AuthZ policy/capabilities | None |
| Admission/quota classes | None |
| Approval policy | None |
| Ledger/Event/Evidence/outbox/reconciliation | None |
| Migrations | None; remains 27 ordered up/down pairs |
| Dependencies/lockfile | None |
| Provider/chain/signer/custody | None |
| Credentials or production identity | None |
| External network | None |
| Release/deployment/launch profile | None |
| Real funds/production credit | None |

## Verification

### Exact repository gate

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: pass.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- schemas: 52;
- OpenAPI: 21 paths / 21 operations;
- migrations: 27 ordered up/down pairs;
- Tenant protocol: 42 operations, 58 request fixtures, 50 result fixtures;
- capability manifests: 3 valid states + 8 invalid mutations;
- product traceability: 13 destinations, 60 actions, 42 bound operations;
- local tests: 406/406 pass.

### SDK, MCP, Agent lifecycle and transport

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
```

Result: 49/49 pass.

This includes exact eleven-tool MCP publication, argument authority rejection,
per-command Host authentication, idempotent Agent Credit Intent-to-Offer,
shared Obligation/execution/repayment, owned Evidence, SDK response-drift
rejection, local portability conformance, and loopback/OpenAPI transport.

### Focused product contract

Command:

```text
npx -y node@24.18.0 --test \
  apps/web/test/agent-console-presentation.test.js \
  apps/web/test/static-ui.test.js \
  apps/tenant-api/test/transport-conformance.test.mjs
```

Result: 14/14 pass. The five Agent Console contract cases cover waiting,
application-ready, runtime-ready, catalog drift, and closed-shape/authority
drift.

### Registry and security gates

Commands:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check:tenant-protocol
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check:product-traceability
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Results:

- exact browser/API/SDK/MCP registry drift gate: pass;
- product traceability: pass;
- security: 24/24 pass.

### PostgreSQL, restart and reconciliation

A temporary PostgreSQL 17 cluster ran at
`/private/tmp/ipo-one-v9006-pg.b9VkDK` on loopback port `55439`.

Command:

```text
DATABASE_URL=postgresql://cptmao@127.0.0.1:55439/ipo_one_v9006_test \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: 70/70 pass, including forced RLS, cross-Tenant denial, Agent
AccountBinding and Mandate persistence, process restart, replay, Event,
Evidence, outbox, atomic failure and full reconciliation.

After the run, the test database was dropped, PostgreSQL was stopped, the
exact temporary cluster was moved to
`/Users/cptmao/.Trash/ipo-one-v9006-pg.b9VkDK`, and port `55439` reported no
response. The Trash copy is recoverable.

### Real browser verification

Playwright exercised the authenticated Agent Console fixture at desktop and
`390x844` mobile sizes.

Verified:

- exact Principal, active Subject, Base Sepolia AccountBinding and active
  sandbox Mandate restore from authenticated server state;
- manifest status is `Runtime handoff`;
- registry parity is `11/11 tools`;
- the active runtime keeps new Credit Intent submission visibly `Draft only`;
- eligible runtime tools remain labeled `Gateway check`, not authorized by
  catalog presence alone;
- three SDK workflows and reliability boundaries are visible;
- all seven unavailable capability classes are explicit;
- “Open Agent API” remains in Agent Console and focuses the local registry;
- `/openapi.json` opens on the exact loopback origin;
- desktop, mobile, main UI and raw OpenAPI tabs report 0 browser errors and
  0 warnings after the fixed favicon mapping.

Evidence:

| Artifact | SHA-256 |
| --- | --- |
| `output/playwright/V9-006-agent-console-authority.png` | `3b542d5331ae3b33ccba88c7d0bcad2b282d7428b3e95b36e44f2e99d7c7ec4b` |
| `output/playwright/V9-006-agent-console-runtime.png` | `895da95dc0eaa38c6ea61b423b4c9116ef659f5675e129551f9d248d24c7548f` |
| `output/playwright/V9-006-agent-console-mobile.png` | `66173b8269903a3dbe5a0abaa92b2e6b88ec092ba5911706c48bccbf5c682728` |
| `output/playwright/V9-006-agent-console-mobile-top.png` | `8979de481f7f4f9305674f4e3c9a9231127ed558cdfd5b04d95d1d5adcd3a2e0` |

## Failures found and resolved

1. The first security run still asserted the superseded production
   HTTPS/mTLS UI copy. The assertion now requires the approved local stdio,
   out-of-band Host context and explicit remote/credential denial. No security
   check was weakened.
2. The first traceability run rejected UI/test references on `ABSENT` and
   `SPECIFIED_DISABLED` actions. Those action bindings remain empty as required;
   the visible disabled-state proof remains in the closed presentation tests.
3. Raw OpenAPI inspection produced a browser-only `/favicon.ico` 404. The
   fixed asset allowlist now serves the existing SVG icon under that conventional
   path. Final browser consoles are clean.
4. Static UI tests still expected the removed hypothetical production HTTPS
   sample. They now assert the executable local stdio SDK composition and the
   absence of copied workload-token/mTLS sample code.

All resolved failures were rerun to PASS. No test remains failed.

## Rollback

Rollback removes the Agent Console presentation module, product composition,
focused fixture/tests, local OpenAPI exposure from the loopback Host, favicon
alias, V9-006 traceability/docs, and browser evidence. The extracted OpenAPI
builder can be folded back into the production Host if necessary.

No database rollback, Event replay, Ledger repair, credential revocation,
Provider rollback, chain action or funds recovery is required because V9-006
adds no durable write, migration, credential, external adapter, deployment, or
financial authority.

## Residual boundaries and reviewer decision

- Remote MCP and A2A remain disabled.
- Production workload credentials and a public Agent endpoint remain absent.
- Provider execution remains the separately bounded local no-funds sandbox.
- Active Mandates cannot be edited in place.
- No real funds, lending, withdrawal, custody, mainnet or production credit is
  enabled.
- A clickable page and passing tests do not establish production readiness.

At the implementation handoff, V9-006 remained `IMPLEMENTED_UNVERIFIED`.
The IPO.ONE Founder subsequently completed the independent review and accepted
V9-006 at `2026-07-24T14:43:24.082Z`.
