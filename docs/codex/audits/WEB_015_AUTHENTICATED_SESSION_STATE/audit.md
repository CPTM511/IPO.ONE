# WEB-015 Authenticated Session State Audit

Date: 2026-07-27

Result: Passed.

## Confirmed defect

The access dialog stayed in its sign-in presentation after the server had
established a valid session. It only changed an inline status string and did
not provide a clear authenticated confirmation, Continue action, or Sign out
control.

The top-bar label could also show a connected wallet address without a verified
IPO.ONE session. In the local private-pilot profile, a valid host session and
CSRF bootstrap were not probed when authentication discovery was unavailable,
so the shell rendered that authenticated session as signed out.

## Implemented correction

- Wallet connection and server-authenticated session are now separate states.
- A verified session changes the top bar to `Signed in` and presents
  `Workspace session verified`, `Continue to workspace`, and, where supported,
  `Sign out`.
- Continue closes an already verified dialog and restores focus to the product
  surface. After wallet verification it performs the required CSRF-bearing
  shell reload.
- Sign out reuses `/auth/v1/logout` with same-origin credentials, the current
  CSRF value, and one idempotency key.
- A pre-provisioned private-pilot session may prove itself through the
  authenticated Tenant catalog even when authentication discovery is disabled.
- Public sandbox and unavailable-authentication profiles remain fail-closed.

No authentication endpoint, provider, role, permission, cookie, funds,
protocol, risk, or deployment boundary was added or changed.

## Browser evidence

- Authenticated desktop state at 1440×1000:
  `artifacts/product-design-audit/2026-07-27-auth-session/02-authenticated-session-desktop-1440x1000.png`
- Authenticated mobile state at 390×844:
  `artifacts/product-design-audit/2026-07-27-auth-session/01-authenticated-session-mobile-390x844.png`
- Desktop and mobile had no page-level horizontal overflow.
- Continue closed the dialog, restored focus to `mainContent`, and preserved
  the authenticated state.
- Sign out returned the fixture to `Sign in` and `Sign-in required`.
- The auth-discovery-disabled private-pilot fixture still verified the
  pre-provisioned session.
- Browser warning and error logs were empty.

## Verification

- Repository check: 557/557 passed.
- Security suite: 33/33 passed.
- Transport suite: 52/52 passed.
- Static web suite: 7/7 passed.
- JavaScript syntax checks passed for the shell and both browser fixtures.
- `git diff --check` passed.

The wallet registry and SIWE security suites exercise the wallet authentication
boundary; the shared frontend state test verifies that wallet verification
enters the pending workspace-bootstrap state without treating a mere wallet
connection as login.
