# TC-403 GPT Agent supplementary adversarial review

Status: `AI_SUPPLEMENTARY_RETEST_PASSED`

Formal independent-review status: `NOT_PERFORMED`

Release status: `BLOCKED_INDEPENDENT_REVIEW`

## Reviewer identities and separation limitation

- Initial broad reviewer: `gpt_agent_tc403_review_01`
- Narrow gate reviewer and retester: `gpt_agent_tc403_gate_review_02`
- Review type: read-only supplementary AI adversarial review
- Retested at: `2026-07-26T04:37:04.000Z`
- Branch: `codex/commercial-access-release`
- Baseline HEAD:
  `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- Reviewed artifact-set hash:
  `0x19d3fb26a3343354cf0cd98e3433b30313fd132a715083198dc5361fe936ffd3`
- Checked assurance hash:
  `0x8bad2dce477e84d726b07f20277a841ec3d81f2b6613521b8f8c998b05785124`

These Agents are Codex-hosted GPT reviewers. They are separate executions from
the commissioning implementation turn, but they are not organizationally
independent human or external security reviewers. This document therefore
cannot set `independentReview.status=PASSED`, cannot complete Founder
acceptance, and cannot unlock RELEASE-001 under the accepted TC-403 gate.

## Method and scope

The Agents performed read-only static review and targeted local adversarial
tests over:

- TC-403 policy, evaluator, schema, tests, assurance, DR script, runbook, audit,
  and independent-review handoff;
- directly relevant TC-301 through TC-402 execution, risk, reconciliation,
  funding, settlement, Ledger/Event/Evidence, Tenant/RLS, and denylist
  boundaries;
- the 14 adversarial families required by the independent-review handoff; and
- malicious assurance payloads for restore, capacity, drill, finding, policy,
  reviewer, report, source identity, timestamp, and launch-state forgery.

No live system, credential, signer, API Wallet, Exchange write, mainnet,
deployment, payout, transfer, withdrawal, real capital, or real funds were
used.

## Initial findings

| Finding | Severity | Initial result | Final result |
| --- | --- | --- | --- |
| `TC403-GATE-P1-001` forged restore/capacity/drill assurance | P1 | Reproduced | `RESOLVED_RETESTED` |
| `TC403-GATE-P1-002` review identity/report replay | P1 | Reproduced | `RESOLVED_RETESTED_MACHINE_GATE` |
| `TC403-GATE-P1-003` dirty worktree not content-addressed | P1 | Reproduced | `RESOLVED_RETESTED` |
| `TC403-GATE-P1-004` findings/retests not bound | P1 | Reproduced | `RESOLVED_RETESTED_MACHINE_GATE` |
| `TC403-REV-P2-001` capacity values presented as measured concurrency | P2 | Confirmed | `RESOLVED_RETESTED` |
| `TC403-GATE-P2-001` executable override inherited parent environment | P2 | Confirmed | `RESOLVED_RETESTED` |
| `TC403-REV-P2-002` runtime alert provenance not composed | P2 | Confirmed | `OPEN` |

Initial malicious payloads could use fabricated manifest hashes and comparison
fields, zero capacity counts, self-asserted drill booleans, an arbitrary
release SHA, a mutable in-memory reviewer policy, an arbitrary report hash, a
future review time, or an omitted finding array to obtain a misleading
human-acceptance candidate.

## Remediation

- Restore assurance now carries complete source and restored manifests. The
  evaluator recomputes both manifest hashes, the canonical 14 comparison
  fields, mismatch set, backup age, RTO, and zero-RPO requirement.
- Capacity evidence is recomputed against the source-fixed policy, including
  exact count arithmetic and Evidence hash. It is truthfully labelled a
  boundary-arithmetic self-test with a configured concurrency ceiling, not a
  measured concurrency result.
- Failure-drill records bind source-fixed scenario, safe state, runner ID,
  artifact-set hash, output hash, start/end time, and complete Evidence hash.
- A canonical manifest binds the baseline commit and every changed/untracked
  file in the stacked worktree by path, status, byte length, and SHA-256.
  Generated assurance/review/audit files and one unrelated nested repository
  are explicitly excluded.
- The approved policy hash is source-pinned. Injecting a reviewer through a
  modified in-memory policy fails before assurance evaluation.
- Review envelopes bind reviewer type, release commit, artifact set, policy,
  finding set, completion time, report hash, and attestation hash.
- Resolved findings require a non-null retest Evidence hash.
- Evaluator output always sets `launchBlocked=true`; the JSON Schema requires
  `const: true`. A machine result can never approve the Founder gate.
- The DR script accepts only non-writable PostgreSQL 17 executables in
  source-fixed prefixes and supplies a minimal subprocess environment.

## Retest

The narrow GPT Agent retest independently confirmed:

- fabricated comparison fields/manifests: rejected;
- zero capacity result: rejected;
- mutated drill output/artifact binding: rejected;
- injected reviewer/policy: rejected;
- fake/future/replayed review: rejected;
- worktree manifest drift: rejected;
- resolved P0/P1 without retest Evidence: rejected;
- `launchBlocked=false` in evaluator or schema-valid artifact: impossible.

Evidence:

- TC-403 targeted suite: 11/11 passed.
- Security suite: 33/33 passed.
- PostgreSQL suite with physical restore: 75/75 passed.
- Complete repository gate: 544/544 tests passed.
- Schema registry: 73 contracts passed.
- OpenAPI: 21 paths/operations passed.
- Migrations: 38 ordered up/down pairs passed.
- `git diff --check`: passed.
- Supplementary retest digest:
  `e1583b0f7a158c965a9d3aa55fec4887393bea0a365778676e4d51040ff83d9b`.

Final technical counts:

- Open P0: `0`
- Open P1: `0`
- Open P2: `1`

The remaining P2 is intentionally visible: alert signal provenance is not yet
composed with durable Tenant/Facility Evidence and trusted persisted
timestamps. The TC-403 alert evaluator is not runtime-composed and grants no
authority, so this is not represented as a current P0/P1 or as production
readiness.

## Decision

The machine-gate P0/P1 remediation is complete. The GPT Agent review remains
supplementary only.

TC-403 remains:

- implementation: `IMPLEMENTED_UNVERIFIED`;
- release: `BLOCKED_INDEPENDENT_REVIEW`;
- independent review: `NOT_PERFORMED`;
- launch blocked: `true`.

The next valid action is an external human or organizational review over the
exact artifact-set hash above, followed by Founder acceptance of that external
report's exact hash. RELEASE-001 remains blocked until both occur.
