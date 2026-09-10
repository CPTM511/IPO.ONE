# WEB-027 Precision Terminal design contract

Selected source: `web-027/precision-terminal-reference.png`, SHA-256 `dd2f9ca115187c01825f41f03feb470adbb450a47b7f71fa6f9bc0f0ace06f25`. This is a visual reference, not financial/identity truth.

## Tokens and reusable behavior

Implementation: `apps/web/src/workspace-experience.css`, `workspace-experience.js`, existing guarded `app.js` controls. Public WEB-012B composition remains in its existing scope. No external font, icon, animation or production dependency added.

| Token / rule | Dark | Light |
| --- | --- | --- |
| Canvas / surface / elevated | `#0d1419` / `#131d23` / `#1a272d` | `#f4f7f6` / `#ffffff` / `#eaf0ee` |
| Main / secondary text | `#edf3f2` / `#a5b4b8` | `#152420` / `#52645e` |
| Accent / selected surface | `#7bd9c8` / `#1b3335` | `#166a58` / `#e0f0e9` |
| Primary action background / text | `#7bd9c8` / `#082521` | `#176d5b` / `#ffffff` |
| Border / strong border | `#2a3940` / `#62777e` | `#d3dfda` / `#8b9e96` |
| Success / warning / danger | `#86d6b3` / `#e6be70` / `#ff9db0` | `#176d50` / `#805c16` / `#b6334c` |

Use existing Inter/system stack, tabular numbers, 14–16px working text, 27–34px scene titles and 25–36px decision figures. Existing fixed metadata may remain smaller; essential amounts and action consequences stay readable and are never conveyed by color alone. No display font or fictional avatar is introduced. Existing `/icons.svg` supplies the Agent bot icon.

Desktop sidebar is 224px; topbar is at least 72px. Agent authority uses a flexible main region and a 320px decision region with a 32px gap. The decision card becomes normal-flow content below 1180px. At narrow widths the terms precede the action, labels wrap and the existing drawer preserves visible navigation. Four primary role destinations maximum; More tools preserves every other allowed entry. Table and term rows use thin separators, modest 4–8px radii and no decorative glow.

Primary actions have at least 44px height. Navigation and buttons use 120–140ms interaction transitions. Reduced-motion disables them and smooth scrolling. Focus outlines are visible around native interactive controls and programmatic destinations. Actual enabled action colors are browser-checked at >=4.5:1 in both themes. Theme preference survives reload; Light is independently styled.

## State and content

- Agent setup uses the original form controls and handlers, moved into the Principal surface. No duplicate identity, hidden replacement action or frontend authority model.
- Principal/Agent names, limits, purpose, provider, expiry and account proof come from authenticated state. Missing values are honestly described. Draft says “Prepares authority for”; only active authority says “Authorizes”.
- The exact Mandate acknowledgement stays unchecked until the user checks it. “Activate sandbox Mandate” retains the same server guard and economic/authority semantics as the former longer label. Reviewing a current Offer cannot create a fresh application.
- Human new-request guidance requires fresh Consent, then terms, then Offer review; returning to the current plan restores its own server-derived Consent reference.
- Empty, loading, failure, unavailable and completed states retain visible reasons/recovery. No funds, synthetic and chain-evidence boundaries remain accurate. Read-only Evidence recovery does not replay an economic Agent goal.
- Do not use source-image sample amounts, fake identity/health labels, legal names or assertions as product data.

## Quality evidence

Root `design-qa.md` records source/render comparisons, intentional deviations and the Capital contrast correction. Browser captures cover Dark/Light, 1440/1058/1024/768/390/320 widths across role workspaces. Fixture screenshots prove layout only. The separate durable browser reports prove individual authorized operations. Neither substitutes for full deployed product acceptance.
