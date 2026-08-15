# UX-006 Gate 2 browser evidence

Date: 2026-08-13 (Asia/Shanghai)
Environment: isolated authenticated Principal QA host, current working-tree Web assets
Funds/deployment: no mutation during navigation/session tests, no deployment

## Result

- Home → Credit → Obligations creates real browser history. Back returned to
  Credit then Home; Forward returned to Credit. No Tenant mutation was sent.
- `#bogus` canonicalized with replacement to `#overview`. The native
  `#mainContent` skip link retained the active product view and focused the main
  landmark instead of being treated as an invalid product route.
- Sign-out cleared private state, canonicalized to `#overview`, left the access
  dialog closed, focused `#signedOutPrivacyAction`, hid the interaction-mode
  switch, and exposed only Home in visible primary navigation. Visible disabled
  controls: 0; no automatic dialog reopen.
- A signed-out request for `#obligations` was retained as one short-lived,
  presentation-only intent. Test-only OIDC reauthentication restored the exact
  authorized `#obligations` view after server workspace recovery. The intent was
  not used as authority. Authentication audit was logout → login start → login
  complete; Tenant operations after re-login were reads only.
- Console errors/warnings across the final navigation, sign-out, skip-link, and
  intent sessions: 0.

## Final screenshots

- `navigation-history-deeplink-final.png`
- `signed-out-landing-final.png`
- `post-login-intent-final.png`

Pure tests separately cover invalid, expired, malformed and cross-role intent
rejection. This evidence is local synthetic/no-funds only and makes no
production availability claim.
