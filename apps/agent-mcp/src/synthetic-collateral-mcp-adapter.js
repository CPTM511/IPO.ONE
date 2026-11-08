import requestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import { DomainError } from "../../../packages/domain/src/index.js";
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";
import { SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS } from "../../../packages/sdk/src/synthetic-collateral-client.js";

const TOOL_NAMES = Object.freeze({
  pilotReadSyntheticCollateralProfile: "ipo_one_read_synthetic_collateral_profile",
  pilotConfirmSyntheticCollateral: "ipo_one_confirm_synthetic_collateral",
  pilotReleaseSyntheticCollateral: "ipo_one_release_synthetic_collateral"
});
const OPERATION_IDS = new Set(SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS);
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
    if (!target) throw new DomainError("invalid_synthetic_collateral_mcp_schema", "Synthetic collateral MCP schema reference is invalid");
    return materialize(target);
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, materialize(value)]));
}

function createTool(operationId) {
  const operation = OPERATION_BY_ID.get(operationId);
  const branch = BRANCH_BY_ID.get(operationId);
  if (!operation || !branch) {
    throw new DomainError("invalid_synthetic_collateral_mcp_catalog", "Synthetic collateral MCP catalog is incomplete");
  }
  return Object.freeze({
    name: TOOL_NAMES[operationId],
    description: `${operationId} through the authenticated local no-funds Tenant contract; no transaction is submitted.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["resourceId", "payload", "requestId", "correlationId", ...(operation.kind === "command" ? ["idempotencyKey"] : [])],
      properties: {
        ...(operation.kind === "command" ? { idempotencyKey: materialize(requestSchema.properties.idempotencyKey) } : {}),
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

export const SYNTHETIC_COLLATERAL_MCP_TOOLS = Object.freeze(SYNTHETIC_COLLATERAL_AGENT_OPERATION_IDS.map(createTool));

function exactKeys(value, expected) {
  const actual = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new DomainError("invalid_synthetic_collateral_mcp_arguments", "Synthetic collateral MCP arguments are invalid");
  }
}

export function createSyntheticCollateralMcpAdapter({ client }) {
  if (typeof client?.executeOperation !== "function" || typeof client?.listOperations !== "function") {
    throw new DomainError("invalid_synthetic_collateral_mcp_config", "Synthetic collateral MCP requires the role-scoped Agent SDK client");
  }
  const allowed = new Set(client.listOperations());
  if (allowed.size !== SYNTHETIC_COLLATERAL_MCP_TOOLS.length || SYNTHETIC_COLLATERAL_MCP_TOOLS.some(({ operationId }) => !allowed.has(operationId))) {
    throw new DomainError("invalid_synthetic_collateral_mcp_config", "Synthetic collateral MCP and SDK catalogs differ");
  }
  const byName = new Map(SYNTHETIC_COLLATERAL_MCP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    listTools() {
      return SYNTHETIC_COLLATERAL_MCP_TOOLS.map(({ operationId: _operationId, resourceType: _resourceType, ...tool }) => structuredClone(tool));
    },
    async callTool(name, args) {
      const tool = byName.get(name);
      if (!tool) throw new DomainError("mcp_tool_unavailable", "The requested Synthetic collateral MCP tool is not available");
      exactKeys(args, tool.inputSchema.required);
      const result = await client.executeOperation({
        operationId: tool.operationId,
        payload: args.payload,
        resource: { resourceType: tool.resourceType, resourceId: args.resourceId },
        requestId: args.requestId,
        correlationId: args.correlationId,
        ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
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
