# M2B-005 — v0.2.1 release hardening

Status: `L0 LOCAL CANDIDATE IMPLEMENTED — EXTERNAL RELEASE BLOCKED`

Baseline: `5f7a4143f54fb3e15d392fa04fa217dd230870e3`

Requirements: `REQ-CORE-001`, `REQ-ID-005`, `REQ-EXEC-003`,
`REQ-EXEC-004`, `REQ-PAY-001`, `REQ-PAY-002`, `REQ-EVID-001`,
`REQ-EVID-002`, `REQ-EVID-004`, `REQ-RISK-002`, `REQ-UX-002`,
`REQ-UX-004`, `REQ-UX-005`, `REQ-TRADE-001`, `REQ-TRADE-004`,
`REQ-TRADE-005`

## Context

M2B-001 through M2B-004 now compose one local, no-funds Agent/Principal
secured-Facility lifecycle through the same Obligation, Ledger, repayment,
Credit Outcome, Credit State and Evidence kernel used by Human flows. The
stacked branches remain Draft and M2B-002/M2B-003 external execution remains
blocked by its exact L3 profile, current observations, signer handoff and
one-use approval gates.

M2B-005 must freeze that truthful state into one machine-verifiable v0.2.1
release candidate. The candidate must distinguish local code/runtime/browser
proof from historical Testnet contracts and from any future remote deployment,
external Agent or signer-authorized venue operation.

## Scope

- Define one closed v0.2.1 candidate manifest and JSON Schema.
- Bind the exact M2B-001 through M2B-004 commits and Draft PR chain.
- Bind all 68 migrations, the shared-kernel terminal E2E Evidence and the
  historical M2A v0.2.0 Base Sepolia candidate without reusing its deployment
  or completion claim for M2B.
- Verify existing signer retirement Evidence without creating, loading,
  funding, signing with, deregistering or destroying a new signer.
- Run a deterministic, no-network recovery drill covering fail-closed STOP,
  replay/restart preservation and no automatic unfreeze.
- Expose a local Founder/Risk release-review experience with visible release,
  recovery and permission status.
- Produce exact test receipts and a release review report that truthfully
  records independent review and Founder release decision as pending.

## Non-goals

- No remote/public deployment, production release or Hosted claim.
- No Hyperliquid or Pool request, nonce, signature, signer creation/reuse,
  Testnet transaction or asset movement.
- No mainnet, real funds, custody, KYC, Human cash lending, transfer,
  withdrawal, residual release, automatic unfreeze or automatic credit change.
- No M3 Task/API/Compute implementation, new service, new dependency or
  database migration.
- No self-attested independent security review or Founder release decision.

## Likely files

- `docs/codex/tasks/M2B_005_V0_2_1_RELEASE_HARDENING.md`
- `schemas/v2/m2b-005-v0-2-1-candidate.schema.json`
- `deploy/releases/m2b-005-v0.2.1-candidate.json`
- `scripts/m2b-005-release-candidate.mjs`
- `scripts/m2b-005-release-experience.mjs`
- `deploy/testnet/test/m2b-005-release-candidate.test.js`
- `docs/releases/IPO_ONE_V0_2_1_CANDIDATE.md`
- `artifacts/m2b-005/`
- `package.json`

## Acceptance criteria

1. A strict validator rejects unknown fields, duplicate bindings, digest
   drift, an unexpected commit, migration drift, an external-write flag or any
   missing excluded authority.
2. The candidate binds exact M2B-001/002/003/004 commits and PRs, migration
   `0068_m2b_dual_risk_recovery`, the M2B-004 terminal/loss Evidence and prior
   signer-closure Evidence.
3. The no-network drill proves M2B external execution remains disabled,
   protective action cannot expand risk, automatic unfreeze is false and
   restart/replay preserves canonical repayment, Outcome and Credit State.
4. Human browser and versioned Agent-facing verification read the same release
   identity, shared-kernel state and permission boundary.
5. Full repository, security, contract, PostgreSQL, browser and recovery gates
   pass on the exact implementation SHA with no M2B-005 P0/P1 finding.
6. The release report separately labels CODE, RUNTIME, DEPLOYED, REACHABLE and
   VERIFIED and remains `BLOCKED — NOT COMPLETE` until required external
   deployment/verification and named human gates actually exist.

## Test commands

```sh
pnpm check:m2b-005-candidate
pnpm test:m2b-005-candidate
pnpm test:agent-credit
pnpm test:e2e:agent-credit
pnpm test:e2e:agent-credit:negative
pnpm test:e2e:agent-credit:restart
pnpm test:transport
pnpm test:security
pnpm test:postgres
pnpm check
pnpm test
git diff --check
```

## Security checklist

- [x] Candidate parser is bounded, strict and symlink-safe.
- [x] Every Evidence file remains under an allowlisted repository root and is
      content-digest bound.
- [x] No secret, raw address, raw signature or credential is introduced.
- [x] No network, signer, nonce, write or profile mutation primitive exists in
      the candidate checker or recovery drill.
- [x] Historical Testnet deployment is labeled historical/read-only and does
      not imply M2B deployment.
- [x] Prior retired signers remain non-reusable; no new signer is created.
- [x] Recovery remains fail-closed, loss-preserving and non-automatic.
- [x] Human and Agent views report the same kernel and authority boundary.

## Permission boundary

The instruction to continue authorizes only deterministic local no-funds
release hardening, local tests, local runtime, browser verification, redacted
Evidence, a stacked branch and Draft PR. It does not authorize any remote
deployment, external Agent credential, signer operation, Pool/Venue write,
Testnet transaction, mainnet, real value, custody, transfer, withdrawal, risk
parameter or production change.

## Data and migration impact

No migration is permitted. The exact database contract remains 68 ordered
up/down pairs ending at `0068_m2b_dual_risk_recovery`. Any persistence gap must
stop this issue and amend the issue contract before schema work begins.

## Rollback

Disable the local candidate profile and release-review runtime, keep external
execution disabled, preserve every Obligation, repayment, Outcome, Credit
State, incident and Evidence record, and reconcile only by read-only replay.
Never retry an unknown external outcome, reuse a retired signer or relabel
historical Testnet Evidence.

## Required Evidence

Issue contract, closed schema, strict checker, negative tests, exact commit and
migration bindings, digest-bound terminal and signer-closure artifacts,
deterministic recovery receipt, full gate results, visible browser acceptance,
Agent parity receipt, exact implementation SHA, release review report and a
working loopback product URL.

## Dependency and sequencing

M2B-005 is stacked on M2B-004 exact commit
`5f7a4143f54fb3e15d392fa04fa217dd230870e3` and PR #57. PRs #54 through #57
remain Draft and unmerged. The candidate cannot become a public or production
release until those exact dependencies, independent review, Founder candidate
decision and separately authorized deployment/verification gates are complete.

## Completion Evidence

The local v0.2.1 engineering candidate binds implementation SHA
`e2e8bf460fcd17ba64974b6100bc0731c4c4a733`. Its strict checker validates the
exact stacked commits, 68 migrations, six content-digest Evidence bindings,
historical M2A Testnet-only identity, prior signer closure and fourteen absent
authorities.

Executable results:

- full repository JavaScript suite: 1,205 passed;
- PostgreSQL forced-RLS/restart suite: 91 passed in an isolated local VM test
  database;
- security / API-SDK-MCP transport: 34 / 85 passed;
- Foundry: 25 passed, with 2 deliberate live-fork skips;
- 143 Schemas, 21 OpenAPI operations, 109 Tenant operations and 68 migration
  pairs passed;
- product traceability: exact two-profile policy and all 109 Tenant operations
  passed, including four focused fail-closed regression tests;
- browser: four visible release/traceability/recovery/Agent controls passed and
  the browser log remained empty.

The deterministic recovery projection hash is
`4c6447f53a1be4c525657827cb51336e59fb5448fcc0acdb92be30a6f1f4fc24`.
No network request, transaction, signer creation/load/reuse, nonce, signature,
funds movement or profile mutation occurred.

The stale `check:product-traceability` launch-policy/catalog accounting blocker
is resolved and admitted to the aggregate quality gate. Independent review and
Founder candidate decision remain pending, so the product verdict is
`BLOCKED — NOT COMPLETE`.

Local Founder/Risk experience: `http://127.0.0.1:4178/`.
