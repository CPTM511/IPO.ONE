# M1-A.1 Candidate Blocker Remediation and Evidence Closure

Audit date: 2026-08-04

Status: `REMEDIATION_EXECUTED_FOUNDER_REVIEW_REQUIRED`

M1-B authorization: `FALSE`

No Release Candidate, branch, commit, tree, or tag was created. This package
contains only the Founder-approved blocker remediation and reproducible
evidence. It does not add fee runtime, dispute capability, production
dependencies, real-value authority, or a Strategy Vault.

## Founder-named blocker disposition

| Blocker | Disposition | Evidence and remaining boundary |
| --- | --- | --- |
| Exact candidate hash | `CLOSED_AS_PRESEAL_EVIDENCE` | `deploy/local/m1-a-1-candidate-snapshot.v1.json` binds the explicit inclusion set to branch, HEAD, tree, file hashes, and one content root while denying every M1-B authorization flag. |
| Lint/typecheck | `CLOSED` | Current retained `pnpm run lint` and `pnpm run typecheck` logs pass. |
| Real authenticated Golden Flow | `CLOSED_FOR_AUTHENTICATED_EXECUTION_EVIDENCE` | Human and Agent SIWE core lifecycles executed. Product completeness is not claimed: Human Dispute/Correction is absent and fresh-session Agent continuation is not fully server-derived. |
| Lockbox persistence | `CLOSED_AT_VERIFIED_SANDBOX` | Migration 0049, domain/database invariants, authenticated persistence, restart/RLS tests, real-browser recovery, and independent Agent execution/repayment evidence pass. |
| M1 requirement gate classification | `CLOSED` | The gate validates exactly 44 Constitution IDs and reports 35 `VERIFIED_SANDBOX`, 8 `IMPLEMENTED_UNVERIFIED`, and 1 `NOT_IMPLEMENTED`. |

## Candidate identity boundary

The exact candidate content root is stored only in
`deploy/local/m1-a-1-candidate-snapshot.v1.json`; the snapshot excludes itself
to avoid recursive self-reference. It records the current dirty worktree, the
unchanged HEAD/tree, and explicit denials for RC creation, commit, tag, and
M1-B entry.

The older sealed v2 RC remains immutable. `pnpm run check` continues to fail
closed because that older manifest expects 48 migrations and this candidate has
49. M1-A.1 does not rewrite, reseal, or relabel the older RC.

## Frozen decisions

- Offline installation as a release gate: pending separate Founder decision.
- Dependency vendoring or upgrades: not performed and not authorized.
- Protocol Execution Fee runtime: frozen.
- Financial Revenue Share runtime: frozen.
- Fee Policy/ADR: requires Founder approval before implementation.
- Strategy Vault: outside the approved MVP.
- Real funds, production, mainnet, custody, external signing, external Provider
  writes, real withdrawal, and real KYC: no evidence and no authorization.

## M1-B entry decision

`DO_NOT_ENTER_M1_B`.

Reasons:

1. The worktree remains intentionally dirty and has no immutable candidate
   commit.
2. The inclusion manifest remains a review draft, not Founder authorization.
3. The full evidence bundle and known gaps require independent Founder review.
4. `REQ-PILOT-001` is absent and eight additional requirements remain
   unverified.
5. The older sealed RC gate correctly rejects migration drift.

Stop after delivering this evidence package and wait for explicit Founder
approval. Do not create a branch, commit, tag, RC, or release.
