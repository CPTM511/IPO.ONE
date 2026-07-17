import { DomainError } from "../../../packages/domain/src/index.js";
import { AGENT_MCP_CLIENT_TOOLS } from "../../../packages/sdk/src/agent-mcp-client.js";

const IDENTIFIER = { type: "string", minLength: 1, maxLength: 256 };
const REQUEST_IDENTIFIER = {
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
};
const IDEMPOTENCY = {
  type: "string",
  minLength: 16,
  maxLength: 256,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
};
const HASH = { type: "string", pattern: "^0x[0-9a-f]{64}$" };
const EVIDENCE_CURSOR = {
  type: "string",
  minLength: 1,
  maxLength: 512,
  pattern: "^[A-Za-z0-9_-]+$"
};

export const AGENT_MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: "ipo_one_read_self",
    description: "Read the authenticated Agent's exact owned IPO.ONE Subject state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subjectId", "requestId", "correlationId"],
      properties: { subjectId: IDENTIFIER, requestId: REQUEST_IDENTIFIER, correlationId: REQUEST_IDENTIFIER }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[0].operationId
  }),
  Object.freeze({
    name: "ipo_one_request_credit",
    description: "Submit one sandbox-only Credit Intent for the authenticated Agent.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subjectId", "payload", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        subjectId: IDENTIFIER,
        payload: {
          type: "object",
          additionalProperties: false,
          required: [
            "authorityId", "assetId", "requestedPrincipalMinor", "purposeCode",
            "requestedTermDays", "repaymentFrequency", "installmentCount"
          ],
          properties: {
            authorityId: IDENTIFIER,
            assetId: IDENTIFIER,
            requestedPrincipalMinor: { type: "string", pattern: "^[1-9][0-9]*$", maxLength: 78 },
            purposeCode: { type: "string", pattern: "^[a-z][a-z0-9_.-]{1,63}$" },
            requestedTermDays: { type: "integer", minimum: 1, maximum: 3660 },
            repaymentFrequency: { enum: ["weekly", "biweekly", "monthly", "end_of_term"] },
            installmentCount: { type: "integer", minimum: 1, maximum: 520 }
          }
        },
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[1].operationId
  }),
  Object.freeze({
    name: "ipo_one_read_credit_application",
    description: "Read the Agent's exact owned Credit Intent, Decision, and optional Offer.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["creditIntentId", "requestId", "correlationId"],
      properties: {
        creditIntentId: IDENTIFIER,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[2].operationId
  }),
  Object.freeze({
    name: "ipo_one_evaluate_credit_application",
    description: "Evaluate the Agent's exact owned Credit Intent under credit-application-rules.v1.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["creditIntentId", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        creditIntentId: IDENTIFIER,
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[3].operationId
  }),
  Object.freeze({
    name: "ipo_one_submit_account_proof",
    description: "Submit the Agent's one-use EIP-712 proof and activate its exact CAIP-10 Subject binding.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subjectId", "payload", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        subjectId: IDENTIFIER,
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["challengeId", "accountId", "signature"],
          properties: {
            challengeId: IDENTIFIER,
            accountId: { type: "string", minLength: 52, maxLength: 160 },
            signature: { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" }
          }
        },
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[4].operationId
  }),
  Object.freeze({
    name: "ipo_one_read_account_binding",
    description: "Read the authenticated Agent's hash-only active CAIP-10 AccountBinding state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subjectId", "requestId", "correlationId"],
      properties: { subjectId: IDENTIFIER, requestId: REQUEST_IDENTIFIER, correlationId: REQUEST_IDENTIFIER }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[5].operationId
  }),
  Object.freeze({
    name: "ipo_one_read_obligation",
    description: "Read the authenticated Agent's exact owned current Obligation and latest servicing state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["obligationId", "requestId", "correlationId"],
      properties: {
        obligationId: IDENTIFIER,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[6].operationId
  }),
  Object.freeze({
    name: "ipo_one_read_obligation_evidence",
    description: "Read the authenticated Agent's exact owned immutable Obligation Evidence timeline.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["obligationId", "limit", "requestId", "correlationId"],
      properties: {
        obligationId: IDENTIFIER,
        limit: { type: "integer", minimum: 1, maximum: 50 },
        cursor: EVIDENCE_CURSOR,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[7].operationId
  }),
  Object.freeze({
    name: "ipo_one_accept_credit_offer",
    description: "Accept one exact self-owned sandbox Credit Offer and create the shared Obligation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["creditOfferId", "payload", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        creditOfferId: IDENTIFIER,
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["expectedOfferHash", "expectedTermsHash", "acknowledgementHash"],
          properties: {
            expectedOfferHash: HASH,
            expectedTermsHash: HASH,
            acknowledgementHash: HASH
          }
        },
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[8].operationId
  }),
  Object.freeze({
    name: "ipo_one_execute_sandbox_obligation",
    description: "Execute one exact self-owned sandbox Obligation through the non-redeemable sandbox rail.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["obligationId", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        obligationId: IDENTIFIER,
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[9].operationId
  }),
  Object.freeze({
    name: "ipo_one_post_sandbox_repayment",
    description: "Post one synthetic repayment to an exact self-owned sandbox Obligation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["obligationId", "payload", "idempotencyKey", "requestId", "correlationId"],
      properties: {
        obligationId: IDENTIFIER,
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["amountMinor", "sourceCode"],
          properties: {
            amountMinor: { type: "string", pattern: "^[1-9][0-9]*$", maxLength: 78 },
            sourceCode: { enum: ["synthetic_wallet", "synthetic_bank", "synthetic_revenue"] }
          }
        },
        idempotencyKey: IDEMPOTENCY,
        requestId: REQUEST_IDENTIFIER,
        correlationId: REQUEST_IDENTIFIER
      }
    },
    operationId: AGENT_MCP_CLIENT_TOOLS[10].operationId
  })
]);

function assertExactKeys(value, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("invalid_mcp_tool_arguments", "MCP tool arguments must be a closed object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new DomainError("invalid_mcp_tool_arguments", "MCP tool arguments are invalid");
  }
}

export function createAgentMcpAdapter({ client }) {
  if (
    !client?.getSelf ||
    !client?.requestCredit ||
    !client?.getCreditApplication ||
    !client?.evaluateCreditApplication ||
    !client?.submitAccountProof ||
    !client?.getAccountBinding ||
    !client?.getOwnObligation ||
    !client?.getOwnObligationEvidence ||
    !client?.acceptCreditOffer ||
    !client?.executeSandboxObligation ||
    !client?.postSandboxRepayment
  ) {
    throw new DomainError("invalid_agent_mcp_config", "Agent MCP requires one authenticated Agent client");
  }
  const byName = new Map(AGENT_MCP_TOOLS.map((tool) => [tool.name, tool]));
  return Object.freeze({
    listTools() {
      return AGENT_MCP_TOOLS.map(({ operationId: _operationId, ...tool }) => structuredClone(tool));
    },
    async callTool(name, args) {
      if (!byName.has(name)) throw new DomainError("mcp_tool_unavailable", "The requested MCP tool is not available");
      let result;
      if (name === "ipo_one_read_self") {
        assertExactKeys(args, ["subjectId", "requestId", "correlationId"]);
        result = await client.getSelf(args);
      } else if (name === "ipo_one_request_credit") {
        assertExactKeys(args, ["subjectId", "payload", "idempotencyKey", "requestId", "correlationId"]);
        result = await client.requestCredit(args);
      } else if (name === "ipo_one_read_credit_application") {
        assertExactKeys(args, ["creditIntentId", "requestId", "correlationId"]);
        result = await client.getCreditApplication(args);
      } else if (name === "ipo_one_evaluate_credit_application") {
        assertExactKeys(args, ["creditIntentId", "idempotencyKey", "requestId", "correlationId"]);
        result = await client.evaluateCreditApplication(args);
      } else if (name === "ipo_one_submit_account_proof") {
        assertExactKeys(args, ["subjectId", "payload", "idempotencyKey", "requestId", "correlationId"]);
        assertExactKeys(args.payload, ["challengeId", "accountId", "signature"]);
        result = await client.submitAccountProof(args);
      } else if (name === "ipo_one_read_account_binding") {
        assertExactKeys(args, ["subjectId", "requestId", "correlationId"]);
        result = await client.getAccountBinding(args);
      } else if (name === "ipo_one_read_obligation") {
        assertExactKeys(args, ["obligationId", "requestId", "correlationId"]);
        result = await client.getOwnObligation(args);
      } else if (name === "ipo_one_read_obligation_evidence") {
        assertExactKeys(args, args.cursor === undefined
          ? ["obligationId", "limit", "requestId", "correlationId"]
          : ["obligationId", "limit", "cursor", "requestId", "correlationId"]);
        result = await client.getOwnObligationEvidence(args);
      } else if (name === "ipo_one_accept_credit_offer") {
        assertExactKeys(args, ["creditOfferId", "payload", "idempotencyKey", "requestId", "correlationId"]);
        assertExactKeys(args.payload, ["expectedOfferHash", "expectedTermsHash", "acknowledgementHash"]);
        result = await client.acceptCreditOffer(args);
      } else if (name === "ipo_one_execute_sandbox_obligation") {
        assertExactKeys(args, ["obligationId", "idempotencyKey", "requestId", "correlationId"]);
        result = await client.executeSandboxObligation(args);
      } else {
        assertExactKeys(args, ["obligationId", "payload", "idempotencyKey", "requestId", "correlationId"]);
        assertExactKeys(args.payload, ["amountMinor", "sourceCode"]);
        result = await client.postSandboxRepayment(args);
      }
      return Object.freeze({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false
      });
    }
  });
}
