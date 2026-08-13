# UX-006 Gate 0.2: Agent durable recovery

Status: Complete locally

Date: 2026-08-12

Baseline commit: `65f999c0882ebd16486324509e0eb342a116cb19`

Branch: `codex/m1-b-deployable-sandbox`

## Context and current baseline

UX006-P0-002 proves an Agent recovery dead end. When an active Mandate has no
current continuation receipt in the browser, the primary Agent Console renders
a disabled button labelled `Create a new Draft Mandate` and instructs the user
to revoke the active Mandate. The browser has no such action and the protocol
revoke operation is Draft-only.

The durable server contract is already present: an Agent-authenticated runner
persists an exact continuation receipt and the controlling Principal reads that
receipt through bounded authenticated workspace recovery. Accepted Offers are
correctly omitted from continuation recovery after an Obligation exists. The
current browser nevertheless checks the missing receipt before the recovered
Obligation and therefore misclassifies a healthy resumed lifecycle as broken.

The predecessor `M1_B_AGENT_APPLICATION_CONTINUATION_OPERABILITY` is carried
forward here so only this issue owns the overlapping browser state machine.

## Scope

- Derive the Agent lifecycle next action from exact durable Mandate, Offer and
  Obligation truth, with an Obligation taking precedence after Offer acceptance.
- Replace the active-Mandate dead state with one enabled, read-only
  `Check Agent progress` action and a truthful waiting/unknown state.
- Remove every instruction to revoke an active Mandate or create a replacement
  Draft Mandate from that recovery path.
- Require the exact current server continuation before the Principal browser
  enables or submits Mandate activation.
- Make the normal local Agent application CLI persist the existing exact
  continuation receipt through the already approved Agent command, while
  preserving its output receipt format for runtime handoff.
- Recover only an Obligation whose authority is the exact current Mandate;
  never present another controlled Agent lifecycle as the recovery result.
- Keep browser cache non-canonical and preserve fresh-tab/relogin/restart
  recovery from authenticated server truth.

## Non-goals

- No active-Mandate revoke, replace, supersede, or new application authority.
- No new public operation, route, role, capability, credential, or permission.
- No production Principal browser call to `/local/v1/reference-agent/*` and no
  browser impersonation of an Agent.
- No protocol-level activation semantic change; an API-wide activation
  invariant requires separate human review because it affects existing clients.
- No schema, migration, seed, database rewrite, deployment, identity, funds,
  chain, Provider, risk, pricing, signer, custody, or withdrawal change.
- No edits to the user's existing Capital Network or Risk browser-host changes.

## Likely files

- `apps/web/src/agent-lifecycle-next-action.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/test/agent-lifecycle-next-action.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/manual-primary-actions.v1.json`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/private-pilot/src/agent-workflow.js`
- `apps/private-pilot/src/agent-reference-acceptance.js`
- focused Agent workflow and production-runner tests
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/audits/UX-006/README.md`

## Acceptance criteria

### Durable state and next action

- Given Draft Mandate plus one exact current continuation, refresh, a new tab,
  relogin, or service restart restores the same Offer and activation review.
- Given active Mandate plus current Offer and no Obligation, the Principal sees
  an enabled read-only progress check for the external Agent acceptance step.
- Given active Mandate plus accepted Offer and an exact recovered Obligation,
  the lifecycle resumes from that Obligation even though continuation recovery
  correctly returns no Offer receipt.
- Given active Mandate with neither a recoverable Offer nor exact Obligation,
  the browser shows one enabled read-only progress action and a stable truthful
  waiting/unknown state; it shows no disabled primary action, Draft replacement
  instruction, or impossible revoke instruction.
- Given multiple Principal-controlled Obligations, only exact Mandate authority
  may be selected. A bounded incomplete result remains unknown, not absent.

### Activation and Agent boundary

- The Principal acknowledgement and activation controls remain disabled until
  the exact server continuation for the loaded Draft Mandate is recovered.
- The browser `activateExactAgentMandate` handler defensively rechecks exact continuation before any
  mutation; stale, missing, duplicate, expired, mismatched, or cross-actor
  state fails closed without a Credit Intent or activation attempt.
- The production browser performs only Principal-authorized reads and never
  calls a local reference-Agent application route.
- The normal local Agent application command persists exactly one current
  continuation using the existing Agent-authenticated operation; replay is
  stable and stdout remains the exact Offer receipt consumed by runtime.

### Usability and recovery

- A recovery check causes exactly one bounded result: Offer, exact Obligation,
  stable waiting/unknown, or one actionable error with Retry.
- No recovery action changes pages automatically or creates a UI loop.
- Refresh, new tab, relogin, service restart, mobile width, keyboard operation,
  and 200% zoom preserve the same truthful next action.

## Test commands

```sh
node --test apps/web/test/agent-lifecycle-next-action.test.js \
  apps/web/test/agent-console-presentation.test.js \
  apps/web/test/static-ui.test.js
node --test apps/private-pilot/test/agent-reference-workflows.test.js \
  apps/private-pilot/test/local-reference-agent-http.test.js \
  apps/private-pilot/test/vercel-golden-flow-agent.test.js
pnpm run test:transport
pnpm run test:postgres
pnpm run check:tenant-protocol
pnpm run check:web-bundle
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run local:agent:acceptance
pnpm run local:acceptance
git diff --check
```

## Security checklist

- [x] Principal browser remains read-only for Agent application/runtime work.
- [x] Exact actor, Subject, Mandate, Offer, version, expiry and Obligation
      authority bindings fail closed.
- [x] Browser storage is not used as canonical continuation truth.
- [x] Duplicate, expired, revoked, stale, cross-tenant and cross-actor receipts
      disclose no Offer state.
- [x] No new mutation, permission, credential, signer, funds or external
      execution authority is introduced.

## Permission boundary

Implementation is authorized only for local code, tests, existing synthetic
no-funds Agent commands and browser verification. Any protocol-level activation
change, production deployment, identity provisioning, remote Agent service,
signer, funds, risk or permission change requires separate human review.

## Data and migration impact

None. The existing `workspace_continuation_receipts` projection and existing
Agent command are reused. No schema, migration or data repair is authorized.

## Rollback plan

Revert only the bounded presentation/state derivation, local CLI persistence,
tests and copy. Existing Mandates, Offers, receipts, Obligations and Evidence
remain unchanged.

## Required Evidence

- Failing-before and passing-after next-action tests.
- Exact operation logs proving active recovery is read-only.
- Refresh/new-tab/relogin/restart evidence for Offer and Obligation recovery.
- Desktop, keyboard, mobile and 200% zoom observations.
- Full gate outputs, exact diff and clickable local product URLs.

## Dependencies and sequencing

- Gate 0.1 role topology truth must be closed first.
- `M1_B_AGENT_APPLICATION_CONTINUATION_OPERABILITY` is carried forward here;
  it must not remain a second active implementation issue.
- API-wide activation hardening remains a separately reviewed follow-up.

## Completion Evidence

- Pure next-action coverage proves Draft/exact continuation, active/exact
  continuation, active/exact Obligation without continuation, and active
  no-result recovery. Duplicate, expired, invalid-version and mismatched
  continuation views fail closed.
- The local Agent application workflow persists one exact existing
  continuation through the Agent-authenticated command while preserving the
  original Offer receipt output; focused Agent tests pass.
- Fresh-browser fixtures passed for `active-neither`,
  `active-obligation-no-receipt`, `active-exact-continuation`, and
  `draft-exact-continuation` across reload, desktop, mobile, narrow/200%
  equivalent and keyboard states. Active checks emitted only authenticated
  read operations; no Agent application, activation, acceptance, execution or
  repayment mutation was issued. All consoles reported zero errors/warnings.
- Browser evidence: `output/playwright/ux-006-gate0-2/`.
- Final fresh/reload recheck confirms Agent mode hides and clears the unrelated
  Human Offer review status while preserving the intended active and Draft
  Agent CTAs; both consoles remained clean.
- Repository regression passes 916/916; focused Web/Agent, Transport, protocol,
  bundle, lint, typecheck and `git diff --check` pass.
- At the original Gate 0 checkpoint, the isolated PostgreSQL paths passed while
  the full suite ran 83/85 because of the then-unchanged Phase 2 Capital Partner
  timing fixture. Gate 0 changed no Capital Partner or database code; later
  aggregate verification supersedes that historical test-state limitation.
- At that same checkpoint, standard compose could not pass because the recorded
  migration `0054` checksum predated a terminal-blank-line cleanup. Later
  compatibility review proved the SQL bodies byte-identical apart from that
  terminal whitespace and added one exact, fail-closed compatibility edge. The
  migration table was not rewritten and the persistent volume was not reset.
- The current standard local no-funds stack passes `pnpm run local:acceptance`:
  PostgreSQL 17 applies all 61 migrations, all four wallet-gated role
  workspaces respond, durable Agent proof, forced RLS, Worker heartbeat and
  reconciliation pass, and the pending outbox is empty. This supersedes only
  the historical local-compose blocker; it does not authorize or prove
  deployment, production or real funds.
- No protocol activation semantic, public operation, permission, schema,
  migration, production deployment or funds authority changed.
