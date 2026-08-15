# WEB-011 current-state UX audit

Audit date: 2026-07-17
Viewport: 1440×1000
Surface: authenticated Human private pilot

## Evidence

- `artifacts/ux-audit/WEB_011/current-human-top.png`
- `artifacts/ux-audit/WEB_011/current-human-workbench.png`

## Findings

1. **Critical — current state and primary action disagree.** The authenticated
   session has a restored Obligation, while the hero still says "Start
   application" and the application console shows a $0 pending Offer.
2. **High — no visible journey or next-step explanation.** Capability readiness
   is shown as a protocol table, but the user cannot see their completed steps,
   current step, or what will happen after the next click.
3. **High — technical detail precedes customer value.** Opaque Subject/Consent
   IDs, protocol terminology, receipts, and Agent authority configuration occupy
   the main Human path before progressive explanations.
4. **Medium — parallel product paths compete.** Human credit and Principal Agent
   setup are both expanded in one long page, weakening the primary Human task.
5. **Medium — safety language is present but fragmented.** "No real funds" is
   repeated, but the user is not given one concise explanation of what is and is
   not created at each step.

## Design response

- Add a lifecycle-aware journey guide with one next-best action.
- Change hero and workbench copy from static capability language to current
  customer state.
- Show an owned Obligation before a blank new-application console.
- Put identity references, protocol controls, proofs, and Agent setup behind
  clear progressive-disclosure labels without removing access.
- Keep the existing dark graphite, lavender accent, white cards, spacing,
  typography, and native controls established by the current design system.

## Post-implementation verification

- The restored authenticated session now opens at `Step 4 of 5`, labels the
  next action `Review activation`, and hides the empty application and Offer
  consoles until the user explicitly starts another request.
- `Start another request` exposes the bounded application and Offer workbench
  while preserving the current Obligation. `Return to current credit` restores
  the current-position-first presentation without a server mutation.
- Desktop 1440×1000 and mobile 390×844 both report zero page-level horizontal
  overflow. The mobile guide presents all five stages and keeps both actions
  fully visible.
- The combined comparison confirms the intended Aave-inspired hierarchy:
  graphite proposition surface, clear primary/secondary actions, overlapping
  white operational cards, restrained lavender emphasis, and dense current-
  credit information. IPO.ONE retains its own product semantics and assets.
