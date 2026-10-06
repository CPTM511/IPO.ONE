# Current IPO.ONE product UI baseline

Effective 2026-09-11, Founder correction for BNB-002.

The current internal product interface is WEB-027 **Precision Terminal**,
including the later startup and theme-contrast fixes through source 86b648f.
BNB-001's e2e98bf build was based on an older branch and is superseded for UI.
The public marketing page retains its separately approved brand design.

Before feature development, compare the checkout and target runtime with this
baseline. Integrate current product UI and behavior before adding a feature;
never treat a historical branch or a passing functional test as current UI.
Do not copy isolated CSS onto incompatible older markup/application logic.
Preserve the current saved Light/Dark/System preference.
Access dialogs must resolve their own current theme tokens even when opened
above the public page. Header emphasis, close buttons, provider badges,
selected wallet borders and session steps are covered by rendered regressions;
legacy public-page selectors must not override those product controls.

Run `pnpm check:ui-baseline` and the affected functional checks. Review actual
rendered login/network dialogs and affected role journeys at desktop and narrow
widths, using current source and runtime assets. Verify that CSS loading failure
shows a recoverable failure rather than a legacy fallback. Backend static assets
must resolve from the same source tree as the serving module, never the shell's
working directory. Provide the exact runtime revision and clickable review URL.

Update this versioned baseline and its executable guard deliberately when a
new UI direction is approved; do not remove the guard to make an old build pass.
