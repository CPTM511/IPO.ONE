# WEB-007: Private shared-kernel product navigation

Status: Implemented locally on 2026-07-17 within the approved Product Charter
v1.1, HUMAN-001C, IDENTITY-001, CREDIT-001E/F, SERVICING-001,
EVIDENCE-001B, TRANSPORT-002, and no-real-funds sandbox boundaries.

## Context

Current browser evidence showed a product-state split after the private Human
Tenant host connected. The Human Pilot rendered the approved shared lifecycle,
but selecting Portfolio, Borrow & Credit, or Payments forced the Agent mode and
rendered the legacy process-local demo state (`No active Agent`, zero balances,
and disabled actions). Evidence also fell back to the legacy empty admin feed.

This was a frontend projection and navigation defect, not a missing protocol
operation. It made the formal product shell behave like unrelated demos even
though the Human and Agent entry modes already shared the same kernel.

## Scope

- Preserve the current Human or Agent interaction mode across shared Portfolio,
  Borrow & Credit, Payments, and Evidence navigation.
- Project the existing in-memory `tenantPilot`, `agentAuthorityPilot`, and
  `ownedEvidence` state into private product surfaces.
- Provide mode-aware actions back to the canonical Human application,
  Obligation/repayment, owner Evidence, Principal authority, or Agent API
  surfaces.
- Hide legacy demo panels while the authenticated private Tenant host is
  connected. Any remaining public demo fallback is quarantined as explicitly
  labelled test infrastructure and is not product truth.
- State explicitly that the projection is session-only and not durable after a
  reload.
- After PROVIDER-001A verification, show the signed local Provider capability
  status without claiming that the current Obligation has Provider execution.

## Non-goals

- No new Tenant operation, MCP tool, SDK workflow, protocol schema, permission,
  capability, Mandate scope, or authorization policy.
- No durable owned-portfolio query or claim that session state survives reload.
- No Provider callback, Provider spend, real funds, capital, custody,
  withdrawal, mainnet, credential, raw signature, or KYC/PII exposure.
- No replacement of EVIDENCE-001B owner reads or Agent Evidence reads with a new
  broad portfolio permission.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_007_PRIVATE_SHARED_KERNEL_NAVIGATION/`

## Acceptance criteria

- [x] Selecting shared navigation from Human mode keeps Human selected.
- [x] Selecting Agent explicitly renders the same shared pages with Agent-mode
  copy and actions.
- [x] Private Portfolio renders Human lifecycle and Agent authority status from
  the current authenticated session, never the empty legacy demo state.
- [x] Private Borrow & Credit renders the current deterministic Offer and shared
  Obligation position.
- [x] Private Payments renders the current schedule, repayment, and servicing
  position plus the verified local Provider capability boundary, while stating
  that the current Obligation has no Provider execution.
- [x] Private Evidence links to the already-approved owner or Agent Evidence
  surface without creating a new permission.
- [x] The public demo fallback, where retained for tests, is isolated from the
  authenticated Human and Agent product state.
- [x] Desktop and 390px mobile browser evidence has zero horizontal overflow.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security checklist

- [x] Human Principal remains the only UI actor that can create or activate
  Agent authority.
- [x] Shared pages invoke only already-approved navigation targets and operations.
- [x] Provider operations remain absent from this UI; the approved
  PROVIDER-001A status appears only after its security and recovery gates pass.
- [x] No API-provided HTML insertion, credential material, private key, raw
  signature, external asset, or new browser persistence was introduced.
- [x] Synthetic/no-funds and non-withdrawable boundaries remain visible.
