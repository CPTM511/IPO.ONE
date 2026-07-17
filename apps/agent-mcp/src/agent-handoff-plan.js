import { randomUUID } from "node:crypto";
import {
  assertAgentHandoffManifest
} from "../../../packages/api-contract/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";
import { AGENT_MCP_TOOLS } from "./agent-mcp-adapter.js";

const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function requestIdentifier(value, prefix) {
  const candidate = value ?? `${prefix}_${randomUUID()}`;
  if (!REQUEST_IDENTIFIER.test(candidate)) {
    throw new DomainError(
      "invalid_agent_handoff_plan",
      "Agent handoff request identifiers are invalid"
    );
  }
  return candidate;
}

function approvedToolPairs() {
  return AGENT_MCP_TOOLS.map(({ name, operationId }) => ({ name, operationId }));
}

export function createAgentHandoffCallPlan(
  manifest,
  { requestId, correlationId, jsonRpcId } = {}
) {
  assertAgentHandoffManifest(manifest);
  if (manifest.status !== "ready") {
    throw new DomainError(
      "agent_handoff_not_ready",
      "Agent handoff requires an active sandbox Mandate"
    );
  }
  const registryPairs = approvedToolPairs();
  if (JSON.stringify(manifest.protocol.tools) !== JSON.stringify(registryPairs)) {
    throw new DomainError(
      "agent_handoff_registry_drift",
      "Agent handoff tools do not match the approved MCP registry"
    );
  }

  const callRequestId = requestIdentifier(requestId, "request_agent_handoff");
  const callCorrelationId = requestIdentifier(correlationId, "correlation_agent_handoff");
  const callJsonRpcId = requestIdentifier(jsonRpcId, "rpc_agent_handoff");
  return deepFreeze({
    schemaVersion: "agent_handoff_call_plan.v1",
    status: "ready",
    transportProfile: "mcp_stdio_local",
    hostCompositionRequired: true,
    credentialDelivery: "out_of_band",
    credentialsIncluded: false,
    remoteMcpEnabled: false,
    fundsAuthority: false,
    subjectId: manifest.subjectId,
    mandateId: manifest.mandateId,
    firstCall: {
      jsonrpc: "2.0",
      id: callJsonRpcId,
      method: "tools/call",
      params: {
        name: "ipo_one_read_self",
        arguments: {
          subjectId: manifest.subjectId,
          requestId: callRequestId,
          correlationId: callCorrelationId
        }
      }
    }
  });
}
