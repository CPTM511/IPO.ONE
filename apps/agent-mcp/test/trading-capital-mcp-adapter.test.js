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

test("TC-104 and M2B-001 local MCP derive exact closed schemas for all 28 operations", () => {
  assert.deepEqual(
    TRADING_CAPITAL_MCP_TOOLS.map(({ operationId }) => operationId),
    TRADING_CAPITAL_OPERATION_IDS
  );
  assert.equal(
    new Set(TRADING_CAPITAL_MCP_TOOLS.map(({ name }) => name)).size,
    28
  );
  for (const tool of TRADING_CAPITAL_MCP_TOOLS) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.inputSchema.required.includes("resourceId"), true);
    assert.equal(tool.inputSchema.required.includes("payload"), true);
    assert.equal(tool.description.includes("local no-funds"), true);
  }
});

test("M2B-001 Principal exposes create/read/revoke while Agent exposes read only", async () => {
  const readRequest = fixtures.validRequests.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const readResult = fixtures.validResults.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const principal = new IpoOneTradingCapitalClient({
    actorType: "human",
    transportProfile: "local_in_process",
    execute: async () => readResult
  });
  const agent = new IpoOneTradingCapitalClient({
    actorType: "agent",
    transportProfile: "local_in_process",
    execute: async () => readResult
  });
  const principalAdapter = createTradingCapitalMcpAdapter({ client: principal });
  const agentAdapter = createTradingCapitalMcpAdapter({ client: agent });
  const principalNames = principalAdapter.listTools().map(({ name }) => name);
  const agentNames = agentAdapter.listTools().map(({ name }) => name);

  assert.equal(principalNames.some((name) => name.includes("agent_create_secured")), true);
  assert.equal(principalNames.some((name) => name.includes("agent_revoke_secured")), true);
  assert.equal(agentNames.some((name) => name.includes("agent_create_secured")), false);
  assert.equal(agentNames.some((name) => name.includes("agent_revoke_secured")), false);

  const readTool = TRADING_CAPITAL_MCP_TOOLS.find(
    ({ operationId }) => operationId === readRequest.operationId
  );
  const args = {
    resourceId: readRequest.resource.resourceId,
    payload: readRequest.payload,
    requestId: readRequest.requestId,
    correlationId: readRequest.correlationId
  };
  const result = await agentAdapter.callTool(readTool.name, args);
  assert.equal(result.structuredContent.response.preSigningOnly, true);
  assert.equal(result.structuredContent.response.nonceCreated, false);
  assert.equal(result.structuredContent.response.signatureCreated, false);
  assert.equal(result.structuredContent.response.networkCalled, false);
  assert.equal(result.structuredContent.response.fundsMoved, false);
  await assert.rejects(
    () => agentAdapter.callTool(readTool.name, { ...args, nonce: "forbidden" }),
    /arguments are invalid/
  );
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
