import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createTradingCapitalMcpAdapter
} from "../src/trading-capital-mcp-adapter.js";
import {
  IpoOneTradingCapitalClient
} from "../../../packages/sdk/src/trading-capital-client.js";

const fixtures = JSON.parse(await readFile(new URL(
  "../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json",
  import.meta.url
), "utf8"));

test("M2B-001 MCP keeps Principal mutation and Agent read-only before signing", async () => {
  const request = fixtures.validRequests.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const response = fixtures.validResults.find(
    ({ operationId }) => operationId === "agentReadSecuredFacilityAuthorization"
  );
  const principal = createTradingCapitalMcpAdapter({
    client: new IpoOneTradingCapitalClient({
      actorType: "human",
      transportProfile: "local_in_process",
      execute: async () => response
    })
  });
  const agent = createTradingCapitalMcpAdapter({
    client: new IpoOneTradingCapitalClient({
      actorType: "agent",
      transportProfile: "local_in_process",
      execute: async () => response
    })
  });
  const principalTools = principal.listTools().map(({ name }) => name);
  const agentTools = agent.listTools().map(({ name }) => name);
  assert.equal(principalTools.some((name) => name.includes("agent_create_secured")), true);
  assert.equal(principalTools.some((name) => name.includes("agent_revoke_secured")), true);
  assert.equal(agentTools.some((name) => name.includes("agent_create_secured")), false);
  assert.equal(agentTools.some((name) => name.includes("agent_revoke_secured")), false);

  const readTool = agent.listTools().find((tool) =>
    tool.name.includes("agent_read_secured_facility_authorization")
  );
  const args = {
    resourceId: request.resource.resourceId,
    payload: request.payload,
    requestId: request.requestId,
    correlationId: request.correlationId
  };
  const result = await agent.callTool(readTool.name, args);
  assert.equal(result.structuredContent.response.preSigningOnly, true);
  assert.equal(result.structuredContent.response.nonceCreated, false);
  assert.equal(result.structuredContent.response.signatureCreated, false);
  assert.equal(result.structuredContent.response.networkCalled, false);
  assert.equal(result.structuredContent.response.fundsMoved, false);
  await assert.rejects(
    () => agent.callTool(readTool.name, { ...args, privateKey: "forbidden" }),
    /arguments are invalid/
  );
});
