import requestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import {
  TRADING_CAPITAL_OPERATION_IDS
} from "../../../packages/sdk/src/trading-capital-client.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";

const OPERATION_IDS = new Set(TRADING_CAPITAL_OPERATION_IDS);
const PROTOCOL_BY_ID = new Map(
  TENANT_PROTOCOL_OPERATIONS
    .filter(({ operationId }) => OPERATION_IDS.has(operationId))
    .map((operation) => [operation.operationId, operation])
);
const BRANCH_BY_ID = new Map(
  requestSchema.oneOf
    .filter(({ properties }) =>
      OPERATION_IDS.has(properties?.operationId?.const)
    )
    .map((branch) => [branch.properties.operationId.const, branch])
);

function materialize(node, seen = new Set()) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((value) => materialize(value, seen));
  if (
    typeof node.$ref === "string" &&
    node.$ref.startsWith("#/$defs/")
  ) {
    const name = node.$ref.slice("#/$defs/".length);
    if (seen.has(name) || !requestSchema.$defs[name]) {
      throw new DomainError(
        "invalid_trading_capital_mcp_schema",
        "Trading Capital MCP schema reference is invalid"
      );
    }
    return materialize(
      requestSchema.$defs[name],
      new Set([...seen, name])
    );
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      materialize(value, seen)
    ])
  );
}

function toolName(operationId) {
  return `ipo_one_${operationId
    .replace(/^trading/, "trading_")
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/__+/g, "_")}`;
}

function toolFor(operationId) {
  const operation = PROTOCOL_BY_ID.get(operationId);
  const branch = BRANCH_BY_ID.get(operationId);
  if (!operation || !branch) {
    throw new DomainError(
      "invalid_trading_capital_mcp_catalog",
      "Trading Capital MCP catalog is incomplete"
    );
  }
  const required = [
    "resourceId",
    "payload",
    "requestId",
    "correlationId",
    ...(branch.required ?? []).filter(
      (key) => !["resource", "operationId"].includes(key)
    )
  ];
  const properties = {
    resourceId: materialize(requestSchema.$defs.domainIdentifier),
    payload: materialize(branch.properties.payload),
    requestId: materialize(requestSchema.properties.requestId),
    correlationId: materialize(requestSchema.properties.correlationId)
  };
  for (const key of required) {
    if (Object.hasOwn(properties, key)) continue;
    properties[key] = materialize(requestSchema.properties[key]);
  }
  return Object.freeze({
    name: toolName(operationId),
    description:
      `${operationId} through the authenticated local no-funds Tenant contract.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [...new Set(required)],
      properties
    },
    operationId,
    resourceType: operation.resourceType
  });
}

export const TRADING_CAPITAL_MCP_TOOLS = Object.freeze(
  TRADING_CAPITAL_OPERATION_IDS.map(toolFor)
);

function exactKeys(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new DomainError(
      "invalid_trading_capital_mcp_arguments",
      "Trading Capital MCP arguments must be a closed object"
    );
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw new DomainError(
      "invalid_trading_capital_mcp_arguments",
      "Trading Capital MCP arguments are invalid"
    );
  }
}

export function createTradingCapitalMcpAdapter({ client }) {
  if (
    typeof client?.executeOperation !== "function" ||
    typeof client?.listOperations !== "function" ||
    typeof client?.actorType !== "string"
  ) {
    throw new DomainError(
      "invalid_trading_capital_mcp_config",
      "Trading Capital MCP requires one role-scoped local SDK client"
    );
  }
  const allowed = new Set(client.listOperations());
  const tools = TRADING_CAPITAL_MCP_TOOLS.filter(({ operationId }) =>
    allowed.has(operationId)
  );
  if (
    tools.length !== allowed.size ||
    tools.some(({ operationId }) => !OPERATION_IDS.has(operationId))
  ) {
    throw new DomainError(
      "invalid_trading_capital_mcp_config",
      "Trading Capital MCP and SDK catalogs differ"
    );
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return Object.freeze({
    actorType: client.actorType,
    listTools() {
      return tools.map(
        ({ operationId: _operationId, resourceType: _resourceType, ...tool }) =>
          structuredClone(tool)
      );
    },
    async callTool(name, args) {
      const tool = byName.get(name);
      if (!tool) {
        throw new DomainError(
          "mcp_tool_unavailable",
          "The requested Trading Capital MCP tool is not available"
        );
      }
      exactKeys(args, tool.inputSchema.required);
      const {
        resourceId,
        payload,
        requestId,
        correlationId,
        ...protocolFields
      } = args;
      const result = await client.executeOperation({
        operationId: tool.operationId,
        payload,
        resource: {
          resourceType: tool.resourceType,
          resourceId
        },
        requestId,
        correlationId,
        ...protocolFields,
        schemaVersion: "tenant_protocol_request.v1"
      });
      return Object.freeze({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false
      });
    }
  });
}
