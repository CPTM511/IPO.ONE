# AUTHN-002: Commercial Account Access Boundary

Status: Secure local foundation implemented on 2026-07-17. Public activation
remains closed until an approved IdP/client, pre-provisioned Credential records,
durable session/transaction repositories, protected deployment evidence, and
independent security review exist for the exact release.

## Context

IPO.ONE needs familiar account access without turning an email address, Google
claim, wallet address, or connected chain into protocol authority. AUTHN-001
already provides a provider-neutral OIDC Authorization Code plus PKCE BFF and
host-only session contract. This increment adds standard OIDC subject mapping,
a bounded token-exchange adapter, and one-use EIP-4361 wallet authentication.

## Scope

- Accept standard OIDC ID tokens from a pinned provider while deriving Tenant,
  Actor, role, capability, and policy only from an active internal Credential.
- Exchange authorization codes server-side with PKCE and return only the ID
  token to the verifier; browser-visible access and refresh tokens remain
  prohibited.
- Support pre-provisioned Human wallet Credentials through one-use SIWE
  challenges on Base Sepolia and X Layer Testnet.
- Reuse the same Secure, HttpOnly, host-only, SameSite session and CSRF boundary
  for OIDC and SIWE.
- Keep phishing-resistant recent-authentication requirements unchanged. A
  basic wallet signature is not treated as phishing-resistant MFA.

## Non-Goals

- No open self-signup or automatic Actor, Tenant, Membership, role, capability,
  Subject, Principal, Mandate, Offer, or funds authority from an IdP or wallet.
- No password store, browser token persistence, wallet custody, transaction
  signing, mainnet activation, or real-funds execution.
- No production IdP selection, client credential, email-delivery provider, RPC
  credential, or public/private deployment in this issue.
- No contract-wallet EIP-1271 claim without a separately reviewed RPC-backed
  verifier and session-invalidation policy.

## Likely Files

- `modules/authentication/src/*`
- `modules/authentication/test/*`
- `apps/web/src/*`
- `docs/security/*`

## Acceptance Criteria

- Standard OIDC tokens need only pinned provider identity claims; all business
  authority comes from the active internal Credential record.
- OIDC exchange is bounded, same-origin redirect-pinned, PKCE-bound, JSON-only,
  response-size-limited, and discards access tokens.
- SIWE challenges bind the exact HTTPS origin, URI, address, approved chain,
  nonce, issue time, and expiry; challenges are one-use even after failure.
- Unknown, revoked, expired, wrong-Tenant, wrong-client, wrong-chain,
  unprovisioned, replayed, or invalid-signature attempts fail before a session.
- Authentication events contain no raw ID token, authorization code, client
  secret, SIWE message, signature, cookie, wallet address, or PII.
- Sessions created by OIDC and SIWE still carry
  `authorizationDecision=not_evaluated`.

## Test Command

```sh
pnpm dlx node@24.18.0 --test modules/authentication/test/*.test.js
pnpm run test:security
pnpm run check
```

## Security Checklist

- [x] OIDC issuer, audience, algorithm, redirect URI, nonce, and PKCE remain pinned.
- [x] Google/common-provider claims cannot become IPO.ONE roles or capabilities.
- [x] SIWE domain, URI, chain, nonce, expiry, signature, and one-use replay are tested.
- [x] SIWE accepts only a pre-provisioned active internal Credential.
- [x] Wallet authentication does not satisfy privileged recent-MFA policy.
- [x] No raw credential or signature is emitted to authentication events.
- [ ] Durable Credential/session/login-transaction repositories are approved and deployed.
- [ ] Exact IdP/client/Secret Manager references and participant provisioning are approved.
- [ ] Independent review passes for the exact closed-pilot release.
