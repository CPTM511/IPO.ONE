# WEB-027K2 — Concrete WebAuthn verification dependency

Date: 2026-09-07. K2 implementation is approved; this record fulfills the proposal's separate fixed-dependency review requirement before adding a new verifier.

Founder approved on 2026-09-07: “已确认，批准”. The exact dependency and locked closure below are authorized for K2 local work.

Approved exact package: `@simplewebauthn/server@14.0.1` (not a range), npm integrity `sha512-kjWgcm9NdSv+Tobo4Swxd1WnEawsBogpYFMjg9pKsVLPN3FdCmR6BipkL+DcPDgmQ7UKbbBZqRqn3E3YaA7NBw==`.

Official release: https://github.com/MasterKale/SimpleWebAuthn/releases/tag/v14.0.1 . npm metadata fetched 2026-09-07; Node >=20, compatible with the pinned project runtime. Current repository has jose/viem, which do not implement the WebAuthn registration/COSE/attestation verification flow. Reimplementing those security parsers for this UI repair adds avoidable authentication risk.

Use only server-side registration/assertion verification and challenge generation. Browser uses native navigator.credentials; no browser dependency, external IdP, analytics, network verification service, or new Risk capability. Authentication remains scoped to the existing invited local Risk operator. Server verifies exact origin/RP, one-use challenge, credential/actor/session/tenant, UV, signature and counter; persistence and explicit revocation remain IPO.ONE-owned.

Direct dependencies declared by this fixed release: @peculiar/x509 ^2.1.0, @hexagon/base64 ^1.1.27, reflect-metadata ^0.2.2, @peculiar/asn1-ecc ^2.6.1, @peculiar/asn1-rsa ^2.6.1, @peculiar/asn1-x509 ^2.6.1, @levischuck/tiny-cbor ^0.2.2, @peculiar/asn1-schema ^2.6.0, @peculiar/asn1-android ^2.6.0, @peculiar/asn1-x509-post-quantum ^2.9.4. Lock the resolved closure with pnpm and record actual integrity before candidate build. Install scripts disabled. Retain the current baseline dependencies; no broad upgrade.

Activation remains local candidate/proof only after signature/replay/origin/UV/counter/revocation tests. Approval here permits adding/building this exact verifier and its locked dependency closure for the already-approved K2; no production deployment is included. Rollback disables Passkey operations and revokes its evidence/sessions; it must not downgrade protected operations to SIWE.

Resolved lock: SHA-256 `8aca10f9e2b97d73a749a1fe28ca03740947566681d98377552731d7e7bf92ff`; 25 packages in the verifier closure (including the verifier). `pnpm-lock.yaml` gained entries only; existing package resolutions did not change. Candidate copies this isolated pure-JavaScript closure without install scripts or registry access at image build time. Browser/durable acceptance is recorded in `docs/design/web-027/k2-verification-evidence.json`. No production deployment authorization is implied.
