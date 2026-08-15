import {
  assertAgentHandoffManifest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const CONFIG_KEYS = ["execute", "manifest", "transportProfile"];
const INPUT_KEYS = ["correlationId", "feedback", "idempotencyKey", "requestId", "subjectId"];
const FEEDBACK_KEYS = [
  "surface", "lifecycleStage", "sentiment", "outcome", "blockerCode", "schemaVersion"
];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/;
const AGENT_SURFACES = new Set(["agent_protocol", "agent_sdk", "agent_mcp", "evidence", "servicing"]);
const STAGES = new Set([
  "onboarding", "application", "offer", "obligation", "execution", "repayment", "servicing", "evidence"
]);
const SENTIMENTS = new Set(["blocked", "difficult", "neutral", "easy", "valuable"]);
const OUTCOMES = new Set(["incomplete", "completed", "needs_support"]);
const BLOCKERS = new Set([
  "none", "unclear_copy", "missing_capability", "authentication", "authority_setup",
  "identity_proof", "credit_terms", "execution", "repayment", "servicing", "evidence",
  "integration", "other_no_text"
]);

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
  if (
    !exactDataObject(input, CONFIG_KEYS) ||
    typeof input.execute !== "function" ||
    input.transportProfile !== "local_in_process"
  ) fail("invalid_agent_feedback_sdk_config", "Agent feedback SDK configuration is invalid");
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    fail("invalid_agent_feedback_sdk_config", "Agent feedback SDK configuration is invalid");
  }
  if (input.manifest.status !== "ready" || input.manifest.authority.status !== "active") {
    fail("agent_active_handoff_required", "Agent feedback requires an active handoff");
  }
}

function validateInput(input) {
  if (!exactDataObject(input, INPUT_KEYS) || !exactDataObject(input.feedback, FEEDBACK_KEYS)) {
    fail("invalid_agent_feedback", "Agent feedback must use the closed categorical contract");
  }
  const feedback = input.feedback;
  if (
    !IDENTIFIER.test(input.subjectId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.requestId ?? "") ||
    !REQUEST_IDENTIFIER.test(input.correlationId ?? "") ||
    !IDEMPOTENCY_KEY.test(input.idempotencyKey ?? "") ||
    feedback.schemaVersion !== "pilot_feedback_record.v1" ||
    !AGENT_SURFACES.has(feedback.surface) ||
    !STAGES.has(feedback.lifecycleStage) ||
    !SENTIMENTS.has(feedback.sentiment) ||
    !OUTCOMES.has(feedback.outcome) ||
    !BLOCKERS.has(feedback.blockerCode) ||
    (feedback.outcome === "completed" && feedback.blockerCode !== "none") ||
    (feedback.sentiment === "blocked" && feedback.blockerCode === "none")
  ) fail("invalid_agent_feedback", "Agent feedback must use the closed categorical contract");
}

function validateResult(result) {
  try {
    assertTenantProtocolResult(result);
  } catch {
    fail("agent_feedback_response_drift", "Agent feedback response is inconsistent");
  }
  if (
    result.operationId !== "pilotSubmitPilotFeedback" ||
    result.response?.schemaVersion !== "tenant_pilot_feedback_recorded.v1" ||
    result.response.entryMode !== "agent" ||
    result.response.safety?.categoricalOnly !== true ||
    result.response.safety?.piiIncluded !== false
  ) fail("agent_feedback_response_drift", "Agent feedback response is inconsistent");
  return result.response;
}

export class IpoOneAgentFeedbackClient {
  #execute;

  constructor(input) {
    validateConfig(input);
    this.#execute = input.execute;
  }

  async submitFeedback(input) {
    validateInput(input);
    let result;
    try {
      result = await this.#execute({
        schemaVersion: "tenant_protocol_request.v1",
        operationId: "pilotSubmitPilotFeedback",
        payload: structuredClone(input.feedback),
        resource: { resourceType: "subject", resourceId: input.subjectId },
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        correlationId: input.correlationId
      });
    } catch {
      fail("agent_feedback_submit_failed", "Agent feedback submission failed");
    }
    return validateResult(result);
  }
}

export function submitAgentPilotFeedback(input) {
  if (!exactDataObject(input, [...CONFIG_KEYS, ...INPUT_KEYS])) {
    fail("invalid_agent_feedback", "Agent feedback must use the closed categorical contract");
  }
  const client = new IpoOneAgentFeedbackClient({
    execute: input.execute,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.submitFeedback({
    subjectId: input.subjectId,
    feedback: input.feedback,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    correlationId: input.correlationId
  });
}
