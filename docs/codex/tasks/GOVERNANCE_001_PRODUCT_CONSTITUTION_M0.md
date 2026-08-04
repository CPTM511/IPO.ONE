# GOVERNANCE-001 — Product Constitution authority recovery

Status: COMPLETED — documentation/governance only

Date: 2026-08-03

Milestone: Recovery M0

Decision owner: IPO.ONE Founder / Product / Governance

## Context

The 2026-08-03 current-state audit used an authority precedence that named
`docs/PRODUCT_CONSTITUTION.md` first, but that file did not exist. Product
Charter v1.1, accepted ADRs, the MVP Build Spec, and Product Optimization
Measure v1.0 contained substantial approved direction, but no single source
assigned stable requirement IDs or resolved the current CreditLine, Strategy
Vault, and dispute-workflow questions.

## Scope

- establish `docs/PRODUCT_CONSTITUTION.md` as the highest repository product
  authority and conflict-resolution index;
- preserve Product Charter v1.1 as the canonical long-term thesis and
  governance source;
- assign stable requirement IDs to the approved MVP and gated pilot
  capabilities;
- record explicit CreditLine, Agent Lockbox, Strategy Vault, and dispute
  decisions;
- update `AGENTS.md` and the audit artifacts to record the M0 disposition.

## Non-goals

- no application, API, schema, migration, contract, policy, or test change;
- no new permission, risk limit, pricing, KYC provider, credential, signer,
  chain, deployment, custody, capital, transfer, withdrawal, or funds authority;
- no claim that a requirement is implemented, verified, hosted, or production
  ready;
- no modification of the V9 machine traceability source commit or release
  candidate; those remain M1 work.

## Files

- `docs/PRODUCT_CONSTITUTION.md`
- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md`
- `CURRENT_STATE_CAPABILITY_MATRIX.md`
- `TRACEABILITY_MATRIX.md`
- `SPEC_CONTRADICTIONS.md`
- `RECOVERY_EXEC_PLAN.md`
- this task record

## Acceptance criteria

- the Constitution exists and records a named decision owner and effective date;
- authority and supersession precedence is explicit;
- every approved capability has one stable requirement ID, status, mode, gate,
  and exactly one governing decision source;
- FR-001 through FR-012 have a current crosswalk;
- CreditLine grant/materialization, parity, Facility relation, and adjustment
  semantics are explicit;
- Agent Lockbox remains approved while Strategy Vault is explicitly not
  approved;
- a dispute/appeal workflow is classified as a closed-pilot prerequisite, not a
  currently implemented L0 capability;
- no operational permission is broadened;
- the documentation-only diff passes whitespace and link/path checks.

## Test commands

```sh
test -f docs/PRODUCT_CONSTITUTION.md
rg -n 'REQ-|FR-|Strategy Vault|CreditLine|dispute|appeal' docs/PRODUCT_CONSTITUTION.md
rg -n 'PRODUCT_CONSTITUTION' AGENTS.md
git diff --check -- docs/PRODUCT_CONSTITUTION.md AGENTS.md \
  CURRENT_STATE_CAPABILITY_MATRIX.md TRACEABILITY_MATRIX.md \
  SPEC_CONTRADICTIONS.md RECOVERY_EXEC_PLAN.md \
  docs/codex/tasks/GOVERNANCE_001_PRODUCT_CONSTITUTION_M0.md
```

## Security checklist

- no secret, credential, signature, private key, raw KYC, or PII is recorded;
- no real-value or external-write authority is granted;
- no withdrawal, transfer, signer, custody, or deployment boundary is loosened;
- deterministic policy and fail-closed unknown/stale state remain mandatory;
- Human and Agent remain on one shared kernel;
- approval, implementation, verification, hosting, and real-value states remain
  distinct.

## Permission boundary

The Founder-directed M0 instruction authorizes this documentation/governance
record only. Every contract, funds, risk, permission, privacy, production,
deployment, KYC, custody, mainnet, signer, credential, and external integration
change remains behind its existing named human-review gate.

## Migration impact

None. No database or protocol schema changes.

## Rollback

Revert only the documentation changes in this task. Runtime behavior and data
are unaffected.

## Completion evidence

Validated on 2026-08-03:

- `test -f docs/PRODUCT_CONSTITUTION.md`: PASS;
- stable registry: 44 rows, 44 unique requirement IDs, zero duplicate or
  malformed rows;
- MVP crosswalk: FR-001 through FR-012, 12 rows;
- Constitution SHA-256:
  `c36e26a00c49868c418896a8c3a9920108b32ade1161c25104c6586513f5e653`;
- `AGENTS.md` names the Constitution as highest product-truth authority;
- tracked and new-file whitespace validation: PASS;
- M0 patch paths are documentation/governance only. Pre-existing dirty runtime
  changes were preserved and are outside GOVERNANCE-001.

This evidence proves authority recovery and requirement reconciliation only. It
does not prove any requirement is implemented, verified, hosted, real-value
active, or production ready.
