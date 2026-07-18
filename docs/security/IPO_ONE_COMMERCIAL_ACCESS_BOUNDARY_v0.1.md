# IPO.ONE Commercial Access Boundary v0.1

## Security Invariant

Account access answers **who is present**. IPO.ONE authorization separately
answers **what this Actor may do to this exact resource under this exact
Mandate and policy version**. Google, email, SIWE, CAIP-10, and chain connection
never create authority by themselves.

## Approved Authentication Profiles

| Profile | Browser receives | Server verifies | Internal binding |
| --- | --- | --- | --- |
| Google / common OIDC | Secure host-only session cookie | issuer, audience, algorithm, code, PKCE, state, nonce, lifetime | pre-provisioned Credential by pinned issuer + subject + client + Tenant |
| Passwordless email | Secure host-only session cookie | same OIDC BFF; email experience remains IdP-hosted | pre-provisioned Credential; email claim is not authority |
| Wallet | SIWE plaintext before signature, then host-only session cookie | HTTPS origin, URI, approved chain, address, nonce, issue/expiry, exact signature | pre-provisioned SIWE Credential using CAIP-10 subject |

External tokens, access tokens, refresh tokens, authorization codes, client
secrets, SIWE signatures, and raw identity claims are prohibited from browser
storage, logs, Events, Evidence, errors, and analytics.

## Supported Chain Connection

- Base Sepolia: `eip155:84532`, EIP-1193 chain ID `0x14a34`.
- X Layer Testnet: `eip155:1952`, EIP-1193 chain ID `0x7a0`.

The browser may request account access and add/switch these test networks. It
does not read balances, request a transaction, approve a token, or infer
creditworthiness. Mainnet is not accepted by this profile.

## Deployment Gates

The public sandbox advertises sign-in as disabled. A closed-pilot deployment
must fail startup unless the IdP approval, pinned configuration, client
credential, reference-hash secret, durable stores, pre-provisioned identities,
privacy/legal controls, support/on-call, and independent security review are
present for the exact release.
