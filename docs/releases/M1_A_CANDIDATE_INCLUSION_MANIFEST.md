# M1-A Candidate Inclusion Manifest

Manifest status: `PROPOSED_NOT_APPROVED`

M1-B authorization: `DENIED_UNTIL_EXPLICIT_FOUNDER_APPROVAL`

Founder decision recorded on 2026-08-03: this file is approved only as an audit
scope draft. It is not authorization to create a Release Candidate, branch,
commit, tag, or release. M1-B remains blocked. M1-A.1 remediation files and
evidence are separately enumerated by
`scripts/m1-a-1-candidate-paths.mjs`; their presence does not amend this draft
into an approved inclusion manifest.

Current-state notice: the original known-gaps proposal below is retained as
historical M1-A evidence. M1-A.1 subsequently produced durable Agent Lockbox
evidence, authenticated Human and Agent runtime evidence, passing lint and
typecheck commands, and an exact pre-seal content root. The current unresolved
gaps and classifications are in
`docs/releases/M1_A_1_CANDIDATE_BLOCKER_CLOSURE.md` and
`docs/verification/M1_A_1_IMPLEMENTATION_LEVEL_REPORT.md`. This update does not
approve the inclusion draft or authorize M1-B.

## Proposed release identity

| Item | Proposal only |
| --- | --- |
| Candidate branch | `codex/m1-rc-v0.1.0-rc.1` |
| RC version | `0.1.0-rc.1` |
| Annotated tag | `m1-rc-v0.1.0-rc.1` |
| Commit message | `chore(release): freeze IPO.ONE M1 RC v0.1.0-rc.1` |
| Base commit | `4b0e41dde352283e0d27228d51d1fb99f04c97a8` |
| Base tree | `907820553598ff50ff0446c1c4c365247a074fe8` |

No proposed Git object has been created.

## Inclusion rule

The proposal is a path-exact freeze of product/governance work that is already
present in the dirty workspace plus the M1-A evidence. It does not authorize
code fixes, generated hash updates, dependency changes, or capability-level
promotion.

Because the current build and release-hash checks are not reproducible, the
recommended Founder decision is to reject immediate M1-B entry and first decide
whether the runtime change set below is the intended RC content.

## Proposed included paths

### A. Existing modified governance and task controls

```text
.github/ISSUE_TEMPLATE/codex_task.md
AGENTS.md
docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md
docs/codex/tasks/GATE_001_CURRENT_CANDIDATE_INTEGRITY.md
docs/codex/tasks/GOVERNANCE_001_PRODUCT_CONSTITUTION_M0.md
docs/codex/tasks/RELEASE_001_ACCEPTED_CANDIDATE_RESEAL.md
docs/codex/tasks/TRUST_002_LATEST_AUTHORIZED_EVIDENCE_VISIBILITY.md
docs/codex/tasks/UX_SAFE_001_AGENT_WORKSPACE_NAVIGATION.md
docs/codex/tasks/UX_SAFE_002_SAFE_REPAYMENT_DEFAULT.md
```

### B. Product Constitution

```text
docs/PRODUCT_CONSTITUTION.md
```

This inclusion records the current 44 Requirement IDs. It does not resolve the
fee-formula omission identified by M1-A.

### C. Current uncommitted runtime and test change set

```text
apps/tenant-api/src/tenant-web-assets.js
apps/tenant-api/test/transport-conformance.test.mjs
apps/web/src/app.js
apps/web/src/index.html
apps/web/src/owned-evidence-presentation.js
apps/web/src/servicing-case-presentation.js
apps/web/test/manual-primary-actions.v1.json
apps/web/test/owned-evidence-presentation.test.js
apps/web/test/servicing-case-presentation.test.js
apps/web/test/static-ui.test.js
apps/web/test/support/agent-console-browser-host.mjs
apps/web/test/support/human-lifecycle-browser-host.mjs
modules/tenant-command-gateway/src/tenant-command-clients.js
modules/tenant-command-gateway/test/tenant-command-gateway.test.js
```

The two browser-host files are test fixtures and must remain labeled as fixture
evidence. Their inclusion does not prove the real authenticated runtime.

### D. User-facing documentation changed with the runtime set

```text
docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md
docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md
```

These are documentation facts only. They do not promote implementation status.

### E. M1-A evidence bundle

```text
docs/releases/M1_A_CANDIDATE_AUDIT.md
docs/releases/M1_A_GIT_STATE.md
docs/releases/M1_A_CANDIDATE_INCLUSION_MANIFEST.md
docs/traceability/M1_REQUIREMENT_TRACEABILITY_MATRIX.md
docs/verification/M1_FOUNDER_JOURNEY_AUDIT.md
docs/verification/M1_TEST_AND_BUILD_REPORT.md
docs/verification/M1_IMPLEMENTATION_LEVEL_REPORT.md
artifacts/m1-a/untracked-files-at-start.txt
artifacts/m1-a/unstaged-at-start.patch
artifacts/m1-a/checksums.sha256
```

The patch is recovery/audit evidence, not an instruction to apply it inside the
candidate.

## Proposed excluded paths

### Marketing, film, generated media, and prototype work

```text
docs/codex/tasks/MARKETING_FILM_006_OPENING_AND_NARRATION_REFINEMENT.md
docs/codex/tasks/MARKETING_FILM_007_ORDER_TO_OUTCOME.md
docs/marketing/
output/
prototypes/
```

Reason: separate experimental/marketing scope, large generated artifacts,
prototype dependencies, and no authority to treat visual presence as product
runtime truth.

### Earlier root-level audit reports

```text
CURRENT_STATE_CAPABILITY_MATRIX.md
GOLDEN_FLOW_GAP_ANALYSIS.md
RECOVERY_EXEC_PLAN.md
SPEC_CONTRADICTIONS.md
TRACEABILITY_MATRIX.md
```

Reason: these are pre-M1 audit inputs. The M1-A documents supersede them for the
candidate decision. They should be preserved in the workspace but not included
in the RC unless the Founder explicitly requests historical-audit inclusion.

### Ignored and secret-bearing state

```text
.ipo-one/
.playwright-cli/
.pnpm-store/
node_modules/
```

Reason: local state, credentials/secrets, dependency cache, and browser audit
state are never release contents.

## Explicit state separation

| Layer | Truth at M1-A |
| --- | --- |
| Current HEAD | exact committed source at commit `4b0e41d...`; does not contain the Constitution or current runtime edits |
| Uncommitted code | 16 modified tracked files plus two untracked web source/test files; this is what the currently observed workspace contains |
| Proposed RC code | only the exact paths in sections A through E, subject to Founder approval and a subsequent clean-room verification |
| WIP/experimental work | marketing, generated output, prototype, and unrelated film task paths; preserve but exclude |
| Documentation fact | claims and intended boundaries in Constitution, ADRs, tasks, manuals, and M1 reports |
| Runtime fact | current loopback health, current test results, current browser sign-in boundary, persistence test results, and observed failures |

## Known-gaps proposal

The RC known-gaps list must include, without euphemism:

- no reproducible offline install from the observed store;
- local RC web hash mismatch;
- WalletConnect checked-in bundle rebuild drift;
- no authenticated current browser Golden Flow proof;
- Agent Lockbox is process-local and not a durable Tenant capability;
- dispute/appeal/correction workflow absent;
- fee formulas unresolved and not authorized;
- no production, mainnet, real funds, custody, unrestricted withdrawal, external
  signer, or real KYC proof;
- legacy demo API and score code are not canonical product authority;
- 12 `SIMULATION_ONLY`, 7 `SPECIFIED_DISABLED`, and 7 `ABSENT` machine actions.

## Founder approval statement required for M1-B

M1-B may begin only after an explicit statement that names this file and
approves or amends its exact included and excluded paths. A generic instruction
such as “continue,” “freeze it,” or approval of another report is insufficient.

Suggested explicit form:

```text
I approve docs/releases/M1_A_CANDIDATE_INCLUSION_MANIFEST.md as written for
M1-B, including its exact included and excluded paths and known-gaps list.
```

Even after approval, M1-B must stop on workspace drift, failed preconditions, or
any need to fix/rebuild generated source that is outside the approved manifest.
