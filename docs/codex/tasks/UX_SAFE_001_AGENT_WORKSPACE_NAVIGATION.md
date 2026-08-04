# UX-SAFE-001 — Agent workspace navigation without hidden mutation

Status: Completed locally  
Started: 2026-07-31  
Baseline commit: 4b0e41dde352283e0d27228d51d1fb99f04c97a8  
Depends on: GATE-001 completed security validation ordering  
Phase: Product Optimization Phase 1 / L0 local integration

## Context

At the recorded baseline, the Principal authority page and Agent credit guide
contained controls labelled Continue in Agent workspace or Open Agent
workspace. Their run-online-agent action navigated to Agent Console and
immediately called the reference Agent.

When the Mandate is active and an Offer receipt exists, that call submits
accept_offer and creates an Obligation. A navigation label therefore hides a
lifecycle mutation.

Agent Console already has one explicit Create Agent Obligation action. The
smallest and clearest fix is to keep navigation mutation-free and preserve
that one explicit mutation entry.

## Scope

- Add a distinct open-agent-workspace guide action.
- Make every control labelled Open Agent workspace use navigation only.
- Rename the Draft application action so it explicitly states that it requests
  Agent credit and receives an Offer without assigning Offer authorship to the
  Agent.
- Keep Create Agent Obligation as the only browser action that accepts the
  existing Agent Offer.
- Add a source contract test proving the navigation branch does not invoke the
  reference Agent.
- Verify the active-Mandate browser path.

## Non-goals

- No Agent protocol, Mandate, Offer, Obligation or API change.
- No new confirmation dialog.
- No change to the Draft application action's operation or authority; only its
  mutation label becomes explicit.
- No sessionStorage recovery or workspace-resume change.
- No permission, credential, risk, pricing, deployment or funds change.

## Likely files

- apps/web/src/index.html
- apps/web/src/app.js
- apps/web/test/static-ui.test.js
- existing Agent browser test host for verification only

## Acceptance criteria

1. Given an active Mandate and matching Offer receipt, when the Principal
   clicks Open Agent workspace, then Agent Console opens and no runtime-step
   request is made.
2. Given the same state, when the workspace opens, then Obligation remains Not
   created and Create Agent Obligation is the one primary mutation.
3. Given the user clicks Create Agent Obligation, then exactly one
   accept_offer request is made and one Obligation is returned.
4. Given a Draft Mandate without an Offer receipt, when the user clicks Request
   Agent credit and receive Offer, then the existing Draft application behavior
   is unchanged and its effect is named before the click.
5. No label containing View, Open, Continue, Back or Next invokes an economic
   or lifecycle mutation in the changed path.

## Test commands

node --test apps/web/test/static-ui.test.js

node --test apps/web/test/*.test.js

pnpm run check:web-bundle

git diff --check

Real browser:

- open the existing Agent browser host;
- complete Draft application and Principal activation;
- click Open Agent workspace;
- verify Not created remains visible;
- click Create Agent Obligation;
- verify the Obligation appears exactly once.

## Test-layer selection

Selected: static action-contract tests, full Web tests, bundle integrity,
real-browser network inspection, keyboard activation and 200-percent-equivalent
responsive reflow. PostgreSQL/RLS and Worker tests are omitted because this
Issue changes presentation routing only and adds no durable or asynchronous
behavior. Full repository and security gates provide regression coverage for
the unchanged protocol boundary.

## Security checklist

- [x] Navigation has no command authority.
- [x] Offer acceptance remains exact Mandate- and Offer-bound.
- [x] No browser credential or raw signature is introduced.
- [x] No duplicate acceptance path is added.
- [x] No protocol, role, capability or server authorization is changed.
- [x] No production funds or external execution is enabled.

## Permission boundary

Presentation and browser orchestration only. Existing Agent application and
Offer-acceptance authority are unchanged.

## Data and migration impact

No migration or durable-state change. Browser state remains non-authoritative.

## Code-efficiency exception

The touched app.js monolith has a net growth of five lines. The growth is one
closed navigation-only action branch; it adds no domain rule, transport,
protocol or state model. Extracting this single branch would add more
indirection and code than it removes. WEB-024 remains the sequenced feature
slicing Issue and MUST NOT be pulled into this safety fix.

## Rollback plan

Revert the new navigation action and matching test. No durable data rollback is
required.

## Required Evidence

- Static action-contract tests.
- Full Web test result.
- Browser capture before and after the explicit Create Agent Obligation action.
- Confirmation that no runtime-step request occurs on navigation.

## Completion Evidence

Completed on 2026-07-31:

- static action-contract tests: 15/15 passed;
- full Web tests: 111/111 passed;
- Web bundle boundary: 1 external module, 27 authored modules and 848 unique
  element IDs passed;
- real browser completed Draft application and exact Principal activation;
- immediately before and after Open Agent workspace, the request list ended at
  the same request and contained no runtime-step call;
- after navigation, the workspace displayed Obligation as Not created and
  exposed Create Agent Obligation as the explicit next action;
- only after that explicit click did one
  `/local/v1/reference-agent/runtime-step` request appear and the page display
  Agent Obligation created;
- the Draft action is now labelled Request Agent credit and receive Offer; Enter
  activated the semantic button and the page returned Decision completed and
  Offer ready;
- in a 600 CSS-pixel layout viewport with device scale factor 2, equivalent to
  the 1200-pixel baseline at 200 percent zoom, `clientWidth` and `scrollWidth`
  both remained 600; the primary Agent button was visible at x=41 with width
  518 and no horizontal task flow;
- captures:
  `output/playwright/ux-safe-001-navigation-only.png` and
  `output/playwright/ux-safe-001-explicit-create.png`, plus
  `output/playwright/ux-safe-001-reflow-200-equivalent.png`.

Decision: the changed Agent navigation path has no hidden lifecycle mutation.
