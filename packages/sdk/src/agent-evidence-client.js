import {
  assertAgentHandoffManifest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const CONFIG_KEYS = ["execute", "manifest", "transportProfile"];
const INPUT_KEYS = ["correlationId", "cursor", "limit", "obligationId", "requestId"];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;

function exactDataObject(value, allowed, required = allowed) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const keys = Object.keys(descriptors);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

function validateConfig(input) {
  if (!exactDataObject(input, CONFIG_KEYS) || typeof input.execute !== "function" || input.transportProfile !== "local_in_process") {
    fail("invalid_agent_evidence_sdk_config", "Agent Evidence SDK configuration is invalid");
  }
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    fail("invalid_agent_evidence_sdk_config", "Agent Evidence SDK configuration is invalid");
  }
  if (input.manifest.status !== "ready" || input.manifest.authority.status !== "active") {
    fail("agent_active_handoff_required", "Agent Evidence read requires an active handoff");
  }
}

function validateInput(input) {
  if (!exactDataObject(
    input,
    INPUT_KEYS,
    ["correlationId", "limit", "obligationId", "requestId"]
  )) fail("invalid_agent_evidence_query", "Agent Evidence query is invalid");
  if (
    !IDENTIFIER.test(input.obligationId ?? "") ||
    !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50 ||
    !REQUEST_IDENTIFIER.test(input.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.correlationId ?? "") ||
    (input.cursor !== undefined && !CURSOR.test(input.cursor))
  ) fail("invalid_agent_evidence_query", "Agent Evidence query is invalid");
}

function validateResult(result, obligationId) {
  try {
    assertTenantProtocolResult(result);
  } catch {
    fail("agent_evidence_response_drift", "Agent Evidence response is inconsistent");
  }
  if (
    result.operationId !== "pilotReadOwnObligationEvidence" ||
    result.response?.schemaVersion !== "tenant_owned_obligation_evidence_view.v1" ||
    result.response.obligationId !== obligationId
  ) fail("agent_evidence_response_drift", "Agent Evidence response is inconsistent");
  return result.response;
}

export class IpoOneAgentEvidenceClient {
  #execute;

  constructor(input) {
    validateConfig(input);
    this.#execute = input.execute;
  }

  async readObligationEvidence(input) {
    validateInput(input);
    let result;
    try {
      result = await this.#execute({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotReadOwnObligationEvidence",
        payload: {
          limit: input.limit,
          ...(input.cursor === undefined ? {} : { cursor: input.cursor })
        },
        resource: { resourceType: "evidence", resourceId: input.obligationId },
        requestId: input.requestId,
        correlationId: input.correlationId
      });
    } catch {
      fail("agent_evidence_query_failed", "Agent Evidence query failed");
    }
    return validateResult(result, input.obligationId);
  }
}

export function readAgentObligationEvidence(input) {
  if (!exactDataObject(
    input,
    [...CONFIG_KEYS, ...INPUT_KEYS],
    [...CONFIG_KEYS, "correlationId", "limit", "obligationId", "requestId"]
  )) fail("invalid_agent_evidence_query", "Agent Evidence query is invalid");
  const client = new IpoOneAgentEvidenceClient({
    execute: input.execute,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.readObligationEvidence({
    obligationId: input.obligationId,
    limit: input.limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    requestId: input.requestId,
    correlationId: input.correlationId
  });
}
