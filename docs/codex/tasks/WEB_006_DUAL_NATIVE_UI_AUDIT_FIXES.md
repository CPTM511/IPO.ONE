# WEB-006: Dual-native UI audit fixes

Status: Implemented locally on 2026-07-17 within the approved Product Charter
v1.1, HUMAN-001C, IDENTITY-001, EVIDENCE-001B, TRANSPORT-002, and no-real-funds
sandbox boundaries.

## Context

Current desktop and 390px mobile browser evidence shows that the Aave-inspired
Human Pilot, Agent Workspace, and Agent Runtime are visually coherent and
horizontally bounded. The same audit found one broken product path and one
readability issue:

- when the authenticated private Tenant Gateway was online, the Agent Workspace
  still sent `Create Demo Agent` to the legacy `/v1/agents` route, which is not
  part of the private shared-kernel host;
- secondary Evidence metadata was too faint on the graphite Obligation panel.

## Scope

- Route the private Agent Workspace primary action to the Human
  Principal-controlled Agent authority workbench.
- Render private Agent Subject, Principal, CAIP-10, and Mandate status from the
  shared `agentAuthorityPilot` state instead of presenting the legacy demo as
  authoritative.
- Hide legacy mock-wallet mutation controls while the private Gateway is active.
- Preserve the legacy public demo route when the private Gateway is unavailable.
- Increase owned Evidence metadata contrast and size on the graphite surface.
- Add static regression checks and current-run desktop/mobile screenshot proof.

## Non-goals

- No protocol, operation, schema, Mandate, AccountBinding, credential, chain,
  deployment, production, funds, custody, capital, or risk-policy change.
- No real lending, real disbursement, remote MCP, arbitrary withdrawal, or raw
  KYC/PII exposure.
- No claim of full WCAG conformance from screenshot and semantic-DOM evidence.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_006_DUAL_NATIVE_UI_AUDIT/audit.md`

## Acceptance criteria

- [x] Private Agent Workspace exposes `Configure Agent authority`, never the
  legacy demo mutation, and opens the focused Human Principal workbench.
- [x] Private Agent Workspace status is derived from the shared Agent authority
  state and does not render legacy mock-wallet mutation controls.
- [x] The legacy public demo still retains `/v1/agents` when the private Gateway
  is unavailable.
- [x] Owned Evidence secondary timestamps, IDs, schema versions, and hashes are
  visibly readable on the graphite panel.
- [x] Desktop and 390px mobile Agent views have zero horizontal overflow.
- [x] Static UI, syntax, repository quality, security, transport, and diff gates
  pass on Node 24.18.0.

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

- [x] The Human Principal remains the only UI actor that can create or activate
  Agent authority.
- [x] The Agent receives no credential, private key, raw signature, remote MCP
  endpoint, production funds authority, or permission expansion.
- [x] No API-provided HTML insertion, external runtime asset, or new browser
  storage was introduced.
- [x] Synthetic/no-funds disclosures remain visible on Human and Agent views.
