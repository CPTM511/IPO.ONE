import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_NAVIGATION_MANIFEST,
  canonicalWorkspaceView,
  workspaceSurfaceAccess
} from "../src/workspace-surface-access.js";

test("controller exposes Principal and Agent surfaces without deferred role destinations", () => {
  const access = workspaceSurfaceAccess("controller");
  assert.equal(access.defaultView, "overview");
  assert.deepEqual(
    [...access.primaryViews],
    ["overview", "request-credit", "secured-pool", "agent-console"]
  );
  assert.equal(access.allowedViews.has("agent-console"), true);
  assert.equal(access.allowedViews.has("capital-partners"), false);
  assert.equal(access.allowedViews.has("risk-operations"), false);
  assert.deepEqual(
    [...access.advancedViews],
    [
      "obligations",
      "wallet-permissions",
      "activity-proofs",
      "credit-track-record",
      "reports-exports",
      "architecture"
    ]
  );
});

test("risk exposes only the safe Risk workspace destination", () => {
  const access = workspaceSurfaceAccess("risk");
  assert.equal(access.defaultView, "risk-operations");
  assert.deepEqual([...access.primaryViews], ["risk-operations"]);
  assert.deepEqual([...access.allowedViews], ["risk-operations"]);
});

test("local Capital Partner remains available without cross-role surfaces", () => {
  const access = workspaceSurfaceAccess("capitalPartner");
  assert.equal(access.defaultView, "capital-partners");
  assert.deepEqual([...access.primaryViews], ["capital-partners"]);
  assert.deepEqual([...access.allowedViews], ["capital-partners"]);
});

test("borrower does not advertise Capital Partner or Risk", () => {
  const access = workspaceSurfaceAccess("borrower");
  assert.deepEqual(
    [...access.primaryViews],
    ["overview", "request-credit", "secured-pool", "obligations"]
  );
  assert.equal(access.allowedViews.has("request-credit"), true);
  assert.equal(access.allowedViews.has("capital-partners"), false);
  assert.equal(access.allowedViews.has("risk-operations"), false);
  assert.deepEqual(
    [...access.advancedViews],
    [
      "activity-proofs",
      "repay-settle",
      "credit-passport",
      "wallet-permissions",
      "credit-track-record",
      "reports-exports"
    ]
  );
});

test("empty and unknown workspace names fail closed for protected role surfaces", () => {
  for (const workspaceName of ["", "unexpected", undefined, null]) {
    const access = workspaceSurfaceAccess(workspaceName);
    assert.equal(access.defaultView, "overview");
    assert.deepEqual([...access.primaryViews], ["overview"]);
    assert.deepEqual([...access.allowedViews], ["overview"]);
  }
});

test("normal role navigation never exposes more than four primary destinations", () => {
  for (const workspaceName of ["borrower", "controller", "risk", "capitalPartner"]) {
    assert.equal(workspaceSurfaceAccess(workspaceName).primaryViews.size <= 4, true);
  }
});

test("one manifest separates authorization from primary and advanced placement", () => {
  assert.equal(
    WORKSPACE_NAVIGATION_MANIFEST.schemaVersion,
    "workspace_navigation_manifest.v1"
  );
  for (const workspaceName of ["borrower", "controller", "risk", "capitalPartner"]) {
    const access = workspaceSurfaceAccess(workspaceName);
    const placed = new Set([...access.primaryViews, ...access.advancedViews]);
    assert.deepEqual(placed, access.allowedViews);
    assert.equal(
      [...access.primaryViews].some((viewId) => access.advancedViews.has(viewId)),
      false
    );
    for (const viewId of access.allowedViews) {
      const entry = access.entries.get(viewId);
      const definition = WORKSPACE_NAVIGATION_MANIFEST.views[viewId];
      assert.equal(entry.allowed, true);
      assert.ok(new Set(["primary", "advanced"]).has(entry.placement));
      assert.equal(typeof definition.label, "string");
      assert.equal(typeof definition.pageTitle, "string");
      assert.equal(definition.capability.state, "available");
      assert.equal(definition.capability.reason, null);
      assert.equal(definition.capability.recoveryCondition, null);
    }
  }
});

test("every allowed view has one normal navigation control", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  for (const workspaceName of ["borrower", "controller", "risk", "capitalPartner"]) {
    for (const viewId of workspaceSurfaceAccess(workspaceName).allowedViews) {
      const controls = html.match(new RegExp(`data-view="${viewId}"`, "g")) ?? [];
      assert.equal(
        controls.length,
        1,
        `${workspaceName}:${viewId} must have exactly one navigation control`
      );
    }
  }
});

test("unavailable and invalid deep links canonicalize to the workspace default", () => {
  assert.equal(canonicalWorkspaceView("controller", "capital-partners"), "overview");
  assert.equal(canonicalWorkspaceView("risk", "overview"), "risk-operations");
  assert.equal(canonicalWorkspaceView("capitalPartner", "risk-operations"), "capital-partners");
  assert.equal(canonicalWorkspaceView("borrower", "not-a-view"), "overview");
  assert.equal(canonicalWorkspaceView("controller", "agent-console"), "agent-console");
});
