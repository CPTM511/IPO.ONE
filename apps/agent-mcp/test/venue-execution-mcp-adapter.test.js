import assert from "node:assert/strict";
import test from "node:test";
import { VENUE_EXECUTION_MCP_TOOLS, createVenueExecutionMcpAdapter } from "../src/index.js";

function client(calls) {
  return Object.fromEntries([
    "discoverCapabilities", "readBinding", "prepareDelegate", "activateDelegate",
    "revokeDelegate", "prepareExecution", "submitExecution", "readExecution"
  ].map((name) => [name, async (args) => {
    calls.push({ name, args });
    return { operation: name, sandboxOnly: true, fundsAuthority: false };
  }]));
}

const IDS = {
  requestId: "request_venue002a_mcp_0001",
  correlationId: "correlation_venue002a_mcp_0001",
  idempotencyKey: "idempotency_venue002a_mcp_0001"
};

test("HYPERLIQUID-002A MCP exposes eight local Venue tools", () => {
  const adapter = createVenueExecutionMcpAdapter({ client: client([]) });
  assert.equal(adapter.listTools().length, 8);
  assert.equal(VENUE_EXECUTION_MCP_TOOLS.every(({ name }) => name.startsWith("ipo_one_venue_")), true);
});

test("HYPERLIQUID-002A MCP accepts only OrderIntent-bound preparation", async () => {
  const calls = [];
  const adapter = createVenueExecutionMcpAdapter({ client: client(calls) });
  const args = {
    delegateId: "venue_delegate_fixture", orderIntentId: "trading_order_intent_fixture",
    orderIntentHash: `0x${"b".repeat(64)}`, ...IDS
  };
  await adapter.callTool("ipo_one_venue_prepare_execution", args);
  assert.equal(calls[0].name, "prepareExecution");
  await assert.rejects(
    adapter.callTool("ipo_one_venue_prepare_execution", { ...args, rawAction: {} }),
    { code: "invalid_mcp_tool_arguments" }
  );
});
