import {
  assertAgentCreditOfferWorkflowReceipt,
  assertAgentHandoffManifest,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";

export const AGENT_MCP_CLIENT_TOOLS = Object.freeze([
  Object.freeze({ name: "ipo_one_read_self", operationId: "pilotReadAgentSelf" }),
  Object.freeze({ name: "ipo_one_request_credit", operationId: "pilotRequestCredit" }),
  Object.freeze({
    name: "ipo_one_read_credit_application",
    operationId: "pilotReadCreditApplication"
  }),
  Object.freeze({
    name: "ipo_one_evaluate_credit_application",
    operationId: "pilotEvaluateCreditApplication"
  }),
  Object.freeze({
    name: "ipo_one_submit_account_proof",
    operationId: "pilotSubmitAgentAccountProof"
  }),
  Object.freeze({
    name: "ipo_one_read_account_binding",
    operationId: "pilotReadAgentAccountBinding"
  }),
  Object.freeze({
    name: "ipo_one_read_obligation",
    operationId: "pilotReadOwnObligation"
  }),
  Object.freeze({
    name: "ipo_one_read_obligation_evidence",
    operationId: "pilotReadOwnObligationEvidence"
  }),
  Object.freeze({
    name: "ipo_one_accept_credit_offer",
    operationId: "pilotAcceptCreditOffer"
  }),
  Object.freeze({
    name: "ipo_one_execute_sandbox_obligation",
    operationId: "pilotExecuteSandboxObligation"
  }),
  Object.freeze({
    name: "ipo_one_post_sandbox_repayment",
    operationId: "pilotPostSandboxRepayment"
  })
]);

const CLIENT_CONFIG_KEYS = Object.freeze(["handle", "manifest", "transportProfile"]);
const WORKFLOW_INPUT_KEYS = Object.freeze(["creditRequest", "workflowId"]);
const FUNCTION_INPUT_KEYS = Object.freeze([
  "handle",
  "manifest",
  "transportProfile",
  "creditRequest",
  "workflowId"
]);
const CREDIT_REQUEST_KEYS = Object.freeze([
  "assetId",
  "installmentCount",
  "purposeCode",
  "repaymentFrequency",
  "requestedPrincipalMinor",
  "requestedTermDays"
]);
const WORKFLOW_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const PURPOSE_CODE = /^[a-z][a-z0-9_.-]{1,63}$/;
const POSITIVE_MINOR_UNITS = /^[1-9][0-9]{0,77}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REPAYMENT_FREQUENCIES = new Set(["weekly", "biweekly", "monthly", "end_of_term"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function hasExactDataKeys(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const actual = Object.keys(descriptors).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

export class IpoOneAgentSdkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IpoOneAgentSdkError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

function invalidClientConfig() {
  fail("invalid_agent_mcp_sdk_config", "Agent MCP SDK configuration is invalid");
}

function invalidWorkflow() {
  fail("invalid_agent_credit_workflow", "Agent credit workflow input is invalid");
}

function workflowDrift() {
  fail("agent_credit_workflow_drift", "Agent credit workflow response is inconsistent");
}

function mcpFailed() {
  fail("agent_credit_workflow_mcp_failed", "Agent credit workflow MCP step failed");
}

function assertToolParity(manifest) {
  if (JSON.stringify(manifest.protocol.tools) !== JSON.stringify(AGENT_MCP_CLIENT_TOOLS)) {
    workflowDrift();
  }
}

function assertClientConfig(input) {
  if (!hasExactDataKeys(input, CLIENT_CONFIG_KEYS)) invalidClientConfig();
  if (typeof input.handle !== "function" || input.transportProfile !== "mcp_stdio_local") {
    invalidClientConfig();
  }
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    invalidClientConfig();
  }
  if (input.manifest.status !== "application_ready") {
    fail(
      "agent_application_handoff_required",
      "Agent credit workflow requires a draft application handoff"
    );
  }
  assertToolParity(input.manifest);
}

function assertWorkflowInput(input, manifest) {
  if (!hasExactDataKeys(input, WORKFLOW_INPUT_KEYS)) invalidWorkflow();
  if (!WORKFLOW_ID.test(input.workflowId)) invalidWorkflow();
  if (!hasExactDataKeys(input.creditRequest, CREDIT_REQUEST_KEYS)) invalidWorkflow();
  const request = input.creditRequest;
  if (
    !IDENTIFIER.test(request.assetId) ||
    !PURPOSE_CODE.test(request.purposeCode) ||
    !POSITIVE_MINOR_UNITS.test(request.requestedPrincipalMinor) ||
    !Number.isInteger(request.requestedTermDays) ||
    request.requestedTermDays < 1 ||
    request.requestedTermDays > 3660 ||
    !REPAYMENT_FREQUENCIES.has(request.repaymentFrequency) ||
    !Number.isInteger(request.installmentCount) ||
    request.installmentCount < 1 ||
    request.installmentCount > 520
  ) invalidWorkflow();
  if (
    manifest.authority.status !== "draft" ||
    !manifest.authority.capabilities.includes("request_credit") ||
    !manifest.authority.assetIds.includes(request.assetId) ||
    BigInt(request.requestedPrincipalMinor) > BigInt(manifest.authority.perActionLimitMinor) ||
    BigInt(request.requestedPrincipalMinor) > BigInt(manifest.authority.aggregateLimitMinor)
  ) {
    fail(
      "agent_credit_workflow_scope_denied",
      "Agent credit request is outside the handoff scope"
    );
  }
}

function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function mandateMatchesHandoff(mandate, manifest) {
  return (
    mandate?.mandateId === manifest.mandateId &&
    mandate.mandateHash === manifest.mandateHash &&
    mandate.status === "draft" &&
    sameStrings(mandate.capabilities, manifest.authority.capabilities) &&
    sameStrings(mandate.assetIds, manifest.authority.assetIds) &&
    mandate.perActionLimitMinor === manifest.authority.perActionLimitMinor &&
    mandate.aggregateLimitMinor === manifest.authority.aggregateLimitMinor &&
    mandate.expiresAt === manifest.authority.expiresAt
  );
}

function workflowIdentifier(workflowId, kind, step) {
  return `${kind}_agent_offer:${workflowId}:${step}`;
}

function toolCall(workflowId, correlationId, sequence, name, args) {
  const step = String(sequence).padStart(2, "0");
  return {
    jsonrpc: "2.0",
    id: workflowIdentifier(workflowId, "rpc", step),
    method: "tools/call",
    params: {
      name,
      arguments: {
        ...args,
        requestId: workflowIdentifier(workflowId, "request", step),
        correlationId
      }
    }
  };
}

async function callTool(handle, message, operationId) {
  let response;
  try {
    response = await handle(message);
  } catch {
    mcpFailed();
  }
  if (
    !response ||
    response.jsonrpc !== "2.0" ||
    response.id !== message.id ||
    response.error ||
    !response.result ||
    response.result.isError !== false
  ) mcpFailed();
  const result = response.result.structuredContent;
  try {
    assertTenantProtocolResult(result);
  } catch {
    workflowDrift();
  }
  if (result.operationId !== operationId) workflowDrift();
  return result;
}

function assertIntent(intent, manifest, request, expectedStatus) {
  if (
    !intent ||
    intent.subjectId !== manifest.subjectId ||
    intent.authorityType !== "mandate" ||
    intent.authorityId !== manifest.mandateId ||
    intent.assetId !== request.assetId ||
    intent.requestedPrincipalMinor !== request.requestedPrincipalMinor ||
    intent.purposeCode !== request.purposeCode ||
    intent.requestedTermDays !== request.requestedTermDays ||
    intent.repaymentFrequency !== request.repaymentFrequency ||
    intent.installmentCount !== request.installmentCount ||
    intent.sandboxOnly !== true ||
    intent.productionFundsRequested !== false ||
    !expectedStatus.has(intent.status)
  ) workflowDrift();
}

function assertDecisionPassport(decision) {
  const passport = decision?.decisionPassport;
  const sourceRoles = new Set(passport?.sourceEvidence?.map(({ role }) => role));
  if (
    !passport ||
    !IDENTIFIER.test(passport.riskDecisionPassportId) ||
    !IDENTIFIER.test(passport.riskFeatureSnapshotId) ||
    !HASH.test(passport.decisionPassportHash) ||
    !HASH.test(passport.featureSnapshotHash) ||
    !HASH.test(passport.policyHash) ||
    !HASH.test(passport.riskStateHash) ||
    passport.featureSetVersion !== "credit-application-evidence-features.v1" ||
    passport.policyVersion !== decision.policyVersion ||
    passport.schemaVersion !== "risk_decision_passport.v1" ||
    passport.nonAuthorizing !== true ||
    passport.sandboxOnly !== true ||
    passport.productionAuthority !== false ||
    !Array.isArray(passport.sourceEvidence) ||
    passport.sourceEvidence.length < 4 ||
    !["credit_intent", "subject", "principal", "authority"]
      .every((role) => sourceRoles.has(role)) ||
    sourceRoles.has("human_identity_reference") ||
    !Array.isArray(passport.reasonLineage) ||
    passport.reasonLineage.length !== decision.reasonCodes.length ||
    passport.reasonLineage.some((lineage, index) =>
      lineage.reasonCode !== decision.reasonCodes[index] ||
      !Array.isArray(lineage.featureKeys) || lineage.featureKeys.length < 1 ||
      !Array.isArray(lineage.sourceRoles) || lineage.sourceRoles.length < 1
    )
  ) workflowDrift();
}

function assertApplication(application, manifest, request, creditIntentId, evaluated) {
  const expectedStatus = evaluated ? new Set(["decided"]) : new Set(["submitted", "decided"]);
  assertIntent(application.creditIntent, manifest, request, expectedStatus);
  if (application.creditIntent.creditIntentId !== creditIntentId) workflowDrift();
  if (!evaluated && application.decision === null && application.offer !== null) workflowDrift();
  if (application.decision !== null) {
    const decision = application.decision;
    if (
      decision.creditIntentId !== creditIntentId ||
      decision.subjectId !== manifest.subjectId ||
      decision.authorityType !== "mandate" ||
      decision.authorityId !== manifest.mandateId ||
      decision.assetId !== request.assetId ||
      decision.policyVersion !== "credit-application-rules.v1" ||
      decision.sandboxOnly !== true ||
      decision.productionAuthority !== false
    ) workflowDrift();
    if (evaluated) assertDecisionPassport(decision);
  } else if (evaluated) workflowDrift();
  if (application.offer !== null) {
    const offer = application.offer;
    if (
      !application.decision ||
      offer.creditIntentId !== creditIntentId ||
      offer.riskDecisionId !== application.decision.riskDecisionId ||
      offer.subjectId !== manifest.subjectId ||
      offer.assetId !== request.assetId ||
      offer.status !== "offered" ||
      offer.sandboxOnly !== true ||
      offer.productionFundsApproved !== false
    ) workflowDrift();
  }
}

function stepReceipt(sequence, name, result, requestId) {
  return {
    sequence,
    tool: name,
    operationId: result.operationId,
    requestId,
    replayed: result.replayed,
    responseSchemaVersion: result.response.schemaVersion
  };
}

async function executeCreditOfferWorkflow({ handle, manifest, creditRequest, workflowId }) {
  const correlationId = workflowIdentifier(workflowId, "correlation", "credit");
  const selfCall = toolCall(workflowId, correlationId, 1, "ipo_one_read_self", {
    subjectId: manifest.subjectId
  });
  const selfResult = await callTool(handle, selfCall, "pilotReadAgentSelf");
  const matchingMandate = selfResult.response.mandates.find(
    (mandate) => mandate.mandateId === manifest.mandateId
  );
  if (
    selfResult.response.subject.subjectId !== manifest.subjectId ||
    selfResult.response.subject.subjectType !== "agent" ||
    !new Set(["pending", "active"]).has(selfResult.response.subject.status) ||
    !mandateMatchesHandoff(matchingMandate, manifest)
  ) workflowDrift();

  const requestCall = toolCall(workflowId, correlationId, 2, "ipo_one_request_credit", {
    subjectId: manifest.subjectId,
    payload: {
      authorityId: manifest.mandateId,
      ...creditRequest
    },
    idempotencyKey: workflowIdentifier(workflowId, "idempotency", "intent")
  });
  const requestResult = await callTool(handle, requestCall, "pilotRequestCredit");
  const creditIntent = requestResult.response.creditIntent;
  assertIntent(creditIntent, manifest, creditRequest, new Set(["submitted", "decided"]));

  const readCall = toolCall(workflowId, correlationId, 3, "ipo_one_read_credit_application", {
    creditIntentId: creditIntent.creditIntentId
  });
  const readResult = await callTool(handle, readCall, "pilotReadCreditApplication");
  assertApplication(
    readResult.response,
    manifest,
    creditRequest,
    creditIntent.creditIntentId,
    false
  );

  const evaluateCall = toolCall(
    workflowId,
    correlationId,
    4,
    "ipo_one_evaluate_credit_application",
    {
      creditIntentId: creditIntent.creditIntentId,
      idempotencyKey: workflowIdentifier(workflowId, "idempotency", "decision")
    }
  );
  const evaluationResult = await callTool(
    handle,
    evaluateCall,
    "pilotEvaluateCreditApplication"
  );
  assertApplication(
    evaluationResult.response,
    manifest,
    creditRequest,
    creditIntent.creditIntentId,
    true
  );

  const { decision, offer } = evaluationResult.response;
  const receipt = structuredClone({
    schemaVersion: "agent_credit_offer_workflow_receipt.v1",
    status: offer === null ? "decision_complete" : "offer_ready",
    transportProfile: "mcp_stdio_local",
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsApproved: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    workflowId,
    correlationId,
    subjectId: manifest.subjectId,
    mandateId: manifest.mandateId,
    creditIntent: evaluationResult.response.creditIntent,
    decision,
    offer,
    steps: [
      stepReceipt(1, "ipo_one_read_self", selfResult, selfCall.params.arguments.requestId),
      stepReceipt(2, "ipo_one_request_credit", requestResult, requestCall.params.arguments.requestId),
      stepReceipt(3, "ipo_one_read_credit_application", readResult, readCall.params.arguments.requestId),
      stepReceipt(
        4,
        "ipo_one_evaluate_credit_application",
        evaluationResult,
        evaluateCall.params.arguments.requestId
      )
    ]
  });
  assertAgentCreditOfferWorkflowReceipt(receipt);
  return deepFreeze(receipt);
}

export class IpoOneAgentMcpClient {
  #handle;
  #manifest;

  constructor(input) {
    assertClientConfig(input);
    this.#handle = input.handle;
    this.#manifest = structuredClone(input.manifest);
  }

  async runCreditOfferWorkflow(input) {
    assertWorkflowInput(input, this.#manifest);
    return await executeCreditOfferWorkflow({
      handle: this.#handle,
      manifest: this.#manifest,
      creditRequest: input.creditRequest,
      workflowId: input.workflowId
    });
  }
}

export function runAgentCreditOfferWorkflow(input) {
  if (!hasExactDataKeys(input, FUNCTION_INPUT_KEYS)) invalidWorkflow();
  const client = new IpoOneAgentMcpClient({
    handle: input.handle,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.runCreditOfferWorkflow({
    creditRequest: input.creditRequest,
    workflowId: input.workflowId
  });
}
