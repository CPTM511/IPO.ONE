# V9-008 implementation audit

Recorded: 2026-07-24T15:41:20.875Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Next task: `V9-009 AUTHORIZED`

## Gate

The IPO.ONE Founder independently accepted V9-007 at
`2026-07-24T15:14:44.402Z`, authorizing V9-008 only. The branch and source
commit match the task package. The worktree contains accepted stacked WALLET
and V9 changes from earlier tasks and was not reset, cleaned, committed,
deployed, or treated as source drift.

This task has a `review` gate. This implementation audit is self-authored
evidence, not independent review or acceptance. It does not authorize V9-009,
unfreeze, limit increase, automatic funds action, runtime approval creation,
break-glass activation, production risk policy, deployment, mainnet, or real
funds.

The pre-change runtime and authority mapping is recorded in
`docs/codex/audits/V9-008/pre-change-mapping.md`.

## Outcome

Risk & Operations now presents one permissioned, no-funds operational
workspace over the existing server-authoritative controls:

1. recent-MFA Tenant portfolio, pilot health, feedback, and servicing-queue
   reads;
2. the existing exact, reason-bound, idempotent protective Subject freeze;
3. visible policy ceilings for Borrower, Risk Operator, Operations Operator,
   and Auditor;
4. checked-in alert, reconciliation, incident, approval, and launch-policy
   evidence with explicit separation between configuration and live runtime
   state; and
5. explicit unavailable states for unfreeze, limit increase, generic emergency
   mutation, browser break glass, automatic repair, automatic funds action,
   incident acknowledgement/resolution, demo reset, mainnet, and real funds.

The implementation does not add a success operation. It does not infer that
an alert was delivered, reconciliation ran cleanly, an incident has an owner,
an ApprovalProposal exists, or a release gate passed merely because a policy
or runbook is checked in.

## Versioned presentation contract

`risk_operations_presentation.v1` is a closed and deeply frozen presentation
contract derived from the current Tenant operation catalog and reviewed,
checked-in policy evidence.

It returns `null` when:

- the input is not the exact `{ catalogOperationIds }` shape;
- an unknown field is present;
- an operation identifier is malformed;
- an operation identifier is duplicated; or
- the bounded catalog input exceeds 128 entries.

Catalog presence controls only presentation availability. The contract
explicitly records `catalogIsAuthorization=false`; Authentication, Membership,
capability, AccessGrant, object scope, recent MFA, admission, durable state,
approval, transaction, Event, Evidence, outbox, and reconciliation remain
server authority.

The contract records:

- alert policy `ops_001b.v1`, seven event-presence rules, notification target
  `unconfigured`, and `liveStateLoaded=false`;
- reconciliation schema `reconciliation_summary.v1`,
  `liveStateLoaded=false`, automatic repair disabled, and approval required
  for repair;
- incident state `runbook_only_unconfigured`, with named owner and notification
  target unconfigured and no acknowledgement/resolution operation;
- approval policy `security_001.v1`, exact-command binding, distinct Risk and
  Operations approver roles, Proposal locator not authority, and no browser
  proposal workflow; and
- launch policy `1.0.0`, checked-in evidence only, closed-pilot release
  disabled, and no inferred runtime approval.

Policy evidence constants are drift-tested against the actual checked-in alert
policy, authorization policy version, and launch-policy document.

## Authority separation

| Actor policy ceiling | Portfolio | Health | Feedback | Queue | Freeze | Sandbox resolution |
| --- | --- | --- | --- | --- | --- | --- |
| Borrower | No | No | No | No | No | No |
| Risk Operator | Yes | Yes | Yes | Yes | Yes | No |
| Operations Operator | No | Yes | Yes | Yes | Yes | Yes, exact external approval artifact required |
| Auditor | Yes | Yes | Yes | No | No | No |

These are presentation ceilings derived from catalog Actor contracts, not
grants. The Gateway still performs the authoritative decision for each
request. Denied, missing, and unavailable resources keep the existing
non-enumerating result.

The three servicing-resolution operations remain server-only browser
prerequisites:

- `pilotRestructureSandboxObligation`;
- `pilotRepurchaseSandboxObligation`; and
- `pilotWriteOffSandboxObligation`.

The browser neither creates nor decides an ApprovalProposal and cannot replace
the exact external artifact required by those commands.

## Protective action and operational truth

The existing freeze path was preserved without semantic change. It remains:

- limited to `pilotFreezeSubject`;
- capability- and recent-MFA-gated;
- exact Subject-resource-bound;
- reason-coded;
- admitted and idempotent;
- transactionally persisted with Event/Evidence/outbox coverage;
- replay- and concurrency-safe; and
- one-way from the browser.

No inverse unfreeze, limit increase, generic emergency command, caller-supplied
role, or break-glass path was added.

Alerts and reconciliation remain durable internal PostgreSQL/worker truth.
Because the Tenant protocol has no read operation for their current state,
V9-008 labels both surfaces unavailable for live operator reads. The incident
surface likewise shows the runbook and configuration gaps without fabricating
an incident lifecycle.

## Change scope

V9-008 implementation and evidence are scoped to:

- `apps/web/src/risk-operations-presentation.js`
- `apps/web/test/risk-operations-presentation.test.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/risk-operations-browser-host.mjs`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- `docs/codex/audits/V9-008/pre-change-mapping.md`
- `docs/codex/audits/V9-008/audit.md`
- `docs/codex/audits/V9-007/audit.md` for the Founder acceptance record
- `output/playwright/v9-008/`

The QA host change adds a closed valid feedback-summary fixture, current
phishing-resistant MFA timestamps, the existing feedback read capability, and
an authenticated options response so browser evidence is free of unrelated
404 noise. It does not change the product server or its authorization policy.

Because the accepted stacked worktree predates V9-008, repository-wide
`git diff` totals are not represented as V9-008-only totals.

## Catalog, authorization and durable-model diff

| Boundary | V9-008 change |
| --- | --- |
| Tenant operations/catalog | None; remains 42 operations |
| New success operation | None |
| Request/result schemas | None |
| AuthZ roles/capabilities/policy | None |
| AccessGrant/admission/quota | None |
| Recent-MFA enforcement | None; existing requirement preserved |
| Approval/break-glass policy | None |
| Ledger/Event/Evidence/outbox | None |
| Reconciliation service | None |
| Migrations | None; remains 27 ordered up/down pairs |
| Dependencies/lockfile | None |
| Credentials/signers/external network | None |
| Release/deployment/launch profile | None |
| Funds/custody/pricing/risk limits | None |
| Mainnet/real funds | None |
| Static web assets | One same-origin presentation module added to the fixed allowlist |
| Product traceability | Existing V9-008 actions now reference the presentation contract and focused test |

## Verification

### Exact repository gate

Command:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check
```

Result: PASS.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: pass;
- schemas: 53;
- OpenAPI: 21 paths / 21 operations;
- migrations: 27 ordered up/down pairs;
- Tenant protocol: 42 operations, 58 request fixtures, 50 result fixtures;
- operations policy: seven event-presence rules;
- approval policy: nine high-impact operations and five protective
  break-glass actions;
- product traceability: 13 destinations, 60 actions, 42 bound operations; and
- local tests: 417/417 pass.

### Presentation, UI and static safety

Commands:

```text
npx -y node@24.18.0 --test \
  apps/web/test/risk-operations-presentation.test.js \
  apps/web/test/static-ui.test.js
git diff --check
```

Results:

- focused presentation/static tests: 10/10 pass;
- diff check: pass;
- presentation output is closed and immutable;
- unsafe, duplicate, missing, and unknown catalog inputs fail closed;
- checked-in policy evidence cannot drift into a live-readiness claim;
- Borrower/Risk/Operations/Auditor ceilings remain separate;
- approval locators cannot be relabelled as browser authority; and
- unavailable authority-increasing actions stay disabled.

### Operations, approval, transport and security

Commands:

```text
npx -y node@24.18.0 --test modules/operations-control/test/*.test.js
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check:operations-policy
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run check:approval-policy
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:transport
npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security
```

Results:

- operations-control: 13/13 pass;
- operations policy: pass;
- approval policy: pass;
- transport: 49/49 pass; and
- security: 24/24 pass.

These suites prove bounded PII-free alert aggregation, no action authority in
alert output, exact dual-control proposal binding, rejection of stale or
mutated commands, protective-only disabled-by-default break glass, same-origin
asset conformance, recent phishing-resistant MFA, non-enumerating
authorization, idempotent protective controls, and fixed low-cardinality
telemetry.

### PostgreSQL restart, RLS, replay and reconciliation

A temporary PostgreSQL `17.10` cluster ran at
`/private/tmp/ipo-one-v9008-pg.hq5MQq` on loopback port `55441`.

Command:

```text
DATABASE_URL=postgresql://127.0.0.1:55441/ipo_one_v9008_test \
  npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:postgres
```

Result: 70/70 pass.

The durable cases include:

- operational alert RLS, replay, restart, and synthetic bounded payloads;
- ApprovalProposal/Decision/Execution restart and exact two-role control;
- protective break-glass restart behavior with no authority expansion;
- reconciliation discrepancy detection and approval-gated repair;
- recent-MFA portfolio and servicing-queue reads;
- freeze durability, exact replay, conflicting replay, and concurrency;
- Event, Evidence, outbox, projection-version, idempotency, rollback, RLS, and
  cross-Tenant isolation; and
- clean global reconciliation after the complete Gateway workflow.

After the run, the exact test database was dropped, PostgreSQL was stopped,
the cluster was moved recoverably to
`/Users/cptmao/.Trash/ipo-one-v9008-pg.hq5MQq`, and port `55441` reported no
response.

### Recent-MFA real-browser evidence

The Playwright CLI exercised the authenticated Risk Operator QA host at desktop
and `390x844` mobile sizes using a current phishing-resistant WebAuthn MFA
context.

Verified:

- the catalog enables only the current eight Risk/Operations operations;
- alert state is visibly `Internal durable · not exposed`;
- reconciliation is visibly `Worker-only · not loaded`;
- incidents are visibly `Runbook only · unconfigured`;
- dual control is visibly `Exact artifact required`;
- server portfolio shows `$125,000` limits, `$48,750` used, `$34,250`
  outstanding, and three adverse positions;
- pilot health and six categorical feedback signals load separately;
- a four-case servicing queue loads with one critical case and `$1,872`
  past due;
- an exact `security_incident` freeze moves the test Subject from Active to
  Suspended and refreshes the server portfolio suspended count;
- no unfreeze, limit-increase, automatic action, browser approval, break-glass,
  demo-reset, mainnet, or funds control appears;
- desktop and mobile consoles report zero errors and zero warnings; and
- mobile reports `innerWidth=390`, `scrollWidth=390`, with no horizontal
  overflow.

Evidence:

| Artifact | SHA-256 |
| --- | --- |
| `output/playwright/v9-008/operational-assurance-desktop.png` | `6005a6b71378cdb0310a9ed18c93ce568fd03f319aa768c32c0eb25f1224e5de` |
| `output/playwright/v9-008/authority-separation-desktop.png` | `8d5616029385e44a3662d509c808e9a2063204af8ec8006832d3c56dd487b913` |
| `output/playwright/v9-008/risk-operations-mobile-full.png` | `be3cfd4af6317d27e3a644b42226046716880e0ec4030a64104da8e46c225eff` |

Additional bounded mobile element captures remain under
`output/playwright/v9-008/`.

## Security proof

- Aggregate Risk views contain money, counts, statuses, opaque test resource
  references, and categorical feedback only; no raw identity, KYC, email,
  wallet secret, credential, signature, or free-text PII was added.
- Browser rendering uses `textContent` and closed presentation values; catalog
  identifiers are validated and never interpreted as HTML.
- The browser cannot supply Tenant, Actor, role, capability, AccessGrant, MFA,
  approval, or live reconciliation status.
- Missing and denied resources preserve the existing non-enumerating boundary.
- Catalog discovery does not authorize a request.
- No alert, reconciliation, approval, or incident configuration is
  misrepresented as loaded live state.
- The protective action remains exact, one-way, idempotent, auditable,
  restart-safe, and fail closed.
- Dual-controlled servicing commands remain exact-artifact-bound and outside
  browser approval authority.
- Break glass stays disabled and protective-only.
- No low-cardinality identifier was added to telemetry.
- No dependency, remote endpoint, credential, signer, contract, funds path,
  deployment, production permission, mainnet, or real-funds state changed.

## Failures found and resolved

1. The first focused static test expected the new ES module import on one line,
   while the reviewed source formatter used a multiline import. The assertion
   was corrected to verify the exact module path independent of whitespace.
   The final focused suite passes 10/10.
2. The first browser run produced an unrelated 404 while the shared shell
   queried authentication options. The bounded QA host now returns one
   truthful authenticated-options fixture; it grants no authority and changes
   no product server behavior. Final browser consoles report zero errors and
   zero warnings.
3. One completed full-check process no longer had a readable terminal handle.
   The entire exact repository gate was rerun after the final traceability
   edit. The recorded final run passes 417/417.

No final test remains failed.

## PASS, FAIL, and UNVERIFIED

PASS:

- V9-008 source identity and prerequisite gate;
- closed versioned presentation contract;
- recent-MFA portfolio, health, feedback, queue, and protective-freeze browser
  flow;
- separate Actor policy ceilings;
- truthful internal-only alert and reconciliation status;
- truthful unconfigured incident status;
- exact-artifact dual-control evidence;
- explicit unavailable authority-increasing actions;
- 417/417 local, 70/70 PostgreSQL, 49/49 transport, 24/24 security, 13/13
  operations-control, and 10/10 focused UI tests; and
- temporary database teardown with recoverable cluster retention.

FAIL:

- none in final verification.

UNVERIFIED:

- independent reviewer acceptance of this implementation and evidence;
- production deployment or hosted-environment behavior;
- live Tenant-protocol reads for operational alert, reconciliation, incident,
  or approval state, because those operations do not exist;
- named incident owners and working notification targets;
- a browser ApprovalProposal/Decision workflow;
- production IdP, operator memberships, runtime credentials, external
  providers, or on-call delivery;
- production risk limits, unfreeze, limit increase, automatic repair, or any
  automatic funds action;
- mainnet, custody, production capital, or real funds; and
- V9-009.

## Rollback

V9-008 rollback is presentation-only:

1. remove `apps/web/src/risk-operations-presentation.js` and its focused test;
2. remove the Risk & Operations import, assurance rendering, and Actor ceiling
   rendering from `apps/web/src/app.js`;
3. remove the assurance and authority-separation markup and styles;
4. remove the module from the fixed Tenant web-asset allowlist and transport
   conformance list;
5. revert only the V9-008 additions to the Risk browser QA fixture;
6. remove the V9-008 presentation/test references from product traceability;
   and
7. retain this audit and browser artifacts as historical evidence.

No migration rollback, data rewrite, catalog downgrade, permission revocation,
credential cleanup, deployment rollback, funds recovery, or chain action is
required because V9-008 added none of them. Earlier accepted stacked WALLET and
V9 changes must not be removed as part of this rollback.

## Next task status

V9-008 is `IMPLEMENTED_UNVERIFIED` and stops at its required review gate.
V9-009 has not started and remains blocked until an independent review is
completed and the IPO.ONE Founder explicitly accepts V9-008. V9-009 is itself
a `human_approval` task and cannot be inferred from acceptance of this audit.

This handoff does not claim production readiness.

The IPO.ONE Founder subsequently completed the review and accepted V9-008 at
`2026-07-24T15:48:04.437Z`, authorizing V9-009 only. That acceptance does not
authorize TC-000, production reports, production fee policy, deployment,
mainnet, custody, or real funds.
