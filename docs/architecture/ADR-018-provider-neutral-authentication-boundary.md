# ADR-018: Provider-Neutral Human and Workload Authentication Boundary

Status: Accepted for local non-funds implementation by SECURITY-001 approval
Date: 2026-07-13

## Context

IPO.ONE's public sandbox uses anonymous, process-local partitions and correctly
treats their identifiers as isolation hints rather than credentials. A closed
pilot needs Human operators and Agent, Provider, and system workloads to map
from reviewed external identity to internal Actor and Credential records before
tenant membership, capability, object ownership, or live protocol policy is
evaluated.

Authentication must not turn a wallet, Subject, Principal, external group,
token role, request parameter, or bearer token into protocol authority. It also
must not force IPO.ONE to select a production identity vendor before the Human
IdP deployment gate is approved.

## Decision

1. Authentication is a separate module that produces a frozen, server-created
   `AuthenticationContext` with `authorizationDecision: not_evaluated`.
   Authentication never performs a protocol mutation or grants business access.
2. Compact JWT inputs are size-bounded and preflighted with duplicate-key
   rejection and closed protected-header and claim sets before `jose` verifies
   an asymmetric signature. Issuer, audience, type, algorithm, key ID, time
   window, policy version, and clock tolerance are pinned.
3. JWKS is supplied through an explicit issuer adapter. The resolver limits key
   count, algorithms, public verification operations, cache lifetime, and fetch
   time. Due refresh failure, unknown keys, private JWK material, duplicate key
   IDs, algorithm mismatch, and withdrawn keys fail closed. Rollover works only
   while the reviewed issuer publishes both old and new public keys. Unknown
   key IDs share a refresh cooldown so invalid tokens cannot amplify IdP traffic.
4. Human operators use OIDC Authorization Code plus S256 PKCE through a BFF.
   `state`, `nonce`, redirect URI, code verifier, and login transaction are
   single-use and bounded. The browser receives only `__Host-` `Secure`,
   `HttpOnly`, host-only SameSite cookies and an independent CSRF token. Session
   IDs and CSRF values are stored only as keyed hashes; access, refresh, ID token,
   authorization code, and password material are not persisted. Authorization
   code exchange has a hard timeout and abort signal.
5. Human sessions default to 30-minute inactivity and eight-hour absolute
   expiry, rotate after authentication and on demand, and are invalidated on
   credential or Actor deactivation. Mutations require the exact configured
   Origin and CSRF token. Privileged actions must separately require a signed
   authentication time no older than 15 minutes and a phishing-resistant AMR.
6. Agent, Provider, and system access tokens have a maximum five-minute
   lifetime and are bound to exact Tenant, Actor type, client, audience,
   capability claims, and policy version. Credential records define the
   internal capability ceiling. External roles are parsed but ignored.
7. Bearer-only workload access is prohibited. Agent requests use DPoP proof
   with access-token hash, method, target URI, proof time, public-key thumbprint,
   and one-time proof `jti`. Provider and system profiles use reviewed
   `private_key_jwt` or mTLS client authentication and DPoP or trusted mTLS
   resource-request binding. Shared client secrets are not a steady-state
   profile.
8. OIDC `nonce` and OAuth confirmation `cnf` are profile security fields
   required by the approved SEC-D02 and SEC-D03 controls. They are accepted only
   in their closed Human or workload profile and never become authorization
   claims.
9. External `sub` values are retained only as domain-separated HMAC references.
   Every authentication checks the active internal Actor and Credential.
   Tenant membership, role bundles, live capability policy, object ownership,
   AccessGrants, approval, and business rules remain AUTHZ-001 responsibilities.
10. Credential and session registration, rotation, suspension, revocation, and
    expiry emit closed, credential-free lifecycle events. Raw token, code,
    cookie, verifier, signature, private key, raw IP, wallet proof, KYC, and PII
    fields cannot enter the event payload.
11. Local test keys are generated in memory and never committed. The public
    sandbox runtime is not wired to this module. Closed-pilot startup remains
    disabled unless external IdP deployment approval and secret-manager
    references are supplied. The gate requires a named vendor, immutable approval
    SHA, and numerically versioned secret references; an actual IdP, OAuth client,
    signing keys, and cloud deployment remain separate approvals.

## Consequences

- A verified `AuthenticationContext` is now the only input that can create a
  PostgreSQL Tenant Security Context with source `verified_authentication`.
  Cloned objects and mismatched Tenant, Actor, or policy values are rejected.
- The local Actor directory, Credential registry, session store, replay cache,
  and authentication event store are bounded reference adapters. They prove the
  contract but are not restart-safe or production data stores.
- AUTHZ-001 must consume the context and perform active membership, route,
  capability, ownership, AccessGrant, and live policy checks. DATA-003 must then
  replace in-memory adapters with tenant-scoped durable repositories and one
  transactional command gateway.
- Production IdP selection must verify single-audience tokens, required custom
  tenant/client/policy claims or an approved claims-mapping boundary, signed key
  rotation, phishing-resistant MFA policy, deprovisioning, audit export, and
  regional/legal fit.
- No authentication endpoint is exposed by the current public sandbox, and no
  claim is made that public users or customer workloads are authenticated.
