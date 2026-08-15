# LOCAL-STACK-001 — Local Multi-Container Pilot

Status: Implemented locally on 2026-07-27; cloud and remote access remain blocked

## Context

IPO.ONE already has a durable PostgreSQL-backed local Human/Agent product and a
digest-pinned OCI runtime. It did not have a one-command multi-service
environment. The development machine has Lima but no Docker Desktop, Docker
CLI, Podman, or existing VM.

Before paying for L1 hosted providers, the complete L0 product must run inside
a reproducible local virtual boundary and prove restart-safe database, API,
worker, and browser behavior.

## Scope

- create a dedicated Lima VM with rootless Docker Compose;
- pin PostgreSQL 17 by digest and preserve it in a named volume;
- run the existing Private Pilot OCI image as three loopback workspaces;
- add a separate same-image unsigned local worker for leased synthetic outbox
  delivery and reconciliation;
- keep the database VM-internal and publish only workspaces to macOS loopback;
- generate local ignored secrets without printing them;
- provide init/up/status/logs/restart/down/VM-stop/guarded-reset commands;
- provide isolated one-off Agent proof/runtime commands without publishing the
  database to macOS;
- add static and live acceptance checks;
- validate restart recovery and browser product behavior; and
- add the static contract to the default repository quality gate.

## Non-goals

- no Vercel, Neon, Cloud Run, Cloud SQL, Render, DNS, billing, secret-manager,
  IdP, provider-account, or cloud mutation;
- no remote tunnel, LAN bind, public signup, external participant, or
  production identity;
- no Hyperliquid/Testnet write, signer, external Provider execution, custody,
  withdrawal, capital, lending, or real funds;
- no claim that local PostgreSQL proves managed PITR, cloud IAM, autoscaling,
  cross-region latency, external alerts, or disaster recovery; and
- no replacement of the later L1 hosted acceptance gate.

## Likely files

- `deploy/local/compose.yaml`
- `deploy/local/stack.v1.json`
- `deploy/local/README.md`
- `apps/private-pilot/src/local-worker.js`
- `apps/private-pilot/test/local-worker.test.js`
- `packages/deployment-topology/src/index.js`
- `packages/deployment-topology/test/local-stack.test.js`
- `scripts/local-stack.mjs`
- `scripts/local-stack-acceptance.mjs`
- `scripts/local-agent.mjs`
- `scripts/check-local-stack.mjs`
- `package.json`

## Acceptance criteria

- Lima VM is exactly 4 CPU, 6 GiB RAM, and 40 GiB disk;
- Docker reports a rootless security boundary;
- PostgreSQL is 17.10, digest-pinned, SCRAM-enabled, persistent, healthy, and
  not forwarded to the macOS host;
- the launcher applies the exact migration set and uses a non-owner
  `NOBYPASSRLS` application role with forced Tenant RLS;
- Borrower, Principal/Agent Authority, and Risk workspaces are healthy on
  `127.0.0.1:8787-8789`;
- Agent account proof runs inside the VM boundary and an exact bounded Mandate
  can be activated by the Human Principal;
- the separate worker claims leased outbox messages, emits bounded local
  receipts, reconciles, and reports a heartbeat;
- a restart preserves canonical product state and returns every service to
  healthy;
- real browser verification confirms authenticated state and critical
  Human/Agent navigation;
- no authority flag becomes true; and
- the complete repository quality gate passes on Node 26.5.0.

## Test commands

```sh
pnpm run check:local-stack
node --test packages/deployment-topology/test/local-stack.test.js
node --test apps/private-pilot/test/local-worker.test.js
pnpm run local:up
pnpm run local:acceptance
pnpm run local:agent:prove -- <repository-local-challenge.json>
pnpm run local:restart
pnpm run local:acceptance
pnpm run check
git diff --check
```

## Security checklist

- [x] VM uses rootless Docker and no host Docker daemon is installed.
- [x] PostgreSQL is bound to VM-only loopback, not macOS or LAN.
- [x] Product workspaces are macOS loopback-only.
- [x] Application and worker containers are read-only, capability-free, and
  no-new-privileges.
- [x] Secrets are random, local, Git-ignored, bounded, and never printed.
- [x] PostgreSQL canonical state, forced Tenant RLS, least-privilege runtime
  role, leases, idempotency, reconciliation, and restart recovery remain
  mandatory.
- [x] Worker sink is explicitly synthetic and has no external delivery target
  or signer.
- [x] Public signup, remote access, cloud mutation, testnet writes, external
  execution, Human credit, and real funds remain false.

## Verification result

PASS on 2026-07-27 using Node 26.5.0 and pnpm 11.1.3.

- Lima `ipo-one-local` is running with 4 CPUs, 6 GiB RAM, 40 GiB disk, and
  rootless Docker.
- PostgreSQL 17.10, the exact 39 migrations, forced Tenant RLS, the non-owner
  application role, worker heartbeat, reconciliation, and an empty pending
  outbox passed live acceptance.
- A real browser completed the Human no-funds lifecycle through full
  repayment and finalized Evidence.
- A real browser and an isolated one-off Agent proof container activated a
  CAIP-10-bound Agent Subject and exact sandbox Mandate.
- `local:restart` retained both the fully repaid Human Obligation and active
  Agent Subject/Mandate; a browser refresh rehydrated both workspaces from
  PostgreSQL server truth.
- The default repository gate passed 575/575 tests. Security passed 33/33,
  transport/SDK passed 52/52, and focused local-stack tests passed 17/17.
- Detailed identifiers, hashes, commands, and screenshots are recorded in
  `docs/codex/audits/LOCAL_STACK_001/README.md`.

## Rollback

- `pnpm run local:down` removes the exact Compose containers while retaining
  PostgreSQL data.
- `pnpm run local:vm:stop` stops the dedicated VM while retaining its disk and
  Compose volume.
- Data deletion requires the explicit
  `local:reset -- --confirm-delete-local-data` guard and removes only the named
  local PostgreSQL volume.
- No cloud or external state exists to roll back.
