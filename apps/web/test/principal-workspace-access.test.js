import assert from "node:assert/strict";
import test from "node:test";

import {
  humanWorkspaceAccess,
  principalWorkspaceAccess,
  resolveAuthenticatedWorkspaceName,
  shouldRecoverAuthenticatedWorkspace
} from "../src/principal-workspace-access.js";

test("production-neutral shell derives exactly one workspace from authenticated server truth", () => {
  assert.equal(resolveAuthenticatedWorkspaceName({
    configuredWorkspaceName: "",
    serverWorkspaceKind: "human_borrower"
  }), "borrower");
  assert.equal(resolveAuthenticatedWorkspaceName({
    configuredWorkspaceName: "",
    serverWorkspaceKind: "principal_controller"
  }), "controller");
  assert.equal(resolveAuthenticatedWorkspaceName({
    configuredWorkspaceName: "",
    serverWorkspaceKind: "unexpected"
  }), "");
});

test("named local and permissioned workspaces never change from session role input", () => {
  for (const configuredWorkspaceName of ["borrower", "controller", "risk", "capitalPartner", "unexpected"]) {
    assert.equal(resolveAuthenticatedWorkspaceName({
      configuredWorkspaceName,
      serverWorkspaceKind: "human_borrower"
    }), configuredWorkspaceName);
  }
});

test("production-neutral authenticated host recovers server workspace truth", () => {
  assert.equal(shouldRecoverAuthenticatedWorkspace({
    connected: true,
    currentView: "request-credit",
    hostWorkspaceName: ""
  }), true);
});

test("risk, disconnected, and unrelated named workspaces do not run borrower recovery", () => {
  for (const input of [
    { connected: true, currentView: "risk-operations", hostWorkspaceName: "" },
    { connected: false, currentView: "request-credit", hostWorkspaceName: "" },
    { connected: true, currentView: "capital-partners", hostWorkspaceName: "capitalPartner" }
  ]) {
    assert.equal(shouldRecoverAuthenticatedWorkspace(input), false);
  }
});

test("production-neutral host accepts authenticated Human Borrower server truth", () => {
  assert.equal(humanWorkspaceAccess({
    connected: true,
    hostWorkspaceName: "",
    serverWorkspaceKind: "human_borrower"
  }), true);
});

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

test("Principal, unknown, disconnected, and non-Human states fail closed for Human mutations", () => {
  for (const input of [
    {
      connected: true,
      hostWorkspaceName: "controller",
      serverWorkspaceKind: "human_borrower"
    },
    {
      connected: true,
      hostWorkspaceName: "unexpected",
      serverWorkspaceKind: "human_borrower"
    },
    {
      connected: false,
      hostWorkspaceName: "",
      serverWorkspaceKind: "human_borrower"
    },
    {
      connected: true,
      hostWorkspaceName: "",
      serverWorkspaceKind: "principal_controller"
    }
  ]) {
    assert.equal(humanWorkspaceAccess(input), false);
  }
});
