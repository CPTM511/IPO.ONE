import assert from "node:assert/strict";
import test from "node:test";

import {
  productionWorkspaceNameForDeploymentRole
} from "../src/production-runtime.js";

test("production deployment roles derive a closed browser workspace topology", () => {
  assert.equal(
    productionWorkspaceNameForDeploymentRole("primary"),
    "controller"
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
