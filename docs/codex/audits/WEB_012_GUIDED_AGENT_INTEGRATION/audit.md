# WEB-012 current-state Agent integration audit

Audit date: 2026-07-17
Viewport: 1440×1000
Surface: authenticated private Agent workspace and local Agent API

## Evidence

- `artifacts/ux-audit/WEB_012/01-current-agent-entry.png`
- `artifacts/ux-audit/WEB_012/02-current-agent-api.png`
- `artifacts/ux-audit/WEB_012/03-current-principal-setup.png`

## Flow and findings

1. **Agent Workspace — needs work.** The screen starts with Subject registry
   fields and a partially clipped setup action. It says Principal authorization
   is required but does not show a staged path, current step, or resulting
   machine artifact.
2. **Agent API — critical.** The first product surface is a raw capability JSON
   packet beside eleven waiting tool rows. Exact protocol truth is valuable, but
   it precedes the intended outcome, role split, and next action, so a complete
   integration surface reads like a technical plugin.
3. **Return to Principal setup — broken handoff.** The control changes to the
   Human home, leaves the Agent authority disclosure closed, and focuses the
   page shell rather than the requested workbench. The user cannot see where to
   continue.

## Accessibility and evidence limits

- The captured desktop views show strong contrast, semantic native controls,
  and readable protocol copy, but the clipped setup action and failed focus
  destination make the primary path unreliable.
- Screenshots alone do not prove keyboard order, live-region behavior, or
  reduced-motion compliance; those require interaction checks after the fix.
- This audit evaluates the waiting authenticated state. Draft and active packet
  states are covered by contract tests and must be rendered from the same
  capability manifest during implementation QA.

## Design response

- Lead with an Agent integration outcome and one server-truth-driven next step.
- Explain Principal and Agent responsibilities side by side before protocol
  fields.
- Present authorization, account proof, application handoff, and runtime as a
  short readiness path.
- Preserve raw packet, tools, SDK, and logs under a clear technical-details
  disclosure rather than deleting them.
- Open and focus the existing Principal authority workbench for every setup
  handoff.

## Post-implementation verification

- The authenticated waiting state now opens with one commercial outcome, a
  four-stage integration path, explicit Principal/Agent role boundaries, and
  the server-truth next action `Authorize Agent`.
- Raw capability JSON, eleven MCP tools, SDK guidance, and request telemetry are
  preserved under `View handoff packet, 11 MCP tools, SDK, and request log`.
- `Authorize Agent` and `Return to Principal setup` now set the authority
  disclosure to open, focus `#agentAuthority`, and place it 88px below the
  sticky header in the 1440×1000 browser check.
- Desktop and 390×844 mobile checks report zero page-level horizontal overflow.
  Both hero actions and all four integration stages remain visible and bounded.
- The combined comparison confirms the approved Aave-inspired hierarchy while
  retaining IPO.ONE's own authority, MCP, Evidence, and no-funds semantics.
