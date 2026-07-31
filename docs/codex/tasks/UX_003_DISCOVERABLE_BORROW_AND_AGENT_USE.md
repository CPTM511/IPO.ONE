# UX-003: Discoverable Human borrowing and staged Agent credit use

Status: Completed locally on 2026-07-31

## Context

The current local no-funds product contains a complete Human application and a
browser-operated reference Agent lifecycle, but its primary actions are not
discoverable at the product level. Human request and deterministic evaluation
are buried inside the long Credit view. The Agent runtime compresses Offer
acceptance, Obligation creation, allowed-use execution, early repayment, and
Evidence read into one button. A tester therefore cannot clearly answer where
to borrow or how an Agent uses approved credit.

Backend capability alone is not acceptance. Every primary step must have a
visible, enabled-at-the-right-time browser action, plain-language prerequisite,
server-derived completion state, and recoverable next step.

## Scope

- Add explicit Human borrowing and evaluation entry actions to the authenticated
  Home and Credit surfaces.
- Keep the existing Human `Request & evaluate credit` operation and make its
  deterministic Decision/Offer result easy to find.
- Split the local reference Agent runtime into browser-visible stages:
  create the Obligation, execute one approved sandbox use, post repayment, and
  read Evidence.
- Keep the Agent workload credential and every Agent command server-side.
- Preserve the existing one-shot Agent runtime route and SDK workflow for
  compatibility while adding a closed local staged route for the browser.
- Rewrite the Human/Agent user manual from the verified clickable product path.

## Non-goals

- No real funds, withdrawable balance, mainnet, custody, public Agent endpoint,
  arbitrary transfer, or production deployment.
- No change to deterministic credit policy, limits, pricing, KYC, legal gates,
  Capital Partner authority, or Evidence anchoring policy.
- No separate Human/Agent ledger, Obligation, repayment, risk, or Evidence
  implementation.
- No Agent credential, private key, signature, or bearer token in browser state
  or browser-visible receipts.

## Likely files

- `apps/private-pilot/src/local-reference-agent-http.js`
- `apps/private-pilot/test/local-reference-agent-http.test.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/codex/audits/UX-003/`

## Acceptance criteria

1. A signed-in Human can see and click `Start Human application` from
   Home, then reach the exact amount/term form and `Request & evaluate credit`.
2. Evaluation returns the deterministic Decision, exact Offer, reasons, and
   Decision Passport in the same guided journey.
3. After Principal activation, the Agent workspace exposes distinct buttons for
   `Create Agent Obligation`, `Execute approved use`, `Repay`, and
   `Verify Evidence`.
4. Each Agent button is enabled only when its preceding durable state exists,
   executes exactly one authorized operation, and shows the next action.
5. Repeated clicks remain economically idempotent; revoked, expired, frozen,
   paused, wrong-Tenant, or wrong-Subject requests fail closed.
6. The staged browser route never returns or accepts a credential, private key,
   reusable signature, Human session, or production funds authority.
7. Human and Agent results remain readable in Obligations, Repay & Settle,
   Credit Passport, and Credit Track Record as authorized by the same shared
   kernel.
8. The v0.2 manual names the exact page, workspace, button, prerequisite,
   success signal, and recovery action for every Human and Agent lifecycle step.
9. Focused web/private-pilot tests, the repository test suite, and authenticated
   browser journeys pass.

## Test commands

```bash
node --test apps/web/test/*.test.js
node --test apps/private-pilot/test/local-reference-agent-http.test.js
pnpm test
pnpm run local:agent:acceptance
```

The current sealed `LOCAL-RC-002` manifest is not rewritten. Source changes
remain an unsealed successor until a separately approved release-candidate
checkpoint.

## Security checklist

- [x] Raw KYC/PII remains offchain and absent from the browser.
- [x] Agent credentials and private material remain server-side.
- [x] Agent use is purpose-bound sandbox execution, not withdrawal.
- [x] Principal activation and Agent runtime execution remain separate.
- [x] All mutations remain Tenant, Subject, Mandate, capability, and
      idempotency bound.
- [x] Synthetic/no-real-funds state remains visible on every affected action.
- [x] Existing one-shot SDK/API compatibility is preserved.
- [x] No deployment, signer, testnet transaction, or funds authority is added.

## Completion evidence

- `node --test apps/web/test/*.test.js`: 107 passed.
- `node --test apps/private-pilot/test/local-reference-agent-http.test.js`:
  3 passed.
- `pnpm test`: 679 passed.
- `pnpm run local:agent:acceptance`: passed with 11 Evidence events.
- `pnpm run local:status`: PostgreSQL, pilot, and worker healthy.
- Human and Agent authenticated browser journeys are recorded in
  `docs/codex/audits/UX-003/`.
