import { DomainError } from "../../../packages/domain/src/index.js";

const ID = { type: "string", minLength: 1, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9:._/%-]*$" };
const REQUEST_ID = { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
const IDEMPOTENCY = { type: "string", minLength: 16, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
const HASH = { type: "string", pattern: "^0x[0-9a-f]{64}$" };

function schema(required, properties) {
  return { type: "object", additionalProperties: false, required, properties };
}

export const VENUE_EXECUTION_MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: "ipo_one_venue_discover_capabilities",
    description: "Read the closed local no-funds capabilities for one IPO.ONE Venue adapter.",
    operationId: "venueDiscoverCapabilities",
    inputSchema: schema(["adapterId", "requestId", "correlationId"], {
      adapterId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_read_binding",
    description: "Read one owned, redacted Venue account binding.",
    operationId: "venueReadBinding",
    inputSchema: schema(["bindingId", "requestId", "correlationId"], {
      bindingId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_prepare_delegate",
    description: "Prepare a hash-bound delegate record locally; no approveAgent request is made.",
    operationId: "venuePrepareDelegate",
    inputSchema: schema([
      "bindingId", "delegateAddressHash", "signerReferenceHash", "requestedExpiresAt",
      "idempotencyKey", "requestId", "correlationId"
    ], {
      bindingId: ID, delegateAddressHash: HASH, signerReferenceHash: HASH,
      requestedExpiresAt: { type: "string", format: "date-time" },
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_activate_delegate",
    description: "Invoke the delegate activation guard; approveAgent remains disabled.",
    operationId: "venueActivateDelegate",
    inputSchema: schema(["delegateId", "expectedDelegateHash", "idempotencyKey", "requestId", "correlationId"], {
      delegateId: ID, expectedDelegateHash: HASH, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_revoke_delegate",
    description: "Invoke the external delegate revocation guard; local tombstoning stays internal Evidence.",
    operationId: "venueRevokeDelegate",
    inputSchema: schema(["delegateId", "reasonCode", "idempotencyKey", "requestId", "correlationId"], {
      delegateId: ID,
      reasonCode: { enum: ["credential_compromise", "operator_request", "security_incident", "scheduled_rotation", "delegate_expired"] },
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_prepare_execution",
    description: "Prepare an exact action from an IPO.ONE OrderIntent; raw Venue payloads are not accepted.",
    operationId: "venuePrepareExecution",
    inputSchema: schema([
      "delegateId", "orderIntentId", "orderIntentHash", "idempotencyKey", "requestId", "correlationId"
    ], {
      delegateId: ID, orderIntentId: ID, orderIntentHash: HASH,
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_submit_execution",
    description: "Invoke the exact Exchange submission guard; external submission remains disabled.",
    operationId: "venueSubmitExecution",
    inputSchema: schema([
      "executionId", "preparedExecutionHash", "idempotencyKey", "requestId", "correlationId"
    ], {
      executionId: ID, preparedExecutionHash: HASH, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_venue_read_execution",
    description: "Read one owned local Venue execution Evidence projection.",
    operationId: "venueReadExecution",
    inputSchema: schema(["executionId", "requestId", "correlationId"], {
      executionId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  })
]);

const METHOD_BY_TOOL = Object.freeze({
  ipo_one_venue_discover_capabilities: "discoverCapabilities",
  ipo_one_venue_read_binding: "readBinding",
  ipo_one_venue_prepare_delegate: "prepareDelegate",
  ipo_one_venue_activate_delegate: "activateDelegate",
  ipo_one_venue_revoke_delegate: "revokeDelegate",
  ipo_one_venue_prepare_execution: "prepareExecution",
  ipo_one_venue_submit_execution: "submitExecution",
  ipo_one_venue_read_execution: "readExecution"
});

function exactArguments(args, schemaValue) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new DomainError("invalid_mcp_tool_arguments", "MCP tool arguments must be a closed object");
  }
  const actual = Object.keys(args).sort();
  const expected = [...schemaValue.required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new DomainError("invalid_mcp_tool_arguments", "MCP tool arguments are invalid");
  }
}

export function createVenueExecutionMcpAdapter({ client, ...unknown } = {}) {
  if (Object.keys(unknown).length !== 0 || !client || typeof client !== "object") {
    throw new DomainError("invalid_venue_execution_mcp_config", "venue execution MCP client is required");
  }
  for (const method of Object.values(METHOD_BY_TOOL)) {
    if (typeof client[method] !== "function") {
      throw new DomainError("invalid_venue_execution_mcp_config", "venue execution MCP client is incomplete");
    }
  }
  const tools = new Map(VENUE_EXECUTION_MCP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    listTools() {
      return VENUE_EXECUTION_MCP_TOOLS.map(({ operationId: _operationId, ...tool }) => structuredClone(tool));
    },
    async callTool(name, args) {
      const tool = tools.get(name);
      if (!tool) throw new DomainError("mcp_tool_unavailable", "The requested MCP tool is not available");
      exactArguments(args, tool.inputSchema);
      const result = await client[METHOD_BY_TOOL[name]](structuredClone(args));
      return Object.freeze({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false
      });
    }
  });
}
