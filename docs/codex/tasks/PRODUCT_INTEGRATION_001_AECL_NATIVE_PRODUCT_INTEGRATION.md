# PRODUCT-INTEGRATION-001 — AECL native product integration

Status: LOCAL IMPLEMENTED — automated acceptance passed; Founder signed-browser
acceptance pending; production blocked and not released

Delivery mode: `L0_LOCAL_NO_FUNDS` release-candidate integration. Production,
real-value, external credential, signer, custody, mainnet, deployment and funds
activation remain blocked by Product Constitution v1.1 and the named gates
below.

## Context and delivered baseline

The completed AECL contracts, Provider SPI, EVM connector, universal signature
verification, delegated grant, pending exposure, exact preparation, simulation,
preflight, Tenant Protocol, SDK and MCP adapters are composed into the current
loopback-only private runtime on branch `codex/m1-b-deployable-sandbox`.
Existing authentication and the shared obligation kernel remain canonical.

The integration closes the former application gap:

- Human and Agent authentication semantics are unchanged;
- Wallet & Permissions exposes a separate authenticated execution-account and
  AccountBinding lifecycle;
- all thirteen binding and wallet-execution operations are catalogued across
  Tenant Protocol, OpenAPI, SDK and local MCP;
- the private runtime composes the PostgreSQL wallet execution application
  through the Tenant Command Gateway transaction; and
- Provider reference conformance still does not prove production configuration.

Product Constitution v1.1 keeps `L5_PRODUCTION` unapproved and separately gates
deployment, external credentials, custody, signing and funds movement.

## Scope

- Preserve existing Human session and Agent workload authentication behavior.
- Add an authenticated, native Execution surface to the existing product shell.
- Separate execution-account connection state from authentication/session state.
- Reuse the existing EIP-1193/EIP-6963/WalletConnect and CAIP chain registry
  boundaries; do not add a wallet brand or a second chain registry.
- Present server-derived AccountBinding, canonical capacity, DelegatedWalletGrant,
  preflight decision and execution Evidence without browser-authored authority.
- Compose the existing AECL wallet application into the local PostgreSQL private
  runtime using the existing Gateway, repositories, AuthZ and Event/Evidence
  transaction boundary.
- Keep all external submission disabled in `L0_LOCAL_NO_FUNDS`; a submit attempt
  must return the canonical fail-closed reason and invoke no wallet/provider.
- Report MetaMask, OKX, Safe, Circle, Base Account, WalletConnect and HyperCore
  activation independently as available, blocked, paused or disabled based on
  current configuration evidence.
- Extend Activity and Risk/Operations presentation only through existing
  canonical reads and receipts; add no second ledger or activity store.
- Produce focused, aggregate, PostgreSQL, security, transport, schema,
  migration and real-browser Evidence for the changed boundary.

## Non-goals

- No redesign of authentication, Tenant, Actor, Role, Subject, Principal,
  Consent, Mandate, SpendPolicy, CreditLine, Offer, Obligation, Ledger, Risk,
  Evidence, AECL SPI or HyperCore Venue SPI.
- No wallet connection as login replacement and no execution signer as Agent
  workload authentication.
- No external transaction, UserOperation, venue action, RPC submission,
  Provider credential, custody secret, KYC/PII, real balance, real capital,
  mainnet, contract deployment or funds movement.
- No cloud/DNS/IAM mutation and no production release claim while the
  Constitution and launch policy remain closed.
- No fake production availability and no silent mock fallback.

## Likely files

- `modules/agentic-execution/src/postgres-wallet-execution-application.js`
- `modules/agentic-execution/src/index.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- `apps/private-pilot/src/production-runtime.js`
- `apps/web/src/execution-product-presentation.js`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- focused unit, runtime, transport and browser acceptance tests
- `docs/codex/audits/PRODUCT-INTEGRATION-001/`

## Acceptance criteria

1. Given an existing authenticated Human session, connecting or disconnecting
   an execution account does not create, replace or terminate that session.
2. Given an existing Agent workload identity, no execution signer, binding or
   grant can authenticate or create an Agent identity.
3. AccountBinding and network selection are read from or verified against the
   existing server registry and cannot select another Subject/Tenant.
4. Wallet connection and AccountBinding expose zero execution authority until
   current PrincipalRelationship/Mandate/SpendPolicy/CreditLine/Obligation and
   AuthZ state derive an exact grant.
5. Grant limits, assets, networks, provider/venue scope and expiry are
   server-derived narrowings; browser input cannot widen them.
6. Preparation atomically reserves pending exposure, constructs an exact
   payload, simulates it and returns one `ALLOW`, `STEP_UP`, `DENY` or
   `QUARANTINE` receipt with current Evidence.
7. Wrong Tenant/Actor/chain, unsupported provider/capability, stale/revoked
   authority, stale preflight, effect/code/proxy drift, duplicate execution,
   provider timeout/unknown, pause/freeze and unlimited approval fail safely.
8. Local submission remains disabled after all checks and invokes no external
   adapter; the UI reports this as blocked, not successful.
9. OpenAPI, SDK, MCP and Web resolve to the same Gateway/application commands.
10. Refresh and re-login restore server-derived execution state; stale browser
    wallet state never replaces workspace identity.
11. Existing Human and Agent authentication regression tests remain unchanged
    and pass.
12. A real browser completes the authenticated local flow with no console
    errors and accessible keyboard/focus/zoom behavior.

## Test commands

```sh
node --test modules/agentic-execution/test/*.test.js
node --test apps/web/test/*.test.js
pnpm test
pnpm run test:transport
pnpm run test:postgres
pnpm run test:security
pnpm run check:schemas
pnpm run check:migrations
pnpm run typecheck
pnpm run lint
pnpm run check
git diff --check
```

Real-browser acceptance uses the existing authenticated private-pilot host and
the repository's approved browser tooling. Production post-deployment checks
are not runnable until a separately approved deployment and credential package
exists.

## Security checklist

- [x] Authentication context remains Host-derived and unchanged.
- [x] Execution wallet state cannot create a session, Tenant, Actor or Role.
- [x] Account, chain, Provider and session changes invalidate only the relevant
      execution preparation; authentication invalidation retains its existing
      canonical rules.
- [x] Caller cannot supply canonical authority, limits, raw calldata, private
      keys, signatures, provider payloads or balances.
- [x] Every mutation is idempotent, Tenant-scoped, RLS-protected and atomically
      evidenced.
- [x] Unknown, stale, denied, quarantined and unreconciled outcomes add no risk.
- [x] Withdrawal, external transfer, unlimited approval and unknown selectors
      remain prohibited.
- [x] No secret, raw account proof, KYC/PII or credential reaches browser
      persistence, logs, PostgreSQL Evidence or model context.

## Permission boundary

This issue accepts repository implementation, local PostgreSQL composition,
local no-funds runtime execution, tests, browser acceptance and release-candidate
Evidence. It does not approve production deployment, remote participant access,
external provider accounts/credentials, signers, contracts, mainnet, custody,
risk-limit changes, real value or funds movement. Those stop at precise
`PRODUCTION_BLOCKED` records until the Product Constitution and launch policy
are revised by named human decisions.

## Data and migration impact

The existing additive migrations `0055` and `0056` remain unchanged. Additive
migration `0061` stores the newly approved dual-native execution AccountBinding
challenge/proof lifecycle and upgrades the shared binding projection without
changing Ledger, Obligation or authentication semantics.

## Rollback plan

Remove the wallet execution application composition and Execution presentation
module, restore the existing unavailable application default, and retain all
pre-existing AECL schemas, migrations and Evidence. Because external submission
is disabled, rollback has no external transaction or fund state to unwind.

## Required Evidence

- exact changed-file and authority-boundary audit;
- authentication separation and negative-path matrix;
- focused and complete command results with pass counts;
- PostgreSQL persistence/restart/RLS/concurrency receipts;
- browser screenshots plus console/accessibility observations;
- candidate commit/build/migration/provider status and rollback point;
- working loopback product URL retained for Founder review;
- final verdict `BLOCKED — NOT RELEASED` unless a separately approved deployed
  environment also passes post-deployment acceptance.

## Dependencies and sequencing

AECL Phase 0-5, SIG-003, EVM-WALLET-001, EXEC-001/002/003 and the HyperCore
adapter are inputs and are not reopened. Runtime composition precedes UI
mutation. Focused negative tests precede aggregate and browser acceptance.
Provider activation is evaluated independently and cannot block unrelated
local integration.

## Completion Evidence

The three Founder-approved canonical contracts are implemented and accepted in
the rebuilt loopback-only `L0_LOCAL_NO_FUNDS` product. Production remains
blocked and nothing was deployed or submitted externally. See
`docs/codex/audits/PRODUCT-INTEGRATION-001/acceptance.md`; the earlier
`audit.md` remains the immutable pre-approval finding.
