# GOVERNANCE-002 — Constitution v2 and proportionate delivery governance

Status: PASS — DOCUMENT REVIEWED

Date: 2026-11-07 (Asia/Shanghai)

Decision owner: IPO.ONE Founder / Product / Governance

## Context and authorization

The Founder agreed on 2026-11-07 to the reviewed proposal: update the Agent-first
product thesis, separate enduring principles from stage-specific authorization,
reuse valid scoped approvals, clarify Agent execution versus policy authority,
accept work against its declared delivery target, and add user/commercial
evidence discipline. Synchronize AGENTS.md and the engineering standard.
This authorizes this governance revision, not runtime activation or deployment.

Existing uncommitted AGENTS.md and Constitution v1.7 edits are the input baseline.
Before editing, copies and SHA-256 values were saved under
`/private/tmp/ipo-one-governance-20261107-before`. The exact input Constitution
is retained in `docs/governance/history/PRODUCT_CONSTITUTION_v1.7_2026-09-10.md`.

## Scope and files

- Rewrite `docs/PRODUCT_CONSTITUTION.md` as v2.0 and explicitly map supersession.
- Move the unchanged 56-row capability registry and current profile boundaries
  to `docs/governance/CURRENT_AUTHORIZATION_REGISTER.md` with decision references.
- Publish engineering standard v1.1; preserve v1.0 as a historical version.
- Update AGENTS.md and the guidance index to route to the current sources.
- Route the existing cutover gate to the authorization register, preserving its
  L4/L5 denials. Pin the historical M1 evidence manifest to its original v1.3
  Constitution and check its IDs against the current registry; label the related
  M1 traceability matrix as historical without changing its original observations.

## Non-goals and permission boundary

No application behavior, protocol/schema, database/migration, launch-policy,
approval artifact, financial limit, credential, signer, contract, Provider,
chain-write, deployment or real-funds change. No historical test result or
capability maturity is promoted. Existing one-use approvals stay one-use;
expired grants stay expired. No outreach, publishing or new spend is authorized.

## Acceptance and checks

- The original v1.7 archive is byte-identical to the input working copy.
- All 56 requirement rows retain IDs, ordering, status and exact boundaries;
  the 55 historical M1 IDs remain compatible without new runtime claims.
- Current-profile restrictions are preserved and linked to executable policy.
- Agent invocation is subject to independent deterministic authorization.
- Delivery targets distinguish document/local/test/deployed acceptance.
- Low-impact tasks reuse a concise existing task contract; high-impact changes
  retain authority, security, migration and rollback requirements.
- Historical versions, decisions and source links remain resolvable.

Commands: `pnpm check:launch-policy`, `pnpm check:prod-cutover-rc`,
`pnpm check:m1-requirements`, `pnpm check:product-traceability`, changed-script
syntax checks, scoped link/path and SHA-256 comparisons, `git diff --check`.
No browser, database or deployment acceptance is claimed by this task.

## Baseline evidence

Before editing: launch-policy, cutover-candidate and product-traceability checks
passed. The cutover check reports its historical candidate as
`BLOCKED — NOT PRODUCTION RELEASED`, not a current release verdict.
M1 requirement verification failed because the moving Constitution path hashes
to `0d719c6e74c8830552d1432db9ddd9ed6249fdec9ddbc3343b54298a1c7d6101`,
while its historical manifest requires
`85251adea9605330d9379759fe63689e8a5b907faa5403b3a0bd5577783e3a0d`.
The original v1.3 source in commit
`93805d35f7193d489ed7607d9e1d3b6410881292` matches that required hash exactly.

## Security, migration and rollback

Review for accidental changes to funds, authentication, privileged roles,
deterministic risk, tenant isolation, exact intents and accounting integrity.
Deployment-policy and evidence hashes/classifications must remain unchanged.
There is no runtime migration. Rollback restores only this task's files from
the before-copy and removes its new documents; it must preserve pre-existing
user changes. The historical v1.7 archive also provides the prior authority text.

## Completion evidence

Completed on 2026-11-07 (Asia/Shanghai), for the governance/document target:

- Constitution v2.0, Current Authorization Register v1.0 and engineering
  standard v1.1 are published locally; AGENTS.md and the source index route to
  them. Original v1.7 and v1.0 remain preserved.
- All 56 capability rows, including their ordering, status and boundary text,
  match the incoming v1.7 byte-for-byte. The v1.7 archive matches input SHA-256
  `0d719c6e74c8830552d1432db9ddd9ed6249fdec9ddbc3343b54298a1c7d6101`.
- `pnpm check:launch-policy`, `pnpm check:prod-cutover-rc`,
  `pnpm check:m1-requirements` and `pnpm check:product-traceability` pass.
  `pnpm test:product-traceability` passes all four existing contract cases.
  These validate the stated governance boundaries, not current product runtime.
- M1 historical source hash is verified against the unchanged recorded v1.3
  hash. Only its source path changed in the evidence manifest; no artifact hash,
  classification or result changed. The separate current-registry compatibility
  check retains all 55 historical IDs and reports the later requirement as
  outside M1 evidence. No row becomes VERIFIED_REAL or PRODUCTION_READY.
- Read-time negative probes against the actual existing scripts reject a corrupt
  historical source, a missing current legacy requirement, and attempted L4 or
  L5 enablement text. The probes did not modify documents or policy.
- All 22 local Markdown links/anchors in the affected guidance/task/matrix
  resolve. Changed scripts parse; scoped tracked and new-file whitespace checks
  pass. Unchanged side-effect/accessibility, automation-audit, security/privacy
  and exception-control sections were compared against standard v1.0.
- Launch-policy bytes and the original v1.0 standard are unchanged. No runtime,
  migration, external permission, deployment or financial activation occurred.

No required work remains for this document target. Current hosted readiness,
commercial validation and any future profile activation require their own
applicable evidence; this task assigns none of those a new completion state.
