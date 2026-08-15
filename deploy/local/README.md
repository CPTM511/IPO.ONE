# IPO.ONE Local Multi-Container Pilot

Status: synthetic-only local integration; no remote access or real funds

This stack runs the durable IPO.ONE Human/Agent product inside a dedicated Lima
Linux VM using rootless Docker Compose:

```text
macOS browser / local Agent
            |
  127.0.0.1:8787-8790
            |
   private-pilot container
            |
 PostgreSQL 17.10 container
            |
 unsigned local worker
```

The PostgreSQL container is reachable only at `127.0.0.2:55432` inside the
Lima VM. It is not forwarded to the macOS host. The four product workspaces
bind to loopback. Lima's host agent forwards only their guest loopback
listeners to macOS loopback. `local:up` verifies that the current
`ipo-one-local` host agent owns all four macOS listeners and that an
IPO.ONE-specific authentication marker is returned. Startup fails if another
process owns any of ports 8787-8790.

## Requirements

- macOS on Apple Silicon;
- Lima 2.2 or later; and
- repository Node 26.5.0 / pnpm 11.1.3 for host-side checks.

Docker Desktop is not required. `local:up` creates the reviewed
`ipo-one-local` Lima VM when it does not exist:

- 4 CPUs;
- 6 GiB RAM;
- 40 GiB disk; and
- rootless Docker with Compose v2.

## Start

```sh
pnpm run local:auth:init -- --wallet 0xYOUR_BASE_SEPOLIA_WALLET
pnpm run local:up
```

`local:auth:init` is an explicit invitation step. It binds only the public
CAIP-10 wallet address; it never requests or stores the wallet private key.
It also creates a separate P-256 Agent key and server-side authentication
keys under the Git-ignored `.ipo-one/local-stack/` directory. Re-running the
command with a different wallet fails closed instead of silently rebinding an
existing invitation.

The first start downloads the pinned PostgreSQL image and builds the pinned
Node 26.5.0 IPO.ONE image. Generated local credentials are placed under the
Git-ignored `.ipo-one/local-stack/` directory and are never printed.

Open:

- Borrower: <http://127.0.0.1:8787/#request-credit>
- Principal / Agent Authority: <http://127.0.0.1:8788/#request-credit>
- Risk Operations: <http://127.0.0.1:8789/#risk-operations>
- Capital Partner: <http://127.0.0.1:8790/#capital-partners>

The local stack also imports the reviewed CHAIN-001E Base Sepolia observation
from the checked-in `artifacts/testnet/` receipt. The import is strict,
replay-safe, Tenant-RLS scoped, read-only, and synthetic-only; it performs no
RPC request and has no signer. In **Activity & Proofs**, query:

```text
0x218a06527a138313936e9a199104dfbabe73f1f1d16e7e5c8189a0ff2edca088
```

This Registry Evidence is a public chain proof shared through the Tenant read
capability. It is not the signed-in Human or Agent's own repayment history and
does not grant credit, account control, or funds authority.

### Agent account proof and runtime

The normal local Principal journey stays in the browser: create or recover the
Agent authority, use the explicit account-proof Refresh, run the registered
reference-Agent application, activate the reviewed Mandate, then complete the
synthetic runtime with the single next action shown by the product. No terminal,
download, copied ID, or JSON handoff is required for that reviewed path.

The PostgreSQL port stays inside the VM. Developers who need to inspect the
machine-facing handoff can expand **Developer details** and run the isolated
one-off helpers explicitly:

```sh
pnpm run local:agent:prove -- .playwright-cli/ipo-one-agent-account-challenge.json
```

After the Principal activates the exact Mandate, an API integrator may start the
local Agent stdio process with the reviewed runtime handoff:

```sh
pnpm run local:agent -- ./agent-handoff.json
```

Both helpers mount the named JSON file and the dedicated Agent private-key file
read-only, reuse the local pilot image and database boundary, and do not
publish PostgreSQL to macOS. The long-lived pilot container does not receive
the Agent private key. Every Agent command uses a fresh, one-use, 60-second
proof and revalidates the durable PostgreSQL Credential.

## Operate

```sh
pnpm run local:status
pnpm run local:logs
pnpm run local:acceptance
pnpm run local:agent:prove -- <repository-local-challenge.json>
pnpm run local:restart
pnpm run local:down
pnpm run local:vm:stop
```

Normal local development labels the Pilot image as `local-stack`. That label is
intentionally ineligible for M1-B exact-commit release Evidence. After P0-1
through P0-4 produce one clean candidate, rebuild and verify the same local
product with its exact lowercase commit SHA:

```sh
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-40-character-sha> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:up
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-40-character-sha> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-40-character-sha> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:restart
IPO_ONE_M1_B_RELEASE_SHA=<exact-clean-40-character-sha> IPO_ONE_M1_B_PORT_BASE=18887 pnpm run local:acceptance
```

The exact-SHA mode fails before Compose if the SHA differs from `HEAD` or any
tracked source differs from that commit. Untracked Founder work is preserved
and excluded from Git source identity. The Docker build context is a fresh Git
archive of tracked `HEAD`, so untracked files and local secrets cannot enter the
exact image. `IPO_ONE_M1_B_PORT_BASE` is optional; it derives four consecutive
review ports and leaves the normal 8787-8790 defaults unchanged when absent.
Use the same port-base value on every `local:*` command for an isolated run.
Acceptance checks the Pilot image plus the running Pilot and Worker OCI
revision labels. This proves which local source was built and restart-tested;
it does not prove a hosted deployment. Do not set the SHA variable for ordinary
dirty-worktree development.

`local:down` and `local:vm:stop` retain the PostgreSQL volume. Lima removes
host forwarding when the guest listeners or VM stop. A later `local:up` returns
to the same durable product state.

If a browser remains open while `local:restart` runs, refresh that page after
`local:status` reports every service healthy. The authenticated workspace then
rehydrates its Actor-bound resources from PostgreSQL; the browser does not
invent or preserve canonical product state while the backend is unavailable.

The destructive reset is guarded and removes only the exact
`ipo-one-local-postgres-data` Compose volume:

```sh
pnpm run local:reset -- --confirm-delete-local-data
```

Generated local credentials are retained so a reset does not silently rotate
browser-session and application-role bindings. Delete `.ipo-one/local-stack`
manually only when deliberate local credential rotation is required.

## Services

### PostgreSQL

- official PostgreSQL 17.10 image pinned by digest;
- persistent named volume;
- SCRAM host authentication;
- migrations and Tenant bootstrap run through the local owner path;
- application traffic switches to the generated non-owner
  `NOBYPASSRLS` role; and
- Human/Agent authentication traffic uses a second, independently verified
  `authentication_only` role; and
- no macOS database port.

### Private pilot

- same repository OCI image boundary intended for later hosted execution;
- four loopback wallet-gated Human/Principal/Risk/Capital Partner workspaces;
- durable SIWE challenges, sessions, logout/invalidation, Credential lifecycle,
  authentication Evidence, and Agent replay protection in PostgreSQL;
- synthetic identities and sandbox value only;
- PostgreSQL is canonical; process memory is not canonical state; and
- no OIDC vendor, signer, testnet write, external Provider, or funds path.
- the reviewed CHAIN-001E receipt is imported without a network call as a
  separate public synthetic Registry Evidence read.

### Local worker

- separate container from the same image;
- claims PostgreSQL outbox messages with leases;
- writes only bounded topic/hash delivery receipts to the local log;
- marks delivery in PostgreSQL and performs full reconciliation;
- publishes a health heartbeat in container tmpfs; and
- has no signer, external destination, remote credential, or funds authority.

The local synthetic sink is intentionally not a production event transport.
Cloud scheduler, managed PITR, IAM, external alert delivery, and cross-region
behavior remain L1 deployment tests.

## Verification

```sh
pnpm run check:local-stack
node --test packages/deployment-topology/test/local-stack.test.js
node --test apps/private-pilot/test/local-worker.test.js
pnpm run local:acceptance
pnpm run check
```

`local:acceptance` verifies all four HTTP workspaces through the verified Lima
host-agent loopback forwarding, wallet-gated unauthenticated state, a fresh
one-use durable Agent proof, PostgreSQL 17, the exact migration count, durable
Tenant state, forced RLS, both least-privilege application/authentication
roles, worker heartbeat, reconciliation, and zero pending synthetic outbox
messages. A Human completes the final SIWE signature interactively in the
browser; automated PostgreSQL tests cover real EIP-191 verification, durable
session restart, expiry, wallet invalidation, and Credential revocation.

## Security boundary

- all product listeners are loopback-only;
- macOS access verifies loopback listeners belong to the current Lima host agent;
- the database is VM-internal and is not published to macOS;
- rootless Docker and a dedicated VM isolate the containers;
- runtime containers are read-only, capability-free, and
  `no-new-privileges`;
- secrets are random, local-only, ignored by Git, and never included in
  Evidence or logs;
- no raw KYC/PII is used; and
- remote access, cloud mutation, public signup, testnet writes, signers,
  external execution, Human credit, and real funds remain false.
