# AUTHN-006 — Local Durable Human and Agent Authentication

Status: Implemented and locally verified; invited-wallet signature remains an
interactive wallet-owner check

## Context

The local no-funds stack currently injects a deterministic daily Human session
and gives the local Agent MCP process an out-of-band synthetic authentication
context. Those shortcuts let the product workflow run, but they do not exercise
the durable authentication controls required by the local-to-closed-pilot
delivery guide.

## Scope

- Keep the runtime bound to `127.0.0.1` and `NODE_ENV=development`.
- Pre-provision one explicitly invited Base Sepolia wallet for each local Human
  workspace role without storing a wallet private key.
- Issue SIWE challenges, verify EIP-191 signatures, and persist sessions,
  revocation, expiry, and authentication events in PostgreSQL.
- Pre-provision one Agent workload credential bound to a local P-256 public key.
- Require the Agent MCP process to prove possession of that key on every fresh
  authentication and re-check the durable Credential before command execution.
- Preserve one shared Tenant, policy, command gateway, obligation kernel, and
  Evidence model.

## Non-goals

- Remote access, public registration, OAuth/OIDC provider activation, or a
  production token issuer.
- Mainnet, production funds, provider signing, arbitrary withdrawals, or any
  change to credit/risk/funds authority.
- Relaxing the closed-pilot HTTPS, Secret Manager, edge, mTLS, or deployment
  approval gates.

## Likely files

- `apps/private-pilot/src/private-pilot-database.js`
- `apps/private-pilot/src/private-pilot-runtime.js`
- `apps/private-pilot/src/agent-stdio.js`
- `apps/private-pilot/src/local-durable-authentication.js`
- `apps/tenant-api/src/postgres-human-access-composition.js`
- `deploy/local/compose.yaml`
- `scripts/local-stack.mjs`
- `scripts/local-stack-acceptance.mjs`

## Acceptance criteria

1. `/auth/v1/options` reports enabled wallet authentication and no active
   session before SIWE.
2. An invited wallet can sign a durable challenge, receive a durable session,
   execute its allowed operations, log out, and remain logged out after restart.
3. Wallet/account change invalidation removes protected access and requires a
   fresh signature.
4. An Agent proof succeeds only for the active, pre-provisioned Credential.
5. Agent Credential suspension/revocation, proof replay, expiry, and key
   mismatch fail closed, including after a database or process restart.
6. Human and Agent credentials remain Tenant-, Actor-, role-, capability-, and
   policy-bound.
7. Existing product, credit, worker, reconciliation, pause/freeze, and Evidence
   tests remain green.

## Test commands

- `pnpm check`
- `pnpm run test:postgres`
- `pnpm run local:acceptance`
- Targeted durable authentication and private-pilot PostgreSQL tests.

## Security checklist

- [x] Loopback-only HTTP remains fail-closed outside development.
- [x] Closed-pilot production gates are unchanged.
- [x] Wallet private keys and raw signatures are never persisted.
- [x] Agent private key remains in ignored local secret storage.
- [x] PostgreSQL authentication uses a non-owner, no-bypass, allowlisted role.
- [x] Sessions, challenges, replay entries, and revocation are durable.
- [x] No real-funds or remote execution authority is introduced.

## Verification receipt

- Node 26.5.0 repository gate: `626/626`.
- Fresh PostgreSQL 17 integration/RLS gate: `80/80`.
- Local stack acceptance passed with 44 migrations, four durable Credentials,
  an empty pending outbox, healthy worker/reconciliation, and persistent state.
- A fresh one-use Agent proof completed a real MCP `ipo_one_read_self` call
  through durable authentication, admission, authorization, RLS, and the
  shared Subject/Mandate kernel.
- The local stack preserved the PostgreSQL volume through restart; a production
  EIP-191/SIWE E2E test also executed a durable Human command.
- The invited local Human wallet private key was never available to the test
  runner, so the owner still performs that one signature manually.

## Rollback

Stop the local stack, restore the previous runtime wiring, and retain the
PostgreSQL volume. Authentication rows are additive and contain protected
references only; no product obligation or ledger rows need to be deleted.
