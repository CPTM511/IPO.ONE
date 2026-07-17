# WEB-011 — Guided commercial Human experience

## Context

The Human no-funds lifecycle is operational, but the interface presents protocol
capabilities, opaque identifiers, and parallel Agent configuration before it
explains the user's current state or next action. A restored Obligation can still
land on a generic "Start application" call to action and an empty Offer console,
which makes a working product feel like a technical plugin.

## Scope

- Add a server-truth-driven Human journey guide with progress, one primary next
  action, a short explanation, and explicit sandbox protections.
- Make the Human hero and application workspace reflect the current lifecycle
  rather than a static first-use state.
- Prioritize an existing Obligation over an empty application/Offer form, while
  keeping a deliberate path to start another no-funds request.
- Use progressive disclosure for opaque identity references, protocol controls,
  proofs, and Principal-controlled Agent configuration.
- Preserve the existing Aave-inspired visual language, responsive behavior,
  keyboard access, and reduced-motion behavior.

## Non-goals

- No new protocol operation, backend endpoint, permission, scoring rule, funds
  movement, production credit, KYC collection, or PII rendering.
- No forced tutorial modal, fabricated lifecycle state, or browser storage as
  product authority.
- No redesign of Risk Operations, Agent API, or the shared obligation kernel.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- `docs/codex/audits/WEB_011_GUIDED_COMMERCIAL_HUMAN_EXPERIENCE/audit.md`
- `design-qa.md`

## Acceptance criteria

- A first-time user can answer what the product does, where they are, what to do
  next, and why the sandbox is safe without opening protocol details.
- The guide is derived from the authenticated session's current Subject,
  Consent, Offer, Obligation, execution, repayment, and Evidence state.
- A restored Obligation presents its execution/repayment action first and does
  not show a misleading empty Offer as the primary content.
- Starting another request is explicit, preserves the current position, and can
  be exited without mutating server state.
- All existing Human and Agent actions remain reachable.
- Desktop 1440×1000 and mobile 390×844 have no accidental horizontal overflow,
  clipped primary controls, or obscured focus targets.
- Current-run browser screenshots, interaction checks, and a combined reference
  comparison pass Product Design QA.

## Test command

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm check
git diff --check
```

## Security checklist

- [x] Guide state is presentation-only and comes from existing authenticated
      server truth or exact IDs already present in the owned session.
- [x] No raw KYC/PII, credential, signature, or unredacted actor data is added.
- [x] Guide actions call only existing authorized operations or focus existing
      controls; they do not bypass acknowledgement or approval gates.
- [x] No real-funds, withdrawal, capital, custody, or production permissions are
      introduced.
- [x] Agent authority remains Principal-controlled and is disclosed separately
      from the Human credit path.

## Implementation evidence

- Desktop guided state: `artifacts/ux-audit/WEB_011/guided-human-top-desktop.png`
- Desktop new-request state: `artifacts/ux-audit/WEB_011/guided-new-request-desktop.png`
- Mobile guided state: `artifacts/ux-audit/WEB_011/guided-human-guide-mobile.png`
- Reference comparison: `artifacts/ux-audit/WEB_011/aave-vs-guided-human-comparison.png`
