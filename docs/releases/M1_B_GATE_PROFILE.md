# IPO.ONE M1-B Gate Profile

Status: Founder-approved for bounded M1-B deployable-sandbox work

Milestone: M1-A.2 Checkpoint and Gate Freeze

Date: 2026-08-04

Authority boundary: M1-B is authorized only as one invitation-only, no-funds
Deployable Sandbox Vertical Slice. This document does not authorize an RC
branch, RC commit, release tag, release version, paid pilot, mainnet,
production financial claim, fee implementation, signer, transaction, transfer,
withdrawal, custody, venue write, new chain, new credit model, broad refactor,
visual redesign, or marketing work.

## 1. Purpose

This profile records the Founder-approved requirement gate for M1-B Deployable
Sandbox Vertical Slice. It is bound to the immutable non-release M1-A.1
checkpoint but is not part of that 67-path checkpoint commit. It authorizes
only the three named blocker closures, one authenticated Agent Golden Flow, one
minimal staging deployment, and the exact Evidence required to verify them.

The gate applies to an `L1_PUBLIC_SANDBOX` candidate using invitation-only
authentication and synthetic data. It is not a paid pilot, closed-pilot,
controlled-real-value, mainnet, RC, release, or production gate.

## 2. Immutable checkpoint binding

| Field | Exact value |
| --- | --- |
| Branch | `codex/m1-a-1-preseal-checkpoint` |
| Commit | `59dc448576553537b9bb4b702b308e461734dee3` |
| Tree | `78f213ba3f184191084b421e91d722ee1d9a5902` |
| Parent commit | `4b0e41dde352283e0d27228d51d1fb99f04c97a8` |
| Parent tree | `907820553598ff50ff0446c1c4c365247a074fe8` |
| Included changed paths | `67` |
| Candidate content root | `67f6f63aadbc4977a35968e379b3dff8da988e8d7a31b3be1c1061db581b881c` |
| Commit patch SHA-256 | `a5444fc6a54b41898a596564dc42aa2371ab4ce957f2dece94b07c1e5d265ece` |
| Commit message | `chore(checkpoint): preserve M1-A.1 pre-seal evidence state` |
| Tag | None |
| RC identity | None |

The commit changes exactly the 67 approved paths in
`scripts/m1-a-1-candidate-paths.mjs`. Three tracked changes outside that list
and unrelated untracked work remained outside the index and checkpoint commit.

## 3. Pre-seal checks and test truth

| Check | Result | Exact evidence |
| --- | --- | --- |
| 67-path count, uniqueness, sorting, and regular files | PASS | `67/67`; no duplicate, missing, symlink, directory, or irregular entry |
| Excluded-path check | PASS | No approved path is under `.ipo-one/`, `node_modules/`, `.playwright-cli/`, `docs/marketing/`, `prototypes/`, `output/`, or `artifacts/` |
| Generated or binary path check | PASS | No generated banner, generated-output path, binary content, source map, minified asset, media, or cache entry detected |
| Credential-like filename check | PASS | No `.env`, credential, secret, PEM, P12, PFX, or key filename detected |
| Secret scan | PASS WITH TRIAGED HEURISTIC | One low-entropy, 10-character static `accessToken` test literal was flagged at `apps/tenant-api/test/transport-conformance.test.mjs:538`; it is not a known token format and is supplied to an expected configuration-rejection test. No confirmed credential was found; the literal value was not reported. |
| Exact staged scope | PASS | `67` staged paths; `0` unexpected paths; `0` approved paths omitted |
| Index content root | PASS | Matches `67f6f63aadbc4977a35968e379b3dff8da988e8d7a31b3be1c1061db581b881c` |
| Source lint | PASS | `560` JavaScript modules parsed; boundary lint passed |
| Contract typecheck | PASS | `3` package export surfaces and `68` runtime value exports matched parseable declarations |
| Requirement evidence check | PASS | Exact `44` Constitution IDs; `35 VERIFIED_SANDBOX`, `8 IMPLEMENTED_UNVERIFIED`, `1 NOT_IMPLEMENTED` |
| Unit suite | PASS | `698` passed, `0` failed, `0` skipped |
| `git diff --check` | FAIL | Existing Markdown hard-break trailing spaces are present in approved checkpoint content; M1-A.2 did not modify or normalize them |
| M1-A.1 snapshot checker before branch creation | PASS | Original branch, HEAD, tree, file hashes, and content root matched the dirty-worktree snapshot |
| M1-A.1 snapshot checker after branch creation | FAIL AS BOUND | The historical snapshot asserts the original branch `codex/checkpoint-20260727-pre-strategy`; it correctly rejects the new checkpoint branch and was not rewritten |

Passing unit tests do not independently prove any capability level. Requirement
levels remain governed by the bound runtime Evidence in the requirement
registry and must be reproduced against the future clean candidate hash.

## 4. Founder-approved gate rule

The M1-B deployable-sandbox gate contains:

- `38` requirements required at `VERIFIED_SANDBOX` for M1-B.
- `6` requirements explicitly deferred by the Founder.
- `3` current blockers among the 38 required requirements.
- `35` checkpoint-level `VERIFIED_SANDBOX` classifications that still require
  evidence rebinding to the future clean candidate commit.

No requirement can be upgraded from code presence, UI presence, filenames,
comments, static fixtures, mock handlers, test names, or test counts.

## 5. Requirement gate matrix

| Requirement ID | Current level | Required for M1-B | Required level | Target | Gate disposition |
| --- | --- | --- | --- | --- | --- |
| `REQ-CORE-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-ID-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-ID-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-ID-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-ID-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-ID-005` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-005` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-006` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-007` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-008` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CREDIT-009` | `IMPLEMENTED_UNVERIFIED` | Yes | `VERIFIED_SANDBOX` | M1-B | `M1_B_CANONICAL_BLOCKER` |
| `REQ-EXEC-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EXEC-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EXEC-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EXEC-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-PAY-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-PAY-002` | `IMPLEMENTED_UNVERIFIED` | No | `NOT_REQUIRED_FOR_M1_B` | Paid controlled pilot | `DEFERRED_BY_FOUNDER_PAID_CONTROLLED_PILOT` |
| `REQ-PAY-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-PAY-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EVID-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EVID-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EVID-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-EVID-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-RISK-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-RISK-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CHAIN-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-CHAIN-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-UX-001` | `IMPLEMENTED_UNVERIFIED` | No | `NOT_REQUIRED_FOR_M1_B` | Controlled-pilot Human dispute/appeal | `DEFERRED_BY_FOUNDER_HUMAN_DISPUTE_APPEAL` |
| `REQ-UX-002` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-UX-003` | `IMPLEMENTED_UNVERIFIED` | No | `NOT_REQUIRED_FOR_M1_B` | Controlled-pilot Capital Partner browser | `DEFERRED_BY_FOUNDER_CAPITAL_PARTNER_BROWSER` |
| `REQ-UX-004` | `IMPLEMENTED_UNVERIFIED` | Yes | `VERIFIED_SANDBOX` | M1-B | `M1_B_AUTHENTICATED_GOLDEN_FLOW_BLOCKER` |
| `REQ-UX-005` | `IMPLEMENTED_UNVERIFIED` | Yes | `VERIFIED_SANDBOX` | M1-B | `M1_B_CANONICAL_BLOCKER` |
| `REQ-TRADE-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-TRADE-002` | `IMPLEMENTED_UNVERIFIED` | No | `NOT_REQUIRED_FOR_M1_B` | L3 read-only | `DEFERRED_READ_ONLY_EXTERNAL_EVIDENCE` |
| `REQ-TRADE-003` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-TRADE-004` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-PRIV-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-AUTO-001` | `VERIFIED_SANDBOX` | Yes | `VERIFIED_SANDBOX` | M1-B | `CHECKPOINT_LEVEL_RECORDED` |
| `REQ-PILOT-001` | `NOT_IMPLEMENTED` | No | `NOT_REQUIRED_FOR_M1_B` | L2 closed pilot | `DEFERRED_FOUNDER_STATE_MACHINE` |
| `REQ-PILOT-002` | `IMPLEMENTED_UNVERIFIED` | No | `NOT_REQUIRED_FOR_M1_B` | L2 closed pilot | `DEFERRED_CONTROLLED_PILOT` |

The machine-readable profile records the full blocking reason, Evidence,
deferral authority, and non-goal boundary for every row.

## 6. Exact disposition of the nine unresolved requirements

### REQ-CREDIT-009

M1-B canonical blocker. Evidence must prove that CreditLine is a canonical,
recalculable capacity and utilization projection derived from current accepted
Offer, Obligation or Facility, Mandate or Consent, policy, exposure, repayment,
correction, freeze, and close truth. Database, API, UI, and replay parity are
required. A CreditLine row, caller field, model output, or stale projection must
never authorize or increase exposure.

### REQ-UX-005

M1-B canonical blocker. A fresh authenticated browser session must recover the
exact workspace from server truth after reload and database restart. Client
storage can be an optional cache only. Revoked, expired, stale, mismatched,
cross-actor, and cross-Tenant continuation receipts must fail closed.

### REQ-UX-001 and REQ-PILOT-001

The Founder deferred the full Human dispute and appeal workflow and retained
`REQ-PILOT-001` at the controlled-pilot gate. Existing freeze, immutable audit,
and additive correction invariants must remain covered by regression Evidence.
No Human dispute, appeal, complaint, or legal workflow may be implemented in
M1-B.

The proposed future shared domain is:

- Case types: `DISPUTE`, `APPEAL`, and `CORRECTION_REQUEST`.
- Case targets: Decision, Offer disclosure, Payment, servicing action, Evidence
  item, or official report.
- Minimal states: `OPEN`, `TRIAGED`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED`, and
  `WITHDRAWN`.
- An appeal is a new case linked to a resolved or rejected parent case; it does
  not overwrite or reopen the parent record.
- A correction is an additive Event and new record version linked to the
  original immutable fact; it never edits Ledger, Evidence, or lifecycle
  history in place.
- Required fields: case ID, Tenant, affected owner, target ID and version,
  authorized filer, owner, type, state, reason code, timestamps, Evidence
  references, parent case, resolution, and correction linkage.
- Authority: affected owner may file and read privacy-safe status; authorized
  Operator or Risk roles may triage and resolve only under explicit policy.

This remains a future-state proposal only. No state machine, schema,
persistence, API, UI, or dispute runtime implementation is authorized during
M1-B.

### REQ-UX-003 and REQ-UX-004

`REQ-UX-003` is deferred by the Founder. The sandbox may use one preconfigured
synthetic Capital Mandate and must not expand the Capital Partner browser
workspace.

`REQ-UX-004` remains an M1-B blocker. The authenticated Risk or Admin Golden
Flow must observe exposure and repayment, execute an audited freeze, and prove
that a subsequent spend is rejected. Closure must add no new override,
approval, or production-control capability.

### REQ-PAY-002

Deferred by the Founder to a paid controlled pilot. M1-B must visibly state
`Protocol fees: disabled in sandbox` and `No commercial lending transaction`.
The published formulas do not authorize runtime fee semantics. Runtime fee
implementation remains prohibited until a separate Fee Policy ADR and Founder
authorization.

### REQ-TRADE-002

Deferred from M1-B to separately authorized L3 read-only Evidence. The future
proof must cover external account and history provenance, freshness, finality,
errors, and UI. Signer, order, transaction, transfer, withdrawal, private key,
custody, and venue-write authority are expressly excluded.

### REQ-PILOT-002

Founder-approved deferral to L2 Controlled Pilot. Before L2 it requires approved data
retention and deletion, privacy owner, incident commander, named support,
severity and escalation policy, rollback owner, onboarding and offboarding, and
a tabletop incident exercise.

## 7. Validation command

Run from the repository root with the pinned runtime:

```bash
node scripts/check-m1-b-gate-profile.mjs
```

The checker fails if the Constitution, 44-ID registry, current classifications,
checkpoint commit, checkpoint tree, exact 67-path commit scope, content root,
authorization flags, blocker set, deferral set, or required fields drift.

## 8. Stop condition

M1-B stops after the deployable sandbox and full Golden Flow Evidence are
available. Controlled-pilot expansion, RC branch creation, candidate reseal,
release tagging, paid operation, mainnet work, and production claims must not
begin automatically.
