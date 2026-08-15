# M1-A.1 — Candidate Blocker Remediation and Evidence Closure

## Status

- Status: In progress
- Founder decision date: 2026-08-03
- Baseline branch: `codex/checkpoint-20260727-pre-strategy`
- Baseline commit: `4b0e41dde352283e0d27228d51d1fb99f04c97a8`
- Baseline tree: `907820553598ff50ff0446c1c4c365247a074fe8`
- Product phase and delivery level: M1-A.1 / L0 local synthetic no-funds
- Release authority: M1-B remains blocked

## Context

The Founder accepted the M1-A audit direction and stop decision without final
acceptance of its reports, logs, matrices, or inclusion manifest. The M1-A
inclusion manifest remains an audit-scope draft and is not authorization to
create a release-candidate branch, commit, tag, or release.

M1-A.1 is a bounded remediation and evidence-closure checkpoint for five
candidate blockers: candidate hash integrity, lint/typecheck gates, a real
authenticated Golden Flow, durable Agent Lockbox persistence, and executable
M1 requirement-classification gates. Requirement classifications may advance
only when reproducible evidence satisfies the applicable gate.

The Product Constitution remains the highest product-truth authority. The
Product Engineering and Experience Standard governs implementation and
acceptance. `RELEASE-001` continues to protect the immutable v2 manifest and
requires separate Founder authority before any isolated branch, commit, or
seal procedure begins.

## Scope

- Preserve the current Git and worktree state without discarding, stashing,
  auto-formatting, or broadly staging existing work.
- Add deterministic pre-seal candidate source hashing and fail-closed
  verification without modifying or relabelling the sealed v2 manifest.
- Add explicit repository lint and type/contract conformance commands without
  adding, upgrading, downloading, or vendoring dependencies.
- Persist the Constitution-approved Agent Lockbox projection through the
  authenticated Tenant command path, within the existing Agent execution and
  repayment lifecycle.
- Prove Tenant isolation, authorization, idempotency, restart-readability,
  reconciliation, purpose/Provider restriction, and withdrawal denial for the
  persisted Lockbox using synthetic no-funds data.
- Execute Human and Agent Golden Flows through the real local authenticated
  runtime and real browser, with redacted evidence.
- Create a machine-readable 44-requirement evidence registry and a fail-closed
  classification checker.
- Correct M1 traceability classifications only where current reproducible
  evidence supports the classification.
- Produce an M1-A.1 evidence bundle and stop for Founder review.

## Non-Goals

- No M1-B execution, release-candidate branch, commit, tag, push, release, or
  deployment.
- No product feature, protocol family, public operation, role, or lifecycle
  expansion beyond the five named blockers.
- No Fee Policy or runtime fee implementation. Protocol Execution Fee and
  Financial Revenue Share remain frozen pending a Founder-approved policy or
  ADR.
- No decision that offline installation is a release gate, and no dependency
  vendoring, dependency addition, dependency upgrade, or lockfile rewrite.
- No Strategy Vault, unrestricted wallet, custody, capital pool, arbitrary
  withdrawal, or borrower-directed transfer capability.
- No production identity, KYC provider, external signer, custody, mainnet,
  production funds, real withdrawal, or real settlement.
- No weakening, skipping, renaming, or reinterpreting a failing release gate
  as passing.
- No implementation of unrelated P0/P1 findings or specification conflicts.

## Likely Files

- `docs/codex/tasks/M1_A_1_CANDIDATE_BLOCKER_REMEDIATION_AND_EVIDENCE_CLOSURE.md`
- `package.json`
- `pnpm-workspace.yaml`
- `scripts/build-m1-a-1-candidate-snapshot.mjs`
- `scripts/check-m1-a-1-candidate-snapshot.mjs`
- `scripts/lint-source.mjs`
- `scripts/check-contract-types.mjs`
- `scripts/check-m1-requirement-evidence.mjs`
- `deploy/local/m1-a-1-candidate-snapshot.v1.json`
- `product/traceability/ipo-one.m1-requirement-evidence.v1.json`
- `packages/domain/src/agent-lockbox.js`
- `packages/domain/test/agent-lockbox.test.js`
- `modules/tenant-command-gateway/src/credit-execution-handlers.js`
- `modules/tenant-command-gateway/test/credit-execution-handlers.test.js`
- `modules/persistence/src/postgres-core-repository.js`
- `modules/persistence/test-postgres/tenant-command-gateway-postgres.test.mjs`
- `apps/private-pilot/src/private-pilot-database.js`
- `apps/private-pilot/src/production-bootstrap.js`
- `apps/private-pilot/test-postgres/production-bootstrap.test.mjs`
- `modules/persistence/test-postgres/postgres-event-runtime.test.mjs`
- `modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs`
- `db/migrations/0049_agent_lockbox_projection.up.sql`
- `db/migrations/0049_agent_lockbox_projection.down.sql`
- `docs/traceability/M1_REQUIREMENT_TRACEABILITY_MATRIX.md`
- `docs/verification/M1_A_1_*`
- `artifacts/m1-a-1/**`

No file outside this bounded list may be changed without first updating this
task contract and recording why the additional path is necessary.

`pnpm-workspace.yaml` is included only to disable pnpm's implicit dependency
installation before script execution. That setting keeps verification
read-only with respect to installed dependencies and does not decide whether
offline installation is a release gate.

## Acceptance Criteria

1. Given the immutable v2 release manifest, when M1-A.1 candidate evidence is
   generated, then v2 remains byte-identical and the new artifact identifies
   itself as a dirty-worktree pre-seal snapshot, not a release candidate.
2. Given the exact bounded M1-A.1 source set, when the snapshot verifier runs,
   then missing, extra, or hash-drifted source bytes fail closed.
3. Given repository JavaScript and machine-readable contracts, when lint and
   type/contract checks run, then syntax, import/export, declaration, and
   schema-contract failures produce non-zero exits without new dependencies.
4. Given an authenticated Agent with an active exact Mandate, accepted Offer,
   and active AccountBinding, when controlled execution succeeds, then one
   purpose-bound Lockbox projection is durably written in the same Tenant
   transaction and is bound to the Subject, Principal, Mandate, Offer,
   Obligation, AccountBinding, chain, asset, allowed Provider set, and purpose.
5. Given replay, cross-Tenant access, unauthorized authority, restart, and
   reconciliation checks, when the Lockbox is queried or the command repeats,
   then replay is idempotent, cross-Tenant and unauthorized access fail closed,
   restart reads the same projection, and reconciliation reports no drift.
6. Given the current approved MVP boundary, when any withdrawal or unrestricted
   transfer is attempted or inventoried, then no public Lockbox withdrawal path
   exists and the persisted projection explicitly records non-withdrawable,
   sandbox-only execution.
7. Given local synthetic identities, when Human and Agent Founder journeys are
   executed through the real authenticated local runtime in a real browser,
   then captured evidence identifies every reached lifecycle step and every
   stop, mock, missing persistence, or authorization failure without exposing
   invitation secrets, session tokens, raw PII, or private keys.
8. Given all 44 Constitution Requirement IDs, when the requirement evidence
   gate runs, then it rejects missing/extra IDs, invalid classifications,
   evidence-free upgrades, and any `VERIFIED_REAL` or `PRODUCTION_READY` claim
   without the required external and immutable-release evidence.
9. Given the completed M1-A.1 evidence, when reports are generated, then they
   distinguish current HEAD, dirty worktree, pre-seal snapshot, runtime truth,
   and Founder-gated release status.
10. On completion, execution stops before M1-B and records no release branch,
    commit, tag, deployment, production integration, external signature, chain
    write, or funds movement.

## Test Commands

```sh
git status --porcelain=v2 --branch
git diff --check
pnpm run lint
pnpm run typecheck
pnpm run check:m1-requirements
pnpm run check:m1-a-1-snapshot
pnpm test
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:restart
pnpm run local:acceptance
pnpm run local:agent:acceptance
pnpm run local:evidence-anchor:status
```

The complete `pnpm run check` result must also be recorded. It must not be
called passing while the immutable v2 release gate correctly rejects current
source drift. Offline installation is reported separately as an unresolved
Founder gate decision.

## Security Checklist

- [ ] The existing v2 manifest and verifier remain byte-identical.
- [ ] Agent execution remains exact-Mandate-bound and Principal-authorized.
- [ ] Lockbox spend remains allowlisted, purpose-bound, Provider-restricted,
      sandbox-only, non-custodial, and non-withdrawable.
- [ ] Lockbox writes share the authenticated Tenant transaction and Event log.
- [ ] Replay, stale authority, Tenant isolation, restart, and reconciliation
      failure paths are executable.
- [ ] Human and Agent use the same Obligation, Ledger, servicing, Event, and
      Evidence kernel.
- [ ] No raw PII, KYC payload, session token, invitation secret, credential,
      private key, or external signature is captured in evidence.
- [ ] No production deployment, real funds, mainnet, custody, external KYC,
      external signer, or real withdrawal is enabled or claimed.
- [ ] Fee runtime behavior remains unchanged.

## Permission Boundary

Authorized changes are limited to local synthetic/no-funds evidence closure for
the five Founder-named blockers. Existing roles, capital authority, risk policy,
pricing, fee policy, production dependencies, deployment topology, credentials,
signers, data classes, Provider contracts, chain-write authority, and funds
paths remain unchanged.

Founder approval is separately required for M1-B, release branch/commit/tag,
Fee Policy/ADR, offline-install release-gate treatment, dependency vendoring,
deployment, production identity/KYC, external signers, custody, mainnet, or real
value.

## Data and Migration Impact

Only an additive Lockbox persistence migration may be introduced, and only if
needed to encode Constitution-required authority and restriction bindings. It
must preserve legacy rows, include a down migration, enforce Tenant-scoped
foreign keys and v2 row consistency, and pass fresh and forward migration
tests. Browser or process-local state must not become canonical truth.

## Rollback Plan

Before any release seal, revert only the M1-A.1 paths through a reviewed patch.
If an additive Lockbox migration was applied to isolated local test data, run
its paired down migration or rebuild the disposable local database. Never use
`git reset --hard`, `git clean`, broad stash, manual hash correction, or deletion
of pre-existing user work.

## Required Evidence

- Exact Git branch, HEAD, tree, status, and bounded diff manifest.
- Immutable v2 file and verifier hashes before and after M1-A.1.
- Deterministic pre-seal snapshot plus fail-closed drift proof.
- Lint and type/contract command logs with exit status.
- Unit, integration, contract, PostgreSQL, security, and transport logs.
- Real-browser authenticated Human and Agent journey evidence with secrets
  redacted.
- Lockbox authorization, Tenant isolation, idempotency, restart, reconciliation,
  purpose/Provider restriction, and withdrawal-denial evidence.
- Machine-readable 44-ID evidence registry and checker output.
- Updated traceability matrix with evidence-bounded classifications.
- Known failures, unresolved conflicts, and exact Founder decisions still
  required.

## Dependency and Sequencing Notes

- Required predecessors: M0 Constitution registry and provisional M1-A audit.
- `RELEASE-001` v3 branch/commit/seal procedure remains blocked until the
  Founder accepts M1-A.1 evidence and explicitly approves M1-B.
- Fee policy, dispute expansion, production integrations, and other P0/P1
  recovery items must not be implemented opportunistically.
- Offline-install release-gate status remains a separate Founder decision.

## Completion Evidence

Complete only after every applicable acceptance criterion has reproducible
evidence. Any blocked criterion remains explicitly blocked; it cannot be
converted to a passing claim by code presence, test count, documentation, or a
manually updated expected value.

- Completed date: Pending
- Exact commands and counts: Pending
- Browser or machine-facing workflow result: Pending
- Security and permission review result: Pending
- Release status: M1-B blocked; no release candidate created
