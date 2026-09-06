# WEB-027J — Local access dependencies: concrete review proposal

Status: APPROVED FOR ISOLATED LOCAL IMPLEMENTATION — Founder approved all four repairs with “完全同意，执行！” on 2026-09-06. Hosted activation remains outside this approval.
Scope: isolated local synthetic/no-funds candidate only. No hosted activation, real user credential import, chain signer, funds, policy/price changes or new product.

## Evidence and requested decision

WEB-027 preserves the original 330 identified controls and adds a tested Precision Terminal shell. Actual signed browser sessions exposed access gaps that prevent the Founder's all-capability acceptance. These are tracked as dependencies, not waived as pre-existing bugs. On source `a8ab3a8f4de99fe1438c2d9d7ebae3e071933763` the main isolated candidate completes Human repayment and the preassigned Agent lifecycle, including read-only Evidence recovery.

The approved WEB-027 directive section 2.2 explicitly requires a separate review when fixing privileged login changes permissions or migrations; section 10 excludes identity/permission expansion. AGENTS.md also requires human review for permission changes. The Founder has approved the exact local remediation below. It does not ask to reapprove the UI redesign.

| Dependency | Actual observation | Bounded remediation |
| --- | --- | --- |
| J1 Invited Capital/Risk login | Both return `400 authentication_role_rejected`; visible message says the selected Human workspace is not enrolled. Migration 0063 and wallet transaction roles admit only Human/Principal. | Extend the versioned selected-role enrollment/login contract to support **pre-enrolled** `capital_partner_operator` and `risk_operator` identities. Keep public registration strictly Human/Principal. Bind the exact tenant, host/client, membership, credential and role in the signed challenge and final session. Preserve each existing role's capabilities. |
| J2 Existing reports | Legacy QA Human and Principal receive `404 authorization_denied` on `pilotCreateOfficialReport`; download/revoke cannot proceed. Local phase7 profiles omit grants already present in the hosted ordinary-role profiles. | On the isolated candidate, rotate affected active ordinary local credentials to a new named generation with exactly `official_report.create.owned`, `official_report.read.owned`, `official_report.retrieve.owned`, `official_report.revoke.owned`. Keep old credentials immutable, revoke superseded sessions, retain identity/ownership and do not revive expired/revoked memberships. Verify JSON/CSV digest, recovery and revocation through the UI. |
| J3 Execution account setup | Both ordinary QA roles receive `404 authorization_denied` on `walletPrepareAccountBinding`. | For the exact local Human/Principal profiles, add only existing owned prepare/submit/read/revoke binding operations and capability discovery: `wallet.account_binding.prepare.owned`, `.submit.owned`, `.read.owned`, `.revoke.owned`, and `wallet.capabilities.discover`. Use the same reviewed credential rotation discipline as J2. Preserve chain policy and signature verification. This grants no wallet execution, delegated spending, venue writes or funds authority. |
| J4 Fresh Principal Agent assignment | New Principal signs in successfully and sees `No Agent assigned`; the preassigned legacy Principal works. | Provide a visible, explicit **local sandbox Agent setup** action that creates a dedicated tenant/Principal-bound Agent identity and its own local durable runtime credential through the existing Agent Subject/Mandate path. No shared seeded Agent, implicit financial authorization, cross-Principal reuse or silent provisioning at login. Preserve explicit account proof and exact Mandate review. |

Credit Track Record is a separate data prerequisite: no projection exists until a terminal outcome is materialized. Verification must finish repayment and use the normal synthetic worker; it must not create a fabricated record or widen access to bypass an empty state.

## Implementation sequence and likely files

1. J1: write a narrow ADR and additive selected-role migration, then update `modules/authentication/src/{wallet-login-transaction-store,human-wallet-bff,postgres-human-authentication}.js`, `apps/tenant-api/src/human-access-routes.js`, local host composition and access UI. Allocate the next free migration number at implementation time; do not rewrite 0063.
2. J2/J3: update `apps/private-pilot/src/local-pilot-identities.js`, local provisioning and reviewed rotation command. Use an explicit allowlist and before/after manifest; no wildcard or entire role-bundle grant. Do not automatically change `production-bootstrap.js`.
3. J4: extend the existing tenant/Principal-bound local enrollment service and its browser control, reuse `modules/tenant-command-gateway/src/agent-subject-handlers.js` and local reference Agent transport. Keep credentials server-side in protected storage, scoped and revocable. No new external provider or production dependency.
4. Re-run every blocked journey and all original role-allowed operations on the same candidate SHA. Update the semantic capability matrix, not just test counts.

## Acceptance, tests and security review

- Visible Capital/Risk login, refresh, logout/login and process restart recover the same exact authorized role. Ordinary wallets cannot self-enroll either privileged role by selecting a button, editing a payload, changing host or replaying signatures.
- Tenant mismatch, role mismatch, stale/expired/revoked enrollment, credential version mismatch and cross-owner references fail closed. No role/capability union. No fabricated MFA claim.
- Legacy Human/Principal data and ownership survive credential rotation. Old sessions stop authorizing. New credentials add only the enumerated grants and preserve remaining approved capabilities.
- Reports: create/read/retrieve JSON and CSV, compare downloaded digest, revoke and verify after refresh. Execution binding: exact test wallet challenge, signature, active binding, discovery, read and revocation. No chain transaction is necessary for these checks.
- A completely fresh Principal can create its own sandbox Agent, prove its account, draft/review/activate Mandate, run the existing no-funds request, accept/execute/repay, inspect Evidence, recover after restart and revoke the exact runtime credential. A second Principal cannot use the first Agent or credential.
- Run web/browser, security, transport, traceability, migration and PostgreSQL suites on a fresh dedicated test DB. Then actual browser acceptance on the isolated durable candidate, including negative role and ownership tests.

## Migration, rollback and delivery boundary

Back up only `ipo_one_web027_candidate` before activation, retain the previous image/container and an exact credential rotation manifest. New schema must be additive and old-runtime compatible where possible; rollback must fail closed for new privileged sessions. Revoke only newly created candidate credentials during rollback, restore prior compatible runtime without clearing domain records, and verify Human/Principal recovery. Never un-revoke a credential to roll back. Preserve original Founder ports 8895–8898 and their database.

Approval covers implementing and locally verifying these four narrowly stated repairs. If migration compatibility, a new capability, real value, external identity/provider or hosted activation is needed, present that concrete delta. Formal release still requires all WEB-027 acceptance plus Founder local experience confirmation; this proposal does not authorize publishing an incomplete subset.

## Completion

IN PROGRESS — NOT COMPLETE. Implementation and verification follow the approved scope. The baseline evidence lives in `output/playwright/web-027/access/`, `capabilities/operations.json`, `durable-settle.json` and `durable-agent.json`. No claim that these permission repairs are already implemented or available.
