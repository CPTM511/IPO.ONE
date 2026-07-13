import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ApprovalRequirement,
  TENANT_OPERATION_POLICIES
} from "../../modules/authorization/src/index.js";
import {
  APPROVAL_OPERATION_CLASSIFICATIONS,
  BREAK_GLASS_PROHIBITED_ACTION_PREFIXES,
  BREAK_GLASS_PROTECTIVE_ACTIONS,
  assertApprovalPolicyCoverage,
  createBreakGlassRuntimeConfig
} from "../../modules/approval/src/index.js";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("high-impact commands and break-glass authority remain closed", () => {
  assert.equal(assertApprovalPolicyCoverage(), true);
  const highImpact = TENANT_OPERATION_POLICIES.filter(
    ({ approvalRequirement }) => approvalRequirement !== ApprovalRequirement.NONE
  );
  assert.deepEqual(
    highImpact.map(({ operationId }) => operationId).sort(),
    APPROVAL_OPERATION_CLASSIFICATIONS.map(({ operationId }) => operationId).sort()
  );
  assert.equal(new Set(BREAK_GLASS_PROTECTIVE_ACTIONS).size, BREAK_GLASS_PROTECTIVE_ACTIONS.length);
  assert.equal(
    BREAK_GLASS_PROTECTIVE_ACTIONS.some((action) =>
      BREAK_GLASS_PROHIBITED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
    ),
    false
  );
  assert.deepEqual(createBreakGlassRuntimeConfig(), { enabled: false, environment: "local" });
});

test("approval migration enforces immutability, tenant isolation, and bounded state", async () => {
  const migration = await readFile(
    `${rootDir}/db/migrations/0006_approval_runtime.up.sql`,
    "utf8"
  );
  for (const required of [
    "approval_proposals_transition_guard",
    "approval_decisions_immutable",
    "approval_executions_immutable",
    "break_glass_incidents_transition_guard",
    "approval_proposals_delete_guard",
    "break_glass_incidents_delete_guard",
    "break_glass_custodian_decisions_immutable",
    "break_glass_reviews_immutable",
    "ALTER TABLE %I ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE %I FORCE ROW LEVEL SECURITY",
    "tenant_context_guard_",
    "required_approval_count = 2",
    "maximum_session_ms BETWEEN 60000 AND 1800000",
    "expires_at <= activated_at + maximum_session_ms * INTERVAL '1 millisecond'",
    "OLD.maximum_session_ms IS DISTINCT FROM NEW.maximum_session_ms",
    "INTERVAL '30 minutes'",
    "INTERVAL '24 hours'"
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(migration, /production_funds_moved\s*=\s*TRUE/i);
});
