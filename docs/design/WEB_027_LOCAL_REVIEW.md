# WEB-027 local candidate and release record

Verdict: **BLOCKED — NOT COMPLETE**. This is an available local candidate, not a whole-site completion or a formal deployment. Founder local acceptance and all required role/capability checks remain open.

## Experience

- Human: http://127.0.0.1:8935/#request-credit
- Principal / Agent: http://127.0.0.1:8936/#agent-console
- Capital/Risk hosts exist at 8938/8937 but their ordinary wallet entry is blocked; they are not presented as usable roles.
- Original Founder experience on 8895–8898 is preserved. Formal `ipo.one` has not been pushed, merged or deployed by WEB-027.

Candidate source: `7f691f1003f7bfc271d24106562bbef526fe4f53`.
Image: `ipo-one-web027:7f691f1003f7`.
Container: `ipo-one-web027-candidate`, restart policy `unless-stopped`.
Database: `ipo_one_web027_candidate`, in the isolated QA PostgreSQL service. Main migrations 0074/0075 were applied to the clone; WEB-027 introduces no schema migration.

The existing candidate worker runs the same unchanged worker implementation from `fe87d25`, synthetic outbox/materialization only. No anchor, signer or funds activation. Its version is intentionally reported separately from the UI image. `candidate-runtime.json`, `candidate-build.json`, `candidate-worker.json` and the sanitized verification manifest record concrete versions and test evidence.

## What changed

Precision Terminal uses graphite/mint working surfaces, consistent typography/numeric columns, a stable Agent decision area, clearer selection/focus/empty states and independent Light theme. Original Agent controls are used in the actual Principal surface; Human setup no longer occupies that scene. All previously identified controls survive once and allowed navigation remains reachable through the primary destinations or More tools.

Three functional corrections accompany the design: the local account-proof adapter now reads the real response's active status; completed Agent Evidence can be recovered without another economic runtime goal; starting/returning from a new Human request correctly guides fresh Consent and preserves the current plan's authority reference. A selected Capital row contrast defect and public first-load layout shift were corrected during browser review.

## Observed browser outcomes

Human: isolated wallet registration/sign-in; Subject/Consent/Offer; exact acceptance and activation; $24.50 synthetic plan, partial $2.50 repayment and remaining $22.00 repayment; $0 selected-plan balance after refresh. Historical positions remain intact. New unaccepted test Offers may be the current next action; use My credit to choose an existing completed position.

Preassigned Agent: account proof on the separate initial-proof clone, then real Draft/application/Offer/exact activation on the main candidate; $100 approved provider spend, $100 repayment and $0 outstanding; returned Evidence verifies. Final `7f691f1` browser run re-read completion and performed refresh/re-login/navigation, confirming no duplicate runtime goal for Evidence recovery.

Both ordinary roles read their actual completed Credit Track Record after normal worker materialization. Human also issued/read/verified/revoked a scoped Decision Passport using an exact QA self-verifier, loaded 13 owned Evidence records, submitted feedback and filed/listed a Case. A revoked same-Decision artifact cannot be reissued; a fresh Decision is used for a new QA round trip. That prohibition was preserved.

No fabricated API responses, fixture query, frontend-only success state or actual user wallet was used for these durable operations. The isolated QA provider signs real server challenges with protected test keys. Fixture screenshots are separate visual evidence, not authenticated service acceptance.

## Open dependencies

See `../codex/tasks/WEB_027J_LOCAL_ACCESS_REPAIR_REVIEW.md` for the concrete permission review. It covers pre-enrolled Capital/Risk wallet login, exact legacy report grants, owned execution-account binding and a fresh Principal's dedicated local Agent setup. None is silently implemented by this report. Full privileged servicing, configured Pool/Provider/venue and different-role disclosure acceptance remain unverified; no whole-site percentage is asserted.

The Founder was asked whether to approve this bounded local repair package. Until an answer arrives, no permission/schema/provisioning change is activated. This follows the already-approved directive's sections 2.2 and 10. It does not re-open ordinary UI implementation approval.

## Verification

| Check | Result / interpretation |
| --- | --- |
| Web and local Agent proof unit tests | 209 passed; includes negative proof integrity cases. |
| Full browser suite | 29 passed. Original controls, reachability, theme, responsive layouts, recovery, keyboard disclosure and guarded actions. Fixtures are limited to this regression suite. |
| Final public-entry follow-up | 2 passed after the last initial-header CSS correction. |
| Security / transport | 35 / 92 passed. No auth/permission weakening to obtain success. |
| PostgreSQL integration | 96 passed in dedicated `ipo_one_web027_test_1788697336341`; never the Founder or candidate data DB. |
| Lint / product traceability / deploy topology / deployment contract | Passed. Deployment contract checks do not deploy or prove formal usability. |
| Actual durable browser | Individual passes and exact blocked denials recorded in the capability matrix and evidence manifest. No whole-site PASS. |
| Public performance comparison | Three interleaved fresh Chromium contexts, same Mac/viewport, no throttling. Initial CLS 0.16944 on old WEB-026H versus 0 on final WEB-027 in all three runs. Median login click-to-dialog around 71ms versus 65ms includes automation overhead, not INP. Resource count typically 43; no performance score claimed. |

Tests were run at the corresponding source revisions. Full Human/Agent mutations are versioned separately from later presentation-only fixes; final read/recovery and fresh-access checks are source-bound. Required formal CI, full zoom/assistive-technology coverage and final hosted browser acceptance are still release gates, not substituted by this local report.

## Rollback and formal release

The previous compatible candidate container is `ipo-one-web027-candidate-8a5a7e66e6b5`. Protected DB backups and configuration are in the main repository's ignored `.ipo-one/web027-runtime/` directory; none is committed or displayed. No destructive data reset is part of rollback.

If this local candidate must be rolled back, stop only `ipo-one-web027-candidate`, rename it to an unused diagnostic name, rename the recorded previous container back to `ipo-one-web027-candidate`, and start it. Verify Human/Principal login and selected-position reads again. The schema did not change in the final UI update, so retain the candidate database. Do not change the original 8895–8898 service. For a future permission migration, use the separately reviewed J rollback manifest instead of assuming this simple UI rollback is sufficient.

Formal release remains conditional on all capability gates and Founder experience confirmation. Use the existing canonical Vercel/Neon route and `scripts/build-vercel-sandbox-bundle.mjs`, verify the exact deployment source/assets, and repeat visible role journeys on the formal domain. Do not promote local registration flags, QA wallets/credentials, fixtures or this local Docker topology. No new hosting project is required.
