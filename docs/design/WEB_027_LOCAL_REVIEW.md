# WEB-027 local candidate and release record

Verdict: **BLOCKED — NOT COMPLETE** for whole-site delivery. The local design and reviewed J repairs are installed and individually verified; Risk MFA, remaining semantic coverage and Founder/formal-site acceptance are still open.

## Experience

- Human: http://127.0.0.1:8935/#request-credit
- Principal / Agent: http://127.0.0.1:8936/#agent-console
- Invited Capital Partner: http://127.0.0.1:8938/#capital-partners
- Invited Risk: http://127.0.0.1:8937/#risk-operations — login works; MFA-protected business reads remain blocked.

Original Founder service 8895–8898 and its database remain unchanged. No WEB-027 push, PR, merge or formal deployment has occurred.

Candidate and worker source: `5303c906081dd317e32039ae65064fe8b3e8800d`.
Image: `ipo-one-web027:5303c906081d`.
Containers: `ipo-one-web027-candidate`, `ipo-one-web027-candidate-worker`, restart `unless-stopped`.
Database: `ipo_one_web027_candidate` in the isolated QA PostgreSQL service. Existing main migrations 0074/75 and approved J/K migrations 0076/77/78/79 are installed. The worker processes synthetic outbox/outcomes only; no chain signer or funds activation.

The installed hashes of all 52 changed runtime files match the source, including API/schema files. All four health endpoints return 200. Build, runtime, worker and read-only audit records are under `output/playwright/web-027/`. Docker readiness alone is not semantic acceptance.

## Implemented and verified

Precision Terminal retains the approved graphite/mint hierarchy, tabular figures, stable decision area, Light/Dark themes, original controls and role-allowed navigation. Functional fixes retain real server authority and records: correct Agent proof state, no economic replay during completed Evidence recovery, fresh Consent for new Human requests, report ownership, binding live-policy checks and revocation on its original durable event stream.

J1: both pre-enrolled Capital/Risk wallet roles log in, visibly enter their own workspace, refresh, logout/login and recover after a process restart. Unknown wallets cannot self-enroll privileged roles. SIWE is never represented as MFA.

J2: Human/Principal JSON and CSV reports create, read, download with exact SHA-256, revoke and recover revoked state after refresh. The exact candidate-host ordinary credential rotation retains previous capabilities and adds only four report plus five existing binding/discovery capabilities. Old sessions/credentials are revoked; no identity or domain reset.

J3: Principal execution-account signing, binding, reading, discovery and revocation pass. Both roles discover the exact local non-executing adapter. K1 now explicitly activates a pending Human profile, enabling its existing binding rule without bypassing active state. Fresh Human challenge/sign/bind/read/discovery/revoke passes; existing Human activation and server recovery pass. The legacy QA address already belongs to its Principal-side binding, so its account reuse is not claimed.

J4: a fresh Principal explicitly creates its own Agent and durable server-held credential. Visible controls complete its account proof, Draft Mandate, exact review/acknowledgement/activation, $100 synthetic provider spend, $100 repayment, $0 outstanding and Evidence verification. Process restart recovers the same Agent; credential revocation persists. A second Principal cannot read/sign/revoke it, duplicate creation is idempotent and revoked credentials cannot be revived by restart or login. The preassigned legacy Agent remains separately available.

Additional verified functions: both ordinary roles read owned portfolio and materialized terminal Credit Track Record; Human shares/revokes a Decision Passport, reads Evidence, submits feedback and files/lists a Case. Capital Partner receives an exact authorized Passport, selects the application, issues and withdraws a synthetic Offer, restores portfolio, and loses Passport access after revocation. Accepted/serviced bilateral Facility completion remains unverified.

All durable acceptance uses protected synthetic test wallets signing actual server challenges, candidate services and PostgreSQL. No frontend API mocks or fixture query is used for these results. The separate 29-case browser regression uses clearly labeled fixtures for layout and deterministic guard tests.

## Verification

| Check | Result / limits |
| --- | --- |
| PostgreSQL | 99/99 on final functional source in a new `ipo_one_web027_test_*` DB; not candidate/Founder data. |
| Browser regression | 24 initial passes plus all 5 affected Agent cases passed after adding the optional enrollment-status contract to the fixture host. 29 cases covered. |
| Authentication / web / local unit | 339 initial passes; the one legacy membership-predicate assertion was corrected for the new expiration guard and passed targeted retest. Narrow report/discovery/binding regressions also pass. |
| Security / transport | 35/35 and 92/92. |
| Static contracts | Source/boundary lint, 79 migration pairs, type/schema/OpenAPI/protocol, traceability and bundle-integrity checks passed. |
| Actual ordinary operations | Original 15 cases plus separately verified K1 fresh Human binding/activation below. These are not a whole-site denominator. |
| Actual invited roles | Login/recovery both pass; Capital author/withdraw/share-revoke pass; Risk protected reads correctly denied. |
| Actual fresh Agent | Complete lifecycle and revocation on final source; separate cross-owner/concurrency/restart negatives pass. |
| Source installation | All 52 changed runtime file hashes match; four role endpoints healthy. |

A PostgreSQL test encountered local VM clock slew; it now waits for actual database time within the existing bounded test allowance. Runtime clocks, projection constraints and authorization were not weakened. Final 99-case rerun passed. A fixture-only Agent boot failure was corrected in the test host; actual J4 acceptance had already passed independently.

Prior visual performance evidence remains historical: three paired local runs at `7f691f1` measured public initial CLS 0 versus WEB-026H 0.16944. This is not a new final-source performance score.

## Remaining release gates

WEB-027K was explicitly approved. K1 is installed and locally verified. K2 has a concrete dependency/origin/session/revocation design, but no Passkey implementation or MFA activation is claimed while the proposal-required fixed verifier review is pending. See `../codex/tasks/WEB_027K2_WEBAUTHN_DEPENDENCY_REVIEW.md` and ADR-WEB-027K2. The real browser rejected an IP RP ID; the planned exact localhost Risk origin grants no external-host authority.

The complete capability matrix also retains open accepted Capital Facility/servicing, special-role dual control, Pool/Provider/venue, device/accessibility and exact formal-deployment checks. No whole-site 100% claim or formal release is justified yet.

## Rollback and delivery

Previous compatible K1 candidate: `ipo-one-web027-candidate-3fbb438dbc78`; source `3fbb438dbc7885c9c291c4b76f8e6b13c1ff818d`. The authoritative record is `candidate-runtime.json`. Retain current database and J/K migrations plus web027k credential generation. Protected candidate-only backups/configuration are in the main repository's ignored `.ipo-one/web027-runtime/` directory.

Do not revive revoked credentials, delete events or roll back to a pre-K identity model. Stop only the candidate, retain the failed image/container for diagnosis, start the recorded compatible prior K1 image against the same approved state, then retest Human/Principal recovery. Do not modify Founder ports or source DB.

Formal release remains contingent on all capability gates and Founder local experience confirmation. Follow the existing canonical Vercel/Neon release route and repeat visible role journeys on the exact hosted SHA. Local flags, credentials, synthetic QA wallets and this Docker topology must never be promoted to the formal site.


## WEB-027K1 acceptance, 2026-09-07

Runtime 5303c90 adds an explicit always-reachable Human activation panel and reviewed confirmation. Existing completed loans cannot hide it. Closed request/unique response schema, exact local gate, Human-self capability, current Subject/Principal/Consent/reference/risk checks and shared event stream enforce the mutation. Migration 0079 rotates 13 valid ordinary credentials to the named web027k generation; only Human receives the added activation capability. Earlier capabilities and owner bindings persist; old sessions/enrollments are revoked.

Evidence under `output/playwright/web-027/k1`: actual fresh and existing Human activation/cancel/recovery at 3fbb438; final-source Human flows and durable replay/repeat rejection separately recorded in `human.json`; `visual.json` tests native modal Escape and measured text contrast at 1440/390 Light/Dark. Screenshot review caught and fixed a Light text-token fallback. Final minimum contrast 6.49:1, with headings/body above 15:1. No viewport overflow.

K1 tests: 23 activation/negative protocol cases; Gateway/local tests 241 initial plus the corrected operation-inventory case passed; web 203/203; security 35/35; transport 92/92; PostgreSQL 99/99 on c921392 (unchanged backend files on final visual source); Playwright 29/29 at 3fbb438 plus final-source modal/browser acceptance. Fresh Principal/Agent full $100 no-funds lifecycle, terminal repayment, Evidence, restart and credential revocation passed on c921392. Changes after that are HTML/CSS only and are independently verified.

One immediate activation safely rejected when the VM database clock moved backward: admission 16:29:20.218Z preceded its already-created Consent/reference 16:29:20.315Z/.338Z. Visible retry after time recovery succeeded. No timestamp/expiry guard was relaxed. Preserve this environment limitation in the evidence; do not call the rejected attempt a pass.

Whole-site verdict remains BLOCKED — NOT COMPLETE. No production push/deployment or real Founder Passkey confirmation occurred.
