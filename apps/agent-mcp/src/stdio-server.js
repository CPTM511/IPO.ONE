import { createInterface } from "node:readline";
import { DomainError } from "../../../packages/domain/src/index.js";

const MAX_MESSAGE_BYTES = 64 * 1024;

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function createAgentMcpJsonRpcHandler({ adapter }) {
  if (!adapter?.listTools || !adapter?.callTool) {
    throw new DomainError("invalid_agent_mcp_config", "Agent MCP adapter is required");
  }
  return async function handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
      return errorResponse(message?.id ?? null, -32600, "Invalid Request");
    }
    const id = message.id ?? null;
    try {
      if (message.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "ipo-one-agent-local", version: "0.1.0" }
          }
        };
      }
      if (message.method === "ping") return { jsonrpc: "2.0", id, result: {} };
      if (message.method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: adapter.listTools() } };
      }
      if (message.method === "tools/call") {
        const params = message.params;
        if (
          !params ||
          typeof params !== "object" ||
          Array.isArray(params) ||
          Object.keys(params).some((key) => !new Set(["name", "arguments"]).has(key)) ||
          typeof params.name !== "string"
        ) return errorResponse(id, -32602, "Invalid params");
        const result = await adapter.callTool(params.name, params.arguments ?? {});
        return { jsonrpc: "2.0", id, result };
      }
      if (message.method === "notifications/initialized") return undefined;
      return errorResponse(id, -32601, "Method not found");
    } catch (error) {
      return errorResponse(id, -32000, error?.code ?? "mcp_tool_failed");
    }
  };
}

export function startAgentMcpStdio({ adapter, input = process.stdin, output = process.stdout }) {
  const handle = createAgentMcpJsonRpcHandler({ adapter });
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let chain = Promise.resolve();
  lines.on("line", (line) => {
    chain = chain.then(async () => {
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
        output.write(`${JSON.stringify(errorResponse(null, -32600, "Invalid Request"))}\n`);
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify(errorResponse(null, -32700, "Parse error"))}\n`);
        return;
      }
      const response = await handle(message);
      if (response !== undefined) output.write(`${JSON.stringify(response)}\n`);
    });
  });
  return Object.freeze({
    async close() {
      lines.close();
      await chain;
    }
  });
}
