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

The tracked M1-B Gate Profile is preserved as the historical source profile for
the requirement registry and its original 38-required / 6-deferred decision.
Its direct checker remains active so the source profile cannot drift, including
its historical `deploymentAuthorized:true` field. That field is not inherited
by current release closure. The sole effective current-stage authority is the
2026-08-14 Founder overlay bound below, which explicitly overrides deployment
and every related external release action to false. This supersedes the
branch-bound M1-A.1 checker and the base profile only for the current aggregate
gate; it does not rewrite or relabel either historical source.

The sealed local RC v2 remains direct historical verification for its bound
2026-07-31 branch and 48-migration state. Its `pnpm run check:local-rc` command
is retained, but the current aggregate uses the later tracked PROD-CUTOVER-001
preflight checker. That preflight is an ancestor-bound no-funds manifest whose
verdict remains explicitly `BLOCKED — NOT PRODUCTION RELEASED`; it is not the
future P0-5 exact-green candidate.

The M1-B checkpoint is intentionally not a release candidate. It keeps
`candidateCommit` unset and `exactGreen`, `deploymentClosureClaimed`, real
funds and mainnet false. P0-5 may bind a clean exact commit only after all
applicable repository, security, transport, PostgreSQL and acceptance gates
pass against that commit. Deployment may remain explicitly pending; in that
state no deployed SHA or deployment-closure claim is permitted.

## 2026-08-14 Founder release-closure overlay

The immutable 38-required / 6-deferred M1-B Gate Profile and its direct checker
remain unchanged. The Founder decision dated 2026-08-14 is recorded as a
versioned current-closure overlay at
`product/traceability/ipo-one.m1-b-release-closure-founder-overlay.2026-08-14.v1.json`.
The aggregate checkpoint invokes its dedicated checker without rewriting or
reclassifying the source profile or historical requirement Evidence. The
checkpoint classifies the base Gate Profile and ancestor-bound cutover
preflight as preserved historical inputs with `aggregateCurrentStageGate:false`;
only this overlay has `soleEffectiveCurrentStageAuthority:true`.

For current M1-B release closure, the overlay derives an effective 39-required /
5-deferred gate. `REQ-UX-001` and `REQ-UX-003` require exact-candidate Human and
Capital Partner acceptance. Full privileged `REQ-UX-004` becomes an M1-C / L2
Closed Pilot gate because its recent phishing-resistant MFA topology is not
currently composed.

Risk security remains mandatory through the separate
`M1_B_RISK_SIWE_ONLY_FAIL_CLOSED` gate. Exact-candidate Evidence must prove that
a SIWE-only session cannot reach operations requiring recent phishing-resistant
MFA, no weak-auth fallback exists, authorization policy is unchanged, no Risk
surface lacking that assurance is newly exposed or promoted, and the privileged
mutation count is zero.

Final SHA, tree, counts, runtime identity, artifact hashes, rollback target and
deployment status bind through external private exact-commit Evidence and the
PR #20 release report. The tracked checkpoint does not self-reference a commit
hash and is not updated after acceptance as a metadata-only seal. If deployment
is pending, the older deployed SHA remains historical state and cannot be used
as current-candidate Evidence. This overlay does not authorize merge,
deployment, deployment Evidence collection requiring a deployment action,
promotion, alias or DNS mutation, custom-domain mutation, tag, or seal.

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
- The final exact-green commit and P0-5 acceptance/deployment-status Evidence
  remain pending; deployed Evidence is conditional on separate deployment
  authorization.
