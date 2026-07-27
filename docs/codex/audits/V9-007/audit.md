# V9-007 implementation audit

Recorded: 2026-07-24T15:06:24.321Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Next task: `V9-008 AUTHORIZED`

## Gate

The IPO.ONE Founder accepted V9-006 at
`2026-07-24T14:43:24.082Z`, authorizing V9-007 only. The source branch and
commit match the task package. The worktree contains accepted stacked changes
from earlier tasks and was not reset, cleaned, committed, deployed, or treated
as source drift.

The approval does not authorize V9-008, Provider funding, public or remote
Provider access, TVL, capital, custody, withdrawals, production pricing,
production credentials, mainnet, deployment, or real funds.

The IPO.ONE Founder independently accepted V9-007 at
`2026-07-24T15:14:44.402Z`, authorizing V9-008 only. That acceptance does not
authorize V9-009, unfreeze, limit increase, automatic funds action, production
risk policy, new approval authority, break-glass activation, deployment,
mainnet, or real funds.

## Outcome

Capital Network is now a no-funds Provider workspace grounded in the existing
signed fixed-loopback Provider sandbox. An authenticated Provider can:

1. enter one exact assigned `TransferIntent` ID;
2. load its current server-derived `provider_intent_view.v1`;
3. inspect the assigned Provider, purpose, sandbox exposure, delivery
   integrity, allocation receipt, and reconciliation state;
4. acknowledge the exact pending delivery through the existing
   `pilotAcknowledgeProviderIntent` operation; and
5. re-read the exact server aggregate before the UI displays the resulting
   acknowledgement or signed-callback state.

The browser does not enumerate assignments, create a Provider, choose an
endpoint, select a Tenant/Actor/role, fund a facility, move funds, withdraw,
settle, write a Ledger, create Provider Evidence, set pricing, or claim TVL.

## Closed presentation contract

`capital_network_presentation.v1` is a closed, deeply frozen presentation
contract over:

- current catalog operation IDs;
- either no Provider view or one exact `provider_intent_view.v1`; and
- either no acknowledgement or one matching
  `provider_intent_acknowledgement.v1`.

It returns `null` for unknown fields, unsafe flags, invalid identifiers,
invalid timestamps, amount drift, acknowledgement binding drift, impossible
status combinations, production-funds claims, or withdrawal authority.

The contract presents:

- a mandate-bound, non-funding Provider assignment;
- an assigned no-funds facility presentation;
- a server-derived allocation receipt using the exact TransferIntent hash;
- a delivery/reconciliation receipt using the exact Provider aggregate state;
- a historical 1.25% earnings example labeled
  `Historical example only · unapproved`, `pricingPolicy=false`, and
  `nonBinding=true`; and
- explicit disabled capabilities for Provider funding, withdrawal, public
  pool, TVL, production pricing, remote Provider access, mainnet, and real
  capital.

The displayed `$120.00 sandbox` and `$1.50 simulated` browser evidence comes
from the exact server fixture amount. Neither is labeled deployed capital,
TVL, entitlement, settlement, or production earnings.

## Provider authorization, retry and reconciliation

V9-007 reuses exactly:

- `pilotReadProviderIntent` with Provider Actor type, exact
  `transfer_intent`, and purpose `provider_intent_delivery`;
- `pilotAcknowledgeProviderIntent` with the exact delivery hash and a stable
  idempotency key derived from that hash; and
- the existing signed Provider callback worker and PostgreSQL reconciliation
  coverage.

Provider identity, Tenant, role, AccessGrant, and policy are injected and
verified by the server. They are not accepted from the browser payload.
Missing, expired, denied, and cross-Provider resources share one
non-enumerating UI result.

The browser does not synthesize a successful status after acknowledgement. It
performs a second exact `pilotReadProviderIntent` call and clears all displayed
Provider state if the refreshed response cannot pass the closed contract.

The browser QA host presents a post-worker `callback_completed` server
snapshot after its no-funds acknowledgement. It does not represent a browser
callback implementation. The real Ed25519 callback, inbox, Event, Evidence,
outbox, exactly-once projection, restart, replay conflict, and reconciliation
proof comes from the unchanged Provider and PostgreSQL runtime tests.

## Change scope

V9-007 implementation and evidence are scoped to:

- `apps/web/src/capital-network-presentation.js`
- `apps/web/test/capital-network-presentation.test.js`
- `schemas/v2/capital-network-presentation.schema.json`
- `scripts/check-schemas.mjs`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/capital-network-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `docs/codex/audits/V9-007/pre-change-mapping.md`
- `docs/codex/audits/V9-007/audit.md`
- `docs/codex/audits/V9-006/audit.md` for the Founder acceptance record
- `output/playwright/v9-007/`

Because the accepted stacked worktree predates V9-007, repository-wide
`git diff` totals are not represented as V9-007-only totals.

## Authority and durable-model diff

| Boundary | V9-007 change |
| --- | --- |
| Tenant operations/catalog | None; remains 42 operations |
| Provider success operations | None added; reuses the two existing Provider operations |
| AuthZ capabilities/policy | None |
| AccessGrant/admission/quota | None |
| Provider signer/callback adapter | None |
| Ledger/Event/Evidence/outbox/reconciliation | None |
| Migrations | None; remains 27 ordered up/down pairs |
| Dependencies/lockfile | None |
| Credentials or production identity | None |
| External network | None; browser QA and Provider runtime remain loopback |
| Release/deployment/launch profile | None |
| Pricing/capital/custody/withdrawal | None; explicitly disabled |
| Real funds/production credit | None |

One new closed JSON Schema and one same-origin static presentation module were
added. The Tenant static-asset conformance test now includes that exact module.

## Verification

### Exact repository gate

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: pass.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: pass;
- schemas: 53;
- OpenAPI: 21 paths / 21 operations;
- migrations: 27 ordered up/down pairs;
- Tenant protocol: 42 operations, 58 request fixtures, 50 result fixtures;
- product traceability: 13 destinations, 60 actions, 42 bound operations;
- local tests: 411/411 pass.

### Provider sandbox and exact retry proof

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:provider
```

Result: 5/5 pass.

This proves:

- Ed25519 binding to the fixed method, path, key and intent;
- fixed `127.0.0.1` delivery with no dynamic URL;
- bounded retries and circuit opening;
- exact replay returns the same deterministic response;
- conflicting replay is rejected;
- crash after commit recovers one state; and
- crash before commit leaves no state and one clean retry.

### Web presentation and mislabeling

Commands:

```text
npx -y node@24.18.0 --test apps/web/test/*.test.js
npx -y node@24.18.0 --check apps/web/src/app.js
npx -y node@24.18.0 --check apps/web/src/capital-network-presentation.js
git diff --check
```

Results:

- web presentation/tests: 69/69 pass;
- syntax checks: pass;
- diff check: pass;
- no duplicate static HTML ID.

The focused Capital Network cases prove empty/catalog state, exact assigned
exposure, acknowledgement/callback receipts, historical-unapproved earnings,
and fail-closed behavior for unsafe flags, unknown fields, mismatched Provider
receipts, impossible state, and client-supplied Actor identity. Static content
tests reject positive TVL/deployed-capital labeling and require all funding,
withdrawal, public-pool, and production-pricing controls to remain disabled.

### Transport and security

Commands:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Results:

- transport: 49/49 pass;
- security: 24/24 pass.

The same-origin web asset allowlist serves the exact presentation module.
Private operations, Authentication Context, CSRF, AuthZ, and non-enumerating
Gateway boundaries remain unchanged and pass their exact conformance suites.

### PostgreSQL, Event, Evidence, replay and reconciliation

A temporary PostgreSQL `17.10` cluster ran at
`/private/tmp/ipo-one-v9007-pg.FNt2bH` on loopback port `55440`.

Command:

```text
DATABASE_URL=postgresql://cptmao@127.0.0.1:55440/ipo_one_v9007_test \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:postgres
```

Result: 70/70 pass.

The durable signed Provider case proves:

- exact Provider AccessGrant read;
- first acknowledgement `replayed=false`;
- identical retry `replayed=true`;
- one durable acknowledgement row;
- first callback `replayed=false`;
- identical callback retry `replayed=true`;
- one durable callback inbox row;
- aggregate version reaches exactly 3;
- no signature or raw nonce persists;
- invalid signed-callback preflight consumes no admission state; and
- full reconciliation remains clean after the complete Gateway flows.

The suite also covers forced RLS, cross-Tenant denial, transaction rollback,
process restart, Event, Evidence, outbox, projection versions, idempotency,
atomic failure and global reconciliation.

After the run, the test database was dropped, PostgreSQL was stopped, the
exact temporary cluster was moved to
`/Users/cptmao/.Trash/ipo-one-v9007-pg.FNt2bH`, and port `55440` reported no
response. The Trash copy is recoverable.

### Real browser verification

The Playwright CLI exercised the authenticated Provider QA host at desktop and
`390x844` mobile sizes.

Verified:

- initial empty workspace contains no inferred Provider state or amount;
- exact read request contains only operation, empty payload, request IDs,
  exact TransferIntent resource, and purpose `provider_intent_delivery`;
- assigned server state displays `$120.00 sandbox`, exact Provider/purpose,
  hash-only allocation and delivery receipts, and no funding authority;
- the historical example displays `$1.50 simulated`, 1.25%, unapproved,
  nonbinding, and not pricing policy;
- acknowledgement request contains the exact delivery hash and stable
  `capital_network_ack_…` idempotency key;
- a second exact Provider read occurs before the UI displays
  `Signed callback processed`;
- acknowledgement is disabled after the terminal server state;
- public pool, funding, withdrawal and production-pricing controls remain
  disabled;
- desktop and mobile consoles report 0 errors and 0 warnings; and
- mobile reports `innerWidth=390`, `scrollWidth=390`,
  `horizontalOverflow=false`.

Evidence:

| Artifact | SHA-256 |
| --- | --- |
| `output/playwright/v9-007/capital-network-assigned.png` | `f43e81708c8d3cb5ad9eb62ac8957701f1ca07bc721ef08b5bcd7131857b967d` |
| `output/playwright/v9-007/capital-network-reconciled.png` | `ac114229a44ebb3328e3bd713617e987013bc2cb0a6d57e30508560f1a3cfd59` |
| `output/playwright/v9-007/capital-network-mobile.png` | `17c24b898478a9044a5b200120a3768e4c0f0809278e5afa489a86f296968df4` |

## Failures found and resolved

1. The default developer shell used Node `26.0.0`, and the exact runtime gate
   correctly rejected it before downstream checks. All final gates were rerun
   through the reviewed Node `24.18.0` / pnpm `11.1.3` runtime; no runtime
   assertion was weakened.
2. The first transport run found that the new presentation module was served
   by the fixed static allowlist but absent from the test's exact import list.
   The conformance list now includes that one same-origin module. The final
   transport suite passes 49/49.
3. The first browser QA composition returned an intentional workspace denial
   during generic shell recovery, producing a browser 404 console entry. The
   Provider QA host now returns a closed, empty, server-truth workspace
   recovery result; this removes fixture noise without granting a resource or
   changing production authorization. Final browser consoles are clean.

All resolved failures were rerun to PASS. No test remains failed.

## Rollback

Rollback removes the Capital Network presentation/schema, page composition,
same-origin asset entry, focused tests, Provider browser QA host, V9-007 audit
and browser evidence. The existing `pilotReadProviderIntent`,
`pilotAcknowledgeProviderIntent`, Provider callback worker, database tables,
Events, Evidence, outbox and reconciliation code must remain unchanged.

No migration rollback, Event replay, Ledger repair, credential revocation,
Provider key rotation, chain action, settlement correction, or funds recovery
is required because V9-007 adds no durable model, signer, credential,
deployment, external adapter, or financial authority.

## Residual boundaries and reviewer decision

- Only one fixed signed local Provider sandbox is in scope.
- Provider assignment discovery remains absent; the UI requires one exact ID.
- Acknowledgement is not funding, settlement, custody, withdrawal, or capital.
- The historical earnings example is not approved pricing or entitlement.
- No public pool, TVL, Provider funding, remote Provider, mainnet, real
  capital, or production fee policy is enabled.
- A clickable page, passing tests and local PostgreSQL do not establish
  production readiness.

At implementation handoff, V9-007 remained `IMPLEMENTED_UNVERIFIED`. The
IPO.ONE Founder subsequently completed the independent review and accepted
V9-007 at `2026-07-24T15:14:44.402Z`, authorizing V9-008 only.
