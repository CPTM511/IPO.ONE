import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_EXECUTION_MCP_TOOLS,
  createWalletExecutionMcpAdapter
} from "../src/index.js";

function client(calls) {
  return Object.fromEntries([
    "prepareAccountBinding", "submitAccountBinding", "readAccountBindings", "revokeAccountBinding",
    "discoverCapabilities", "prepareGrant", "activateGrant", "readGrant", "revokeGrant",
    "prepareExecution", "approveExecution", "submitExecution", "readExecution"
  ].map((name) => [name, async (args) => {
    calls.push({ name, args });
    return { operation: name, sandboxOnly: true, fundsAuthority: false };
  }]));
}

const IDS = {
  requestId: "request_exec003_mcp_0001",
  correlationId: "correlation_exec003_mcp_0001",
  idempotencyKey: "idempotency_exec003_mcp_0001"
};

test("PRODUCT-INTEGRATION-001 MCP exposes binding and execution through one wallet family", () => {
  const adapter = createWalletExecutionMcpAdapter({ client: client([]) });
  assert.equal(adapter.listTools().length, 13);
  assert.deepEqual(
    WALLET_EXECUTION_MCP_TOOLS.map(({ operationId }) => operationId),
    [
      "walletPrepareAccountBinding", "walletSubmitAccountBinding",
      "walletReadAccountBindings", "walletRevokeAccountBinding",
      "walletDiscoverCapabilities", "walletPrepareGrant", "walletActivateGrant",
      "walletReadGrant", "walletRevokeGrant", "walletPrepareExecution",
      "walletApproveExecution", "walletSubmitExecution", "walletReadExecution"
    ]
  );
});

test("EXEC-003 MCP preparation accepts only a TransferIntent reference", async () => {
  const calls = [];
  const adapter = createWalletExecutionMcpAdapter({ client: client(calls) });
  const args = {
    grantId: "delegated_wallet_grant_exec003",
    transferIntentId: "transfer_intent_exec003",
    ...IDS
  };
  const result = await adapter.callTool("ipo_one_wallet_prepare_execution", args);
  assert.equal(result.isError, false);
  assert.equal(calls[0].name, "prepareExecution");
  assert.deepEqual(calls[0].args, args);
  await assert.rejects(
    adapter.callTool("ipo_one_wallet_prepare_execution", { ...args, calldata: "0x12345678" }),
    { code: "invalid_mcp_tool_arguments" }
  );
});

test("EXEC-003 MCP submit preserves the exact execution/preflight binding", async () => {
  const calls = [];
  const adapter = createWalletExecutionMcpAdapter({ client: client(calls) });
  const args = {
    executionId: "wallet_execution_exec003",
    preflightHash: `0x${"b".repeat(64)}`,
    ...IDS
  };
  await adapter.callTool("ipo_one_wallet_submit_execution", args);
  assert.equal(calls[0].name, "submitExecution");
  assert.deepEqual(calls[0].args, args);
});
