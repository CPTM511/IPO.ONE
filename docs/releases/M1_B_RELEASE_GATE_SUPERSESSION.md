# M1-B Release Gate Supersession

Status: `P0_RELEASE_CLOSURE_IN_PROGRESS`

Ordered baseline: `ae6a0571d9052028b2043437938ca37d15b96f6b`

## Decision

The immutable M1-A.1 snapshot remains historical evidence for the dirty
pre-seal state it records. Its direct checker remains available as
`pnpm run check:m1-a-1-snapshot` and correctly fails outside its bound branch,
HEAD and worktree. Neither the untracked historical snapshot nor its tracked
checker is rewritten, and the current aggregate does not require that local
historical file to exist in a clean checkout.

The tracked M1-B Gate Profile checker validates the immutable checkpoint by
commit object, tree, parent, exact 67-path scope and content root. It does not
require a checkout-local branch ref, because GitHub Actions checks out only the
triggering ref by default.

The aggregate `pnpm run check` now uses the Founder-approved M1-B Gate Profile
and `deploy/local/m1-b-release-closure-checkpoint.v1.json` as its current-stage
authority. This explicitly supersedes the branch-bound M1-A.1 checker only for
the current aggregate gate; it does not supersede or relabel M1-A.1 history.

The sealed local RC v2 remains direct historical verification for its bound
2026-07-31 branch and 48-migration state. Its `pnpm run check:local-rc` command
is retained, but the current aggregate uses the later tracked PROD-CUTOVER-001
preflight checker. That preflight is an ancestor-bound no-funds manifest whose
verdict remains explicitly `BLOCKED — NOT PRODUCTION RELEASED`; it is not the
future P0-5 exact-green candidate.

The M1-B checkpoint is intentionally not a release candidate. It keeps
`candidateCommit` unset and `exactGreen`, `deploymentClosureClaimed`, real
funds and mainnet false. P0-5 may bind a clean exact commit only after all
applicable repository, security, transport, PostgreSQL, deployment and
acceptance gates pass against that commit.

## Dependency build policy

pnpm 11 rejected the clean frozen install because it detected lifecycle scripts
without a reviewed workspace allowlist. The exact allowlist contains only:

- `@reown/appkit`: its pinned `1.8.19` postinstall reads package manifests and
  reports AppKit version consistency. It performs no network request or source
  mutation.
- `esbuild`: its pinned `0.28.1` postinstall selects and integrity-checks the
  lockfile-resolved platform binary. It may fall back to the npm registry only
  if that optional binary is unavailable.

No wildcard, broad script permission, ignored-build suppression, lockfile
relaxation or install-command bypass is introduced. The CI command remains
`pnpm install --frozen-lockfile`.

README tool, operation, schema and migration counts are derived and checked by
`pnpm run check:readme-counts`; they are no longer unverified prose counters.

## Boundaries

- No product behavior, protocol, schema, migration, permission, wallet,
  Provider, MCP or funds path changes.
- No M1-B completion, deployment, production, real-value or mainnet claim.
- No historical evidence mutation.
- The final exact-green commit and deployment Evidence remain P0-5 work.
