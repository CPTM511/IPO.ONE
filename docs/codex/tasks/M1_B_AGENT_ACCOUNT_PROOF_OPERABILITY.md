# M1-B Agent Account Proof Operability

## Context

The deployed Principal workspace restores the exact pending Agent Subject, but
the production-neutral web shell does not provide the registered sandbox Agent
EVM account. The `Create signing request` control remains enabled while the
account field is empty. Clicking it therefore fails in browser-only validation
before any Tenant API request, which presents as an inert primary action and
leaves no Vercel request or PostgreSQL challenge evidence.

## Scope

- Require the Vercel primary sandbox to declare one reviewed public Agent EVM
  account address as non-secret deployment configuration.
- Inject only that public address into the authenticated web shell and use it
  to prefill the existing account-proof field.
- Disable the signing-request mutation until Subject, chain, purpose, and EVM
  account input are valid.
- Present a clear inline next step when the public Agent account is missing or
  invalid.
- Preserve the external Golden Flow runner as the only account-proof signer.
- Add unit, transport, environment, and static UI regression coverage.

## Non-goals

- No private key, signature, credential, transaction signer, transfer,
  withdrawal, custody, venue-write, mainnet, or real-funds authority.
- No browser signing and no reuse of the Principal wallet as the Agent account.
- No new chain, credit model, fee runtime, Capital Partner expansion, or broad
  deployment refactor.
- No modification of the protected Capital Network or Risk browser-host WIP
  files.
- No RC branch, release tag, or controlled-pilot expansion.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/tenant-api/test/production-tenant-host.test.mjs`
- `apps/private-pilot/src/production-environment.js`
- `apps/private-pilot/src/production-runtime.js`
- `apps/private-pilot/test/vercel-sandbox-serverless.test.js`
- `scripts/check-vercel-sandbox-environment.mjs`
- `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`
- `scripts/check-vercel-sandbox-environment.mjs`

## Acceptance criteria

1. The primary Vercel sandbox fails closed when the reviewed public Agent EVM
   account configuration is absent or malformed.
2. The Risk project does not require or expose the Agent account configuration.
3. The authenticated primary web shell contains the configured public address
   and never contains private key or signature material.
4. `Create signing request` is disabled until the exact Subject and valid
   account-proof input are present.
5. Missing or invalid account input produces an explicit inline next step
   instead of an apparently inert mutation.
6. A valid input reaches `pilotCreateAgentAccountChallenge`; PostgreSQL stores
   one pending, expiring, one-use challenge.
7. The existing external Agent proof boundary remains unchanged and Vercel
   receives no workload or EVM private key.

## Test commands

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
node --test apps/tenant-api/test/production-tenant-host.test.mjs
node --test apps/private-pilot/test/vercel-sandbox-serverless.test.js
pnpm run check:vercel-sandbox
pnpm run lint
pnpm run typecheck
pnpm test
git diff --check
```

## Security checklist

- Server workspace truth and Principal capability enforcement remain
  authoritative.
- The configured Agent account is public evidence, not authority.
- The Principal wallet is never substituted for the Agent workload account.
- Vercel stores no private workload key, EVM private key, raw signature, or
  transaction credential.
- The challenge remains short-lived, one-use, Subject-bound, and test-chain
  restricted.
- No real funds, mainnet, custody, withdrawal, transfer, or venue write is
  introduced.

## Permission boundary

This issue is limited to the Founder-authorized deployable no-funds M1-B
Sandbox and its existing primary Vercel project. It does not activate remote
participant access, a transaction signer, or controlled-pilot authority.

## Migration impact

None. The change adds deployment configuration and web bootstrap behavior only;
no PostgreSQL schema or data migration is required.

## Rollback plan

Remove the non-secret Agent account environment variable, restore the prior
deployment alias, and revert only the bounded closure commit. No database
migration or canonical-state rollback is required.

## Completion evidence

- Exact source commit and deployment ID.
- Environment validation output with no secret values.
- Targeted and full automated test output.
- Mouse-click evidence from the deployed primary URL.
- Vercel operation log, authorization audit event, and PostgreSQL challenge row.
