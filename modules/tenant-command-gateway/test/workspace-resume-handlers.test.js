import assert from "node:assert/strict";
import test from "node:test";
import { RoleBundle } from "../../authorization/src/index.js";
import { readWorkspaceResumeQueryHandler } from "../src/workspace-resume-handlers.js";

function context(roles = [RoleBundle.HUMAN_BORROWER]) {
  return {
    tenantId: "tenant_workspace_test",
    actorId: "actor_workspace_test",
    roles
  };
}

function row(index, resourceType = "subject") {
  return {
    resource_type: resourceType,
    resource_id: `${resourceType}_workspace_${String(index).padStart(2, "0")}`,
    relationship: resourceType === "subject" ? "owner" : "owner"
  };
}

test("workspace recovery returns only bounded resources already bound to the authenticated Human", async () => {
  const calls = [];
  const handler = readWorkspaceResumeQueryHandler();
  const result = await handler.execute({
    client: {
      async query(text, values) {
        calls.push({ text, values });
        return { rows: [row(1), row(2, "consent"), row(3, "obligation")] };
      }
    },
    payload: {},
    authenticationContext: context()
  });

  assert.equal(result.workspaceKind, "human_borrower");
  assert.equal(result.serverTruth, true);
  assert.equal(result.hasMore, false);
  assert.equal(result.resources.length, 3);
  assert.deepEqual(calls[0].values.slice(0, 2), ["tenant_workspace_test", "actor_workspace_test"]);
  assert.match(calls[0].text, /b\.actor_id = \$2/);
  assert.match(calls[0].text, /r\.status = 'active'/);
  assert.equal(JSON.stringify(result).includes("credential"), false);
});

test("workspace recovery is capped and recognizes one Principal Controller role", async () => {
  const handler = readWorkspaceResumeQueryHandler();
  const rows = Array.from({ length: 33 }, (_, index) => row(index, index % 2 ? "mandate" : "subject"));
  const result = await handler.execute({
    client: { async query() { return { rows }; } },
    payload: {},
    authenticationContext: context([RoleBundle.PRINCIPAL_CONTROLLER])
  });
  assert.equal(result.workspaceKind, "principal_controller");
  assert.equal(result.resources.length, 32);
  assert.equal(result.hasMore, true);
});

test("workspace recovery fails closed on caller scope, ambiguous role, or invalid durable rows", async () => {
  const handler = readWorkspaceResumeQueryHandler();
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [] }; } },
      payload: { actorId: "actor_other" },
      authenticationContext: context()
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [] }; } },
      payload: {},
      authenticationContext: context([RoleBundle.HUMAN_BORROWER, RoleBundle.PRINCIPAL_CONTROLLER])
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [{ ...row(1), resource_type: "credential" }] }; } },
      payload: {},
      authenticationContext: context()
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
});
