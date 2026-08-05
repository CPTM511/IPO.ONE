import assert from "node:assert/strict";
import test from "node:test";

import { principalWorkspaceAccess } from "../src/principal-workspace-access.js";

test("production-neutral host accepts authenticated Principal server truth", () => {
  assert.equal(principalWorkspaceAccess({
    connected: true,
    hostWorkspaceName: "",
    serverWorkspaceKind: "principal_controller"
  }), true);
});

test("named local Controller host accepts matching Principal server truth", () => {
  assert.equal(principalWorkspaceAccess({
    connected: true,
    hostWorkspaceName: "controller",
    serverWorkspaceKind: "principal_controller"
  }), true);
});

test("Borrower, unknown, disconnected, and non-Principal states fail closed", () => {
  for (const input of [
    {
      connected: true,
      hostWorkspaceName: "borrower",
      serverWorkspaceKind: "principal_controller"
    },
    {
      connected: true,
      hostWorkspaceName: "unexpected",
      serverWorkspaceKind: "principal_controller"
    },
    {
      connected: false,
      hostWorkspaceName: "",
      serverWorkspaceKind: "principal_controller"
    },
    {
      connected: true,
      hostWorkspaceName: "",
      serverWorkspaceKind: "human_borrower"
    }
  ]) {
    assert.equal(principalWorkspaceAccess(input), false);
  }
});
