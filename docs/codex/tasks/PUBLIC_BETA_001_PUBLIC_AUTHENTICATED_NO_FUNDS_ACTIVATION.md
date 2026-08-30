# PUBLIC-BETA-001 — Public Authenticated No-Funds Activation

Status: In progress

Decision owner: IPO.ONE Founder / Product / Release

Authorization: Founder Product Decision — Public No-Funds Beta, 2026-08-30

## Context and current baseline

`origin/main` was last successfully resolved locally at
`3a3fd06805baa6f1595a2f5eb85e4f09f61a40ff`. A fresh fetch was attempted before
implementation but GitHub was temporarily unreachable; the fetch must succeed
before merge. The exact SHA already runs as a zero-traffic Vercel + Neon
candidate with `single_v2` SIWE, forced RLS, migration `0071`, successful cron
reconciliation, and no real-funds authority. Ordinary wallets are still
rejected unless a Credential was pre-provisioned, the launch policy still calls
private durable access an invited closed pilot, and `ipo.one` still points to an
older deployment.

The Founder decision supersedes invitation/cohort admission for ordinary
no-funds users and authorizes the smallest governance, runtime, deployment and
domain-cutover change required to make `https://ipo.one` publicly usable after
authentication. It is the named human review for the authentication,
permission, private-data, production-dependency and deployment changes in this
issue.

## Scope

- Amend the Constitution once so the current L2 meaning is public authenticated
  no-funds Beta with durable Tenant-isolated state.
- Enable a matching launch-policy profile while keeping every financial and
  external execution capability false.
- After a valid SIWE proof, idempotently self-provision only the ordinary
  `human_borrower` and `principal_controller` role enrollments in the existing
  Tenant/RLS and object-authorization architecture.
- Preserve pre-provisioned Agent and Capital Partner paths and every privileged
  Risk/Operations/System boundary.
- Reuse PostgreSQL abuse-control buckets to rate-limit anonymous authentication
  reads and high-cost authentication mutations; retain existing stricter
  authenticated command admission.
- Add concise public Beta/no-funds copy and remove ordinary invitation language.
- Merge, deploy the exact merged SHA, promote `ipo.one`, and run hosted
  acceptance against the custom domain.

## Non-goals

- Real funds, real Human lending, mainnet, custody, withdrawal, transfer,
  external Provider execution, Hyperliquid signed execution or M3.
- Self-service Capital Partner, Risk, Operations, Admin, Security or Release
  roles.
- A new identity provider, database, Cloud SQL, Cloud Run, Redis, queue,
  anti-fraud platform, invitation manager, cohort manager or activation gate.
- Any economic write to the separately governed Base Sepolia secured Pool.

## Likely files

- `docs/PRODUCT_CONSTITUTION.md`
- `deploy/launch-policy.v1.json`
- `modules/authentication/src/postgres-human-authentication.js`
- `modules/authentication/src/human-wallet-bff.js`
- `apps/tenant-api/src/postgres-human-access-composition.js`
- `apps/tenant-api/src/human-access-routes.js`
- `apps/tenant-api/src/production-tenant-host.js`
- `apps/private-pilot/src/production-runtime.js`
- `apps/private-pilot/src/production-environment.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/web/src/index.html`
- `apps/web/src/authentication-availability-presentation.js`
- `apps/web/src/app.js`
- `db/migrations/0072_public_beta_self_service_identity.*.sql`
- focused unit/PostgreSQL/runtime/security tests and deployment checks

## Acceptance criteria

1. Given an unregistered normal EVM wallet, when it completes a valid SIWE
   challenge for Human or Principal, then one active Human Actor, one bounded
   membership, one Credential and exactly the two ordinary role enrollments are
   created idempotently without an invitation.
2. Given the same wallet repeats or changes between the two ordinary role
   choices, when it authenticates again, then the same Credential/Actor is used
   and each session contains exactly the selected role's capabilities.
3. Given an invalid signature, unsupported role, stale/replayed challenge,
   cross-Tenant reference or direct attempt to select a privileged role, then
   provisioning and session creation fail without partial identity state.
4. Given anonymous authentication traffic, when one network exceeds the
   reviewed read or mutation budget, then the service returns a bounded 429 and
   does not perform the protected write; mutation budgets are stricter than
   reads.
5. Given User A and User B, when each uses the durable product, then object-level
   authorization prevents either from reading the other's Subject, Obligation,
   Evidence or workspace state and anonymous requests cannot read either.
6. Given the launched product, when a user visits `https://ipo.one`, then the
   public Beta/no-funds notice is visible, SIWE needs no invitation, the Human
   and Principal/Agent entry paths are reachable, and the separately approved
   Pool is discoverable/read-only without a new economic write.
7. The exact deployed SHA and migration head are visible; reconciliation,
   refresh/re-login/restart recovery, rollback and database restore checks pass.

## Test commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run check:launch-policy
pnpm run check:vercel-sandbox-deployment
git diff --check
```

Hosted acceptance additionally exercises `https://ipo.one` through visible
browser controls and direct negative authorization requests.

## Security checklist

- SIWE signature verification occurs before any self-provisioning.
- The database procedure permits only one exact Human profile and two exact
  non-privileged role enrollments; it cannot mint Risk/Ops/Admin authority.
- Existing `single_v2`, forced RLS, session, CSRF, DPoP/mTLS, object AuthZ,
  idempotency, reconciliation and redacted-log boundaries remain enabled.
- Authentication limits are durable, hashed, bounded and stricter on writes.
- Wallet addresses, raw signatures, secrets and raw PII do not enter logs,
  public copy or durable Events.
- All economic/financial launch-policy flags remain false.

## Permission boundary

This issue uses the explicit Founder authorization to change ordinary no-funds
admission, public private-state availability, Vercel/Neon runtime configuration,
deployment and the `ipo.one` production alias. It grants no financial,
mainnet, custody, signer, Provider, venue, privileged-role or Pool-write
authority.

## Data and migration impact

Migration `0072` adds a narrowly validated, idempotent database function for
verified wallet self-provisioning and no new datastore. Existing invited
Credentials, sessions, Tenant state, dispute/correction, feedback, support and
incident capabilities remain intact. Rollback removes new self-provisioning
authority but preserves already-created ordinary identities and their durable
no-funds state.

## Rollback plan

1. Revert the production alias to the last known-good deployment.
2. Disable public self-provisioning through the launch/runtime configuration.
3. Run the `0072` down migration only if function removal is required; do not
   delete users or product state.
4. Keep real-funds/mainnet/custody/withdrawal/external execution false
   throughout rollback.

## Required Evidence

- exact PR, merge SHA, CI run and Vercel deployment ID;
- migration count/head and forced-RLS inventory;
- positive SIWE self-provision/recovery and negative privileged/cross-user
  authorization results;
- durable rate-limit result;
- hosted Human, Principal/Agent and read-only Pool screenshots/receipts;
- reconciliation and runtime logs bound to the exact SHA;
- final verdict `PASS — DEPLOYED AND USER-VERIFIED` or, for a real P0/P1 only,
  `BLOCKED — NOT COMPLETE`.

## Dependency and sequencing notes

This is the current Phase 3 activation repair, not a new milestone. It
supersedes ordinary invitation/cohort activation work. `live_testnet_secured_pool`
and `controlled_agent_credit_pilot` retain their separate exact gates.

## Completion Evidence

Pending.
