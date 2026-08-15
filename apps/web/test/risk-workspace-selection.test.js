import test from "node:test";
import assert from "node:assert/strict";
import { selectRiskWorkspaceReference } from "../src/risk-workspace-selection.js";

function reference(resourceType, resourceId) {
  return {
    resource: resourceId === null ? null : { resourceType, resourceId },
    serverTruth: true,
    readOnly: true,
    schemaVersion: resourceType === "risk_portfolio"
      ? "tenant_risk_portfolio_reference_view.v1"
      : "tenant_servicing_queue_reference_view.v1"
  };
}

test("selects exact server-derived Risk references", () => {
  assert.deepEqual(
    selectRiskWorkspaceReference(
      reference("risk_portfolio", "risk_portfolio_local_private_pilot"),
      "risk_portfolio"
    ),
    { status: "selected", resourceId: "risk_portfolio_local_private_pilot" }
  );
  assert.deepEqual(
    selectRiskWorkspaceReference(
      reference("servicing_queue", "servicing_queue_local_private_pilot"),
      "servicing_queue"
    ),
    { status: "selected", resourceId: "servicing_queue_local_private_pilot" }
  );
});

test("preserves a closed empty reference", () => {
  assert.deepEqual(
    selectRiskWorkspaceReference(reference("risk_portfolio", null), "risk_portfolio"),
    { status: "empty", resourceId: null }
  );
});

test("fails closed on malformed, extra, or wrong-type reference truth", () => {
  const valid = reference("risk_portfolio", "risk_portfolio_a");
  const cases = [
    null,
    {},
    { ...valid, extra: true },
    { ...valid, serverTruth: false },
    { ...valid, readOnly: false },
    { ...valid, schemaVersion: "tenant_servicing_queue_reference_view.v1" },
    { ...valid, resource: { ...valid.resource, extra: true } },
    { ...valid, resource: { resourceType: "servicing_queue", resourceId: "servicing_queue_a" } },
    { ...valid, resource: { resourceType: "risk_portfolio", resourceId: "invalid id" } }
  ];
  for (const value of cases) {
    assert.deepEqual(
      selectRiskWorkspaceReference(value, "risk_portfolio"),
      { status: "ambiguous", resourceId: null }
    );
  }
});

test("fails closed for an unsupported expected resource type", () => {
  assert.deepEqual(
    selectRiskWorkspaceReference(reference("risk_portfolio", "risk_portfolio_a"), "subject"),
    { status: "ambiguous", resourceId: null }
  );
});
