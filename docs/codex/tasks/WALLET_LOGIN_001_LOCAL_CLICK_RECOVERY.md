# WALLET-LOGIN-001 — Local wallet click recovery

Status: IN PROGRESS — local repair validated; publication authorized on 2026-10-08 03:48 UTC. Real wallet acceptance remains BLOCKED — NOT COMPLETE until user verification.

## Context and authority

Baseline: origin/main `01325c7546edbd50f906489b1b4212c526d78ed2`, WEB-027 Precision Terminal and approved subsequent fixes. User reports no response after wallet sign-in clicks on BNB Smart Chain (56) and BSC Testnet (97), including a personal Germany VPN comparison. This observation establishes no geographic cause or bypass authorization. Apply AGENTS.md, PRODUCT_CONSTITUTION.md and engineering standard sections 4, 9–11. The user's explicit local-only instruction supersedes the general deployment follow-up requirement for this task.

## Scope, non-goals and likely files

Reproduce visible clicks against current deployed assets without production writes. Bound pending wallet/authentication steps, show actionable phase/error feedback, discard interrupted/stale continuations and test both required BNB profiles. Inspect provider discovery including OKX. Likely files: apps/web/src/app.js, a focused wallet-login lifecycle helper, wallet provider registry if discovery evidence requires it, Tenant web asset map, focused unit/browser tests.

Initial stage prohibited publication. User subsequently explicitly authorized submitting this fix to GitHub, merging after CI passes, and deploying to ipo.one (2026-10-08 03:48 UTC, “允许”). Publication must stage and verify a candidate before promotion, retaining the current production rollback. Add the focused browser gate to Quality Gate and isolate its fixture from the existing full browser configuration. No real signatures, funds, new credentials, VPN/security setting changes, marketing, alternate-chain replacement or modifications to the original dirty repository/Anvil workspace. Controlled provider/backend fixtures are regression evidence only, never deployed-wallet acceptance.

## Acceptance criteria

- Given a selected wallet and either chain 56 or 97, clicking sign-in requests an account, verifies/switches the exact chain, then prepares an exact-role challenge; it never submits a transaction.
- Given a pending wallet popup, duplicate clicks issue no duplicate account requests and the UI visibly explains the next action. A deadline provides recovery and late resolution cannot request a signature.
- Given rejection, pending-request/provider/network/service failures, display the relevant reason and recovery action. Actual location restrictions remain enforced; never infer them solely from an ambiguous error.
- Given close/Escape, provider replacement/disconnection, or post-connect material account/chain changes, a stale operation cannot advance to a signature or verification.
- Given no provider, retain visible discovery guidance; desktop/mobile and both themes remain operable with no application errors.
- Actual BNB 56/97 wallet connection and SIWE acceptance require user-controlled wallet action; stop before that action and report the limitation.

## Validation commands

`node --test apps/web/test/wallet-sign-in-attempt.test.js apps/web/test/wallet-provider-registry.test.js apps/web/test/evm-wallet-connector.test.js apps/web/test/wallet-authority-lifecycle.test.js apps/web/test/authentication-availability-presentation.test.js`

`pnpm test:browser:wallet-sign-in` runs the isolated browser gate; use `IPO_ONE_WALLET_REVIEW_PORT=42920` while the user demo occupies 42919. Initial 40/40 browser cases and the focused 61/61 unit/regression cases passed; two account-isolation browser cases were added during publication. Full unit suite passed 1431/1431, security 35/35, transport 99/99 after its exact import allowlist was extended. UI baseline, source lint (919 modules), boundary lint, web bundle integrity (48 authored modules) and `git diff --check` passed. Existing loopback listeners were preserved; an occupied test port was replaced with unused 42919.

Local `pnpm check` reached the PostgreSQL gate and stopped because this isolated worktree has no DATABASE_URL. No existing user database was accessed and no check was skipped or weakened. Required cloud Quality Gate must pass the complete aggregate check with its existing isolated PostgreSQL service, the existing 65-case browser suite and the new wallet suite before merge.

## Security, permissions, migration and rollback

Preserve selected-provider semantics, approved network allowlist, exact-role authentication, SIWE challenge validation, authority quarantine and all no-funds boundaries. No credentials, addresses, signatures or personal data in diagnostics. No schema/DB migration or production configuration changes. Local loopback and public GET/HEAD only for live checks; fixture POSTs remain local and synthetic. Rollback: discard this isolated branch/worktree after retaining evidence; original checkout remains untouched.

## Dependencies and evidence

Local branch: `codex/wallet-login-local-20261008`. Offline frozen dependency installation passed. CODE and RUNTIME are local-verified; REACHABLE at http://127.0.0.1:42919/. Initial local stage performed no commits or external writes. Subsequent publication follows the explicit authorization above; exact PR, CI, candidate, production SHA and rollback evidence are captured in the publication handoff. Real hosted SIWE acceptance remains pending.

Confirmed defect: an unresolved wallet RPC previously left the click busy forever; close/Escape and pre-session material changes could leave an old asynchronous login continuation active. Fixed with synchronous click dispatch, bounded connect/challenge/signature/verification steps (60/20/120/20 seconds), explicit phase/error recovery, abort propagation and late-result guards. Post-connect account/chain changes now interrupt the pre-session attempt while expected connection-time chain switches remain allowed. Verification transport uncertainty explicitly requests a session refresh rather than asserting no session was issued.

Live evidence: `../candidate-audit/wallet-click-live-repro.json` relative to the checkout's parent. Actual deployed assets request eth_requestAccounts on both 56/97; rejection feedback works; a controlled pending Provider remains busy. This does not identify the user's real Provider or establish geofencing. The deployed page issued no POSTs in this reproduction.

Local evidence: `output/wallet-sign-in/results.json`, screenshots and `served-assets-proof.json` (exact source/served hashes for app.js, connector, new helper and styles). Browser providers and challenge responses are synthetic; no cryptographic signing occurred. OKX EIP-6963 and Binance namespace discovery were exercised; real extension versions and real WalletConnect relay/pairing were not tested.

Founder review: open the loopback URL in the normal wallet-enabled browser; Open IPO.ONE → select a discovered wallet → select BNB Smart Chain 56 or BSC Testnet 97 → Connect & sign in with wallet → user approves only account access/network switching. The local host rejects challenge/verify with local_review_signature_boundary and never produces a message to sign, authenticated session, credential or economic authority. Repeat for both required chains. A successful local connection is a diagnostic milestone, not hosted SIWE acceptance. Do not use alternate chains as a replacement.

User-reported real connection acceptance received during publication: “我都尝试了，都可以，OKX wallet下用BNB和BNB testNet都可以，我还切换了OKX不同账号都可以”. This confirms the user's local-demo OKX account connection/network switching on both required chains and multiple accounts; it is not independently observed hosted SIWE or workspace recovery acceptance. Added exact-account isolation browser regressions for both chains. Transport conformance's exact import allowlist now includes the newly served helper without weakening the guard.

Limits: provider RPC cancellation cannot dismiss a wallet's own popup. Dismiss pending requests before retrying. An HTTP abort cannot revoke server-side verification already accepted; uncertain verification requires checking server session truth. Original dirty repository and Anvil workspace were not used or changed. User-controlled signature and separately authorized deployment/live acceptance remain necessary before claiming BNB login is complete.
