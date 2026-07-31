# UX-001: User-manual operability audit and repair

## Context

The Human and Agent user manual is now the executable product map for the
local no-funds pilot. A workflow is not complete merely because an API, SDK,
button, handoff document, or database record exists. A Human tester or a
registered Agent must be able to discover the next action, execute it with the
documented tool, observe server-derived progress, and recover safely from
errors.

The first confirmed gap is the Agent two-stage lifecycle: the browser can
download application and runtime handoffs, while the repository exposes only
the raw MCP stdio host and no simple local reference runner that consumes those
handoffs. This makes Request -> Decision -> Offer and
Obligation -> Execution -> Repayment -> Evidence technically available but not
operable from the documented local test journey.

## Scope

- Treat the versioned user manual as an operability checklist.
- Exercise every primary local-pilot surface for Human, Agent, Capital Partner,
  Trading Capital, repayment, Evidence, Credit Passport, reports, and
  Risk/Ops.
- Identify controls that are orphaned, require undiscoverable internal IDs, or
  lack success, pending, failure, and recovery feedback.
- Add a bounded local reference Agent runner for exact application and runtime
  handoffs without exposing the Agent credential to the browser.
- Repair confirmed UI, state-recovery, documentation, and test gaps while
  preserving the shared obligation kernel and existing authorization
  boundaries.
- Capture a reproducible operability matrix and current UI evidence.

## Non-goals

- No mainnet, real funds, production signer, custody, public LP vault, or
  arbitrary withdrawal support.
- No change to underwriting policy, credit limits, pricing, KYC provider, or
  legal approval gates.
- No duplicate Human or Agent obligation implementation.
- No browser-side Agent private key or credential handling.
- No claim that synthetic, fixture, or testnet Evidence is production capital
  activity.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/src/static-ui.test.js`
- `apps/private-pilot/src/agent-stdio.js`
- `apps/private-pilot/src/`
- `scripts/local-agent.mjs`
- `package.json`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.1_DRAFT.md`
- `docs/codex/audits/UX-001/`

## Acceptance criteria

1. Every primary action documented in the manual has a visible entry point or
   an exact runnable local command, with prerequisites and completion evidence.
2. The Agent application handoff can be consumed by a repository-owned local
   reference runner to produce an authenticated, persisted Offer workflow
   receipt.
3. The Agent runtime handoff can be consumed by the same runner to create,
   execute, repay, and read Evidence for one synthetic Obligation, with
   idempotent retry behavior.
4. Agent credentials remain outside browser state, downloads, logs, receipts,
   and committed artifacts.
5. Human and Agent positions remain readable by their authorized owners after
   reload and service/database restart.
6. Primary workflows do not require copying opaque internal identifiers already
   known to the authenticated workspace; unavoidable operator IDs are marked as
   advanced inputs and explained.
7. Disabled controls explain the unmet prerequisite; successful and failed
   actions show a safe next step and request/receipt reference.
8. Static control coverage, repository tests, local acceptance, and selected
   browser journeys pass.
9. The user manual and operability matrix describe the verified current
   behavior without claiming real-funds readiness.

## Test commands

```bash
pnpm test
pnpm run local:acceptance
pnpm --filter @ipo-one/web test
```

Additional bounded Agent runner and browser journey commands are added with the
implementation and recorded in the audit.

## Security checklist

- [x] Agent private material is loaded only by the local Agent host/runner.
- [x] Browser handoffs and receipts contain no raw credential or signature.
- [x] Human Principal activation remains separate from Agent execution.
- [x] Operation capability, Mandate, subject binding, and tenant checks remain
      fail closed.
- [x] Synthetic/testnet state is labelled accurately.
- [x] Idempotency keys prevent duplicate credit acceptance, execution, and
      repayment.
- [x] Errors redact sensitive values and retain a request or receipt reference.
- [x] No production, deployment, funds, signer, or privacy boundary is widened.

## Verification result

- `pnpm test`: 672 passed.
- Isolated PostgreSQL 17 integration suite: 82 passed; the temporary
  `ipo_one_ux001_test` database was removed after the run.
- `pnpm run local:acceptance`: passed before and after database/service restart.
- `pnpm run local:agent:acceptance`: passed before and after restart; the latest
  run created one synthetic Obligation, posted full repayment, and returned 11
  owned Evidence events.
- Web bundle integrity, Tenant protocol conformance, product traceability, and
  `git diff --check`: passed.
