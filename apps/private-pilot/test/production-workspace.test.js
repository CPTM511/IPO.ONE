import assert from "node:assert/strict";
import test from "node:test";

import {
  productionWorkspaceNameForDeploymentRole
} from "../src/production-runtime.js";

test("production deployment roles derive a closed browser workspace topology", () => {
  assert.equal(
    productionWorkspaceNameForDeploymentRole("primary"),
    undefined
  );
  assert.equal(
    productionWorkspaceNameForDeploymentRole("risk"),
    "risk"
  );
  assert.equal(
    productionWorkspaceNameForDeploymentRole("container"),
    undefined
  );
  assert.equal(
    productionWorkspaceNameForDeploymentRole("unexpected"),
    undefined
  );
});

test("the primary production shell remains neutral until authenticated server role recovery", () => {
  assert.notEqual(productionWorkspaceNameForDeploymentRole("primary"), "controller");
  assert.notEqual(productionWorkspaceNameForDeploymentRole("primary"), "borrower");
});
