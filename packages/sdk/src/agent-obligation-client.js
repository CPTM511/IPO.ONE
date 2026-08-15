import {
  assertAgentHandoffManifest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const CONFIG_KEYS = ["execute", "manifest", "transportProfile"];
const INPUT_KEYS = ["correlationId", "obligationId", "requestId"];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function exactDataObject(value, keys) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

function validateConfig(input) {
  if (
    !exactDataObject(input, CONFIG_KEYS) ||
    typeof input.execute !== "function" ||
    input.transportProfile !== "local_in_process"
  ) fail("invalid_agent_obligation_sdk_config", "Agent Obligation SDK configuration is invalid");
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    fail("invalid_agent_obligation_sdk_config", "Agent Obligation SDK configuration is invalid");
  }
  if (input.manifest.status !== "ready" || input.manifest.authority.status !== "active") {
    fail("agent_active_handoff_required", "Agent Obligation read requires an active handoff");
  }
}

function validateInput(input) {
  if (
    !exactDataObject(input, INPUT_KEYS) ||
    !IDENTIFIER.test(input.obligationId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.correlationId ?? "")
  ) fail("invalid_agent_obligation_query", "Agent Obligation query is invalid");
}

function validateResult(result, obligationId) {
  try {
    assertTenantProtocolResult(result);
  } catch {
    fail("agent_obligation_response_drift", "Agent Obligation response is inconsistent");
  }
  if (
    result.operationId !== "pilotReadOwnObligation" ||
    result.response?.schemaVersion !== "tenant_owned_obligation_view.v1" ||
    result.response.obligation?.obligationId !== obligationId ||
    result.response.sandboxOnly !== true ||
    result.response.productionFundsMoved !== false ||
    result.response.withdrawable !== false
  ) fail("agent_obligation_response_drift", "Agent Obligation response is inconsistent");
  return result.response;
}

export class IpoOneAgentObligationClient {
  #execute;

  constructor(input) {
    validateConfig(input);
    this.#execute = input.execute;
  }

  async readObligation(input) {
    validateInput(input);
    let result;
    try {
      result = await this.#execute({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotReadOwnObligation",
        payload: {},
        resource: { resourceType: "obligation", resourceId: input.obligationId },
        requestId: input.requestId,
        correlationId: input.correlationId
      });
    } catch {
      fail("agent_obligation_query_failed", "Agent Obligation query failed");
    }
    return validateResult(result, input.obligationId);
  }
}

export function readAgentObligation(input) {
  if (!exactDataObject(input, [...CONFIG_KEYS, ...INPUT_KEYS])) {
    fail("invalid_agent_obligation_query", "Agent Obligation query is invalid");
  }
  const client = new IpoOneAgentObligationClient({
    execute: input.execute,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.readObligation({
    obligationId: input.obligationId,
    requestId: input.requestId,
    correlationId: input.correlationId
  });
}
