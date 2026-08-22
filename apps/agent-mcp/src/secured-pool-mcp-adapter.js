import requestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import { DomainError } from "../../../packages/domain/src/index.js";
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";
import { SECURED_POOL_AGENT_OPERATION_IDS } from "../../../packages/sdk/src/secured-pool-client.js";

const TOOL_NAMES = Object.freeze({
  pilotReadOwnSecuredPool: "ipo_one_read_secured_pool",
  pilotReviewSecuredPoolAction: "ipo_one_review_secured_pool_action"
});
const OPERATION_IDS = new Set(SECURED_POOL_AGENT_OPERATION_IDS);
const OPERATION_BY_ID = new Map(
  TENANT_PROTOCOL_OPERATIONS
    .filter(({ operationId }) => OPERATION_IDS.has(operationId))
    .map((operation) => [operation.operationId, operation])
);
const BRANCH_BY_ID = new Map(
  requestSchema.oneOf
    .filter(({ properties }) => OPERATION_IDS.has(properties?.operationId?.const))
    .map((branch) => [branch.properties.operationId.const, branch])
);

function materialize(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(materialize);
  if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
    const target = requestSchema.$defs[node.$ref.slice("#/$defs/".length)];
    if (!target) throw new DomainError("invalid_secured_pool_mcp_schema", "Secured Pool MCP schema reference is invalid");
    return materialize(target);
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, materialize(value)]));
}

function createTool(operationId) {
  const operation = OPERATION_BY_ID.get(operationId);
  const branch = BRANCH_BY_ID.get(operationId);
  if (!operation || !branch) {
    throw new DomainError("invalid_secured_pool_mcp_catalog", "Secured Pool MCP catalog is incomplete");
  }
  return Object.freeze({
    name: TOOL_NAMES[operationId],
    description: `${operationId} through the authenticated local no-funds Tenant contract; no transaction is submitted.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["resourceId", "payload", "requestId", "correlationId"],
      properties: {
        resourceId: materialize(requestSchema.$defs.domainIdentifier),
        payload: materialize(branch.properties.payload),
        requestId: materialize(requestSchema.properties.requestId),
        correlationId: materialize(requestSchema.properties.correlationId)
      }
    },
    operationId,
    resourceType: operation.resourceType
  });
}

export const SECURED_POOL_MCP_TOOLS = Object.freeze(SECURED_POOL_AGENT_OPERATION_IDS.map(createTool));

function exactKeys(value, expected) {
  const actual = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new DomainError("invalid_secured_pool_mcp_arguments", "Secured Pool MCP arguments are invalid");
  }
}

export function createSecuredPoolMcpAdapter({ client }) {
  if (typeof client?.executeOperation !== "function" || typeof client?.listOperations !== "function") {
    throw new DomainError("invalid_secured_pool_mcp_config", "Secured Pool MCP requires the role-scoped Agent SDK client");
  }
  const allowed = new Set(client.listOperations());
  if (allowed.size !== SECURED_POOL_MCP_TOOLS.length || SECURED_POOL_MCP_TOOLS.some(({ operationId }) => !allowed.has(operationId))) {
    throw new DomainError("invalid_secured_pool_mcp_config", "Secured Pool MCP and SDK catalogs differ");
  }
  const byName = new Map(SECURED_POOL_MCP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    listTools() {
      return SECURED_POOL_MCP_TOOLS.map(({ operationId: _operationId, resourceType: _resourceType, ...tool }) => structuredClone(tool));
    },
    async callTool(name, args) {
      const tool = byName.get(name);
      if (!tool) throw new DomainError("mcp_tool_unavailable", "The requested Secured Pool MCP tool is not available");
      exactKeys(args, tool.inputSchema.required);
      const result = await client.executeOperation({
        operationId: tool.operationId,
        payload: args.payload,
        resource: { resourceType: tool.resourceType, resourceId: args.resourceId },
        requestId: args.requestId,
        correlationId: args.correlationId,
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
