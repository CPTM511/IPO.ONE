# M3-GOV-001 — Constitution v1.5 ratification

Status: `COMPLETE — GOVERNANCE RATIFIED; NO RUNTIME CHANGE`

Date: 2026-09-02

Baseline: `origin/main` at
`bd98382e7b2055915beff4fd658b2a6216c93086`

## Context

Founder accepted the M3-000 `NARROW` recommendation after alignment PR #68
merged. Product Constitution v1.4 has no stable requirement for authenticated
metered machine-service usage Evidence.

## Scope

- supersede Constitution v1.4 with v1.5;
- add only `REQ-EXEC-005`;
- ratify only `DEC-METERED-RESOURCE-CREDIT-001`;
- record the v1.4-to-v1.5 crosswalk; and
- update AGENTS.md authority text.

## Non-goals

No runtime, schema, migration, dependency, API, MCP, UI, Provider, credential,
deployment, pricing, risk limit, capital, signer, mainnet, real-value or funds
change.

## Likely files

- `docs/PRODUCT_CONSTITUTION.md`
- `AGENTS.md`
- this issue document

## Acceptance criteria

- Given v1.4, when v1.5 is ratified, then exactly one new requirement and one
  decision exist with an explicit crosswalk.
- Given `REQ-EXEC-005`, when authority is read, then only L0 local no-funds
  implementation is approved.
- Given any external Provider, deployment or real-value inference, when checked
  against the decision, then it is explicitly denied.

## Test commands

```text
pnpm run check:product-traceability
pnpm run check:launch-policy
git diff --check
```

## Security and permission checklist

- [x] shared-kernel and no-withdrawal invariants preserved;
- [x] exact Provider/resource/unit/price/cap authority required;
- [x] stale, revoked, disputed and unreconciled usage fails closed;
- [x] external Provider, production, real value and funds remain gated; and
- [x] approval is not represented as implementation Evidence.

## Data, migration and rollback

Data/migration impact: none. Rollback reverts this governance-only change; no
runtime state exists to migrate or delete.

## Completion Evidence

Constitution v1.5, AGENTS.md v1.5 authority reference, passing traceability and
launch-policy checks, and exact Git/PR review Evidence.

Permission/funds/deployment impact: **none**.
