import { DomainError } from "../../../packages/domain/src/index.js";

const ID = { type: "string", minLength: 1, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9:._/%-]*$" };
const REQUEST_ID = { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
const IDEMPOTENCY = { type: "string", minLength: 16, maxLength: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
const HASH = { type: "string", pattern: "^0x[0-9a-f]{64}$" };

function schema(required, properties) {
  return { type: "object", additionalProperties: false, required, properties };
}

export const WALLET_EXECUTION_MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: "ipo_one_wallet_prepare_account_binding",
    description: "Prepare one-use proof that binds an execution account to an existing authenticated Subject; this is not login or authority.",
    operationId: "walletPrepareAccountBinding",
    inputSchema: schema(["subjectId", "accountId", "idempotencyKey", "requestId", "correlationId"], {
      subjectId: ID, accountId: ID, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_submit_account_binding",
    description: "Submit the exact one-use EIP-712 AccountBinding proof; no login session or economic authority is created.",
    operationId: "walletSubmitAccountBinding",
    inputSchema: schema([
      "subjectId", "challengeId", "accountId", "signature", "idempotencyKey", "requestId", "correlationId"
    ], {
      subjectId: ID, challengeId: ID, accountId: ID,
      signature: { type: "string", pattern: "^0x(?:[0-9a-fA-F]{2}){65,4096}$" },
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_read_account_bindings",
    description: "Read execution AccountBindings for one exact owned Subject without changing authentication or authority.",
    operationId: "walletReadAccountBindings",
    inputSchema: schema(["subjectId", "requestId", "correlationId"], {
      subjectId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_revoke_account_binding",
    description: "Revoke one execution AccountBinding independently from logout and grant revocation.",
    operationId: "walletRevokeAccountBinding",
    inputSchema: schema([
      "subjectId", "accountBindingId", "idempotencyKey", "requestId", "correlationId"
    ], {
      subjectId: ID, accountBindingId: ID, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_discover_capabilities",
    description: "Read closed, non-authorizing capabilities for one enabled IPO.ONE wallet adapter.",
    operationId: "walletDiscoverCapabilities",
    inputSchema: schema(["adapterId", "requestId", "correlationId"], {
      adapterId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_prepare_grant",
    description: "Ask IPO.ONE to derive a narrower local no-funds wallet grant from current canonical authority.",
    operationId: "walletPrepareGrant",
    inputSchema: schema([
      "subjectId", "providerId", "accountBindingId", "chainId", "requestedExpiresAt", "sessionEpoch",
      "nonce", "idempotencyKey", "requestId", "correlationId"
    ], {
      subjectId: ID, providerId: ID, accountBindingId: ID,
      chainId: { enum: ["eip155:84532", "eip155:1952"] },
      requestedExpiresAt: { type: "string", format: "date-time" },
      sessionEpoch: { type: "integer", minimum: 0 }, nonce: ID,
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_activate_grant",
    description: "Activate the exact locally compiled no-funds wallet grant; no Provider call is made.",
    operationId: "walletActivateGrant",
    inputSchema: schema(["grantId", "expectedGrantHash", "idempotencyKey", "requestId", "correlationId"], {
      grantId: ID, expectedGrantHash: HASH, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_read_grant",
    description: "Read one exact owned delegated wallet grant projection.",
    operationId: "walletReadGrant",
    inputSchema: schema(["grantId", "requestId", "correlationId"], {
      grantId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_revoke_grant",
    description: "Revoke one exact owned wallet grant under reviewed reason codes.",
    operationId: "walletRevokeGrant",
    inputSchema: schema(["grantId", "reasonCode", "idempotencyKey", "requestId", "correlationId"], {
      grantId: ID,
      reasonCode: { enum: ["credential_compromise", "operator_request", "security_incident"] },
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_prepare_execution",
    description: "Prepare and preflight an IPO.ONE-resolved TransferIntent; raw calldata is not accepted.",
    operationId: "walletPrepareExecution",
    inputSchema: schema(["grantId", "transferIntentId", "idempotencyKey", "requestId", "correlationId"], {
      grantId: ID, transferIntentId: ID, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_approve_execution",
    description: "Bind an exact Human approval artifact hash to a STEP_UP preflight; this does not sign or submit.",
    operationId: "walletApproveExecution",
    inputSchema: schema([
      "executionId", "preflightHash", "approvalArtifactHash", "idempotencyKey", "requestId", "correlationId"
    ], {
      executionId: ID, preflightHash: HASH, approvalArtifactHash: HASH,
      idempotencyKey: IDEMPOTENCY, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_submit_execution",
    description: "Invoke the exact submission guard; L0 local no-funds execution always remains disabled.",
    operationId: "walletSubmitExecution",
    inputSchema: schema(["executionId", "preflightHash", "idempotencyKey", "requestId", "correlationId"], {
      executionId: ID, preflightHash: HASH, idempotencyKey: IDEMPOTENCY,
      requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  }),
  Object.freeze({
    name: "ipo_one_wallet_read_execution",
    description: "Read one exact owned prepared execution, simulation and preflight Evidence timeline.",
    operationId: "walletReadExecution",
    inputSchema: schema(["executionId", "requestId", "correlationId"], {
      executionId: ID, requestId: REQUEST_ID, correlationId: REQUEST_ID
    })
  })
]);

const METHOD_BY_TOOL = Object.freeze({
  ipo_one_wallet_prepare_account_binding: "prepareAccountBinding",
  ipo_one_wallet_submit_account_binding: "submitAccountBinding",
  ipo_one_wallet_read_account_bindings: "readAccountBindings",
  ipo_one_wallet_revoke_account_binding: "revokeAccountBinding",
  ipo_one_wallet_discover_capabilities: "discoverCapabilities",
  ipo_one_wallet_prepare_grant: "prepareGrant",
  ipo_one_wallet_activate_grant: "activateGrant",
  ipo_one_wallet_read_grant: "readGrant",
  ipo_one_wallet_revoke_grant: "revokeGrant",
  ipo_one_wallet_prepare_execution: "prepareExecution",
  ipo_one_wallet_approve_execution: "approveExecution",
  ipo_one_wallet_submit_execution: "submitExecution",
  ipo_one_wallet_read_execution: "readExecution"
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

export function createWalletExecutionMcpAdapter({ client, ...unknown } = {}) {
  if (Object.keys(unknown).length !== 0 || !client || typeof client !== "object") {
    throw new DomainError("invalid_wallet_execution_mcp_config", "wallet execution MCP client is required");
  }
  for (const method of Object.values(METHOD_BY_TOOL)) {
    if (typeof client[method] !== "function") {
      throw new DomainError("invalid_wallet_execution_mcp_config", "wallet execution MCP client is incomplete");
    }
  }
  const tools = new Map(WALLET_EXECUTION_MCP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    listTools() {
      return WALLET_EXECUTION_MCP_TOOLS.map(({ operationId: _operationId, ...tool }) => structuredClone(tool));
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
