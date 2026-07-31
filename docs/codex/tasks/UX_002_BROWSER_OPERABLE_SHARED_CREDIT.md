# UX-002: Browser-operable shared credit and Evidence closure

Status: Implemented, browser-verified, and sealed in LOCAL-RC-002

## Context

The local no-funds pilot currently passes API and runner acceptance tests, but
several primary Human and Agent journeys are not operable from the browser.
Confirmed user-reported gaps include a stalled Human Offer confirmation,
inaccessible repayment after an older fully repaid position is restored,
Credit Passport and Credit Track Record views that do not load their durable
server truth, and an Agent journey whose primary path still requires a
downloaded handoff and local CLI runner. Base Sepolia Evidence requirements
also have a reconciliation backlog.

Passing a backend test is not sufficient for this task. The product must expose
the next authorized action, execute it through the same shared obligation
kernel, and show a durable receipt and recoverable next step in the browser.

## Scope

- Reproduce the reported Human and Agent failures in an authenticated browser
  fixture and retain current-state screenshots and request evidence.
- Repair Human Offer acceptance so explicit account or wallet confirmation
  completes exactly once and recovers the newly created Obligation.
- Make partial and full early repayment available for every eligible executed
  Obligation before its due date; distinguish an already fully repaid position
  from an ineligible repayment policy.
- Make Credit Passport and Credit Track Record load the latest authorized,
  durable Decision and Evidence without requiring browser-memory state or
  opaque IDs for the primary path.
- Replace the Agent Console's download-and-CLI primary path with an online
  local reference-Agent action backed by the protected Agent HTTPS contract and
  server-held, revocable workload credentials.
- Keep customer Agents as API users. Do not place an Agent credential, private
  key, or Human session in browser state.
- Reconcile all key lifecycle Evidence requirements with the configured Base
  Sepolia Evidence Anchor Registry and show submitted/finalized/explorer state.
- Update the user manual and browser acceptance coverage to match the verified
  interaction model.

## Non-goals

- No real funds, mainnet transaction, production signer, custody, public LP
  vault, arbitrary withdrawal, or production deployment.
- No change to credit policy, limits, price, KYC vendor, legal approval, or
  Capital Partner underwriting authority.
- No separate Human and Agent obligation, ledger, risk, or Evidence models.
- No customer Agent deployment by IPO.ONE and no browser-side Agent credential.
- No claim that an authenticated account click itself is a blockchain
  transaction; public-chain closure is provided by finalized Evidence anchors.

## Likely files

- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/*browser-host.mjs`
- `apps/private-pilot/src/agent-reference-workflows.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/tenant-api/src/`
- `modules/tenant-command-gateway/src/`
- `packages/api-contract/src/tenant-protocol.js`
- `scripts/local-evidence-anchor.mjs`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.1_DRAFT.md`
- `docs/codex/audits/UX-002/`

## Acceptance criteria

1. A signed-in Human can create a new application, evaluate it, confirm the
   exact Offer, and land on the newly created Obligation without a silent
   spinner or duplicate acceptance.
2. Any eligible executed Human or Agent Obligation accepts a positive partial
   or full repayment before its due date and recomputes outstanding balance and
   schedule; a fully repaid Obligation points to an open-position selector or
   new-credit action.
3. Credit Passport has one visible action that restores and opens the latest
   owned Decision Passport from durable server state.
4. Credit Track Record has one visible action that loads the selected
   Obligation's verified Evidence and renders finalized/non-final counts.
5. A registered local reference Agent can run Request, Decision, Offer,
   Obligation, execution, repayment, and Evidence from browser-visible online
   controls without downloading a handoff; external Agents retain the
   versioned protected HTTPS API path.
6. Human and Agent browser flows remain subject-, Principal-, Mandate-,
   capability-, tenant-, and idempotency-bound and fail closed after revocation
   or session expiry.
7. Every key lifecycle Evidence requirement is either finalized on Base
   Sepolia or visibly pending/failed with a retry action; finalized rows link to
   the configured explorer transaction.
8. Browser screenshots demonstrate the five repaired workflows at desktop
   width, and the static UI, full repository, PostgreSQL integration, local
   acceptance, restart, and idempotency checks pass.
9. The manual describes browser-first Human and reference-Agent testing plus
   API-first external Agent integration, without making CLI download a product
   prerequisite.

## Test commands

```bash
pnpm --filter @ipo-one/web test
pnpm test
pnpm run test:postgres
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:evidence-anchor:status
```

Authenticated in-app Browser journeys and screenshots are recorded in
`docs/codex/audits/UX-002/`.

## Security checklist

- [x] Raw Human KYC/PII remains encrypted offchain and is not rendered or
      anchored.
- [x] Agent credentials and private keys never enter browser state, downloads,
      receipts, logs, or committed artifacts.
- [x] Human confirmation cannot authorize an Agent action and a Principal
      cannot impersonate the Agent workload.
- [x] Offer acceptance, execution, and repayment remain idempotent.
- [x] Fully repaid, frozen, paused, revoked, expired, and wrong-tenant actions
      fail closed.
- [x] Base Sepolia anchor transactions have zero native value and respect the
      configured balance cap.
- [x] Explorer links are shown only for observed/finalized transactions.
- [x] Synthetic/no-real-funds and testnet states remain explicit in every
      affected view.
