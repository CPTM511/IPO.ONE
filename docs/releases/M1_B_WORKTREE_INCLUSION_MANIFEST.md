# M1-B Worktree Inclusion Manifest

## Status

Status: `PRE_COMMIT_DRAFT`

Base checkpoint:
`59dc448576553537b9bb4b702b308e461734dee3`

Working branch: `codex/m1-b-deployable-sandbox`

This manifest separates the current authorized M1-B implementation work from
protected user WIP and unrelated untracked material. It is not an RC manifest,
release manifest, deployment manifest, or authorization to use `git add -A`.

The exact implementation candidate contained 109 paths. A clean-worktree
verification then proved that the tracked Requirement gate referenced 11 exact
hash-bound M1-A.1 artifacts that were not present in the commit. The complete
reproducible candidate therefore contained 120 paths, including this manifest
and only those 11 historical evidence dependencies. The Founder subsequently
approved the exact authentication expectation update in
`apps/private-pilot/test-postgres/production-runtime-e2e.test.mjs`; the final
candidate therefore contains 121 paths. The list must be
regenerated and rechecked immediately before staging and after any change.

## Exact candidate implementation paths

```text
api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json
api/tenant-protocol/conformance/agent-pilot-capability-manifest.v1.fixtures.json
api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json
api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json
api/tenant-protocol/ipo-one.tenant-protocol.v1.json
api/vercel-sandbox-cron.mjs
api/vercel-sandbox.mjs
apps/private-pilot/src/agent-reference-acceptance.js
apps/private-pilot/src/local-pilot-identities.js
apps/private-pilot/src/local-reference-agent-http.js
apps/private-pilot/src/local-worker.js
apps/private-pilot/src/private-pilot-database.js
apps/private-pilot/src/production-bootstrap.js
apps/private-pilot/src/production-environment.js
apps/private-pilot/src/production-runtime.js
apps/private-pilot/src/vercel-sandbox-cron.js
apps/private-pilot/src/vercel-sandbox-runtime.js
apps/private-pilot/test-postgres/production-bootstrap.test.mjs
apps/private-pilot/test-postgres/production-runtime-e2e.test.mjs
apps/private-pilot/test-postgres/vercel-sandbox-cron.test.mjs
apps/private-pilot/test/production-environment.test.js
apps/private-pilot/test/vercel-sandbox-serverless.test.js
apps/tenant-api/src/postgres-human-access-composition.js
apps/tenant-api/src/production-tenant-host.js
apps/tenant-api/src/tenant-web-assets.js
apps/web/src/agent-handoff-manifest.js
apps/web/src/agent-pilot-capability-manifest.js
apps/web/src/app.js
apps/web/src/index.html
apps/web/test/agent-handoff-manifest.test.js
apps/web/test/manual-primary-actions.v1.json
apps/web/test/static-ui.test.js
apps/web/test/support/agent-console-browser-host.mjs
artifacts/m1-a-1/browser/agent-golden-flow-recovered.png
artifacts/m1-a-1/browser/human-golden-flow-complete.png
artifacts/m1-a-1/browser/okx-wallet-request-cancelled.png
artifacts/m1-a-1/logs/local-acceptance-20260804.log
artifacts/m1-a-1/logs/local-agent-acceptance-20260804-rerun.log
artifacts/m1-a-1/logs/local-agent-acceptance-20260804.log
artifacts/m1-a-1/logs/pnpm-check-migrations-20260804.log
artifacts/m1-a-1/logs/pnpm-lint-20260804.log
artifacts/m1-a-1/logs/pnpm-test-20260804.log
artifacts/m1-a-1/logs/pnpm-test-postgres-20260804.log
artifacts/m1-a-1/logs/pnpm-typecheck-20260804.log
db/migrations/0050_canonical_credit_line_projection.down.sql
db/migrations/0050_canonical_credit_line_projection.up.sql
db/migrations/0051_durable_workspace_continuation_receipts.down.sql
db/migrations/0051_durable_workspace_continuation_receipts.up.sql
db/migrations/0052_provider_bound_sandbox_execution_receipts.down.sql
db/migrations/0052_provider_bound_sandbox_execution_receipts.up.sql
db/migrations/0053_workspace_continuation_tenant_guard.down.sql
db/migrations/0053_workspace_continuation_tenant_guard.up.sql
deploy/vercel/m1-b-sandbox.manifest.v1.json
deploy/vercel/package.m1-b-sandbox.json
deploy/vercel/vercel.m1-b-sandbox-risk.json
deploy/vercel/vercel.m1-b-sandbox.json
docs/codex/tasks/M1_B_DEPLOYABLE_SANDBOX_CLOSURE.md
docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md
docs/deployment/VERCEL_ROLLBACK_AND_RECOVERY.md
docs/deployment/VERCEL_SANDBOX_ARCHITECTURE.md
docs/deployment/VERCEL_SANDBOX_RUNBOOK.md
docs/releases/M1_B_DEPLOYMENT_BLOCKERS.md
docs/releases/M1_B_DEPLOYMENT_RUNBOOK.md
docs/releases/M1_B_GATE_PROFILE.md
docs/releases/M1_B_KNOWN_LIMITATIONS.md
docs/releases/M1_B_WORKTREE_INCLUSION_MANIFEST.md
docs/user-guide/IPO_ONE_HUMAN_AGENT_USER_MANUAL_v0.2_DRAFT.md
docs/user-guide/IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md
docs/verification/M1_B_CANONICAL_CLOSURE_EVIDENCE.md
docs/verification/M1_B_GOLDEN_FLOW_EVIDENCE.md
docs/verification/M1_B_VERCEL_GOLDEN_FLOW.md
docs/verification/m1-b-vercel-golden-flow-evidence.v1.json
modules/abuse-control/src/abuse-policy.js
modules/abuse-control/test/abuse-policy.test.js
modules/authentication/src/runtime-config.js
modules/authorization/src/authorization-constants.js
modules/authorization/src/authorization-policy.js
modules/persistence/src/postgres-core-repository.js
modules/persistence/src/postgres-reconciliation-service.js
modules/persistence/src/postgres.js
modules/persistence/test-postgres/postgres-event-runtime.test.mjs
modules/sandbox-rail/src/signed-sandbox-rail-adapter.js
modules/sandbox-rail/test/signed-sandbox-rail-adapter.test.js
modules/tenant-command-gateway/src/credit-execution-handlers.js
modules/tenant-command-gateway/src/index.js
modules/tenant-command-gateway/src/postgres-live-policy-adapter.js
modules/tenant-command-gateway/src/tenant-command-clients.js
modules/tenant-command-gateway/src/tenant-foundation-handlers.js
modules/tenant-command-gateway/src/workspace-continuation-handlers.js
modules/tenant-command-gateway/src/workspace-resume-handlers.js
modules/tenant-command-gateway/test-postgres/tenant-command-gateway-runtime.test.mjs
modules/tenant-command-gateway/test/credit-execution-handlers.test.js
modules/tenant-command-gateway/test/tenant-command-gateway.test.js
package.json
packages/api-contract/index.d.ts
packages/api-contract/src/agent-pilot-capability-manifest.js
packages/api-contract/src/tenant-protocol.js
packages/domain/src/agent-lockbox.js
packages/domain/src/credit-line-projection.js
packages/domain/src/index.js
packages/domain/src/sandbox-credit.js
packages/domain/test/agent-lockbox.test.js
packages/domain/test/credit-line-projection.test.js
packages/sdk/src/agent-sandbox-obligation-client.js
packages/sdk/src/production-agent-client.js
packages/sdk/test/agent-sandbox-obligation-client.test.js
packages/sdk/test/production-agent-client.test.js
product/traceability/ipo-one.m1-b-gate-profile.v1.json
product/traceability/ipo-one.v9-product-traceability.v1.json
schemas/v2/abuse-control-policy.schema.json
schemas/v2/agent-handoff-manifest.schema.json
schemas/v2/agent-pilot-capability-manifest.schema.json
schemas/v2/agent-sandbox-obligation-workflow-receipt.schema.json
schemas/v2/tenant-protocol-catalog.schema.json
schemas/v2/tenant-protocol-request.schema.json
schemas/v2/tenant-protocol-result.schema.json
scripts/build-vercel-sandbox-bundle.mjs
scripts/check-m1-b-gate-profile.mjs
scripts/check-vercel-sandbox-deployment.mjs
scripts/check-vercel-sandbox-environment.mjs
scripts/smoke-vercel-sandbox.mjs
```

The browser acceptance host remains mock/process-local support and cannot be
used as Golden Flow runtime proof. Its change is included only for contract and
UI acceptance consistency.

## Explicitly excluded protected user WIP

These tracked paths are modified but must not be staged, overwritten, reverted,
formatted, or included without separate Founder approval:

```text
apps/web/test/support/capital-network-browser-host.mjs
apps/web/test/support/risk-operations-browser-host.mjs
```

## Explicitly excluded unrelated or historical paths

```text
CURRENT_STATE_CAPABILITY_MATRIX.md
GOLDEN_FLOW_GAP_ANALYSIS.md
RECOVERY_EXEC_PLAN.md
SPEC_CONTRADICTIONS.md
TRACEABILITY_MATRIX.md
all other `artifacts/m1-a-1/` paths not listed in the exact candidate block
artifacts/m1-a/
deploy/local/m1-a-1-candidate-snapshot.v1.json
docs/codex/tasks/MARKETING_FILM_006_OPENING_AND_NARRATION_REFINEMENT.md
docs/codex/tasks/MARKETING_FILM_007_ORDER_TO_OUTCOME.md
docs/marketing/
output/
prototypes/
```

Historical M1-A and M1-A.1 Evidence remains authoritative for its own snapshot
and must not be rewritten to claim M1-B completion.

## Mandatory pre-commit controls

Before a normal M1-B implementation commit:

1. regenerate `git status --porcelain=v2` and stop on unexpected drift;
2. confirm every staged path appears in the candidate list;
3. confirm every protected/excluded path is unstaged;
4. inspect the exact staged diff;
5. run secret, credential, generated-file, and excluded-path checks on the
   exact staged set;
6. run `git diff --cached --check` for source and documentation paths; the
   exact hash-bound historical logs retain their original CRLF/terminal control
   bytes and are checked by catalog SHA-256 instead of being normalized;
7. run the complete static, unit, contract, and fresh PostgreSQL gates;
8. record the staged tree SHA and file hashes;
9. use a normal implementation commit only, never an RC branch or tag;
10. deploy from a clean checkout of that exact commit, not from the dirty
    working directory.

No commit created from this draft is an M1-B completion claim. Requirement
levels remain evidence-gated.
