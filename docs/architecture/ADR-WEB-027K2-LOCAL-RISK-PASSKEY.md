# ADR WEB-027K2 — Invited local Risk Passkey step-up

Status: K2 implementation authorized by Founder; fixed verification dependency approved on 2026-09-07 (“已确认，批准”). Runtime verification pending. 2026-09-07.

## Verified prerequisites and origin

Invited Risk SIWE already resolves its existing actor, tenant, role enrollment and capabilities, but lacks recent phishing-resistant evidence. Keep all current protected operation policies and their 15-minute limit.

A real Chromium virtual authenticator on `http://127.0.0.1:8937` with RP ID `127.0.0.1`, UV required and attestation none returns `SecurityError: This is an invalid domain.` No server registration occurred. Recorded by `scripts/web027k-webauthn-origin.mjs`. K2 should use the exact loopback hostname `http://localhost:8937` (proof equivalent 8947) with RP ID `localhost`. This is the existing local listener, not an external hostname/service. Keep a visible redirect/link from the IP Risk entry. No host wildcard, DNS tunnel, proxy trust or public binding.

The wallet credential issuer remains the existing internal enrolled issuer; the SIWE ceremony domain/URI and browser/CSRF origin must reflect localhost exactly. Both fields have distinct roles and must not be conflated or silently mapped in signed messages. Existing localhost origin rejection must be relaxed only for this reviewed invited Risk local composition, never production or ordinary public enrollment.

## Durable model and trust

Use the existing authentication-only database role and tenant RLS. Add versioned tables for Passkey credentials (public COSE key, opaque credential ID, actor/credential/version/RP binding, counter, transport metadata, immutable ownership and terminal revocation), expiring one-use challenges (session reference hash, purpose, expected origin/RP, nonce, usedAt) and session step-up evidence (exact session/passkey/credential version, verifiedAt, expiry, challenge reference). Add bounded immutable authentication audit events without raw signatures or secrets. No private authenticator material is received or stored.

Authenticate every ceremony request via existing session and CSRF checks. A credential remains eligible only while its exact tenant, actor, membership, Risk enrollment, credential version and session are active. First registration is restricted to the pre-enrolled Risk identity. Adding/replacing a Passkey after one exists requires a current verified Passkey; revocation must not create a wallet-only re-enrollment loophole. Lost-authenticator recovery remains explicitly unavailable pending named review.

Use the fixed verifier reviewed in `docs/codex/tasks/WEB_027K2_WEBAUTHN_DEPENDENCY_REVIEW.md`. Require UP/UV, exact WebAuthn type/origin/RP, one-use challenge and expected credential, cryptographic signature and applicable counter. Deny cross-origin ceremonies, unsolicited credentials, ambiguous counters, expiration, revocation and unknown application-envelope fields. WebAuthn `CollectedClientData` permits future keys under the W3C specification; ignore their values while verifying the original signed bytes and all security fields, and reject duplicate JSON keys. Serialize challenge consumption/credential counter/evidence admission in one transaction; failed attempts consume or terminally invalidate their challenge.

Do not mutate immutable SIWE session `auth_time`/`amr` into invented historical evidence. On each authenticated request, resolve independently verified, current session-bound Passkey evidence and construct the trusted authentication context. Logout/session rotation must invalidate old evidence; refresh/process restart can recover current evidence only from durable truth. Passkey revocation immediately denies all evidence derived from that key. Capabilities remain identical before and after step-up.

## Visible experience and verification

Risk page: clear pending authentication state, “Register Risk Passkey”, “Verify with Passkey”, recent verification time, expiry, and visible key revocation. Browser cancel leaves the operation unverified. Only a successful server verification unlocks currently authorized portfolio/queue/health/case actions. Existing unconfigured capabilities retain truthful reasons.

Browser acceptance uses a real cryptographic virtual authenticator for repeatable protocol evidence, not injected success responses. Test fresh registration, assertion, active reads, session persistence, concurrent/replayed/expired challenges, bad origin/RP/UV/signature/user handle, wrong actor/tenant/key, revoked credentials, logout/login, process restart and protected reads after expiry/revocation. Founder device acceptance remains separately visible; virtual-authenticator tests cannot claim the Founder's device was used.

## Delivery boundary and rollback

Exact isolated local database/hosts only; preserve original 8895–8898, production, role capabilities, risk settings, chain and funds gates. Additional migration next after 0079, with up/down and upgrade/rollback evidence. Disable new routes and evidence resolution and revoke relevant sessions/keys to roll back; preserve events and original SIWE login. Never remove MFA requirements to manufacture a passing Risk screen.
