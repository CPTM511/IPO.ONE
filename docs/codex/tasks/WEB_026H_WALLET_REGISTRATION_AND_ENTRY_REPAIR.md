# WEB-026H — Wallet registration and automatic workspace entry

Status: local repair deployed and browser-verified with independent QA wallets; Founder wallet retry pending. Product verdict: `BLOCKED — NOT COMPLETE` until the reported wallet path is confirmed by the Founder. Founder explicitly requested repair of wallet registration/login after a signed message on local 8896 (2026-09-06).

## Context

The real Chrome page reports `credential is not active`; the connected wallet differs from the local invited wallet. The local runtime does not enable ordinary verified-wallet enrollment. The controller entry also defaults to Human Borrower, and successful login waits for a second Continue click. WEB-026F tested an invited QA wallet and therefore missed the first-visit registration defect.

## Scope / authority

Fix local no-funds ordinary Human/Principal registration using the existing reviewed 0072 verified-wallet provisioning function and exact role profiles. Activate only through an explicit local runtime option, a separate durable v2 reference key, and the existing v1 lookup compatibility path. Do not attach a new wallet to the seeded pilot identity. Never revive revoked credentials or grant management roles. Correct presentation role defaults and automatically bootstrap after successful server verification. The user's concrete repair request supplies local implementation/activation authority; no cloud or real-value change is included.

## Files and acceptance

Authentication runtime config, local private-pilot composition, credential registry fallback guard, access UI, and regression tests. New generated wallets must register and enter their intended workspace using real signatures and durable PostgreSQL. Existing invited wallets remain compatible. Reject bad signatures, replay, revoked identity, cross-tenant reads and privileged roles. Refresh/re-login preserves the new identity. Verify default Principal on controller host, auto-entry without Continue and visible recoverable errors. Deploy exact source to the existing local endpoints and retest visible login.

## Checks / migration / rollback

Run authentication/web unit tests, security/transport suites, PostgreSQL integration, and real-browser first-registration tests on a restored database before local activation. No new migration or role capability expansion is required. Retain existing backups; back up current live data before cutover. Roll back the immutable application/config to WEB-026F without deleting newly enrolled identities. Preserve v2 material so a rollback cannot destroy identity recovery.

## Completion evidence — 2026-09-06

- CODE: source `0211f75120003a1000a81ea0e1e4f6c6230b446b`; initial registration/UI repair `e9afc46d28962f164b8a26e00152af2dc757ad67`, followed by a restart compatibility fix. Retired invitation credentials are historical and never have role authority recreated during startup.
- RUNTIME: `ipo-one-web026h-review` and `ipo-one-web026h-worker`, healthy, read-only root, dropped capabilities, readonly secret mounts, no mutable `/app`, exec-form health checks, restart policy `unless-stopped`.
- DEPLOYED: existing local ports 8895–8898 now run immutable image `ipo-one-web026h:0211f75`, digest `sha256:eb9cec70c5a072c39adb642008f1f6c6db9089d6dceaba514ee8e6232277013f`. No cloud release or funds authority. Schema remains 0073; no migrations were required.
- REACHABLE: [Agent entry](http://127.0.0.1:8896/#agent-console) and [Human entry](http://127.0.0.1:8895/#request-credit). All four current local health endpoints pass.
- VERIFIED: real browser clicks and locally generated EVM signatures against the deployed services and durable PostgreSQL. Fresh Human/Principal wallets enter automatically with zero Continue clicks. Refresh and logout/relogin work. The isolated final candidate also passes process restart with its active browser session, plus the legacy invited wallet and pre-existing repayment balance. New wallet identities remain distinct from seeded identities, with only the existing ordinary role enrollments. Invalid signatures and management self-enrollment fail; existing Agent proof works and replay fails. Founder retry with the reported OKX wallet is still pending.

Checks: authentication/web 240/240, security 35/35, transport 91/91, private-pilot unit 91/91, final PostgreSQL integration 96/96. Source/boundary lint and whitespace checks passed. Initial browser-test expectations were corrected to use the actual Human workspace title and browser-sent secure session cookies; neither correction changed production behavior. The restart regression discovered a real retired-enrollment startup defect, which is fixed in the final source and covered by the browser restart check.

Evidence directory: `/Users/cptmao/Documents/IPO.ONE/output/playwright/web-026h-wallet/`. Authoritative records: `build.json`, `copy-final-browser.json`, `copy-final-audit.json`, `cutover.json`, `live-browser.json`, `live-audit.json`, plus final screenshots and test logs. Earlier `copy3` records belong to the superseded candidate.

Reproduction (from this worktree): `node scripts/web026h-browser.mjs 8915 <unique-copy-stage> restart` against the isolated copy; `node scripts/web026h-browser.mjs 8895 <unique-live-stage>` for deployed browser acceptance; `node scripts/web026h-audit.mjs <base-port> <same-stage>` for identity/runtime verification. These use generated local QA wallets in protected ignored storage and never sign with the Founder's wallet. `web026h-runtime.mjs` records the immutable build, isolated regression setup and scoped local cutover; its destructive test command targets only the named fresh test database.

Before cutover the current review database was backed up to protected `web026h-pre-cutover.dump`, SHA-256 `5b882a68d3e9f953c8a64a0ad137c3b6e1efca0776429c780571782429f67ebb`. Previous application/worker containers remain stopped and preserved. Keep both v1 and v2 material and the 0211f75 retired-enrollment startup fix in any later rollback after a legacy identity has rebound; do not erase new identities or reactivate historical credentials. Runtime stays available for Founder review.
