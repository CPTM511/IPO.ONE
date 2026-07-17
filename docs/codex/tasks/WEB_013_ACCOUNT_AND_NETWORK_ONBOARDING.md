# WEB-013: Account and Network Onboarding

Status: Product UI and EIP-1193 test-network connection implemented on
2026-07-17. Public sandbox discovery keeps account sign-in visibly disabled;
approved closed-pilot deployments can activate Google, email, and SIWE options
through the same server-side contract.

## Context

The commercial workspace needs a clear start path. Users should understand how
to enter the product, which network is connected, and why authentication is
separate from Principal and Mandate authority.

## Scope

- Add one top-level Access action available from every Human and Agent view.
- Present a two-step commercial onboarding surface: sign in, then connect an
  approved test network.
- Support server-advertised Google and passwordless-email OIDC entry points.
- Connect injected EIP-1193 wallets, switch or add Base Sepolia and X Layer
  Testnet, and update visible account/network state.
- When enabled by the server, request and sign a one-use SIWE message and create
  the same host-only Human session.
- Explain that authentication and network connection create no business or
  funds authority.

## Non-Goals

- No fake login, mock Google success, open registration, mainnet, wallet
  transaction, token approval, custody, balance read, or funds movement.
- No browser-stored address, token, signature, role, or authority decision.
- No third-party analytics, remote font, external script, or wallet SDK.

## Likely Files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/api/src/server.js`
- `apps/web/test/static-ui.test.js`

## Acceptance Criteria

- The Access action is visible and keyboard operable in every workspace.
- The dialog traps focus, closes with Escape or either close control, restores
  focus, and leaves the application inert only while open.
- Google/email buttons activate only when the same-origin server advertises an
  approved provider; public sandbox never simulates authentication.
- Wallet connect uses `eth_requestAccounts`, `wallet_switchEthereumChain`, and
  the reviewed `wallet_addEthereumChain` fallback.
- Base Sepolia uses `eip155:84532`; X Layer Testnet uses `eip155:1952`.
- Wallet SIWE is described as a no-fee login signature, not a transaction.
- Desktop and 390px mobile layouts have zero horizontal overflow.

## Test Command

```sh
pnpm dlx node@24.18.0 --check apps/web/src/app.js
pnpm dlx node@24.18.0 --test apps/web/test/static-ui.test.js
pnpm run test:security
pnpm run check
```

## Security Checklist

- [x] Authentication and authorization are explicitly separated in the UI.
- [x] Public sandbox reports sign-in disabled instead of returning fake success.
- [x] Wallet metadata is limited to the two approved synthetic-only profiles.
- [x] No account, signature, token, or authority is persisted in browser storage.
- [x] Same-origin, credentialed calls are used for authentication endpoints.
- [x] No external runtime script or analytics dependency was added.
- [ ] Closed-pilot IdP, durable session store, independent review, and release evidence are deployed.
