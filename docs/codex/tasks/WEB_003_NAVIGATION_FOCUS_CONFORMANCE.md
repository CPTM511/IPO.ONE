# WEB-003: Human and Agent Navigation Focus Conformance

Status: Implemented locally on 2026-07-16 within the approved WEB-002,
HUMAN-001C/D, CREDIT-001D, MANDATE-001A, and TRANSPORT-001 boundaries. This
task changes presentation and accessibility behavior only. It grants no new
identity, acceptance, obligation, execution, repayment, servicing, transport,
deployment, production, chain, credential, or funds authority.

## Context

Current-run desktop and mobile screenshots show that the Aave-inspired Human,
Agent, and machine surfaces are visually coherent. They also reveal two real
navigation defects: the sticky mobile header obscures the Human application
heading after the primary jump, and Agent navigation leaves the polite live
region announcing the stale Human view while a browser-default outline wraps
the entire main landmark.

These defects make an otherwise formal product feel less trustworthy and make
the selected destination less clear for keyboard and assistive-technology
users. They can be fixed without expanding any protocol permission.

## Scope

- Offset both Human application and Agent authority jump targets below the
  sticky header at every responsive size.
- Preserve one intentional visible focus indicator on the selected workbench.
- Suppress the decorative browser-default outline on the programmatically
  focused main landmark while keeping the landmark focused.
- Announce the exact selected view through the existing polite live region.
- Respect `prefers-reduced-motion` for programmatic Human/Agent jumps.
- Add static regression gates and current-run before/after screenshot evidence.

## Non-Goals

- No visual redesign, new navigation destination, API, schema, business rule,
  identity proof, Offer acceptance, Obligation, execution, repayment, or funds.
- No public/private transport change, OIDC composition, Agent credential,
  remote MCP, deployment, chain adapter, or production dependency.
- No full WCAG compliance claim from screenshot and DOM evidence alone.

## Likely Files

- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_003_CURRENT_UI_AUDIT/`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_V11_TRACEABILITY_v0.1.md`

## Acceptance Criteria

- [x] At 390x844, the Human application target begins below the sticky header
  and its complete heading is visible after activating `Start application`.
- [x] The moved focus remains on `humanApplication` with an intentional visible
  violet indicator.
- [x] At 1440x900, Agent API navigation focuses `mainContent`, exposes no
  decorative main outline, and announces `Agent API view selected`.
- [x] Both verified viewports have zero horizontal overflow.
- [x] Reduced-motion preference selects an immediate jump.
- [x] Static UI, syntax, target-runtime repository, security, transport, and
  diff checks pass.

## Test Commands

```sh
node --test apps/web/test/static-ui.test.js
node --check apps/web/src/app.js
pnpm run check
pnpm run test:security
pnpm run test:transport
git diff --check
```

## Security Checklist

- [x] No API, authority, credential, endpoint, identity, financial value, or
  funds behavior changes.
- [x] Existing no-funds, private-host, locked-Acceptance, and remote-disabled
  messages remain visible.
- [x] No API-controlled HTML insertion, external asset, remote script, or new
  browser storage is introduced.
- [x] Programmatic focus remains deterministic and no bypass option is added.

## Verification Evidence

- Current-run audit: `docs/codex/audits/WEB_003_CURRENT_UI_AUDIT/audit.md`.
- 390x844 before: application top `-0.16px`; heading was obscured by the sticky
  header.
- 390x844 after: application top `91.84px`, heading top `136.84px`, header
  bottom `73px`, active element `humanApplication`, horizontal overflow `0`.
- 1440x900 after Agent API navigation: active element `mainContent`, live-region
  value `Agent API view selected`, computed main outline `none`, horizontal
  overflow `0`.
- Targeted static UI tests: 2/2; `node --check` and `git diff --check` pass.
- Browser console after the corrected Human and Agent navigation sequence:
  zero warnings and zero errors.
- Node 24.18.0 `pnpm run check`: 218/218; 34 schemas, 15 migration pairs, 21
  public OpenAPI operations, 17 private Tenant operations, UI, SDK, policy,
  protocol, and boundary checks pass.
- Node 24.18.0 `pnpm run test:security`: 21/21.
- Node 24.18.0 `pnpm run test:transport`: 22/22, including the fixed complete
  Tenant web module graph, named Human Host, named Agent Host, and actual local
  stdio workflow.
