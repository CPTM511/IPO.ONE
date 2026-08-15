# OPTIMIZATION-001 — Phase 1 stabilize and simplify

**Status:** Completed and sealed locally on 2026-07-30
**Reference:** `IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md`
**Delivery shape:** One complete vertical work package

## Context

The local no-funds product already has a sealed release candidate, a shared
Human/Agent lifecycle, PostgreSQL persistence, Credit Passport operations,
CHAIN-001F Evidence anchors, and the consolidated commercial workspace.

The next task is not a redesign or new credit system. It is to re-verify the
current source after the latest fixes, simplify the user journey, and make
Credit Passport and chain receipts understandable without changing protocol
behavior.

This issue must reuse `LOCAL-RC-001`, `WEB-018`, `WEB-019`, `E2E-001`, and the
existing authenticated server truth. Completed functionality is not rebuilt.

## Scope

### Release truth

- Re-run the exact Node 26/PostgreSQL 17 repository and local-stack gates.
- Record the current migrations, OpenAPI contracts, conformance fixtures,
  CHAIN-001F Registry, expected database summary, and safety flags.
- Seal a replacement local candidate only after the current Human and Agent
  lifecycle, restart, replay, wallet, credential, reconciliation, pause, and
  anchor tests all pass.

### Product entry

- Replace contradictory signed-out language with one clear signed-out state.
- Provide four understandable entry choices: Human, Agent, Capital Partner,
  and Developer/API.
- Keep one primary sign-in action and one plain explanation of the no-funds
  boundary.
- After authentication, show one primary next action for the selected role.
- Preserve all existing destinations through the current navigation and
  progressive disclosure.

### Credit Passport

- Present the current authenticated Subject, authority, Decision, selected
  factors, outcome history, validity, and permission state in plain language.
- Use only data already returned by the authenticated server in this phase.
- Keep issue, read, verify, revoke, and advanced recovery operations.
- Remove normal-path requirements to paste IDs the server already knows.
- Keep unavailable factors explicitly unavailable; do not manufacture values.

### Evidence and chain receipts

- Reuse one presentation component for:
  - offchain record or Evidence digest;
  - Base Sepolia transaction hash;
  - anchor state;
  - chain finality;
  - indexer state; and
  - reconciliation state.
- Link to BaseScan only when the server returns a verified EVM transaction hash.
- Preserve pending, failed, replaced, retrying, finalized, and reconciled
  states without collapsing them into one “verified” label.

### Usability and compatibility

- Verify desktop and mobile reflow, keyboard navigation, focus visibility,
  readable contrast, labels, validation, and error recovery.
- Preserve existing operation IDs, schema versions, route keys, authorization,
  state machines, and Human/Agent parity unless a separately reviewed defect
  requires a compatible change.

## Non-goals

- No Capital Partner mutation, Offer authoring, new role, migration, or API.
- No new scoring model, risk rule, price, limit, or automatic credit authority.
- No cloud deployment, remote participant access, KYC provider, raw PII, or
  external credential.
- No new contract, Registry, signer, chain write authority, test asset, venue
  write, mainnet, custody, or real funds.
- No separate Human, Agent, Trading, Passport, Ledger, or Evidence kernel.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/src/credit-passport-presentation.js`
- a shared receipt-presentation module under `apps/web/src/`
- `apps/web/test/*.test.js`
- `apps/private-pilot/test-postgres/production-runtime-e2e.test.mjs`
- `scripts/local-stack-acceptance.mjs`
- `deploy/local/release-candidate.v1.json`
- `docs/codex/tasks/OPTIMIZATION_001_PHASE_1_STABILIZE_AND_SIMPLIFY.md`

## Acceptance criteria

1. Signed-out state has one consistent message and one primary sign-in action.
2. Human, Agent, Capital Partner, and Developer entry purposes are
   understandable before authentication.
3. Current Human and Agent authenticated lifecycles complete without changed
   economic or authorization semantics.
4. Normal Credit Passport use requires no copied internal identifier already
   known to the server.
5. Credit Passport shows only authenticated, versioned facts and clearly marks
   missing factors.
6. Every displayed hash is explicitly typed; only verified transaction hashes
   receive a block-explorer link.
7. Anchor, finality, indexer, and reconciliation states remain distinct.
8. Wallet sign-out/sign-in, Agent activation, offer acceptance, execution,
   repayment, credit outcome, and Evidence anchoring continue to work.
9. Restart, duplicate request, unknown outcome, retry, pause/freeze, and
   credential revocation tests remain green.
10. Desktop, mobile, keyboard, focus, and readable-contrast checks pass with no
    new console error or horizontal overflow.
11. A new local release receipt binds the exact source, migrations, contracts,
    fixtures, database summary, and CHAIN-001F coverage.

## Test commands

```sh
node --test apps/web/test/*.test.js
pnpm run check:web-bundle
pnpm run check:migrations
pnpm run check
pnpm run test:postgres
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:evidence-anchor:status
pnpm run check:local-rc
git diff --check
```

The final acceptance run must include one clean Human browser path and one
Agent API/SDK path against PostgreSQL, followed by a restart and exact replay.

## Security checklist

- [x] No browser fixture or local storage replaces authenticated server truth.
- [x] No raw KYC/PII, credential, signature, key, or private identifier is
      added to a public surface or URL.
- [x] Sign-out clears the account session, wallet permission, and private state.
- [x] Evidence digest and transaction hash remain different types.
- [x] Missing, denied, or cross-Tenant resources remain non-enumerating.
- [x] All real-funds, mainnet, external execution, deployment, and remote-access
      flags remain false.
- [x] No current Human, Agent, Risk, Provider, Trading, or Evidence authority is
      expanded.

## Completion handoff

Deliver:

- exact candidate commit and release receipt;
- before/after Human, Agent, Credit Passport, and receipt screenshots;
- full test and PostgreSQL result summary;
- remaining defects by severity;
- an explicit Phase 2 go/no-go.

## Completion evidence

- Candidate commit:
  `7f04aedebe6e624f1cc843298aa22f17b4b87d6f`
- Release receipt:
  `deploy/local/release-candidate.v1.json`
- Acceptance report:
  `docs/codex/audits/OPTIMIZATION-001/phase-1-acceptance.md`
- Decision: go for Phase 2 no-funds design and implementation; no-go for
  cloud launch, remote access, Capital Partner mutation, testnet value
  movement, or real funds without their separately named approvals.
