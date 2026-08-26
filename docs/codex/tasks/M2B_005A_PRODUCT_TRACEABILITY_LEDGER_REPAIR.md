# M2B-005A — product traceability ledger repair

Status: `IN PROGRESS — INTERNAL RELEASE INTEGRITY BLOCKER`

Baseline: `890ae4aaa5b5be0168fa3bc756caca2d160aa5a7`

Requirements: `REQ-CORE-001`, `REQ-EVID-001`, `REQ-EVID-002`,
`REQ-UX-004`, `REQ-TRADE-001`, `REQ-TRADE-004`, `REQ-TRADE-005`

## Context

`check:product-traceability` is the only known internal M2B-005 candidate
blocker. The product and launch policy have advanced legitimately, but the V9
traceability checker and ledger still describe an older baseline:

- the checker requires exactly one enabled profile, `public_sandbox`, while
  the current reviewed launch policy also enables the already completed exact
  Base Sepolia `live_testnet_secured_pool` test-assets profile;
- the Tenant protocol catalog contains 109 closed operations, while the
  traceability ledger binds and classifies 106;
- the only missing operations are
  `agentCreateSecuredFacilityAuthorization`,
  `agentReadSecuredFacilityAuthorization`, and
  `agentRevokeSecuredFacilityAuthorization`.

This is traceability debt, not permission to change the launch policy or weaken
catalog coverage.

## Scope

- Replace the singular traceability release-profile field with an exact closed
  set of enabled profiles.
- Require exactly `public_sandbox` and `live_testnet_secured_pool` and retain
  explicit test-assets-only, no-real-funds and no-Agent-Venue-write checks.
- Add exact handler/AuthZ/admission/persistence/UI/test bindings for the three
  M2B-001 Facility-authorization operations.
- Add one truthful `REAL_LOCAL` Agent Console action covering those operations.
- Add regression tests proving a third enabled profile, missing profile,
  missing operation binding or unclassified catalog operation fails closed.
- Re-run and reseal the v0.2.1 local candidate on the repaired exact SHA.

## Non-goals

- Do not disable or enable any launch profile.
- Do not change profile capabilities, addresses, contracts, assets, or gates.
- Do not add, remove or alter a Tenant protocol operation, handler, AuthZ,
  admission, database, API, SDK, MCP or UI business behavior.
- Do not delete, skip, soften or special-case the traceability checker.
- No signer, credential, chain request, Testnet transaction, deployment,
  mainnet, real funds, transfer, withdrawal or production change.

## Likely files

- `docs/codex/tasks/M2B_005A_PRODUCT_TRACEABILITY_LEDGER_REPAIR.md`
- `scripts/check-product-traceability.mjs`
- `schemas/v2/v9-product-traceability.schema.json`
- `product/traceability/ipo-one.v9-product-traceability.v1.json`
- focused traceability tests
- M2B-005 candidate Evidence and local release-review presentation

## Acceptance criteria

1. Given the current launch policy, when traceability is checked, then exactly
   the two reviewed enabled profiles match the ledger and all unsafe capability
   boundaries remain false.
2. Given any extra, missing or reordered enabled profile, when checked, then
   the checker fails closed without changing policy.
3. Given the current 109-operation catalog, when checked, then all 109 have one
   exact binding and at least one `REAL_LOCAL` classified action.
4. Given any one missing or extra operation binding/action reference, when
   checked, then the checker fails closed.
5. Existing schema, protocol, security, PostgreSQL, browser and full repository
   gates pass; the traceability blocker no longer appears.

## Test commands

```sh
pnpm check:product-traceability
pnpm test:product-traceability
pnpm check:schemas
pnpm check:tenant-protocol
pnpm test:security
pnpm test:transport
pnpm test:postgres
pnpm check
pnpm test
git diff --check
```

## Security checklist

- [ ] Exact approved enabled-profile set is closed and order-stable.
- [ ] Base Sepolia profile remains test-assets-only and no-real-funds.
- [ ] Agent Venue execution, market creation and production credit remain off.
- [ ] All 109 catalog operations remain private and no-funds-authority.
- [ ] Every binding resolves to the real handler, AuthZ, admission and durable
      persistence sources.
- [ ] Negative tests prove profile and operation drift fail closed.

## Permission boundary

The Founder instruction authorizes only this internal traceability integrity
repair, its local tests, candidate reseal, browser verification and Draft PR
update. It grants no launch-policy mutation, deployment, signer, external
credential, chain/Venue write, Testnet asset movement, mainnet, real funds,
custody, transfer, withdrawal or production authority.

## Data and migration impact

None. The database remains at 68 ordered migration pairs ending in
`0068_m2b_dual_risk_recovery`.

## Rollback

Revert the checker/schema/ledger repair as one unit and keep the v0.2.1
candidate blocked. Never restore a knowingly false one-profile/106-operation
claim merely to make the gate pass.

## Required Evidence

Issue contract, pre-fix four-error reproduction, exact two-profile comparison,
109-operation one-to-one report, focused negative regression tests, repaired
traceability output, full release gates, exact implementation SHA, updated
candidate receipt, visible local review and remote quality-gate result.

## Dependency and sequencing

This repair is stacked on M2B-005 PR #58. It must complete before independent
review or a Founder v0.2.1 candidate decision. It does not unlock M3 or any
remote/external execution step.
