import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVAL_OPERATION_CLASSIFICATIONS,
  assertApprovalPolicyCoverage,
  requireDualControlProfile
} from "../src/index.js";

test("every high-impact authorization operation has one closed approval classification", () => {
  assert.equal(assertApprovalPolicyCoverage(), true);
  assert.equal(new Set(
    APPROVAL_OPERATION_CLASSIFICATIONS.map(({ operationId }) => operationId)
  ).size, APPROVAL_OPERATION_CLASSIFICATIONS.length);
  assert.deepEqual(
    requireDualControlProfile("pilotIncreaseCreditLimit").requiredApproverRoleBundles,
    ["risk_operator", "operations_operator"]
  );
  assert.throws(
    () => requireDualControlProfile("pilotFreezeSubject"),
    (error) => error.code === "approval_operation_not_dual_control"
  );
});

test("coverage fails when a high-impact operation is removed or silently weakened", async () => {
  const { TENANT_OPERATION_POLICIES } = await import("../../authorization/src/index.js");
  assert.throws(
    () => assertApprovalPolicyCoverage(
      TENANT_OPERATION_POLICIES.filter(({ operationId }) => operationId !== "pilotUnfreezeSubject")
    ),
    (error) => error.code === "approval_policy_coverage_failed"
  );
  assert.throws(
    () => assertApprovalPolicyCoverage(TENANT_OPERATION_POLICIES.map((policy) =>
      policy.operationId === "pilotIncreaseCreditLimit"
        ? { ...policy, approvalRequirement: "protective_single_actor" }
        : policy
    )),
    (error) => error.code === "approval_policy_coverage_failed"
  );
});
