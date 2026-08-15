import {
  IpoOneAgentEvidenceClient,
  IpoOneAgentMcpClient,
  IpoOneAgentSandboxObligationClient
} from "../../../packages/sdk/src/index.js";
import {
  assertTenantProtocolResult
} from "../../../packages/api-contract/src/index.js";
import { DomainError, hashId } from "../../../packages/domain/src/index.js";

const RUNTIME_MCP_OPERATIONS = Object.freeze({
  pilotAcceptCreditOffer: Object.freeze({
    tool: "ipo_one_accept_credit_offer",
    resourceType: "credit_offer",
    payloadKeys: Object.freeze([
      "acknowledgementHash",
      "expectedOfferHash",
      "expectedTermsHash"
    ])
  }),
  pilotExecuteSandboxObligation: Object.freeze({
    tool: "ipo_one_execute_sandbox_obligation",
    resourceType: "obligation",
    payloadKeys: Object.freeze(["providerCategory", "providerId"])
  }),
  pilotPostSandboxRepayment: Object.freeze({
    tool: "ipo_one_post_sandbox_repayment",
    resourceType: "obligation",
    payloadKeys: Object.freeze(["amountMinor", "sourceCode"])
  }),
  pilotReadOwnObligationEvidence: Object.freeze({
    tool: "ipo_one_read_obligation_evidence",
    resourceType: "evidence",
    payloadKeys: Object.freeze(["limit"]),
    optionalPayloadKeys: Object.freeze(["cursor"]),
    idempotent: false
  })
});
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function exactDataKeys(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) {
    return false;
  }
  const keys = Object.keys(descriptors);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => allowed.has(key));
}

function invalidMcpCommand() {
  throw new DomainError(
    "invalid_local_agent_mcp_command",
    "Reference Agent MCP command is invalid"
  );
}

function runtimeMcpArguments(command, operation) {
  const rootKeys = [
    "correlationId",
    "operationId",
    "payload",
    "requestId",
    "resource",
    "schemaVersion"
  ];
  if (operation.idempotent !== false) rootKeys.push("idempotencyKey");
  if (
    !exactDataKeys(command, rootKeys) ||
    command.schemaVersion !== "tenant_protocol_request.v1" ||
    !REQUEST_IDENTIFIER.test(command.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(command.correlationId ?? "") ||
    (
      operation.idempotent !== false &&
      !IDEMPOTENCY_KEY.test(command.idempotencyKey ?? "")
    ) ||
    !exactDataKeys(command.resource, ["resourceId", "resourceType"]) ||
    command.resource.resourceType !== operation.resourceType ||
    !IDENTIFIER.test(command.resource.resourceId ?? "") ||
    !exactDataKeys(
      command.payload,
      operation.payloadKeys,
      operation.optionalPayloadKeys ?? []
    )
  ) invalidMcpCommand();

  const base = {
    requestId: command.requestId,
    correlationId: command.correlationId
  };
  if (command.operationId === "pilotAcceptCreditOffer") {
    return {
      creditOfferId: command.resource.resourceId,
      payload: structuredClone(command.payload),
      idempotencyKey: command.idempotencyKey,
      ...base
    };
  }
  if (command.operationId === "pilotExecuteSandboxObligation") {
    return {
      obligationId: command.resource.resourceId,
      providerId: command.payload.providerId,
      providerCategory: command.payload.providerCategory,
      idempotencyKey: command.idempotencyKey,
      ...base
    };
  }
  if (command.operationId === "pilotPostSandboxRepayment") {
    return {
      obligationId: command.resource.resourceId,
      payload: structuredClone(command.payload),
      idempotencyKey: command.idempotencyKey,
      ...base
    };
  }
  return {
    obligationId: command.resource.resourceId,
    limit: command.payload.limit,
    ...(command.payload.cursor === undefined
      ? {}
      : { cursor: command.payload.cursor }),
    ...base
  };
}

function mcpFailure(response) {
  if (response?.error && typeof response.error.message === "string") {
    throw new DomainError(
      response.error.message,
      "Reference Agent MCP tool failed"
    );
  }
  throw new DomainError(
    "invalid_local_agent_mcp_response",
    "Reference Agent MCP response is invalid"
  );
}

export function createLocalAgentMcpTransport({ handle }) {
  if (typeof handle !== "function") {
    throw new DomainError(
      "invalid_local_agent_mcp_transport",
      "Reference Agent MCP Host handle is required"
    );
  }
  const steps = [];
  return Object.freeze({
    async execute(command) {
      const operation = RUNTIME_MCP_OPERATIONS[command?.operationId];
      if (!operation) invalidMcpCommand();
      const args = runtimeMcpArguments(command, operation);
      const id = `rpc_agent_runtime:${command.requestId}`;
      let response;
      try {
        response = await handle({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name: operation.tool,
            arguments: args
          }
        });
      } catch {
        throw new DomainError(
          "local_agent_mcp_transport_failed",
          "Reference Agent MCP Host call failed"
        );
      }
      if (
        !response ||
        response.jsonrpc !== "2.0" ||
        response.id !== id ||
        response.error ||
        response.result?.isError !== false
      ) mcpFailure(response);
      const result = response.result.structuredContent;
      try {
        assertTenantProtocolResult(result);
      } catch {
        mcpFailure();
      }
      if (result.operationId !== command.operationId) mcpFailure();
      steps.push(deepFreeze({
        sequence: steps.length + 1,
        tool: operation.tool,
        operationId: result.operationId,
        requestId: command.requestId,
        replayed: result.replayed,
        responseSchemaVersion: result.response.schemaVersion
      }));
      return result;
    },
    createReceipt({ obligationId, providerId, providerCategory }) {
      const expectedOperations = Object.keys(RUNTIME_MCP_OPERATIONS);
      if (
        !IDENTIFIER.test(obligationId ?? "") ||
        !IDENTIFIER.test(providerId ?? "") ||
        !/^[a-z][a-z0-9_.-]{1,95}$/.test(providerCategory ?? "") ||
        steps.length !== expectedOperations.length ||
        steps.some((step, index) => (
          step.operationId !== expectedOperations[index]
        ))
      ) {
        throw new DomainError(
          "incomplete_local_agent_mcp_receipt",
          "Reference Agent MCP lifecycle receipt is incomplete"
        );
      }
      return deepFreeze({
        schemaVersion: "local_agent_mcp_transport_receipt.v1",
        status: "evidence_read",
        transportProfile: "mcp_stdio_local",
        registryVersion: "agent_mcp_registry.v2",
        obligationId,
        providerTarget: { providerId, providerCategory },
        steps: steps.map((step) => structuredClone(step)),
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        fundsAuthority: false,
        credentialsIncluded: false,
        remoteMcpEnabled: false
      });
    }
  });
}

function workflowSuffix(manifest) {
  return manifest.mandateHash.slice(2, 26);
}

export function createLocalAgentApplicationInput(manifest) {
  const principal = [
    BigInt(manifest.authority.perActionLimitMinor),
    BigInt(manifest.authority.aggregateLimitMinor),
    10_000n
  ].reduce((minimum, value) => value < minimum ? value : minimum);
  return {
    creditRequest: {
      assetId: manifest.authority.assetIds[0],
      requestedPrincipalMinor: principal.toString(),
      purposeCode: "compute",
      requestedTermDays: 30,
      repaymentFrequency: "end_of_term",
      installmentCount: 1
    },
    workflowId: `local-agent-application-${workflowSuffix(manifest)}`
  };
}

export function createLocalAgentRuntimeInput(
  manifest,
  offerReceipt
) {
  return {
    acknowledgementHash: hashId(
      "agent_offer_acknowledgement",
      `${manifest.mandateHash}:${offerReceipt.offer.creditOfferHash}`
    ),
    offerReceipt,
    repayment: {
      amountMinor: offerReceipt.offer.approvedPrincipalMinor,
      sourceCode: "synthetic_revenue"
    },
    workflowId: `local-agent-obligation-${workflowSuffix(manifest)}`
  };
}

export async function runLocalAgentApplicationWorkflow({
  manifest,
  session
}) {
  const client = new IpoOneAgentMcpClient({
    handle: session.host.handle,
    manifest,
    transportProfile: "mcp_stdio_local"
  });
  return client.runCreditOfferWorkflow(
    createLocalAgentApplicationInput(manifest)
  );
}

export async function persistLocalAgentContinuationReceipt({
  receipt,
  session
}) {
  if (
    receipt?.status !== "offer_ready" ||
    typeof receipt?.offer?.creditOfferId !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(receipt?.offer?.creditOfferHash ?? "") ||
    typeof receipt?.correlationId !== "string"
  ) {
    throw new Error("Agent Offer receipt is not eligible for durable continuation");
  }
  return session.client.persistContinuationReceipt({
    creditOfferId: receipt.offer.creditOfferId,
    receipt,
    idempotencyKey:
      `reference-agent-continuation-${receipt.offer.creditOfferHash}`,
    requestId:
      `request-reference-agent-persist-${receipt.offer.creditOfferHash.slice(2, 26)}`,
    correlationId: receipt.correlationId
  });
}

export async function runLocalAgentRuntimeWorkflow({
  manifest,
  offerReceipt,
  session
}) {
  const mcpTransport = createLocalAgentMcpTransport({
    handle: session.host.handle
  });
  const execute = mcpTransport.execute.bind(mcpTransport);
  const client = new IpoOneAgentSandboxObligationClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const receipt = await client.runObligationWorkflow(
    createLocalAgentRuntimeInput(manifest, offerReceipt)
  );
  const evidenceClient = new IpoOneAgentEvidenceClient({
    execute,
    manifest,
    transportProfile: "local_in_process"
  });
  const suffix = workflowSuffix(manifest);
  const evidence = await evidenceClient.readObligationEvidence({
    obligationId: receipt.obligation.obligationId,
    limit: 50,
    requestId: `request-agent-evidence-${suffix}`,
    correlationId: `correlation-agent-evidence-${suffix}`
  });
  const mcpReceipt = mcpTransport.createReceipt({
    obligationId: receipt.obligation.obligationId,
    providerId: manifest.authority.allowedProviderIds[0],
    providerCategory: manifest.authority.allowedCategories[0]
  });
  return {
    schemaVersion: "local_agent_reference_workflow_result.v1",
    status: "evidence_read",
    sandboxOnly: true,
    productionFundsMoved: false,
    workflowReceipt: receipt,
    mcpReceipt,
    evidence
  };
}
