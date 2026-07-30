# E2E-001 — Dual-native local and Base Sepolia regression

## Context

The local closed pilot exposed two user-visible regressions during design-partner
testing: Agent authority actions returned an unexpected request error, and a
Human who signed out could not start a fresh wallet sign-in. The local Pilot
also has to prove that Human and Agent Evidence requirements are finalized
through the approved Base Sepolia CHAIN-001F hash-only Registry boundary.

## Scope

- Recover the durable local stack without changing product semantics.
- Preserve exact compatibility for previously applied migrations whose only
  historical difference is the reviewed terminal newline.
- Keep discovered EIP-6963 Providers available after logout while revoking
  account permission and clearing all authenticated browser state.
- Re-run Human, Agent, PostgreSQL, restart, idempotency, Evidence, and approved
  Base Sepolia anchor verification.
- Record exact request, database, Evidence, and transaction receipts without
  recording wallet or attestor private keys.

## Non-goals

- Mainnet, real lending, real capital, custody, or arbitrary withdrawals.
- New contracts or changes to the CHAIN-001F Registry.
- Reuse of the destroyed CHAIN-001D deployment signer.
- Production authentication or deployment changes.

## Likely files

- `scripts/migrate.mjs`
- `apps/private-pilot/src/production-runtime.js`
- `apps/private-pilot/test/migration-checksum-compat.test.js`
- `apps/web/src/app.js`
- `apps/web/src/wallet-provider-registry.js`
- `apps/web/test/wallet-provider-registry.test.js`
- `apps/web/test/static-ui.test.js`
- `artifacts/testnet/`

## Acceptance criteria

1. The pinned Node 26/PostgreSQL 17 local stack starts and survives restart.
2. Logout revokes or releases the selected wallet, clears the authenticated
   workspace, and presents a fresh selectable wallet sign-in without reload.
3. Human and Agent use the shared durable Subject, Mandate, Offer, Obligation,
   repayment, servicing, and Evidence kernel.
4. Replay-safe requests do not duplicate durable effects.
5. Every required Evidence hash has one reconciled CHAIN-001F anchor and a
   finalized Base Sepolia observation; Evidence hashes are never presented as
   transaction hashes.
6. Full repository checks and local acceptance pass with no fake transaction
   hashes and no failed or orphan anchors.

## Test commands

```sh
pnpm test -- apps/web/test/wallet-provider-registry.test.js
pnpm test -- apps/private-pilot/test/migration-checksum-compat.test.js
pnpm run check:migrations
pnpm run check
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:evidence-anchor:status
```

## Security checklist

- [x] No private key, bearer token, raw wallet signature, or PII is logged.
- [x] Browser sign-out clears session, CSRF bootstrap, wallet selection, and
      private resource locators.
- [x] Testnet writes use the fixed CHAIN-001F Registry and fixed local attestor,
      send zero native value, and remain under the approved balance cap.
- [x] Human economic actions retain an explicit review/confirmation boundary.
- [x] Agent commands revalidate a one-use durable credential and active Mandate.
- [x] No production, mainnet, funds, contract, or deployment authority is
      inferred from the test.

## Rollback

Revert the scoped code changes, rebuild the local images, and run
`pnpm run local:restart`. PostgreSQL data and existing Evidence remain durable;
the reviewed CHAIN-001F Registry is not changed or redeployed.
