# authentication

Owns the provider-neutral authentication boundary approved by SECURITY-001 for
local, non-funds implementation. It verifies pinned OIDC/OAuth issuers and
asymmetric JOSE algorithms, maps signed identity to active internal
Tenant/Actor/Credential records, and produces a server-created, frozen
`AuthenticationContext` with `authorizationDecision: not_evaluated`.

Human operators use Authorization Code plus PKCE through a BFF or a one-use
EIP-4361 wallet proof bound to a pre-provisioned internal Credential. The
browser receives only a rotated `Secure`, `HttpOnly`, host-only, SameSite cookie
and an independent CSRF token. Standard OIDC provider claims are identity only;
Tenant, Actor, role, capability, and policy come from the internal Credential.
Agent, Provider, and system clients use five-minute or shorter access tokens
with DPoP or trusted mTLS sender binding. Open wallet self-signup, shared
steady-state client secrets, bearer-only workload access, external-role
authorization, raw credential persistence, and protocol mutation are excluded.

This module is not connected to the public sandbox runtime. A production Human
IdP, client registration, secret-manager references, and deployment approval
remain explicit launch gates.
