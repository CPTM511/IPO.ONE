# WEB-026H — Wallet registration and automatic workspace entry

Status: IN PROGRESS. Founder explicitly requested repair of wallet registration/login after a signed message on local 8896 (2026-09-06).

## Context

The real Chrome page reports `credential is not active`; the connected wallet differs from the local invited wallet. The local runtime does not enable ordinary verified-wallet enrollment. The controller entry also defaults to Human Borrower, and successful login waits for a second Continue click. WEB-026F tested an invited QA wallet and therefore missed the first-visit registration defect.

## Scope / authority

Fix local no-funds ordinary Human/Principal registration using the existing reviewed 0072 verified-wallet provisioning function and exact role profiles. Activate only through an explicit local runtime option, a separate durable v2 reference key, and the existing v1 lookup compatibility path. Do not attach a new wallet to the seeded pilot identity. Never revive revoked credentials or grant management roles. Correct presentation role defaults and automatically bootstrap after successful server verification. The user's concrete repair request supplies local implementation/activation authority; no cloud or real-value change is included.

## Files and acceptance

Authentication runtime config, local private-pilot composition, credential registry fallback guard, access UI, and regression tests. New generated wallets must register and enter their intended workspace using real signatures and durable PostgreSQL. Existing invited wallets remain compatible. Reject bad signatures, replay, revoked identity, cross-tenant reads and privileged roles. Refresh/re-login preserves the new identity. Verify default Principal on controller host, auto-entry without Continue and visible recoverable errors. Deploy exact source to the existing local endpoints and retest visible login.

## Checks / migration / rollback

Run authentication/web unit tests, security/transport suites, PostgreSQL integration, and real-browser first-registration tests on a restored database before local activation. No new migration or role capability expansion is required. Retain existing backups; back up current live data before cutover. Roll back the immutable application/config to WEB-026F without deleting newly enrolled identities. Preserve v2 material so a rollback cannot destroy identity recovery.

## Completion evidence

Pending. Separate CODE, RUNTIME, DEPLOYED, REACHABLE and VERIFIED; no completion claim from signature or fixture alone.
