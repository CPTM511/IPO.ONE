# WEB-008: Private Risk Operations control plane

Status: Implemented locally on 2026-07-17 within Product Charter v1.1 and the
already-approved DATA-003C/D protective freeze and aggregate Tenant-risk read
permissions.

## Context

The authenticated Risk Operations view still rendered the historical public
DEMO Admin Dashboard: a sandbox reset, plugin/rail fixtures, and a raw object
inspector. That surface was useful as development instrumentation but conflicted
with the approved commercialization requirement. A commercial control plane
must show only authenticated, policy-bound portfolio truth and must not imply
that demo state, reset controls, or object dumps are operational risk tooling.

The durable private protocol already exposes two reviewed operations:
`pilotReadTenantRisk` for a bounded PII-free aggregate portfolio view and
`pilotFreezeSubject` for a strong-MFA, reason-coded, idempotent protective
Agent Subject suspension. WEB-008 composes those exact operations into the
formal UI without adding authority.

## Scope

- Replace the authenticated Risk Operations projection with an Aave-inspired,
  IPO.ONE-native private control plane.
- Query one exact `risk_portfolio` through `pilotReadTenantRisk` and render
  Subject, CreditLine, Obligation, and per-asset aggregate exposure.
- Submit one exact protective Agent Subject freeze through
  `pilotFreezeSubject`, with an approved reason code and explicit acknowledgement.
- Keep read and command authorization server-side; catalog presence is only
  capability discovery and is never presented as session authorization.
- Return one shared non-enumerating UI state for denied or unavailable
  resources.
- Hide the historical DEMO Admin Dashboard, reset, plugin/rail fixtures, and
  object inspector whenever the authenticated private Host is connected.
- Update the private protocol label from 29 to the current 32 operations.

## Non-goals

- No new Tenant operation, schema, role, capability, AccessGrant, MCP tool, SDK
  workflow, public route, remote transport, or deployment.
- No unfreeze, pause release, limit increase, arbitrary withdrawal, production
  funds, mainnet, custody, capital, or real-value credit.
- No raw KYC, PII, entity-level portfolio export, borrower enumeration, or
  black-box risk score.
- No claim that the local UI is deployed to the hosted public sandbox or that
  incident/alert ownership is complete.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `apps/web/test/support/risk-operations-browser-host.mjs`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `docs/codex/audits/WEB_008_PRIVATE_RISK_OPERATIONS_CONTROL_PLANE/`
- Product Charter traceability and commercialization roadmap documents

## Acceptance criteria

- [x] Authenticated Risk Operations renders the private control plane and hides
  every legacy DEMO risk surface.
- [x] One exact portfolio query renders authoritative aggregate money, count,
  adverse-state, and per-asset fields without mock substitutions.
- [x] One exact Agent Subject can be suspended only after a protective reason
  and explicit acknowledgement are present.
- [x] The command sends `reasonCode`, exact resource binding, and idempotency;
  the UI exposes no unfreeze or authority-increasing control.
- [x] Human Borrower denial and unavailable resources share a non-enumerating
  state and return zero portfolio data.
- [x] Desktop and 390x844 mobile UI remain readable, actionable, and free of
  horizontal overflow.
- [x] Aave reference and current implementation are reviewed together; no
  copied Aave asset or invented placeholder art is introduced.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:provider
DATABASE_URL=postgresql://.../ipo_one_web008_test pnpm run test:postgres
git diff --check
```

## Security checklist

- [x] `pilotReadTenantRisk` remains Risk Operator/Auditor-only and returns
  bounded aggregate data without raw identity or PII.
- [x] `pilotFreezeSubject` remains Risk/Operations-only, protective-only,
  reason-coded, exact-resource-bound, and idempotent.
- [x] Catalog discovery does not imply actor authorization; every action is
  verified by the authenticated Gateway.
- [x] Denials do not reveal whether a portfolio or Subject exists.
- [x] API output is rendered with `textContent`; no API-provided HTML is used.
- [x] No production value, credential, raw signature, external asset, remote
  endpoint, or browser persistence was added.
