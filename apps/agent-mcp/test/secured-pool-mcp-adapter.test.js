import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IpoOneSecuredPoolClient } from "../../../packages/sdk/src/secured-pool-client.js";
import { createSecuredPoolMcpAdapter } from "../src/secured-pool-mcp-adapter.js";

const fixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/secured-pool-workspace.v1.fixtures.json", import.meta.url),
  "utf8"
));

test("Secured Pool MCP provides Agent parity without a transaction submission tool", async () => {
  const client = new IpoOneSecuredPoolClient({
    transportProfile: "local_in_process",
    async execute(request) {
      return fixtures.validResults.find(({ operationId }) => operationId === request.operationId);
    }
  });
  const adapter = createSecuredPoolMcpAdapter({ client });
  assert.deepEqual(adapter.listTools().map(({ name }) => name), [
    "ipo_one_read_secured_pool",
    "ipo_one_review_secured_pool_action"
  ]);
  assert.equal(adapter.listTools().some(({ name }) => name.includes("submit")), false);
  const response = await adapter.callTool("ipo_one_review_secured_pool_action", {
    resourceId: "subject_pool_fixture",
    payload: { actionType: "borrow", amountAssets: "1000000" },
    requestId: "request_pool_review_fixture_001",
    correlationId: "correlation_pool_review_fixture_001"
  });
  assert.equal(response.structuredContent.response.submittable, false);
  assert.equal(response.isError, false);
});

test("Secured Pool MCP rejects extra authority-bearing arguments", async () => {
  const client = new IpoOneSecuredPoolClient({
    transportProfile: "local_in_process",
    async execute() { throw new Error("must not execute"); }
  });
  const adapter = createSecuredPoolMcpAdapter({ client });
  await assert.rejects(
    () => adapter.callTool("ipo_one_read_secured_pool", {
      resourceId: "subject_pool_fixture",
      payload: {},
      requestId: "request_pool_workspace_fixture_001",
      correlationId: "correlation_pool_workspace_fixture_001",
      privateKey: "prohibited"
    }),
    (error) => error.code === "invalid_secured_pool_mcp_arguments"
  );
});
