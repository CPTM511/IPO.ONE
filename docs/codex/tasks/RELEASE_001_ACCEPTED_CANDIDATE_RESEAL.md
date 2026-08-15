# RELEASE-001 — Accepted candidate reseal

Status: In progress — accepted P0 slice fixed; branch/commit authorization pending  
Created: 2026-07-31  
Updated: 2026-08-01  
Baseline commit: 4b0e41dde352283e0d27228d51d1fb99f04c97a8  
Depends on: GATE-001, UX-SAFE-001, UX-SAFE-002 and TRUST-002 accepted  
Phase: Product Optimization Phase 1 / L0 local integration

## Context

`deploy/local/release-candidate.v2.json` is an integrity statement about exact
accepted bytes. It must not be rewritten while development changes are
unreviewed, uncommitted or still missing a required product gate.

On 2026-07-31, `pnpm run check:local-rc` correctly rejected source drift at
`apps/web/src/index.html`. The manifest was intentionally left unchanged. A
green functional test run does not authorize resealing, committing, deploying
or changing the candidate identity.

On 2026-08-01, the dependent P0 Issues were accepted for release assembly.
The shared worktree remains mixed with unrelated and still-changing marketing,
prototype and generated-output files, so it is not a valid clean release input.
RELEASE-001 therefore requires an exact allowlist and an isolated worktree; it
must not obtain a nominally clean state by stashing, moving, deleting or
ignoring user files.

The repository also contains an older `docs/codex/audits/RELEASE-001/`
checkpoint from 2026-07-26. That historical audit remains immutable. This Issue
is the Product Engineering and Experience Standard's 2026-08-01 local P0
reseal checkpoint and does not reopen, overwrite or reinterpret the older
audit.

## Scope

- Start only after the included Issues and code are reviewed and explicitly
  accepted for one candidate.
- Require a clean committed source identity before deriving candidate hashes.
- Run the complete repository gate against those exact bytes.
- Regenerate the local release candidate only through the reviewed repository
  process.
- Re-run the complete gate after regeneration and record exact source SHA,
  manifest hash, commands, counts and environment profile.
- Preserve a NO-GO result for any remaining drift, failure or incomplete
  Evidence.
- Create a versioned v3 successor; preserve `release-candidate.v2.json` and its
  verifier byte-for-byte.
- Use a deterministic repository builder for all source hashes. No manifest
  source hash may be entered or corrected manually.

## Non-goals

- No commit, tag, push or branch operation without explicit user instruction.
- No deployment, remote access, credential, signer, chain transaction or
  public endpoint.
- No test bypass, snapshot acceptance or manual hash editing.
- No real funds, production data or KYC/PII.
- No change to product, permission, risk, pricing or accounting semantics.
- No `git add -A`, broad stash, broad clean-up or mutation of excluded user
  files.

## Accepted P0 source allowlist

Only the following 24 existing paths may enter the accepted P0 source commit:

- `.github/ISSUE_TEMPLATE/codex_task.md`
- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md`
- `modules/tenant-command-gateway/src/tenant-command-clients.js`
- `modules/tenant-command-gateway/test/tenant-command-gateway.test.js`
- `docs/codex/tasks/GATE_001_CURRENT_CANDIDATE_INTEGRITY.md`
- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/test/manual-primary-actions.v1.json`
- `apps/web/test/static-ui.test.js`
- `docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md`
- `docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md`
- `docs/codex/tasks/UX_SAFE_001_AGENT_WORKSPACE_NAVIGATION.md`
- `apps/web/src/servicing-case-presentation.js`
- `apps/web/test/servicing-case-presentation.test.js`
- `docs/codex/tasks/UX_SAFE_002_SAFE_REPAYMENT_DEFAULT.md`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `apps/web/src/owned-evidence-presentation.js`
- `apps/web/test/owned-evidence-presentation.test.js`
- `apps/web/test/support/agent-console-browser-host.mjs`
- `apps/web/test/support/human-lifecycle-browser-host.mjs`
- `docs/codex/tasks/TRUST_002_LATEST_AUTHORIZED_EVIDENCE_VISIBILITY.md`
- `docs/codex/tasks/RELEASE_001_ACCEPTED_CANDIDATE_RESEAL.md`

RELEASE-001 may additionally add only its reviewed release mechanics: the v3
builder, v3 verifier, package-script wiring, v3 manifest and bounded release
Evidence. These files are release infrastructure, not additions to the accepted
product-feature slice.

The following roots and Issues are explicitly excluded regardless of their
current worktree state:

- `docs/marketing/ipo-one-brand-film/**`
- `output/**`
- `prototypes/ipo-one-capital-partners-film/**`
- `docs/codex/tasks/MARKETING_FILM_006_*`
- `docs/codex/tasks/MARKETING_FILM_007_*`

## Release mechanics and likely files

- `deploy/local/release-candidate.v3.json` as a successor artifact;
- `scripts/build-local-release-candidate-v3.mjs` as a deterministic builder;
- `scripts/check-local-release-candidate-v3.mjs` as a fail-closed verifier;
- `package.json` only for explicit v1/v2/v3 script wiring;
- a new, non-colliding 2026-08-01 RELEASE-001 Evidence location;
- no product source file outside the accepted allowlist unless a separate
  failing Issue is opened and accepted.

`deploy/local/release-candidate.v2.json` and its v2 verifier are inputs to the
successor chain, not editable release files.

## Commit and sealing procedure

The release requires two local commits on an isolated `codex/` branch:

1. **C1 — accepted source and release tooling.** Copy only the 24-path P0
   allowlist plus reviewed v3 mechanics into a clean isolated worktree. Commit
   them, prove the worktree clean and record C1 as the source identity.
2. **Pre-seal verification.** Run every applicable check and test except the
   not-yet-materialized v3 manifest check. This is a pre-seal gate, not a claim
   that the complete `pnpm run check` has passed.
3. **Deterministic derivation.** From clean C1, have the reviewed builder derive
   v3 source hashes and bounded verification metadata. Any failure leaves v2
   untouched and produces NO-GO.
4. **C2 — seal.** Commit only the generated v3 manifest and bounded release
   Evidence. The verifier must bind the clean C2 `HEAD` to the latest commit
   containing the v3 manifest, while the manifest binds its product and
   operational sources to C1.
5. **Post-seal verification.** From clean C2, run the complete `pnpm run check`
   and all required gates again. Only this run can satisfy the release
   acceptance criteria.

No branch or commit step begins until the user explicitly authorizes both.

## Acceptance criteria

1. The candidate starts from explicitly accepted, committed and clean source.
2. Every manifest entry is generated from and verifies against those exact
   bytes.
3. `pnpm run check` passes without skipping or weakening a gate.
4. Full repository, Web, security and required PostgreSQL tests pass against
   the same source identity.
5. Browser Evidence covers the accepted Human and Agent workflows without
   writing to production data.
6. The report states local no-funds status and does not imply hosted,
   Testnet-verified, public-beta-ready or real-capital-active status.
7. The checkpoint does not claim full Product Engineering and Experience
   Standard compliance while later ordered gaps remain open.
8. Any failure leaves the prior manifest untouched and produces a NO-GO
   report with the exact failing gate.
9. The v3 verifier fails closed on a dirty worktree, a `HEAD` that is not the
   latest commit containing the v3 manifest, predecessor-v2 hash drift, or
   missing/extra candidate paths.
10. The v3 manifest records v2 as its immutable predecessor and preserves any
    historical Testnet checkpoint as non-authorizing history; no new chain
    write is performed.

## Test commands

pnpm run check

pnpm run test:security

pnpm run test:postgres

git status --short

git diff --check

Exact browser commands and fixtures must be recorded by the implementing
Issue and must use isolated synthetic or redacted data.

The pre-seal command set must be enumerated explicitly and must not be labelled
as `pnpm run check`. The post-seal C2 run must execute the unmodified complete
`pnpm run check`, including `check:local-rc` wired to v3.

## Security checklist

- [ ] Source is accepted, committed and clean before reseal.
- [ ] No test, schema or manifest assertion is weakened.
- [ ] No credentials, secrets, raw PII or private keys enter artifacts.
- [ ] Browser tests use isolated no-funds data.
- [ ] Candidate claims remain local and evidence-bounded.
- [ ] Deployment and production authority remain separately gated.
- [ ] v2 manifest and verifier hashes remain unchanged.
- [ ] Accepted and excluded path sets are checked before each commit.
- [ ] C1 and C2 are created only after explicit branch/commit authorization.

## Permission boundary

Integrity verification and local candidate metadata only. This Issue itself
does not authorize commit, tag, push, deployment, credentials, signers, remote
access, Testnet writes or funds movement.

## Data and migration impact

No business-data mutation. If an accepted candidate contains migrations, they
must have their own reviewed Issue, forward and rollback evidence, and isolated
test database proof before RELEASE-001 starts.

## Rollback plan

On any failure, retain the prior manifest and report NO-GO. Never restore a
passing state by editing expected hashes by hand or deleting failed Evidence.

## Required Evidence

- accepted source commit and clean-worktree proof;
- complete command log with exit status and test counts;
- manifest derivation and post-derivation verification;
- browser Evidence for the included Human and Agent flows;
- explicit status statement limited to local no-funds readiness.

## Readiness decision

Conditionally ready for isolated assembly. GATE-001, UX-SAFE-001, UX-SAFE-002
and TRUST-002 are accepted, and the exact P0 source allowlist is fixed. The
current mixed worktree is not a release input. Execution is stopped at the
explicit branch/commit permission gate; no branch, commit, manifest rewrite,
push, tag, deployment or external write has been authorized or performed.
