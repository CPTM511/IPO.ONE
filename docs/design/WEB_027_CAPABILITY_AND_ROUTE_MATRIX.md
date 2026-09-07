# WEB-027 capability and route acceptance matrix

Founder requirement: every previously usable capability must remain usable and be confirmed through visible clicks. **BLOCKED — NOT COMPLETE**. All-site 100% acceptance has not been reached. A preserved button, fixture success, shared CSS or working homepage is never counted as a functional pass.

## Environment and five-state evidence

Code baseline: integrated `c585b50` over main `7ce4b95`, preserving WEB-026 through `4e61f19`. Functional corrections: `734f4d4`, `3d7b585`, `a8ab3a8`; final visual corrections follow in the same branch. WEB-027J final functional source is `68c5036`, with additive migrations 0076–0078. Current installed source/image is recorded in `output/playwright/web-027/candidate-runtime.json` and `candidate-build.json`.

`L` below means installed **local** candidate at ports 8935–8938, durable PostgreSQL `ipo_one_web027_candidate`, no response mocks and no `preview_data=fixture`. **DEPLOYED to the formal website = NO for every row.** Original Founder service 8895–8898 and its database remain intact. Code and local runtime availability do not fulfill the repository's final hosted five-state gate.

| Capability ID / source | Role and visible entry | CODE / RUNTIME / local installation | REACHABLE | VERIFIED behavior / remaining gap | Issue / dependency |
| --- | --- | --- | --- | --- | --- |
| W027-PUBLIC / existing public site | Public → Home, Log in, Whitepaper | Implemented / L | Public login open/close clicked | Public narrative retained; interactive illustration/Whitepaper regression passes. Public entry measured against old service. External destinations and formal site not yet accepted. | C/G/H |
| W027-AUTH-H / WEB-026H | Human → Log in → wallet → sign | Implemented / L | Yes | Real isolated signature → automatic entry; fresh registration, refresh, logout/login and candidate process restart. No extra Continue click. | C |
| W027-AUTH-A / WEB-026H | Principal → Log in → wallet → sign | Implemented / L | Yes | Same real signature/recovery checks. Successful sign-in does not prove an Agent is assigned. | C/E |
| W027-AUTH-ERROR / existing access contract | Login → reject signature / retry | Implemented / L | Yes | Cancel/retry preserved. Pre-enrolled Capital/Risk selected-role login works; unknown wallets, role/host mismatch and revoked enrollment are denied. Full real-device wallet matrix pending. | C/G/J1 |
| W027-NAV-H / workspace manifest | Human Next/My credit/Activity/Settings/More tools | Implemented / L | 10/10 allowed views clicked | Current-plan, portfolio and advanced entries preserved; refresh and re-login recover. Page reachability is separate from the operations below. | A/C/D |
| W027-NAV-A / workspace manifest | Principal Tasks/Agents/Activity/Settings/More tools | Implemented / L | 10/10 allowed views clicked | Agent page now presents the actual Agent authority form instead of Human onboarding. Original controls preserved exactly once. | A/B/E |
| W027-H-PREP / Human pilot | Next → Create sandbox profile → Consent | Implemented / L | Yes | Fresh test wallet creates Subject, scoped Consent and synthetic references, then an explainable Offer. No raw PII. | D |
| W027-H-REQUEST / Human pilot | Next → request terms → Review Offer | Implemented / L | Yes | New request obtains a separate Offer; fresh Consent required. Return-current restores original plan context. | D |
| W027-H-ACCEPT / shared kernel | Offer acknowledgement → Accept → exact wallet confirmation | Implemented / L | Yes | Actual accepted Obligation created with server confirmation; no hidden mutation behind navigation wording. | D |
| W027-H-EXEC / shared kernel | Current plan → activation → exact confirmation | Implemented / L | Yes | Existing controlled synthetic execution completes and is reflected in the durable Obligation. | D |
| W027-H-REPAY / shared kernel | Review next payment → amount → exact confirmation | Implemented / L | Yes | Partial $2.50 on $24.50, then remaining $22.00 repaid; current Obligation $0 survives refresh. Other historical positions retained. | D |
| W027-H-HISTORY / owned Evidence | My credit → select position → Load Evidence | Implemented / L | Yes | Actual owned read returns 13 events after full repayment; no chain broadcast. | D/G |
| W027-H-SERVICE / prior servicing UI/API | Applicable servicing/Case controls | Code retained / role-dependent | Case filing/list clicked | Categorical support Case and Risk assign/uphold/correct work. DPD/default/restructure/repurchase/write-off operator mutations are not covered by ordinary Human login and remain UNVERIFIED in this candidate. | F/G, privileged access |
| W027-A-PROOF / existing and dedicated local Agent | Agents → create signing request → prove account | Implemented / L | Yes | Fresh dedicated Agent proves its actual test account on the main candidate. Exact Principal ownership and server-derived account enforced; no credential enters browser. | E/J4 |
| W027-A-AUTH / exact Mandate | Agents → Draft → application → review → checkbox → activate | Implemented / L | Yes | Fresh Principal path repeated on final 68c5036, exact limits/Offer and unchecked acknowledgement preserved. | E/J4 |
| W027-A-RUN / shared Agent kernel | Tasks → Complete sandbox Agent lifecycle | Implemented / L | Yes | Fresh dedicated Agent executes approved synthetic $100 provider spend, repays $100, returns owned Evidence and $0 outstanding on final source. Preassigned Agent preserved. | E/J4 |
| W027-A-RECOVER / runtime credential | Tasks → Verify Agent Evidence; Agents → Revoke local runtime credential | Implemented / L | Yes | Exact durable recovery after refresh/restart; Evidence verification sends no economic replay. Cross-Principal read/sign/revoke denied. Revocation survives restart and logout/login; create cannot revive it. | E/G/J4 |
| W027-A-NEW / explicit local onboarding | New Principal → Agents → Create my sandbox Agent | Implemented / L | Yes | Dedicated Principal-bound identity/runtime created once; full lifecycle passed. Server-held local credential uses existing shared Gateway/SDK/MCP path. No production Agent enrollment claim. | E/J4 |
| W027-PORTFOLIO / shared obligation view | Human My credit / Principal More tools → Obligations | Implemented / L | Yes, both roles | Refresh, select and reload exact owned position; Fully Repaid and 0 outstanding confirmed. | D/E/G |
| W027-TRACK / finalized outcomes | More tools → Credit Track Record → Load verified record | Implemented / L + worker | Yes, both roles | No record before terminal repayment; real worker materializes terminal outcomes; both roles then read `tenant_owned_credit_state_view.v1`. No invented score or automatic limit change. | D/E/G |
| W027-PASSPORT / permissioned Decision artifact | Human More tools → Decision Passport | Implemented / L | Yes | Fresh unaccepted Decision → issue/read/exact self-verifier round trip/revoke. Same-Decision revoked artifact correctly cannot be reissued. Exact Capital Partner sharing/inbox and unaccepted Offer authoring/withdrawal are now verified; accepted/executed/fully-repaid Capital Facility is verified by L; exceptional servicing remains unverified. | D/F/G |
| W027-FEEDBACK / existing pilot | Next → Share product feedback | Implemented / L | Yes | Submit receives durable receipt. | D/G |
| W027-CASE / existing pilot | Next → Get help with a record → file/refresh | Implemented / L | Yes | Closed-category Case filed and listed against an owned record. Risk processing not yet verified. | D/F/G |
| W027-REPORT-H / official report | Human More tools → Reports & Exports | Implemented / L | Yes | JSON and CSV create/read/download with matching SHA-256, revoke and refresh recovery passed on 68c5036. | F/J2 |
| W027-REPORT-A / official report | Principal More tools → Reports & Exports | Implemented / L | Yes | Same complete JSON/CSV check passed; Agent owner/controller relationships preserved correctly. | F/J2 |
| W027-WALLET / owned execution-account binding | Settings → connect → bind / read / discover / revoke | Implemented / L | Yes | Principal binding/proof/read/discovery/revoke passed; both roles discover exact non-executing adapter. K1: fresh Human explicitly activates a pending profile and completes signing/binding/read/discovery/revoke. Existing Human activates from an always-visible panel, with refresh/logout/login/restart recovery. Legacy QA account reuse across Subject ownership is not claimed. No execution/spend/funds authority added. | C/F/J3/K1 |
| W027-CAPITAL / bilateral Capital workflow | Invited Capital login → Inbox & portfolio | Implemented / L | Yes | Login/recovery passed; exact borrowed Passport sharing, selected application, issue/withdraw synthetic Offer, portfolio read and Passport revoke-access withdrawal passed. L: exact lender Offer accepted, executed and fully repaid; owned Facility detail, refresh/relogin/restart verified on 3ecbf4b. Dual-controlled restructuring/repurchase/write-off remain UNVERIFIED. | F/J1/G |
| W027-RISK / Risk queue/control plane | Invited Risk login → Queue & controls → Refresh | Implemented / L | Yes | K2 invited wallet → native Passkey → portfolio, servicing queue, health, feedback, case queue and readiness reads passed on durable local services. Registration/assertion/revoke/expiry/refresh/logout/restart verified, with no capability expansion. L: actual Case assign/uphold/additive-correction and two-sided recovery verified; Risk Pool aggregate read verified. Physical device, freeze and dual-controlled servicing remain UNVERIFIED. | F/J1/K2 |
| W027-POOL / current secured-only profile | More tools → Secured Pool | Code retained / L configured boundary | Page clicked for ordinary roles | Read/scenario visible-browser fixture checks and 200% CSS zoom checks pass. L: Human and Risk read controls verified; Human RPC/indexer/reconciliation unavailable, market values not asserted. All Pool mutations remain gated and unverified. No chain/run activation added. | F/G |
| W027-PROVIDER / narrow M3 profile | Existing Tasks/API/Integration entry | Existing main implementation retained | Ordinary entry/API links preserved | Exact synthetic M3 implementation/migrations retained; standalone Provider identity and all provider-specific real-service operations not accepted in this candidate. No new Compute product. | E/F/G |
| W027-ADVANCED / manifest and Constitution | More tools/contextual links | Existing Capital Network/Trading Capital/Architecture retained | Architecture clicked for Principal; role-gated views require legal identity | No hidden loss of original controls. Capital Network/Trading Capital venue functionality remains gated/unverified, not silently enabled or counted as usable. | F/G |
| W027-THEME / design directive | Appearance → Dark/Light/System; mobile menu | Implemented / L assets | Clicked in regression | Dark/Light captures at 1440/1058/1024/768/390/320; no horizontal overflow; persisted selection and reduced-motion checked. Full assistive-technology/browser zoom matrix still pending. | B/G |

## Evidence and interpretation

- `output/playwright/web-027/capabilities/operations.json`: real-service semantic operation results for both ordinary roles, exact runtime source, no mocks. Failure and pass are recorded separately.
- `durable-flow.json` (`3d7b585`): Human partial repayment lifecycle; `durable-settle.json` and `durable-agent.json` (`a8ab3a8`): terminal Human repayment and main candidate Agent lifecycle. Later source changes are presentation-only; final read/recovery evidence remains separately source-bound.
- `access/*-browser.json`: ordinary registration and session recovery; new-Principal assignment and privileged login failures. `ordinaryAuthenticationPassed` is never all-capability success.
- `proof/`: initial fresh Agent proof and completed lifecycle evidence, separate clone on 8945–8948. It is not the main Founder experience database.
- Browser 29/29, web/proof unit 209/209, security 35/35, transport 92/92, PostgreSQL 96/96 are relevant regression evidence, not 100% capability counts. PostgreSQL ran only on a new `ipo_one_web027_test_*` database.
- No formal website or Founder wallet acceptance has occurred. Privileged/Provider/venue/servicing gaps prevent denominator closure; do not quote a whole-site pass percentage or declare these rows “not in scope” merely to obtain 100%.

## Structural baseline appendix

`web-027/baseline-controls.json` records 330 controls/links including global, static, conditional and technical controls. The browser checks each identified control remains exactly once. That inventory detects removed/duplicated controls; it is not 330 completed clicks.

| Surface | Baseline controls/links |
| --- | ---: |
| global | 100 |
| overview | 10 |
| secured-pool | 5 |
| request-credit | 71 |
| credit-passport | 27 |
| agent-console | 14 |
| capital-partners | 14 |
| capital-network | 3 |
| trading-capital | 17 |
| wallet-permissions | 15 |
| obligations | 6 |
| repay-settle | 9 |
| activity-proofs | 7 |
| credit-track-record | 1 |
| reports-exports | 8 |
| risk-operations | 13 |
| architecture | 10 |

## WEB-027J evidence update — 2026-09-06

Runtime/worker `68c5036`, 39 changed runtime files verified by installed SHA-256 and four health endpoints 200. `local-access-audit.json` records exact host credential rotation, Subject states and durable runtime revocation. `j1/roles.json`, `j4/final.json`, `j4/security.json`, `capital/operations.json` and `capabilities/operations.json` record actual signed browser/API-bound operations without response mocks. The 16 ordinary capability cases include 15 individual passes and one blocked Human binding; this is not a whole-site coverage percentage. Capital complete Facility servicing, special-role dual control, Pool/Provider/venue and hosted acceptance remain open.

Final PostgreSQL 99/99 passed on a fresh dedicated test DB. Browser regression: 24 original cases passed, then all 5 affected Agent cases passed after the fixture host advertised the new read-only optional enrollment status. One prior PostgreSQL failure exposed VM clock slew; the test now waits for database time within its existing bounded allowance without changing runtime clocks or projection guards. Auth/web regression: 339 initial passes and the one membership-guard assertion passed after distinguishing eligibility predicates from authority-version comparisons. Security 35 and transport 92 passed. Narrow report/discovery/binding tests and actual durable revocation complement those suites.

Remaining activation review: `../codex/tasks/WEB_027K_LOCAL_PREREQUISITES_REVIEW.md`. Required final hosted states remain unverified for every row; no formal push, merge or deployment occurred.


K1 acceptance (2026-09-07): exact runtime 5303c90, migration 0079, 52 installed source hashes. Final local evidence in `web-027/k1-verification-evidence.json`. This was the historical K1 checkpoint; K2 dependency approval and implementation supersede its pending state below.

K2 acceptance (2026-09-07): final installed source `71f4723`, migration 0081, 60 matched runtime files. See `web-027/k2-verification-evidence.json`. Human full credit/repayment plus visible navigation, fresh Principal/Agent full lifecycle and Risk Passkey/reads were clicked on that source. Whole-site and physical-device acceptance remain blocked by the explicit rows above.


## WEB-027L final local update

Current installed API/worker source `3ecbf4b`; 63 runtime hashes match; 81 migrations. Delegated acceptance supersedes the generic Founder-click prerequisite for tested local software flows. Human pending-Offer recovery/selection, exact bilateral acceptance/execution/full repayment and owned Partner Facility detail, fresh Principal/Agent lifecycle/revocation, Risk Case assign/uphold/correct, two-sided recovery and Pool read controls are individually verified. See `web-027/l-verification-evidence.json`. No economic mocks or frontend success fixtures were used.

213 web/workspace tests and 99 isolated PostgreSQL tests pass; PG backend unchanged between its tested `bf02756` and installed `3ecbf4b`. Missing Operations/Auditor/approval roles and queue-only freeze selection are concrete prerequisites in `../codex/tasks/WEB_027M_SPECIAL_ROLE_ACCEPTANCE_REVIEW.md`. No formal deployment, physical device/full assistive-technology claim or whole-site 100% claim.
