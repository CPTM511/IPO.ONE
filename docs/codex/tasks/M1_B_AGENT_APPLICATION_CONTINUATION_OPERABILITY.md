# M1-B Agent application continuation operability

Status: Carried forward by UX-006 Gate 0.2

The production-compatible continuation persistence and Principal recovery
boundary delivered by this issue remain in force. UX-006 Gate 0.2 owns the
remaining usability closure for active-Mandate recovery and the local Agent
CLI persistence gap; only that successor may change the overlapping browser
state machine while it is active.

## Context and baseline

The deployed no-funds sandbox exposes a Principal-controlled Agent journey. A
new Agent Subject remains `pending` until the Agent proves control of its own
registered account, and a Draft Mandate may not be activated while that proof
is absent. This fail-closed identity boundary is correct.

The deployed browser currently contradicts that boundary in two ways:

- it presents a pending, unbound Agent as `Application ready`; and
- its `Request Agent credit and receive Offer` action calls
  `/local/v1/reference-agent/application`, a route that is intentionally absent
  from the production tenant host.

The browser is a Principal interface and must not impersonate the Agent or hold
an Agent private key. The production-compatible closure is therefore an
authenticated Agent application executed with the Agent's own external,
revocable credential, followed by a server-persisted continuation receipt that
the controlling Principal can recover and review.

Baseline commit: `53c0ec842650632a5f4a2e46c5413596154fdbd0`

## Scope

- Fail closed when the Agent Subject is not active or its account binding is
  absent or inactive.
- Keep Mandate activation disabled until the existing identity invariants are
  satisfied.
- Allow a Principal Controller to recover active continuation receipts only for
  currently controlled Agent actors in the same tenant.
- Replace the deployed browser's local-only reference-Agent request with an
  explicit server-truth continuation check.
- Preserve the local reference-Agent route for local development only.
- Provide a one-shot external Agent runner path for production-sandbox
  verification without creating an always-on external service.
- Verify the deployed path with real Chrome mouse clicks.

## Non-goals

- No browser-held or Vercel-held Agent private key, reusable signature, signer,
  transaction authority, transfer authority, withdrawal authority, or
  venue-write authority.
- No Human production lending, real funds, mainnet, custody, KYC vendor,
  Capital Partner expansion, fee runtime, new chain, or new credit model.
- No change to CreditLine authority, policy, Offer, Obligation, repayment,
  Evidence, or risk semantics.
- No broad refactor, dependency upgrade, RC branch, release tag, or release
  claim.

## Likely files

- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/agent-console-presentation.js`
- `apps/web/test/agent-console-presentation.test.js`
- `apps/web/test/static-ui.test.js`
- `modules/tenant-command-gateway/src/workspace-resume-handlers.js`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- production Agent runner and its focused tests, if the existing SDK cannot
  execute the exact DPoP flow without new authority.

## Acceptance criteria

- [ ] Given a Draft Mandate whose Agent Subject is pending or whose account
      binding is absent/inactive, when the Agent Console renders, then the
      application action is disabled and the UI identifies account proof as the
      blocking next action.
- [ ] Given an active Agent Subject, active account binding, Draft Mandate, and
      no continuation receipt, when the Principal checks for an Offer, then the
      browser performs only an authenticated server-truth read and reports that
      the external Agent application is still required.
- [ ] Given an active continuation receipt produced by a controlled Agent, when
      the controlling Principal starts a fresh browser session and checks for
      the Offer, then the exact Subject, Mandate, Offer, version, expiry, and
      receipt binding are restored from PostgreSQL-backed server truth.
- [ ] Given a continuation receipt belonging to another actor, tenant, expired
      receipt, revoked receipt, mismatched Mandate, or replay-invalid Offer,
      when a Principal recovers its workspace, then the receipt is absent and
      no Offer state is disclosed.
- [ ] Given a recovered exact Offer receipt, when the Principal confirms and
      activates the exact Mandate, then activation succeeds without creating a
      new Credit Intent.
- [ ] The production browser never calls `/local/v1/reference-agent/*`.
- [ ] The Agent application remains Agent-authenticated and the browser remains
      non-authoritative.
- [ ] Targeted tests, repository tests, PostgreSQL tests, lint, typecheck, build,
      and exact deployed browser verification are recorded truthfully.

## Test commands

```sh
node --test apps/web/test/agent-console-presentation.test.js
node --test apps/web/test/static-ui.test.js
pnpm run test:postgres
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run build
git diff --check
```

## Security checklist

- [ ] Principal recovery is tenant-bound and limited to active controlled Agent
      memberships.
- [ ] Receipt selection is bounded and does not enumerate unrelated actors.
- [ ] Subject, Mandate, Offer, aggregate version, expiry, revocation, and replay
      validity continue to fail closed.
- [ ] Agent account proof remains Agent-signed and Agent-authenticated.
- [ ] No private key, reusable proof, access token, or secret is rendered,
      logged, committed, bundled, or deployed to the browser.
- [ ] No real-value or external write authority is introduced.

## Permission boundary

Founder authorization covers the deployable no-funds sandbox closure and exact
browser verification. It does not authorize a release candidate, release tag,
production financial claim, real funds, mainnet, signer, transfer, withdrawal,
custody, fee runtime, or controlled-pilot expansion.

## Data and migration impact

No schema migration is expected. The change reads existing durable
`workspace_continuation_receipts` through existing tenant-scoped repository
methods. If implementation proves that a schema change is required, work must
stop for a separate review before migration.

## Rollback plan

Revert only this issue's exact commit and redeploy the previous immutable
deployment bundles. Existing Agent Subjects, Mandates, Offers, continuation
receipts, Obligations, Events, and Evidence remain durable and unchanged.

## Evidence required

- Exact diff and commit SHA.
- Targeted and full test output.
- PostgreSQL authorization and restart-recovery evidence.
- Deployed commit and deployment IDs.
- Chrome mouse-click evidence for account-proof gating, continuation recovery,
  exact Mandate activation, and the subsequent no-funds Agent lifecycle.
- Runtime request IDs, Event IDs, and database-backed projection evidence where
  independently available.

## Dependencies and sequencing

1. Add failing presentation and authorization/recovery tests.
2. Implement the smallest server-truth and browser-state correction.
3. Verify locally and with PostgreSQL.
4. Commit only the bounded issue files.
5. Deploy exact bundles.
6. Execute the external Agent application and Chrome mouse-click journey.
