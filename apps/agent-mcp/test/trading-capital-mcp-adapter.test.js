import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TRADING_CAPITAL_MCP_TOOLS,
  createTradingCapitalMcpAdapter
} from "../src/trading-capital-mcp-adapter.js";
import {
  IpoOneTradingCapitalClient,
  TRADING_CAPITAL_OPERATION_IDS
} from "../../../packages/sdk/src/trading-capital-client.js";

const fixtures = JSON.parse(
  await readFile(
    new URL(
      "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
      import.meta.url
    ),
    "utf8"
  )
);

test("TC-104 local MCP derives exact closed schemas for all 25 operations", () => {
  assert.deepEqual(
    TRADING_CAPITAL_MCP_TOOLS.map(({ operationId }) => operationId),
    TRADING_CAPITAL_OPERATION_IDS
  );
  assert.equal(
    new Set(TRADING_CAPITAL_MCP_TOOLS.map(({ name }) => name)).size,
    25
  );
  for (const tool of TRADING_CAPITAL_MCP_TOOLS) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.inputSchema.required.includes("resourceId"), true);
    assert.equal(tool.inputSchema.required.includes("payload"), true);
    assert.equal(tool.description.includes("local no-funds"), true);
  }
});

test("TC-104 local MCP is role-scoped and calls the typed SDK", async () => {
  const request = fixtures.validRequests.find(
    ({ operationId }) => operationId === "tradingRequestClose"
  );
  const response = fixtures.validResults.find(
    ({ operationId }) => operationId === "tradingRequestClose"
  );
  const calls = [];
  const client = new IpoOneTradingCapitalClient({
    actorType: "agent",
    transportProfile: "local_in_process",
    execute: async (value) => {
      calls.push(structuredClone(value));
      return response;
    }
  });
  const adapter = createTradingCapitalMcpAdapter({ client });
  const tool = TRADING_CAPITAL_MCP_TOOLS.find(
    ({ operationId }) => operationId === request.operationId
  );
  const args = {
    resourceId: request.resource.resourceId,
    payload: request.payload,
    requestId: request.requestId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey
  };
  const result = await adapter.callTool(tool.name, args);
  assert.deepEqual(result.structuredContent, response);
  assert.equal(result.isError, false);
  assert.deepEqual(calls, [request]);
  assert.equal(
    adapter.listTools().some(({ name }) =>
      name.includes("run_settlement")
    ),
    false
  );
  await assert.rejects(
    () => adapter.callTool(tool.name, { ...args, privateKey: "forbidden" }),
    /arguments are invalid/
  );
});
