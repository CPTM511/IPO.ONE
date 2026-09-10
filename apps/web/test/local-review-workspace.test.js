import test from "node:test";
import assert from "node:assert/strict";
import { localReviewOperationAvailable } from "../src/local-review-workspace.js";

test("installed interfaces cannot expose writes to read-only or independent reviewer workspaces", () => {
  const operations=["pilotReadApprovalInbox","pilotProposeApproval","pilotDecideApproval","pilotCancelApproval",
    "pilotRestructureSandboxObligation","pilotRepurchaseSandboxObligation","pilotWriteOffSandboxObligation","pilotReadServicingQueue","pilotReadRiskAgentDirectory"];
  const installed=new Set(operations);
  assert.equal(localReviewOperationAvailable("auditor","pilotReadApprovalInbox",installed),true);
  for(const op of operations.slice(1)) assert.equal(localReviewOperationAvailable("auditor",op,installed),false);
  assert.equal(localReviewOperationAvailable("riskReviewer","pilotDecideApproval",installed),true);
  assert.equal(localReviewOperationAvailable("operationsReviewer","pilotDecideApproval",installed),true);
  for(const op of ["pilotProposeApproval","pilotCancelApproval","pilotWriteOffSandboxObligation"])
    assert.equal(localReviewOperationAvailable("operationsReviewer",op,installed),false);
  for(const op of ["pilotProposeApproval","pilotCancelApproval","pilotWriteOffSandboxObligation"]) assert.equal(localReviewOperationAvailable("riskReviewer",op,installed),false);
  assert.equal(localReviewOperationAvailable("operations","pilotProposeApproval",installed),true);
  assert.equal(localReviewOperationAvailable("operations","pilotDecideApproval",installed),false);
  assert.equal(localReviewOperationAvailable("risk","pilotReadRiskAgentDirectory",installed),true);
  for(const workspace of ["auditor","operations","riskReviewer","risk","borrower","unknown"])
    assert.equal(localReviewOperationAvailable(workspace,"pilotReadApprovalInbox",new Set()),false);
});
