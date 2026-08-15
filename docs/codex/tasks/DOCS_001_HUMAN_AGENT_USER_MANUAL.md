# DOCS-001: Human and Agent user manual

Status: Draft complete and locally verified; authenticated screenshot pass and
Agent handoff UI follow-up pending

## Context

IPO.ONE has locally verified Human, Principal-controlled Agent, Capital Partner,
repayment, Credit Passport, Trading Capital, Evidence, and operations surfaces,
but the product does not yet have one role-based operating manual. Users and
testers cannot consistently tell:

- which workspace and role should perform an action;
- whether an action creates identity, authority, credit, an Obligation,
  repayment, Evidence, or a chain transaction;
- whether to use the Web UI, wallet, Agent Host, API, SDK, or MCP;
- which state confirms success and what the next action is;
- which capability is locally implemented, Testnet verified, hosted, or
  real-value active.

The manual must become the shared user and acceptance reference without
creating a second product truth.

## Scope

- Create one versioned Human and Agent user manual for the current local
  Closed Pilot and synthetic-capital product.
- Explain the product, environments, roles, workspaces, navigation, and shared
  credit lifecycle.
- Provide step-by-step Human Borrower, Human Principal, Agent Runtime, and
  Capital Partner workflows.
- Explain Repay & Settle, Credit Passport, Evidence, Trading Capital, Risk /
  Operations, Sign in, Sign out, role switching, and recovery.
- For every operational step, state its actor, purpose, prerequisites, UI
  location, action, required tool, expected result, created or updated record,
  Evidence and chain effect, failure recovery, and next step.
- Preserve exact English UI labels inside the Chinese manual.
- Add tester-oriented acceptance checks to each primary journey.
- Verify labels and capability claims against the current Web UI, OpenAPI,
  SDK/MCP catalog, task audits, and local runtime.

## Non-goals

- No UI, API, protocol, permission, risk, pricing, model, or economic change.
- No cloud deployment, external credentials, KYC vendor selection, signer,
  contract deployment, chain write, mainnet, real capital, custody, or funds
  movement.
- No claim that an Evidence Hash is a transaction hash or that every Evidence
  event is independently written onchain.
- No generic score, automatic underwriting authority, or automatic Agent loan
  on Mandate activation.
- No duplication of Human and Agent Obligation, Ledger, servicing, Event,
  Evidence, or reconciliation rules.

## Files

- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.1_DRAFT.md`
- `docs/codex/tasks/DOCS_001_HUMAN_AGENT_USER_MANUAL.md`

Optional verified screenshots may later be stored under
`docs/user-guide/assets/v0.1/`. Unauthenticated, stale, synthetic-looking, or
unverified screenshots must not be presented as authoritative product state.

## Acceptance criteria

- [x] One reader can identify the correct role and workspace before signing in.
- [x] Human and Agent quick starts converge on the same shared lifecycle.
- [x] Mandate activation is explicitly distinguished from borrowing.
- [x] Principal browser actions and Agent Runtime actions are separated.
- [x] Each major step explains its purpose, tool, result, Evidence, chain
      effect, failure handling, and next action.
- [x] Capital Partner and Trading Capital functions are described without
      claiming unsupported real-value availability.
- [x] Evidence Hash, record hash, transaction hash, anchor receipt, finality,
      indexing, and reconciliation are not conflated.
- [x] Internal IDs are treated as advanced or support details, not normal user
      inputs.
- [x] The manual includes sign-out, wallet switching, credential revocation,
      restart, retry, unknown-outcome, pause, and freeze guidance.
- [x] UI labels and Agent tools match the current checked-in product surfaces.
- [x] Tester checklists cover the primary Human and Agent flows.

## Verification

```sh
rg -n "Sign in|Create Agent Subject|Create signing request|Refresh binding|Activate exact Sandbox Mandate|Continue to Agent credit|Repay & Settle|Credit Passport" apps/web/src/index.html
node --test apps/web/test/*.test.js
pnpm test
pnpm run local:status
git diff --check
```

## Security checklist

- [x] Raw KYC, PII, credentials, private keys, and signatures are never
      instructed to be pasted into the browser or manual.
- [x] The Agent Host remains the only local account-proof signer.
- [x] Principal read access is described as exact-resource and read-only.
- [x] Agent economic mutations remain Agent-authenticated and Mandate-bound.
- [x] Local synthetic, hosted no-funds, Testnet, and real-value states remain
      visibly distinct.
- [x] No instruction grants production, chain-write, signer, custody, funds, or
      external-service authority.

## Verification result

- Manual covers all 12 checked-in Agent MCP tools and their required handoff
  phases.
- Manual and current Web source share 30 checked primary UI labels.
- Web tests: 103 passed.
- Repository tests: 669 passed.
- Local acceptance passed with PostgreSQL 17, 48 migrations, wallet-gated
  Human/Principal/Risk/Capital Partner workspaces, durable Agent proof, RLS,
  worker, reconciliation, and one-to-one Evidence anchor coverage.
- Local PostgreSQL, pilot, worker, and Lima host-agent loopback forwarding are
  healthy.
- `git diff --check` passed.

## Product finding

The documentation audit confirmed a current Agent guidance conflict:

- `application_ready` Draft Mandate handoff is required for
  `pilotRequestCredit` and the Decision/Offer workflow;
- `ready` Active Mandate handoff is required for acceptance, Obligation,
  execution, repayment, and Evidence;
- the current post-activation `Continue to Agent credit` UI does not explain
  that the runtime handoff cannot start a new Credit Intent.

The manual records the executable order and a safe local recovery path.
Correcting the UI sequence requires a separate product change so this
documentation task does not silently change application behavior.
