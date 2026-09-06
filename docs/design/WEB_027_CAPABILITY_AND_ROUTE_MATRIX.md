# WEB-027 capability and route acceptance matrix

Founder requirement: every previously usable capability must remain usable and be confirmed through visible clicks. **BLOCKED — NOT COMPLETE**. All-site 100% acceptance has not been reached. A preserved button, fixture success, shared CSS or working homepage is never counted as a functional pass.

## Environment and five-state evidence

Code baseline: integrated `c585b50` over main `7ce4b95`, preserving WEB-026 through `4e61f19`. Functional corrections: `734f4d4`, `3d7b585`, `a8ab3a8`; final visual corrections follow in the same branch. Current installed source/image is recorded in `output/playwright/web-027/candidate-runtime.json` and `candidate-build.json`.

`L` below means installed **local** candidate at ports 8935–8938, durable PostgreSQL `ipo_one_web027_candidate`, no response mocks and no `preview_data=fixture`. **DEPLOYED to the formal website = NO for every row.** Original Founder service 8895–8898 and its database remain intact. Code and local runtime availability do not fulfill the repository's final hosted five-state gate.

| Capability ID / source | Role and visible entry | CODE / RUNTIME / local installation | REACHABLE | VERIFIED behavior / remaining gap | Issue / dependency |
| --- | --- | --- | --- | --- | --- |
| W027-PUBLIC / existing public site | Public → Home, Log in, Whitepaper | Implemented / L | Public login open/close clicked | Public narrative retained; interactive illustration/Whitepaper regression passes. Public entry measured against old service. External destinations and formal site not yet accepted. | C/G/H |
| W027-AUTH-H / WEB-026H | Human → Log in → wallet → sign | Implemented / L | Yes | Real isolated signature → automatic entry; fresh registration, refresh, logout/login and candidate process restart. No extra Continue click. | C |
| W027-AUTH-A / WEB-026H | Principal → Log in → wallet → sign | Implemented / L | Yes | Same real signature/recovery checks. Successful sign-in does not prove an Agent is assigned. | C/E |
| W027-AUTH-ERROR / existing access contract | Login → reject signature / retry | Implemented / L | Yes | Cancel leaves an actionable retry; wrong privileged role remains blocked. Automated security/transport tests cover additional negative boundaries. Full real-user wallet/device matrix pending. | C/G |
| W027-NAV-H / workspace manifest | Human Next/My credit/Activity/Settings/More tools | Implemented / L | 10/10 allowed views clicked | Current-plan, portfolio and advanced entries preserved; refresh and re-login recover. Page reachability is separate from the operations below. | A/C/D |
| W027-NAV-A / workspace manifest | Principal Tasks/Agents/Activity/Settings/More tools | Implemented / L | 10/10 allowed views clicked | Agent page now presents the actual Agent authority form instead of Human onboarding. Original controls preserved exactly once. | A/B/E |
| W027-H-PREP / Human pilot | Next → Create sandbox profile → Consent | Implemented / L | Yes | Fresh test wallet creates Subject, scoped Consent and synthetic references, then an explainable Offer. No raw PII. | D |
| W027-H-REQUEST / Human pilot | Next → request terms → Review Offer | Implemented / L | Yes | New request obtains a separate Offer; fresh Consent required. Return-current restores original plan context. | D |
| W027-H-ACCEPT / shared kernel | Offer acknowledgement → Accept → exact wallet confirmation | Implemented / L | Yes | Actual accepted Obligation created with server confirmation; no hidden mutation behind navigation wording. | D |
| W027-H-EXEC / shared kernel | Current plan → activation → exact confirmation | Implemented / L | Yes | Existing controlled synthetic execution completes and is reflected in the durable Obligation. | D |
| W027-H-REPAY / shared kernel | Review next payment → amount → exact confirmation | Implemented / L | Yes | Partial $2.50 on $24.50, then remaining $22.00 repaid; current Obligation $0 survives refresh. Other historical positions retained. | D |
| W027-H-HISTORY / owned Evidence | My credit → select position → Load Evidence | Implemented / L | Yes | Actual owned read returns 13 events after full repayment; no chain broadcast. | D/G |
| W027-H-SERVICE / prior servicing UI/API | Applicable servicing/Case controls | Code retained / role-dependent | Case filing/list clicked | Categorical support Case works. DPD/default/restructure/repurchase/write-off operator mutations are not covered by ordinary Human login and remain UNVERIFIED in this candidate. | F/G, privileged access |
| W027-A-PROOF / existing local Agent | Agents → create Subject/challenge → prove account | Implemented / L for preassigned QA Agent | Yes on isolated proof environment | Full proof flow verified at `fe87d25`; adapter fixed to use actual `status=active`, rejecting incomplete proof. Preserved thereafter; fresh Principal assignment still blocked. | B/E, J4 |
| W027-A-AUTH / exact Mandate | Agents → Draft → run application → review → checkbox → activate | Implemented / L | Yes for preassigned QA Agent | Real Draft, bounded Offer and exact Mandate activation completed at `a8ab3a8`. Checkbox starts unchecked; current limits preserved. | B/E |
| W027-A-RUN / shared Agent kernel | Tasks → Complete sandbox Agent lifecycle | Implemented / L | Yes for preassigned QA Agent | Existing Offer acceptance, $100 allowed-provider spend and $100 repayment complete; outstanding $0. No real funds. | E |
| W027-A-RECOVER / existing runtime query | Tasks → Verify Agent Evidence → Review obligations | Implemented / L | Yes | Refresh restores Fully Repaid; read-only Evidence verification issues no repeat runtime goal. Role/credential revocation end-to-end remains separate. | E/G |
| W027-A-NEW / ordinary onboarding | New Principal → Agents | Code partial / L | Page visible | **BLOCKED:** “No Agent assigned”. Cannot count legacy preassignment as new-user success. | E/J4 |
| W027-PORTFOLIO / shared obligation view | Human My credit / Principal More tools → Obligations | Implemented / L | Yes, both roles | Refresh, select and reload exact owned position; Fully Repaid and 0 outstanding confirmed. | D/E/G |
| W027-TRACK / finalized outcomes | More tools → Credit Track Record → Load verified record | Implemented / L + worker | Yes, both roles | No record before terminal repayment; real worker materializes terminal outcomes; both roles then read `tenant_owned_credit_state_view.v1`. No invented score or automatic limit change. | D/E/G |
| W027-PASSPORT / permissioned Decision artifact | Human More tools → Decision Passport | Implemented / L | Yes | Fresh unaccepted Decision → issue/read/exact self-verifier round trip/revoke. Same-Decision revoked artifact correctly cannot be reissued. Different-role reviewer acceptance remains blocked/unverified. | D/F/G |
| W027-FEEDBACK / existing pilot | Next → Share product feedback | Implemented / L | Yes | Submit receives durable receipt. | D/G |
| W027-CASE / existing pilot | Next → Get help with a record → file/refresh | Implemented / L | Yes | Closed-category Case filed and listed against an owned record. Risk processing not yet verified. | D/F/G |
| W027-REPORT-H / official report | Human More tools → Reports & Exports → JSON/CSV create | Code retained / L denies legacy identity | Yes, attempted | **BLOCKED:** create returns `404 authorization_denied`; read/download/digest/revoke cannot complete for this legacy identity. | F/J2 |
| W027-REPORT-A / official report | Principal More tools → Reports & Exports | Code retained / L denies legacy identity | Yes, attempted | Same denial; not represented as working because buttons exist. | F/J2 |
| W027-WALLET / owned execution-account binding | Settings → connect → bind | Code retained / L denies current profiles | Yes, both roles attempted | **BLOCKED:** `walletPrepareAccountBinding` returns `404 authorization_denied`. Read/discovery/revoke and permitted downstream operations await exact grants, not frontend bypass. | C/F/J3 |
| W027-CAPITAL / bilateral Capital workflow | Capital host → wallet login → Inbox | Code retained / L login denied | Login attempted | **BLOCKED:** `authentication_role_rejected`. Layout/selection are fixture-verified only; Offers/Portfolio/servicing not durable-browser accepted. | F/J1 |
| W027-RISK / Risk queue/control plane | Risk host → wallet login → queue | Code retained / L login denied | Login attempted | **BLOCKED:** same role error. Freeze/case decisions/queue processing remain unverified. | F/J1 |
| W027-POOL / current secured-only profile | More tools → Secured Pool | Code retained / L configured boundary | Page clicked for ordinary roles | Read/scenario visible-browser fixture checks and 200% CSS zoom checks pass. Actual configured market, risk role and all pool mutations are UNVERIFIED/gated. No chain/run activation added. | F/G |
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
