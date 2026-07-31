# WEB-022: Agent post-activation credit entry and Principal monitoring

Status: Implemented and locally verified; handoff presentation superseded by
WEB-023; sealed in LOCAL-RC-002

> Correction (2026-07-30): the Agent application is Draft-only. An Active
> runtime accepts an existing Offer receipt and cannot start a new Credit
> Intent. WEB-023 replaces the former generic post-activation continuation with
> explicit application and runtime handoffs; the exact-controller monitoring
> work in this task remains current.

## Context

An active Agent Mandate authorizes a bounded Agent runtime but does not itself
request credit, accept an Offer, create an Obligation, execute credit, or post
repayment. The current Principal UI does not make that distinction clear:

- the post-activation Agent action routes to the architecture overview instead
  of the runtime handoff;
- the Agent Credit entry continues to show `Open Principal setup` after the
  Mandate is active;
- the local database can contain an active Mandate with no Agent Credit Intent
  or Agent Obligation, but the UI does not explain the next operation;
- an Agent-created Obligation is bound only to the Agent owner even though its
  Evidence already binds the accountable Human controller, so the Principal
  workspace cannot recover and inspect the controlled position.

The local database inspection on 2026-07-30 confirmed active Mandate snapshots
but no Mandate-authorized Credit Intent or Obligation.

## Scope

- Route active Agent actions to the authenticated Agent runtime handoff.
- State clearly that activation creates authority, not a loan.
- Present one explicit continuation from Mandate activation to Agent Credit.
- Make Agent Credit actions reflect application/runtime readiness.
- Bind newly created Agent Obligations to both the Agent owner and its already
  verified Human controller.
- Give the Principal Controller read-only access to exact controlled Agent
  Obligations through the existing `pilotReadOwnObligation` contract.
- Keep acceptance, execution, and repayment mutations Agent-authenticated.
- Reuse the existing shared Obligation, servicing, Ledger, Event, Evidence, and
  workspace-recovery paths.

## Non-goals

- No browser impersonation of the Agent and no browser-held Agent credential.
- No automatic loan, Offer acceptance, execution, or repayment on Mandate
  activation.
- No new Obligation, Ledger, servicing, repayment, or Evidence kernel.
- No Principal permission to accept, execute, or repay for an Agent.
- No real funds, withdrawal, provider execution, mainnet, contract, signer,
  deployment, KYC, risk-policy, pricing, or credit-limit change.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `modules/authorization/src/authorization-constants.js`
- `modules/authorization/test/authorization-policy.test.js`
- `apps/private-pilot/src/local-pilot-identities.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `modules/tenant-command-gateway/src/credit-acceptance-handlers.js`
- `modules/tenant-command-gateway/test/credit-acceptance-handlers.test.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`

## Acceptance criteria

- [x] An active Mandate shows a visible runtime-handoff action.
- [x] Agent Credit says that activation alone does not create borrowing.
- [x] The primary action opens the runtime handoff, not Architecture.
- [x] A local Agent can request and evaluate through its authenticated Draft
      application handoff, then accept, execute, repay, and retrieve Evidence
      through its authenticated Active runtime handoff.
- [x] A new Agent Obligation creates an owner binding for the Agent and a
      controller binding for the exact Human Principal.
- [x] The Principal can recover and read that exact controlled Agent
      Obligation but cannot accept, execute, or repay it.
- [x] Human acceptance and Obligation permissions remain unchanged.
- [x] Agent and Human continue to use one canonical economic lifecycle.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/*.test.js
node --test modules/authorization/test/authorization-policy.test.js
node --test modules/tenant-command-gateway/test/credit-acceptance-handlers.test.js
pnpm run check:web-bundle
pnpm test
pnpm run local:up
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] Controller access is exact-resource, read-only, and binding-dependent.
- [x] Agent economic mutations still require the Agent Runtime role and active
      Mandate checks.
- [x] The browser receives no Agent credential, key, or raw signature.
- [x] Cross-Tenant and unbound Principal reads remain unavailable.
- [x] No authority is inferred from a UI mode or handoff file.
- [x] No funds, withdrawal, external execution, chain write, signer, contract,
      deployment, pricing, risk, or production permission is introduced.

## Verification

- Web tests: 103 passed.
- Repository tests: 669 passed.
- Durable PostgreSQL Tenant Command Gateway: 40 passed, including one complete
  Agent credit, execution, repayment, Evidence, exact-controller read, and
  controller workspace recovery flow.
- Local stack acceptance passed with PostgreSQL 17, 48 migrations, durable
  authentication, worker, reconciliation, and complete Evidence-anchor
  coverage.
- Web bundle integrity passed with 822 unique DOM IDs; the rebuilt assets on
  ports 8787 and 8788 contain the WEB-022 continuation and status controls.
- Browser smoke check loaded the signed-out 8788 Human workspace without a
  rendering or navigation failure. Wallet signing remains a user action.
- The additive Principal read capability rotated the local credential
  generation from `phase2` to `phase3`; prior active credentials are revoked by
  the existing durable rotation path rather than silently widened.
