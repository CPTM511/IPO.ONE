# WEB-012 — Guided commercial Agent integration

## Context

Product Charter v1.1 makes the Agent interface a first-class commercial entry
mode. The authenticated product already exposes an exact capability manifest,
eleven local MCP tools, staged SDK workflows, Principal-controlled identity and
Mandate setup, and credential-free handoff packets. The current interface opens
with registry fields, raw JSON, and tool names before it explains who must act,
what is ready, or how an Agent reaches its first no-funds workflow.

The live `Agent API -> Return to Principal setup` interaction also returns to the
Human home without opening or focusing the Agent authority workbench.

## Scope

- Add a lifecycle-aware Agent integration guide derived from the existing
  Subject, AccountBinding, Mandate, and `agent_pilot_capability_manifest.v1`.
- Separate Principal setup from Agent/developer integration in plain language.
- Add one dynamic next-best action and a four-stage readiness path covering
  authorization, account proof, application handoff, and runtime workflows.
- Keep the exact manifest, MCP registry, SDK example, and request log available
  behind deliberate progressive disclosure.
- Fix every Principal-setup handoff so the Human authority disclosure opens and
  the exact workbench receives visible focus below the sticky header.
- Reuse the existing Aave-inspired IPO.ONE visual system and responsive rules.

## Non-goals

- No new MCP tool, SDK workflow, Tenant operation, endpoint, credential,
  subprocess, remote transport, funds authority, or live-chain execution.
- No simulated Agent execution from the browser and no editable authority in a
  handoff packet.
- No change to the shared Obligation, risk, ledger, servicing, or Evidence
  kernel.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_012_GUIDED_AGENT_INTEGRATION/audit.md`
- `design-qa.md`

## Acceptance criteria

- A first-time Principal or Agent developer can identify who acts next, why the
  current step is blocked, and what artifact becomes available afterward.
- Guide state is derived from exact authenticated Subject, AccountBinding,
  Mandate, handoff, and capability-manifest state rather than browser fiction.
- Waiting state has a visible `Authorize Agent` action; eligible draft/active
  states expose the existing application/runtime handoff without broadening it.
- The technical manifest, tools, SDK, and logs remain reachable and copy-safe,
  but raw JSON no longer dominates the first screen.
- `Return to Principal setup` and every setup CTA open the exact authority
  disclosure, scroll it below the sticky header, and place visible focus.
- Desktop 1440×1000 and mobile 390×844 have no page-level horizontal overflow,
  clipped primary action, or hidden current-step label.
- Current-run screenshots, interaction checks, combined reference comparison,
  static UI checks, and the full repository gate pass.

## Test command

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm check
git diff --check
```

## Security checklist

- [x] Guide state is presentation-only and reads existing authenticated truth.
- [x] Principal approval and account-proof gates cannot be bypassed.
- [x] Handoff packets remain credential-free, non-authorizing, local-only, and
      no-real-funds.
- [x] Browser controls never execute an Agent workflow or invent a receipt.
- [x] No raw account, signature, PII, Tenant authority, or secret is added.

## Implementation evidence

- Guided desktop entry:
  `artifacts/ux-audit/WEB_012/04-guided-agent-api-desktop.png`
- Correct Principal handoff:
  `artifacts/ux-audit/WEB_012/05-principal-setup-focused.png`
- Progressive technical detail:
  `artifacts/ux-audit/WEB_012/06-agent-protocol-details.png`
- Agent workspace entry:
  `artifacts/ux-audit/WEB_012/07-agent-workspace-desktop.png`
- Mobile entry and guide:
  `artifacts/ux-audit/WEB_012/08-agent-api-mobile.png` and
  `artifacts/ux-audit/WEB_012/09-agent-guide-mobile.png`
- Combined visual comparison:
  `artifacts/ux-audit/WEB_012/aave-vs-guided-agent-comparison.png`
