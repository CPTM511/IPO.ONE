import { assertAgentHandoffManifest, assertTenantProtocolResult } from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/;
const TARGETS = new Set(["decision", "offer_disclosure", "payment", "servicing_action", "evidence_item", "report"]);
const REASONS = new Set(["record_inaccurate", "context_missing", "payment_mismatch", "servicing_error", "evidence_mismatch", "report_mismatch"]);

function exact(value, keys) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

export class IpoOneAgentPilotCaseClient {
  #execute;
  #subjectId;

  constructor({ execute, manifest, transportProfile }) {
    if (typeof execute !== "function" || transportProfile !== "local_in_process") {
      fail("invalid_agent_pilot_case_sdk_config", "Agent pilot case SDK configuration is invalid");
    }
    try {
      assertAgentHandoffManifest(manifest);
    } catch {
      fail("invalid_agent_pilot_case_sdk_config", "Agent pilot case SDK configuration is invalid");
    }
    if (!new Set(["application_ready", "ready"]).has(manifest.status)) {
      fail("agent_handoff_required", "Agent pilot cases require an application or runtime handoff");
    }
    this.#execute = execute;
    this.#subjectId = manifest.subjectId;
  }

  async fileCase({ subjectId, pilotCase, idempotencyKey, requestId, correlationId }) {
    if (
      subjectId !== this.#subjectId ||
      !IDENTIFIER.test(subjectId ?? "") ||
      !REQUEST_IDENTIFIER.test(requestId ?? "") ||
      !REQUEST_IDENTIFIER.test(correlationId ?? "") ||
      !IDEMPOTENCY_KEY.test(idempotencyKey ?? "") ||
      !exact(pilotCase, ["targetType", "targetId", "reasonCode", "schemaVersion"]) ||
      pilotCase.schemaVersion !== "pilot_case_file.v1" ||
      !TARGETS.has(pilotCase.targetType) ||
      !IDENTIFIER.test(pilotCase.targetId ?? "") ||
      !REASONS.has(pilotCase.reasonCode)
    ) fail("invalid_agent_pilot_case", "Agent pilot case must use the closed contract");
    const result = await this.#execute({
      schemaVersion: "tenant_protocol_request.v1",
      operationId: "pilotFileCase",
      payload: structuredClone(pilotCase),
      resource: { resourceType: "subject", resourceId: subjectId },
      idempotencyKey,
      requestId,
      correlationId
    });
    try {
      assertTenantProtocolResult(result);
    } catch {
      fail("agent_pilot_case_response_drift", "Agent pilot case response is inconsistent");
    }
    if (
      result.operationId !== "pilotFileCase" ||
      result.response?.schemaVersion !== "tenant_pilot_case_filed.v1" ||
      result.response.pilotCase?.entryMode !== "agent" ||
      result.response.pilotCase?.safety?.economicMutationAuthorized !== false
    ) fail("agent_pilot_case_response_drift", "Agent pilot case response is inconsistent");
    return result.response;
  }

  async listCases({ subjectId, requestId, correlationId }) {
    if (
      subjectId !== this.#subjectId ||
      !IDENTIFIER.test(subjectId ?? "") ||
      !REQUEST_IDENTIFIER.test(requestId ?? "") ||
      !REQUEST_IDENTIFIER.test(correlationId ?? "")
    ) fail("invalid_agent_pilot_case", "Agent pilot case list input is invalid");
    const result = await this.#execute({
      schemaVersion: "tenant_protocol_request.v1",
      operationId: "pilotListOwnCases",
      payload: {},
      resource: { resourceType: "subject", resourceId: subjectId },
      requestId,
      correlationId
    });
    try {
      assertTenantProtocolResult(result);
    } catch {
      fail("agent_pilot_case_response_drift", "Agent pilot case response is inconsistent");
    }
    if (result.operationId !== "pilotListOwnCases" || result.response?.schemaVersion !== "tenant_pilot_case_list.v1") {
      fail("agent_pilot_case_response_drift", "Agent pilot case response is inconsistent");
    }
    return result.response;
  }
}
