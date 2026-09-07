# WEB-027 local candidate and release record

Verdict: **BLOCKED — NOT COMPLETE** for whole-site delivery. The local design and reviewed J repairs are installed and individually verified; K2 Risk Passkeys and protected reads are locally verified; remaining semantic coverage and Founder/formal-site acceptance are still open.

## Experience

- Human: http://127.0.0.1:8935/#request-credit
- Principal / Agent: http://127.0.0.1:8936/#agent-console
- Invited Capital Partner: http://127.0.0.1:8938/#capital-partners
- Invited Risk: http://localhost:8937/#risk-operations — invited wallet → Passkey → authorized Risk reads. The old IP entry redirects visibly.

Original Founder 8895–8898 images, configuration and database contents were retained. The old synthetic worker was restarted with its original configuration after the shared VM disk-full incident described below. No WEB-027 push, PR, merge or formal deployment has occurred.

Candidate and worker source: `71f4723dffa99d99fd6a651b925fc2ebb47a1209`.
Image: `ipo-one-web027:71f4723dffa9`.
Containers: `ipo-one-web027-candidate`, `ipo-one-web027-candidate-worker`, restart `unless-stopped`.
Database: `ipo_one_web027_candidate` in the isolated QA PostgreSQL service. Existing main migrations 0074/75 and approved J/K migrations 0076/77/78/79 and K2 0080/81 are installed. The worker processes synthetic outbox/outcomes only; no chain signer or funds activation.

The installed hashes of all 60 changed runtime files match the source, including API/schema files. All four health endpoints return 200. Build, runtime, worker and read-only audit records are under `output/playwright/web-027/`. Docker readiness alone is not semantic acceptance.

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

WEB-027K and the exact K2 verifier dependency are explicitly approved. K1 and K2 are installed and locally verified. K2 uses exact localhost origin/RP, invited Risk binding, native Passkeys and durable session evidence. Registration, assertion, cancellation, protected reads, replay/signature/origin rejection, revocation, real challenge expiry, refresh/logout/login/restart and 1440/390 Light/Dark controls passed. A virtual authenticator is repeatable cryptographic evidence, not Founder physical-device acceptance. See `web-027/k2-verification-evidence.json` for the exact source and bounds.

The complete capability matrix also retains open accepted Capital Facility/servicing, special-role dual control, Pool/Provider/venue, device/accessibility and exact formal-deployment checks. No whole-site 100% claim or formal release is justified yet.

## Rollback and delivery

Previous compatible K2 candidate: `ipo-one-web027-candidate-30bed6fbdcd8`; source `30bed6fbdcd885f5e3cfe530d85872762ef082ab`. The authoritative record is `candidate-runtime.json`. Retain current database and J/K migrations plus web027k credential generation. Protected candidate-only backups/configuration are in the main repository's ignored `.ipo-one/web027-runtime/` directory.

Do not revive revoked credentials, delete events or roll back to a pre-K identity model. Stop only the candidate, retain the failed image/container for diagnosis, start the recorded compatible prior K2 image against the same approved state, then retest Human/Principal recovery. Do not modify Founder ports or source DB.

Formal release remains contingent on all capability gates and Founder local experience confirmation. Follow the existing canonical Vercel/Neon release route and repeat visible role journeys on the exact hosted SHA. Local flags, credentials, synthetic QA wallets and this Docker topology must never be promoted to the formal site.


## WEB-027K1 acceptance, 2026-09-07

Runtime 5303c90 adds an explicit always-reachable Human activation panel and reviewed confirmation. Existing completed loans cannot hide it. Closed request/unique response schema, exact local gate, Human-self capability, current Subject/Principal/Consent/reference/risk checks and shared event stream enforce the mutation. Migration 0079 rotates 13 valid ordinary credentials to the named web027k generation; only Human receives the added activation capability. Earlier capabilities and owner bindings persist; old sessions/enrollments are revoked.

Evidence under `output/playwright/web-027/k1`: actual fresh and existing Human activation/cancel/recovery at 3fbb438; final-source Human flows and durable replay/repeat rejection separately recorded in `human.json`; `visual.json` tests native modal Escape and measured text contrast at 1440/390 Light/Dark. Screenshot review caught and fixed a Light text-token fallback. Final minimum contrast 6.49:1, with headings/body above 15:1. No viewport overflow.

K1 tests: 23 activation/negative protocol cases; Gateway/local tests 241 initial plus the corrected operation-inventory case passed; web 203/203; security 35/35; transport 92/92; PostgreSQL 99/99 on c921392 (unchanged backend files on final visual source); Playwright 29/29 at 3fbb438 plus final-source modal/browser acceptance. Fresh Principal/Agent full $100 no-funds lifecycle, terminal repayment, Evidence, restart and credential revocation passed on c921392. Changes after that are HTML/CSS only and are independently verified.

One immediate activation safely rejected when the VM database clock moved backward: admission 16:29:20.218Z preceded its already-created Consent/reference 16:29:20.315Z/.338Z. Visible retry after time recovery succeeded. No timestamp/expiry guard was relaxed. Preserve this environment limitation in the evidence; do not call the rejected attempt a pass.

Whole-site verdict remains BLOCKED — NOT COMPLETE. No production push/deployment or real Founder Passkey confirmation occurred.

## WEB-027K2 acceptance, 2026-09-07

Final installed source `71f4723dffa99d99fd6a651b925fc2ebb47a1209`, 60 installed runtime hashes, 81 migrations; API and worker match. Eight existing Risk operations returned successful durable reads through visible controls: portfolio reference/portfolio, servicing reference/queue, lifecycle health, feedback summary, case queue and readiness. Case transitions, freeze/servicing mutations and the remaining special-role matrix are not inferred from those reads.

On this exact source, visible Human clicks created a fresh scoped Consent, requested $24.50 synthetic credit, accepted the Offer, executed, repaid $2.50, then repaid to $0; refresh/re-login and all ten borrower plus ten Principal navigation entries passed. A fresh Principal created its own Agent, completed account proof, Mandate review/activation, $100 synthetic provider spend and full repayment, verified Evidence without economic replay, recovered across restart and revoked the Agent credential. These are actual services with PostgreSQL, no frontend mock or fixture query.

K2 backend source `30bed6f` passed 265 authentication/web tests, 224 transport/security/local tests and 99 PostgreSQL tests. Only CSS changed afterward; final-source web tests (203), all three visible role journeys, database evidence audit and image hashes passed. The full 16-check Risk security browser run covers rejected signatures/origin/RP/user handle/cross-origin/raw ID/envelope fields, replay/concurrency, cancellation, visible reads, backup registration, revocation and real two-minute expiry. Immutable SIWE claims stay unchanged; separate current evidence expires at 15 minutes and cannot cross actor, tenant, credential, version or session. Database mutation probes all explicitly rolled back; populated migration rollback is blocked.

The shared local VM filled its disk during repeated isolated builds/regressions. Resulting database failures are recorded as failed attempts. Three this-turn temporary runners/databases and rebuildable Docker cache were removed (2.033 GB cache reclaimed), while images, volumes and business databases were retained. The original synthetic worker exited during the incident and was restored using its unchanged `0211f75` image/configuration. Subsequent full PostgreSQL and browser checks passed; old 8895–8898 and new candidate health endpoints return 200. No production action occurred.

Inspected final desktop Dark Risk and mobile Light native revoke dialog. Light/Dark at 1440/390 has no horizontal overflow; dialog fits, text contrast is at least 15.23:1, and Escape cancels without revocation. Physical Founder Passkey/device acceptance and the remaining release gates above remain open.
