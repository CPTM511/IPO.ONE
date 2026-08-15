# WEB-019 design QA

## Comparison target

- Source visual truth:
  `/Users/cptmao/.codex/generated_images/019fa271-5a62-7ad2-8a1f-b55a46cf80f1/call_B9q7yS6GJv3ascasIHmx8Ok6.png`
- Source dimensions: 1487 × 1058 px.
- Browser-rendered implementation:
  `/Users/cptmao/Documents/IPO.ONE/artifacts/ui/web019-overview-desktop-1280x911-pass2.jpg`
- Implementation dimensions and CSS viewport: 1280 × 911 px at device density 1.
- Normalization: the source was resized to 1280 × 911 px because its aspect
  ratio matches the implementation viewport. The implementation was not
  rescaled.
- Same-input comparison:
  `/Users/cptmao/Documents/IPO.ONE/artifacts/ui/web019-design-qa-comparison-pass2.jpg`
- State: authenticated Human Workspace, active synthetic obligation, durable
  workspace recovery available, no-funds sandbox.

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: the implementation preserves the source's compact geometric
  hierarchy while using the repository's existing type stack. Headings, metric
  values, labels, pills, and sidebar text remain readable without low-contrast
  gray-on-gray treatment. Long metric values wrap without overlapping icons.
- Spacing and layout: the dark navigation rail, workspace switch, four-metric
  row, action hierarchy, and three product rows follow the selected direction.
  IPO.ONE's mandatory no-funds boundary adds one compact row above the source
  composition; all primary products and both next actions remain above the fold.
- Colors and tokens: graphite, white, lavender, and green semantic tokens retain
  IPO.ONE's identity. Foreground contrast is intentionally stronger than the
  secondary `o1.credit` reference.
- Image quality and assets: this screen contains no product photography or
  illustration. Existing repository SVG symbols are used consistently for
  interface icons; no emoji, placeholder art, CSS drawings, or approximate
  brand imagery were introduced.
- Copy and content: product labels are direct and commercial while remaining
  accurate to the no-funds pilot. Missing available-credit truth is presented as
  `Unavailable`; no amount, score, transaction, or Evidence claim is invented.
- States and interactions: Human/Agent workspace switching, Credit routing,
  More tools disclosure, mobile navigation, sign-in state, and sign-out controls
  were exercised. Browser console warning/error output was empty.
- Accessibility and responsiveness: semantic buttons and existing focus
  behavior are preserved. At 390 × 844 CSS px the navigation and metrics stack
  without horizontal overflow; the final density pass only removes redundant
  authenticated copy and reduces vertical spacing, without changing mobile
  breakpoints.

## Full-view comparison evidence

The pass-2 composite places the normalized source on the left and the final
browser capture on the right. It confirms the intended shared composition:
compact dark sidebar, top-level workspace switch, four account signals, one
dominant credit action, clear product rows, and progressive disclosure for
advanced tools.

IPO.ONE intentionally differs in three places:

1. It displays the no-funds safety boundary instead of implying production
   capital.
2. It keeps a secondary Agent authority action because Human and Agent are
   parallel first-class entry modes.
3. It shows only server-derived portfolio values, including `Unavailable` when
   the current protocol surface does not return available credit.

These are accepted product constraints rather than fidelity defects.

## Focused-region evidence

A separate crop was not required. The original-resolution 1280 × 911 browser
capture keeps the navigation labels, workspace switch, safety row, metric
labels and values, product descriptions, pills, and action controls legible.
Those regions were also exercised directly in the browser rather than judged
from the composite alone.

## Comparison history

### Pass 1 — blocked

- Finding: P2 above-the-fold hierarchy drift.
- Evidence:
  `/Users/cptmao/Documents/IPO.ONE/artifacts/ui/web019-design-qa-comparison.jpg`
- Difference: separate safety and authenticated-runtime panels plus a duplicate
  portfolio heading pushed the product entry rows below the first viewport.
- Impact: the implementation read like an internal status console instead of
  the selected action-first commercial workspace.
- Fix:
  - hide the redundant authenticated-runtime panel only after the workspace is
    positively connected;
  - retain the full panel for checking, blocked, and signed-out states;
  - keep the overview section heading accessible but visually remove its
    duplicate display;
  - tighten metric and product-row vertical rhythm;
  - move the server-recovery status below the product entries.

### Pass 2 — passed

- Evidence:
  `/Users/cptmao/Documents/IPO.ONE/artifacts/ui/web019-design-qa-comparison-pass2.jpg`
- Result: the four account signals, both primary actions, and all three product
  families are visible above the fold. Mandatory safety truth remains clear,
  readable, and distinct from commercial actions.
- Post-fix browser console warnings/errors: none.

## Verification

- `node --check apps/web/src/app.js`
- `node --test apps/web/test/*.test.js` — 94 passed.
- `pnpm run check:web-bundle` — passed.
- `pnpm run check` — 652 passed.
- `git diff --check` — passed.

## Follow-up polish

- P3: when the protocol eventually exposes an approved available-credit
  operation, the first metric can display that server-derived amount without a
  layout change.
- P3: recent verified activity remains immediately after the compact workspace
  details/recovery area and may require one short scroll on smaller desktop
  heights. This preserves the mandatory safety and server-truth context.

final result: passed
