# PROD-CUTOVER-001 preflight evidence

Date: 2026-08-11

Verdict: `BLOCKED — NOT PRODUCTION RELEASED`

## Exact integrated source

- branch at integration seal: `codex/m1-b-deployable-sandbox`
- integrated source commit: `285cc74aadd65e147fe223f032516635138979f5`
- integrated source tree: `171ec9d9df83a01ba8a25cd40df1c5d8142221c6`
- audited candidate scope: 279 files
- protected WIP, marketing/prototype output, historical M1 snapshots and local
  browser output were not included in the integration commit
- staged secret and sensitive-artifact filename scans returned no matches

## Verification

- runtime, lint, type contract, 136 schemas, 21 OpenAPI operations, 61 ordered
  migrations, 98 Tenant Protocol operations and 98 product traceability
  bindings passed
- security: 33/33 passed
- transport: 75/75 passed
- repository: 899/899 passed
- isolated PostgreSQL 17: 85/85 passed; no Founder live data was touched
- the historical aggregate `pnpm run check` stopped at the old M1-A.1 branch
  binding because that snapshot expects
  `codex/checkpoint-20260727-pre-strategy`; it is not reused as the current
  integration seal

## Browser preflight

The real browser opened
`http://127.0.0.1:8787/#wallet-permissions`, rendered the IPO.ONE Product
Workspace, opened the sign-in and network setup flow, returned HTTP 200 for
`/auth/v1/options`, and reported zero browser-console errors.

The controlled browser had no compatible wallet Provider. The product correctly
left wallet sign-in, account connection and the real signature action disabled.
No synthetic Provider or signature was injected. The final invited-wallet
AccountBinding signature and reload recovery remain a Founder-visible action.

## Deployability and authority

The minimum successor candidate is
`deploy/local/prod-cutover-001.release-candidate.v1.json`. It binds the exact
integrated source and permits only the checked-in `public_sandbox` / deployable
sandbox profile. The deployment artifact must be built from a clean exact HEAD
and record that commit.

Real funds, external Provider execution, production signer authority, Venue
writes and custom-domain cutover remain disabled. Product Constitution v1.1
still disables L4 controlled real value and does not approve L5 production;
`deploy/launch-policy.v1.json` still disables the controlled Agent credit
profile. Those locks cannot be converted into approval by test or deployment
evidence.

## Current blockers

1. Complete the invited-wallet AccountBinding signature and server-truth reload
   regression.
2. Build and deploy the exact clean candidate to an authorized generated
   `vercel.app` target, then pass deployed Human, Agent and Risk acceptance.
3. Record one named production decision package and policy revision covering
   Provider, chain, asset, capital, custody, signer governance, numerical caps,
   loss bearer, legal/privacy, security, operations and recovery.
4. Only after those gates pass, present one exact transaction for final Founder
   confirmation.

No real-value transaction was prepared or submitted during this preflight.
