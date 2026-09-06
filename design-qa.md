# WEB-027 design QA

Source visual truth: `docs/design/web-027/precision-terminal-reference.png`.
Implementation: `output/playwright/web-027/authority-1440-dark.png` and `authority-1440-light.png`; real-service state captures in `output/playwright/web-027/durable-agent-authority.png`, `durable-agent-result.png` and `durable-human-fully-repaid.png`.

Source dimensions: 1487×1058 pixels, raster concept with no recorded CSS/device scale. Implementation: 1440×1024 pixels at 1440×1024 CSS, device scale 1. No screenshot resampling or image editing. The 47px width and 34px height differences are explicit; this is a composition/state comparison, not a pixel-diff score. Source is a fictional Draft review; implementation is the corresponding real guarded Draft review using clearly marked fixture data for repeatability. Live amounts and timestamps intentionally differ.

## Comparison and iteration history

The source and implementation were opened together in the same tool comparison input, first before the final copy/icon refinement, then again after it. Full-view comparison includes the whole left navigation, heading, main term block and right action card. Essential text, checkbox, button and icons are readable at 1:1; focused review of those regions used the same original-resolution pair, so a separate resampled crop was unnecessary.

| Finding | Impact / correction | Post-fix evidence |
| --- | --- | --- |
| P1: inherited primary-button styling overrode the new action colors | Legacy selectors produced unreadable action text. A single scoped semantic action rule now controls foreground/background without changing event handlers. | `authority-1440-dark.png`; enabled-button contrast >=4.5:1 browser assertions in both themes. |
| P2: long Agent activation copy consumed the decision area | Retained exact-action acknowledgement and the existing Offer boundary, shortened repeated prose, and placed the real library bot icon next to the object heading. | Latest authority 1440 Dark/Light; the main action is visible at approximately y=700px in the Draft desktop state. |
| P1: Capital selected application kept a pale fixed background under white text | Replaced fixed selection/hover backgrounds with shared accent-muted tokens, including non-button selected rows. | `output/playwright/web-026/capital-1440-dark.png`, recaptured after the correction. The selected title is visibly readable. |
| P2: public initial layout jumped from x=192 to x=0 during startup | Reserved the correct full-width public geometry before deferred experience initialization. | Public-quality before/after: 0.16944 on WEB-026H versus 0 on final 7f691f1 in three interleaved local runs; no auth or navigation behavior changed. |

## Systematic review

- Typography: existing type stack, strong object heading, tabular two-column amounts and quieter metadata match the reference hierarchy. No oversized marketing heading replaces operational content. Actual controls use normal words and explicit mutations.
- Layout/spacing: 224px sidebar and 320px right review panel retain the chosen visual structure. A real sandbox banner, technical disclosure and application receipt add vertical content absent from the concept; they remain accessible. Authority details stack at narrow widths without horizontal overflow.
- Colors: graphite/mint selected direction, independent Light palette, distinct semantic states. No fabricated live-health green indicator. Buttons and selected Capital rows use theme tokens.
- Images/icons: source's fictional logos/avatars and company footer were intentionally omitted. Real brand assets and the existing bot/icon sprite are used; no approximate SVG illustration or CSS art.
- Copy/state: Draft/Active distinction, exact Mandate acknowledgement and no-funds consequence are explicit. Completed Evidence can be read after refresh without another runtime goal. Human current-plan and new-request states are separate.
- Additional inspected renders: Human/Agent tasks at 1440 Dark; authority at 390 Dark and 1440 Light; Capital at 1440 Dark; Risk at 390 Light. All four role layouts are captured/tested in six widths and both themes. Initial Capital/Risk screenshots were fixture-only. J1 now separately verifies real local invited login/recovery; `capital/partner.png` is a durable-service render. Risk MFA-protected operations remain blocked.
- Interactions: native navigation, More tools, theme, current-plan action, Agent review/activation, keyboard disclosure focus, login error recovery and reduced-motion checks pass in browser suites. Actual Human/Agent signed flows use durable local services and isolated QA wallets, without API response mocks.

## Intentional differences and remaining acceptance

The source falsely says a Draft “Authorizes” and invents names, limits, health and legal claims. The implementation corrects those rather than copying them. The real exact-action checkbox and technical recovery disclosure add necessary content. No arbitrary “all functions complete” claim follows from this visual match.

Visual corrections above are addressed. WEB-027J repaired invited login, legacy reports, Principal execution binding and fresh Principal Agent provisioning. Overall product handoff remains blocked by Human Subject activation, real Risk MFA and the remaining whole-site semantic acceptance matrix. Screen presence is not capability acceptance. Full 200% browser zoom and final hosted role acceptance remain to be recorded before release.

final result: blocked

## WEB-027J follow-up

Inspected the actual fresh Principal `j4/before-restart.png` and Capital `capital/partner.png`, with the selected Precision Terminal layout retained. New local Agent enrollment/revocation controls reuse the same native button and form system. Exact runtime and schema hashes were verified separately. Full browser regression has 29 covered cases after the five Agent-host fixture cases were corrected and retested; no fixture result is substituted for durable login or authority.
