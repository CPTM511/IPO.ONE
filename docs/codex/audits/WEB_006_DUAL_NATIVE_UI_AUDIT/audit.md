# WEB-006 dual-native UI audit

Date: 2026-07-17

## Scope and visual source

The audit exercised the current authenticated local product at 1440x1000 and
390x844 against the user-approved Aave consumer, Aave Pro, and Aave market
screenshots. It covered the Human no-funds lifecycle, owned Evidence, Agent
identity/authority entry, and the Agent API/MCP runtime.

Comparison evidence:

- `artifacts/product-design-audit/2026-07-17-human-agent-ui/16-aave-pro-vs-agent-final.png`
- `artifacts/product-design-audit/2026-07-17-human-agent-ui/17-aave-market-vs-human-evidence-final.png`

## Journey health

1. **Human entry — healthy.** The no-funds boundary, Human/Agent mode control,
   primary application action, authority summary, and 44px mobile targets are
   visible without horizontal overflow.
2. **Application and Offer — healthy.** Subject, scoped Consent, Credit Intent,
   deterministic Decision/Offer, exact acknowledgement, and Obligation creation
   completed through the authenticated same-origin Tenant protocol.
3. **Execution, repayment, and Evidence — healthy.** The signed sandbox
   execution, deterministic repayment waterfall, and four-event owner-only
   Evidence timeline completed with no real or withdrawable funds.
4. **Agent authority entry — fixed and healthy.** The private Agent Workspace no
   longer calls the unsupported legacy `/v1/agents` route. Its primary action
   opens the Human Principal-controlled authority workbench, and its status
   derives from shared Agent Subject, CAIP-10 AccountBinding, and Mandate state.
5. **Agent Runtime — healthy.** The machine surface advertises exactly ten local
   MCP tools, three SDK workflows, 29 private Tenant operations, public/private
   separation, out-of-band credentials, and no live-chain or funds authority.

## Fixed findings

- **P1 — fixed:** the private Agent Workspace invoked a legacy demo-only route
  and returned `Tenant route is not available`. The private mode now routes to
  Principal authorization and hides the non-authoritative mock-wallet mutation.
- **P2 — fixed:** owned Evidence timestamps, IDs, schema versions, and hashes
  were visually too faint on graphite. The final table uses larger, lighter
  secondary text while preserving the existing IPO.ONE palette and density.
- **P2 — fixed:** author CSS could override the semantic `hidden` attribute.
  One explicit global rule now guarantees hidden controls remain absent from
  layout and interaction.

## Current evidence

- Human desktop start: `01-human-start-desktop.png`
- Human Offer: `03-human-offer-desktop.png`
- Obligation created: `04-human-obligation-created-desktop.png`
- Final owned Evidence: `15-human-evidence-final-desktop.png`
- Agent API desktop/mobile: `08-agent-api-desktop.png`, `09-agent-api-mobile.png`
- Final Agent Workspace desktop/mobile: `13-agent-workspace-final-desktop.png`,
  `14-agent-workspace-final-mobile.png`

All files are under
`artifacts/product-design-audit/2026-07-17-human-agent-ui/`.

## Accessibility evidence and limitations

- Semantic snapshots verified headings, landmarks, regions, exact control
  names, disabled states, live status announcements, and the mobile navigation
  dialog/focus model.
- Human and Agent mobile documents both reported
  `scrollWidth === clientWidth === 390`.
- The mobile navigation exposes an explicit open/close action, makes the hidden
  shell inert, and retains the existing Escape/focus-return behavior.
- This is not a full WCAG audit. It does not replace testing with multiple
  screen readers, browser zoom/reflow matrices, OS high-contrast modes, or
  independent manual accessibility review.
- The browser host uses synthetic/redacted fixtures and no real funds. Agent
  signature submission remains a local MCP action and is covered by transport
  and domain tests, not by exposing a credential or signing control in Human UI.
