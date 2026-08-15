# LOCAL-RC-001 — Repeatable local no-funds release candidate

Status: Sealed locally on 2026-07-29

## Context

The L0 delivery guide requires the exact runtime, migrations, protocol
contracts, configuration, test data, and failure-path evidence to be recorded
before a local candidate can be promoted. The project owner explicitly
authorized source sealing after the local lifecycle and Base Sepolia Evidence
anchor checkpoints completed. The Git commit containing the sealed manifest is
the immutable source identity; its exact SHA is recorded in the handoff.

## Scope

- Pin Node 26.5.0, pnpm 11.1.3, and PostgreSQL 17.
- Pin all 47 migrations and the checksum of the latest migration.
- Pin the Human OpenAPI, shared Tenant protocol, and `TRANSPORT-003` Agent
  HTTPS OpenAPI.
- Pin the local stack profile, Human/Agent conformance fixtures, Hyperliquid
  read-only fixture, and accepted Base Sepolia Registry and Evidence-anchor
  observations.
- Name and hash the tests covering the complete no-funds lifecycle, restart,
  replay, authentication expiry/revocation, wallet change, unknown outcomes,
  reconciliation, Agent suspension, Tenant pause, Facility freeze, and
  credit-Outcome retry.
- Keep all remote access, signer, real-funds, external execution, and public
  signup authority disabled.
- Record the separately approved active CHAIN-001F zero-value attestor without
  allowing this release to grant any new testnet-write authority.

## Non-goals

- No deployment, remote participant access, mainnet action, real-funds action,
  Provider execution, venue signer, public signup, or public launch.
- No new testnet deployment or write authority beyond the separately approved
  active CHAIN-001F zero-value Evidence attestor.
- No new credit Decision method or automatic model promotion.

## Likely files

- `deploy/local/release-candidate.v1.json`
- `scripts/check-local-release-candidate.mjs`
- `package.json`
- `docs/codex/tasks/LOCAL_RC_001_REPEATABLE_LOCAL_RELEASE_CANDIDATE.md`

## Acceptance criteria

- The manifest fails closed on migration, contract, fixture, runtime, test
  source, or safety-authority drift.
- `TRANSPORT-003` is included in the manifest and remains activation-disabled.
- The candidate is bound to the Git commit containing the manifest and records
  the explicit project-owner seal authorization.
- Repository checks, fresh PostgreSQL checks, local live acceptance, restart,
  and a second live acceptance pass.

## Verification receipt

- Node 26.5.0 repository gate: `647/647`.
- Fresh PostgreSQL 17 integration/RLS gate: `81/81`.
- Live local stack: 47 migrations and two acceptance passes with a full
  PostgreSQL/Pilot/worker restart between them.
- Four durable pre-provisioned authentication Credentials remained active;
  Human SIWE and Agent proof/replay state used the independent
  `authentication_only` PostgreSQL role.
- The persistent volume was retained and the post-restart pending outbox was
  empty.
- Durable Evidence and chain-anchor requirement counts matched, failed anchors,
  fake transaction hashes, orphan requirements, missing requirements, and
  unproved finalized anchors were all zero.
- The separately approved CHAIN-001F attestor remained active, Base
  Sepolia-only, zero-value, below its balance cap, and outside the repository.
- Secret scanning found no production credential or private key. Public
  testnet artifacts explicitly exclude private keys, and ignored `.ipo-one/`
  material remains outside the commit.
- Source is sealed by the Git commit containing
  `deploy/local/release-candidate.v1.json`.

## Test commands

```text
pnpm run check:local-rc
pnpm run check
pnpm run test:postgres
pnpm run local:up
pnpm run local:acceptance
pnpm run local:restart
pnpm run local:acceptance
```

## Security checklist

- [x] Synthetic/no-funds only.
- [x] Human and Agent share one Tenant protocol and obligation kernel.
- [x] Raw KYC/PII is not added.
- [x] Remote Agent transport remains disabled pending named approval.
- [x] This release grants no new testnet write, venue signer, Provider
      execution, deployment, or real-funds authority.
- [x] Active CHAIN-001F operation remains separately approved, zero-value,
      hash-only, and Base Sepolia-only.
- [x] Candidate is source-sealed by an exact Git commit.

## Rollback

Revert the sealed Git commit to return to the prior source baseline. That
source rollback does not rewrite PostgreSQL, deployed Base Sepolia state, or
already-finalized Evidence. Any later deployment must use its own rollback
procedure and may not infer authority from this local seal.
