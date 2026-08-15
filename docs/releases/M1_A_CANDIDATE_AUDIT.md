# M1-A Candidate Audit

Historical-snapshot notice: this document preserves the original M1-A
read-only findings. Current M1-A.1 blocker remediation, runtime evidence, and
implementation classifications are recorded in
`docs/releases/M1_A_1_CANDIDATE_BLOCKER_CLOSURE.md` and
`docs/verification/M1_A_1_IMPLEMENTATION_LEVEL_REPORT.md`. Where those later
reports conflict with this snapshot, the later evidence controls; M1-B remains
blocked.

Audit ID: `M1-A-20260803T132413Z`

Audit mode: read-only candidate audit and freeze proposal

Decision state: `FOUNDER_APPROVAL_REQUIRED`

M1-B state: `NOT_AUTHORIZED`

## Executive determination

The current workspace is not safe to seal as a release candidate without a
Founder decision. The audit found a precisely identifiable running local
no-funds system, but it is not represented by one clean Git tree and is not
reproducible from the current lockfile/cache state.

The audited baseline is:

- branch: `codex/checkpoint-20260727-pre-strategy`;
- HEAD commit: `4b0e41dde352283e0d27228d51d1fb99f04c97a8`;
- HEAD tree: `907820553598ff50ff0446c1c4c365247a074fe8`;
- audit-start tracked changes: 16 modified files, zero staged files;
- audit-start untracked files: 202;
- runtime: four loopback Tenant hosts on ports 8787 through 8790, each returning
  `200 ready` from `/tenant/v1/healthz`;
- release boundary: local/synthetic/no-funds; no production, mainnet, custody,
  real withdrawal, external signing, or real-value authority was exercised.

No branch, commit, tag, merge, dependency upgrade, code repair, or runtime-code
change was made by M1-A.

## Candidate decision

Recommendation: `DO_NOT_ENTER_M1-B_YET`.

Blocking reasons:

1. `pnpm install --frozen-lockfile --offline --ignore-scripts` failed in an
   isolated workspace snapshot because the exact `@reown/appkit@1.8.19`
   tarball was absent from the local store.
2. `pnpm run check` failed at `check:local-rc` because the current
   `apps/web/src/index.html` hash does not equal the frozen RC evidence hash.
3. A direct WalletConnect bundle rebuild succeeded in isolation but produced a
   different bundle SHA-256 than the checked-in bundle.
4. The Founder-specified fee formulas are absent from the Product Constitution
   and approved implementation authority. Existing accepted ADR text states
   that pricing and fee terms remain unapproved.
5. The authenticated Human and Agent browser journeys could not be executed
   without creating session/product state. Read-only browser evidence stops at
   `Sign-in required`; fixture-host journeys are not runtime proof.
6. The Agent Lockbox is still process-local and is not a durable authenticated
   Tenant capability.
7. The closed-pilot dispute/appeal/correction workflow is absent.

## Constitution integrity findings

The Constitution contains exactly 44 stable Requirement IDs at
`docs/PRODUCT_CONSTITUTION.md:105-148`. All 44 are represented in the M1
traceability matrix.

The following directed semantic checks passed at the specification level:

- CreditLine is a bounded capacity/utilization projection and not independent
  authority (`docs/PRODUCT_CONSTITUTION.md:169-196`).
- Agent Lockbox is purpose-bound, Mandate-controlled, Provider-restricted, and
  non-withdrawable (`docs/PRODUCT_CONSTITUTION.md:198-209`).
- Strategy Vault is not approved and is not a Lockbox synonym
  (`docs/PRODUCT_CONSTITUTION.md:211-218`).
- dispute/appeal/correction is required before a closed pilot
  (`docs/PRODUCT_CONSTITUTION.md:220-235`).
- Human and Agent share one canonical kernel
  (`docs/PRODUCT_CONSTITUTION.md:55-76`, `105-148`).
- external Capital Partners own bilateral Offer economics while IPO.ONE owns
  permission, versioning, servicing, Ledger, reconciliation, and Evidence
  integrity (`docs/PRODUCT_CONSTITUTION.md:61-63`).
- CAIP adapters, finality/reorg safety, replay, reconciliation, and additive
  corrections are required (`docs/PRODUCT_CONSTITUTION.md:128-135`).
- production, mainnet, real funds, custody, unrestricted withdrawals, and
  external signing remain prohibited (`docs/PRODUCT_CONSTITUTION.md:237-249`).

## Founder-directed fee conflict

The following formulas were directed for explicit verification:

- Protocol Execution Fee: `$1 + funded amount x 0.10%`.
- Financial Revenue Share: `realized financial revenue x 12.5%`.

Neither formula exists in the 44-requirement Constitution registry, its
semantic decisions, the accepted ADRs, or an authorized runtime policy. The
current policy explicitly says fee calculation is unavailable and unauthorized
at `product/policies/ipo-one.fee-audit-policy.v1.json:1-8`. The machine
traceability file classifies production fee policy as `SPECIFIED_DISABLED` and
Provider share/waterfall as `SIMULATION_ONLY` at
`product/traceability/ipo-one.v9-product-traceability.v1.json:3266-3303`.

ADR-037 allows only future accepted fee terms against actual realized financial
income and explicitly leaves pricing, fee, and waterfall terms unapproved at
`docs/architecture/ADR-037-trading-capital-settlement-incident-ownership-and-recovery.md:43-68`
and `:135-148`. A Testnet-only helper accepts caller-supplied basis points but
sets `productionPricingApproved`, `economicAuthority`, and `fundsAuthority` to
false at `modules/hyperliquid-settlement/src/index.js:234-305`.

Disposition: `UNRESOLVED_FOUNDER_DECISION`. M1-A did not change the
Constitution.

## Current implementation truth

The machine product traceability catalog reports 67 actions:

| Existing catalog class | Count |
| --- | ---: |
| `REAL_LOCAL` | 40 |
| `REAL_TESTNET_READ` | 1 |
| `SIMULATION_ONLY` | 12 |
| `SPECIFIED_DISABLED` | 7 |
| `ABSENT` | 7 |

Those catalog classes are not release-readiness claims. Applying the stricter
M1 evidence rubric to the 44 approved requirements yields:

| M1 implementation level | Count |
| --- | ---: |
| `NOT_IMPLEMENTED` | 1 |
| `WIRED_MOCK` | 1 |
| `IMPLEMENTED_UNVERIFIED` | 7 |
| `VERIFIED_SANDBOX` | 35 |
| `VERIFIED_REAL` | 0 |
| `PRODUCTION_READY` | 0 |

See `docs/verification/M1_IMPLEMENTATION_LEVEL_REPORT.md` for the evidence
rules and `docs/traceability/M1_REQUIREMENT_TRACEABILITY_MATRIX.md` for the
per-requirement assignment.

## Highest-priority gaps

| Priority | Gap | Evidence |
| --- | --- | --- |
| P0 | No exact reproducible candidate | dirty worktree; offline install failure; local RC hash failure; bundle rebuild drift |
| P0 | No authenticated current browser Golden Flow evidence | all four real browser workspaces stop at `Sign-in required` |
| P0 | Agent Lockbox is not durable Tenant truth | `modules/lockbox/src/lockbox-service.js:19-23` stores state in `new Map()` |
| P0 | Fee formulas have no approved requirement or policy authority | fee policy disabled; ADR-037 leaves terms unapproved |
| P1 | dispute/appeal/correction workflow absent | Constitution requires it before L2; no case operation/schema/runtime found |
| P1 | Human/Agent UI parity is not runtime-proven | backend and fixture coverage exists; read-only authenticated UI proof does not |
| P1 | Legacy demo API and 300-850 score code coexist with the current product | `api/openapi/ipo-one.v1.json`; `modules/credit-learning/src/credit-learning-service.js:72-99` |
| P1 | Current external integration proof is limited | Testnet unit/contract checks pass, but no new live RPC/write action was authorized or performed |

## Evidence commands

```sh
git branch --show-current
git rev-parse HEAD HEAD^{tree}
git status --porcelain=v2
git diff --cached --binary
git diff --binary
git ls-files --others --exclude-standard
git submodule status --recursive
node --version
pnpm --version
pnpm run check
pnpm test
pnpm run test:security
pnpm run test:transport
pnpm run test:provider
pnpm run test:chain:conformance
pnpm run test:indexer:reorg
pnpm run test:chain:live-unit
pnpm run test:postgres
pnpm run check:openapi
pnpm run check:migrations
pnpm run check:tenant-protocol
pnpm run check:product-traceability
pnpm run check:web-bundle
```

Commands that bind loopback sockets were first observed failing with sandbox
`EPERM` and were then rerun unchanged in the permitted host context. The host
runs passed. PostgreSQL tests used a newly initialized database named
`ipo_one_m1a_test` in `/private/tmp`; that instance was stopped after the test.

## M1-B authorization boundary

M1-B has not been performed. It requires explicit Founder approval of
`docs/releases/M1_A_CANDIDATE_INCLUSION_MANIFEST.md`. Approval of this audit
report alone is not approval of the inclusion manifest, fee semantics, a
release branch, a commit, or a tag.
