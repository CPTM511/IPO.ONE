import {
  assertAgentHandoffManifest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const CONFIG_KEYS = ["execute", "manifest", "transportProfile"];
const INPUT_KEYS = ["authorizationHash", "correlationId", "requestId"];
const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function exactDataObject(value, allowed, required = allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => descriptor.get || descriptor.set
    )
  ) return false;
  const keys = Object.keys(descriptors);
  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => keys.includes(key))
  );
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

function validateConfig(input) {
  if (
    !exactDataObject(input, CONFIG_KEYS) ||
    typeof input.execute !== "function" ||
    input.transportProfile !== "local_in_process"
  ) {
    fail(
      "invalid_agent_registry_evidence_sdk_config",
      "Agent Registry Evidence SDK configuration is invalid"
    );
  }
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    fail(
      "invalid_agent_registry_evidence_sdk_config",
      "Agent Registry Evidence SDK configuration is invalid"
    );
  }
  if (
    input.manifest.status !== "ready" ||
    input.manifest.authority.status !== "active"
  ) {
    fail(
      "agent_active_handoff_required",
      "Agent Registry Evidence read requires an active handoff"
    );
  }
}

function validateInput(input) {
  if (
    !exactDataObject(input, INPUT_KEYS) ||
    !HASH.test(input.authorizationHash ?? "") ||
    !REQUEST_IDENTIFIER.test(input.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.correlationId ?? "")
  ) {
    fail(
      "invalid_agent_registry_evidence_query",
      "Agent Registry Evidence query is invalid"
    );
  }
}

function validateResult(result, authorizationHash) {
  try {
    assertTenantProtocolResult(result);
  } catch {
    fail(
      "agent_registry_evidence_response_drift",
      "Agent Registry Evidence response is inconsistent"
    );
  }
  if (
    result.operationId !== "pilotReadCreditRegistryEvidence" ||
    result.response?.schemaVersion !==
      "tenant_credit_registry_evidence_view.v1" ||
    result.response.authorizationHash !== authorizationHash ||
    result.response.readOnly !== true ||
    result.response.syntheticOnly !== true ||
    result.response.authorizing !== false ||
    result.response.fundsAuthority !== false
  ) {
    fail(
      "agent_registry_evidence_response_drift",
      "Agent Registry Evidence response is inconsistent"
    );
  }
  return result.response;
}

export class IpoOneAgentRegistryEvidenceClient {
  #execute;

  constructor(input) {
    validateConfig(input);
    this.#execute = input.execute;
  }

  async readCreditRegistryEvidence(input) {
    validateInput(input);
    let result;
    try {
      result = await this.#execute({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotReadCreditRegistryEvidence",
        payload: {},
        resource: {
          resourceType: "credit_registry_evidence",
          resourceId: input.authorizationHash
        },
        requestId: input.requestId,
        correlationId: input.correlationId
      });
    } catch {
      fail(
        "agent_registry_evidence_query_failed",
        "Agent Registry Evidence query failed"
      );
    }
    return validateResult(result, input.authorizationHash);
  }
}

export function readAgentCreditRegistryEvidence(input) {
  if (
    !exactDataObject(
      input,
      [...CONFIG_KEYS, ...INPUT_KEYS],
      [...CONFIG_KEYS, ...INPUT_KEYS]
    )
  ) {
    fail(
      "invalid_agent_registry_evidence_query",
      "Agent Registry Evidence query is invalid"
    );
  }
  const client = new IpoOneAgentRegistryEvidenceClient({
    execute: input.execute,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.readCreditRegistryEvidence({
    authorizationHash: input.authorizationHash,
    requestId: input.requestId,
    correlationId: input.correlationId
  });
}
