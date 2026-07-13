# authentication

Owns the provider-neutral authentication boundary approved by SECURITY-001 for
local, non-funds implementation. It verifies pinned OIDC/OAuth issuers and
asymmetric JOSE algorithms, maps signed identity to active internal
Tenant/Actor/Credential records, and produces a server-created, frozen
`AuthenticationContext` with `authorizationDecision: not_evaluated`.

Human operators use Authorization Code plus PKCE through a BFF. The browser
receives only a rotated `Secure`, `HttpOnly`, host-only, SameSite cookie and an
independent CSRF token. Agent, Provider, and system clients use five-minute or
shorter access tokens with DPoP or trusted mTLS sender binding. Shared client
secrets, bearer-only workload access, wallet authentication, external-role
authorization, raw credential persistence, and protocol mutation are excluded.

This module is not connected to the public sandbox runtime. A production Human
IdP, client registration, secret-manager references, and deployment approval
remain explicit launch gates.
