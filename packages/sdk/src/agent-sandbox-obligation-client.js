import {
  assertAgentCreditOfferWorkflowReceipt,
  assertAgentHandoffManifest,
  assertAgentSandboxObligationWorkflowReceipt,
  assertTenantProtocolResult
} from "@ipo-one/api-contract";
import { IpoOneAgentSdkError } from "./agent-mcp-client.js";

const CLIENT_CONFIG_KEYS = Object.freeze(["execute", "manifest", "transportProfile"]);
const WORKFLOW_INPUT_KEYS = Object.freeze([
  "acknowledgementHash",
  "offerReceipt",
  "repayment",
  "workflowId"
]);
const FUNCTION_INPUT_KEYS = Object.freeze([
  "acknowledgementHash",
  "execute",
  "manifest",
  "offerReceipt",
  "repayment",
  "transportProfile",
  "workflowId"
]);
const REPAYMENT_KEYS = Object.freeze(["amountMinor", "sourceCode"]);
const REQUIRED_CAPABILITIES = Object.freeze([
  "accept_credit_offer",
  "execute_sandbox_credit",
  "route_repayment"
]);
const REPAYMENT_SOURCES = new Set([
  "synthetic_wallet",
  "synthetic_bank",
  "synthetic_revenue"
]);
const WORKFLOW_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;

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
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) return false;
  const actual = keys.sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

function fail(code, message) {
  throw new IpoOneAgentSdkError(code, message);
}

function invalidConfig() {
  fail("invalid_agent_obligation_sdk_config", "Agent Obligation SDK configuration is invalid");
}

function invalidWorkflow() {
  fail("invalid_agent_obligation_workflow", "Agent Obligation workflow input is invalid");
}

function workflowDrift() {
  fail("agent_obligation_workflow_drift", "Agent Obligation workflow response is inconsistent");
}

function workflowFailed() {
  fail("agent_obligation_workflow_failed", "Agent Obligation workflow command failed");
}

function assertClientConfig(input) {
  if (!hasExactDataKeys(input, CLIENT_CONFIG_KEYS)) invalidConfig();
  if (typeof input.execute !== "function" || input.transportProfile !== "local_in_process") {
    invalidConfig();
  }
  try {
    assertAgentHandoffManifest(input.manifest);
  } catch {
    invalidConfig();
  }
  if (input.manifest.status !== "ready" || input.manifest.authority.status !== "active") {
    fail("agent_active_handoff_required", "Agent Obligation workflow requires an active handoff");
  }
  if (!REQUIRED_CAPABILITIES.every((capability) => (
    input.manifest.authority.capabilities.includes(capability)
  ))) {
    fail(
      "agent_obligation_workflow_scope_denied",
      "Agent Mandate does not authorize the sandbox Obligation workflow"
    );
  }
}

function assertWorkflowInput(input, manifest) {
  if (!hasExactDataKeys(input, WORKFLOW_INPUT_KEYS)) invalidWorkflow();
  if (
    !WORKFLOW_ID.test(input.workflowId) ||
    !HASH.test(input.acknowledgementHash ?? "") ||
    !hasExactDataKeys(input.repayment, REPAYMENT_KEYS) ||
    !POSITIVE_MINOR.test(input.repayment.amountMinor ?? "") ||
    !REPAYMENT_SOURCES.has(input.repayment.sourceCode)
  ) invalidWorkflow();
  try {
    assertAgentCreditOfferWorkflowReceipt(input.offerReceipt);
  } catch {
    invalidWorkflow();
  }
  const receipt = input.offerReceipt;
  if (
    receipt.status !== "offer_ready" ||
    receipt.subjectId !== manifest.subjectId ||
    receipt.mandateId !== manifest.mandateId ||
    receipt.creditIntent.authorityType !== "mandate" ||
    receipt.creditIntent.authorityId !== manifest.mandateId ||
    receipt.decision.authorityType !== "mandate" ||
    receipt.decision.authorityId !== manifest.mandateId ||
    receipt.offer.subjectId !== manifest.subjectId ||
    !manifest.authority.assetIds.includes(receipt.offer.assetId) ||
    BigInt(receipt.offer.approvedPrincipalMinor) > BigInt(manifest.authority.perActionLimitMinor) ||
    BigInt(receipt.offer.approvedPrincipalMinor) > BigInt(manifest.authority.aggregateLimitMinor)
  ) {
    fail(
      "agent_obligation_workflow_scope_denied",
      "Agent Offer is outside the active handoff scope"
    );
  }
}

function workflowIdentifier(workflowId, kind, step) {
  return `${kind}_agent_obligation:${workflowId}:${step}`;
}

function tenantCommand(workflowId, correlationId, sequence, operationId, resource, payload) {
  const step = String(sequence).padStart(2, "0");
  return {
    schemaVersion: "tenant_protocol_request.v1",
    operationId,
    payload,
    resource,
    idempotencyKey: workflowIdentifier(workflowId, "idempotency", step),
    requestId: workflowIdentifier(workflowId, "request", step),
    correlationId
  };
}

async function executeCommand(execute, command, expectedOperationId) {
  let result;
  try {
    result = await execute(command);
  } catch {
    workflowFailed();
  }
  try {
    assertTenantProtocolResult(result);
  } catch {
    workflowDrift();
  }
  if (result.operationId !== expectedOperationId) workflowDrift();
  return result;
}

function sameObligationIdentity(actual, expected, manifest) {
  return (
    actual?.obligationId === expected.obligationId &&
    actual.subjectId === manifest.subjectId &&
    actual.principalId === expected.principalId &&
    actual.creditIntentId === expected.creditIntentId &&
    actual.riskDecisionId === expected.riskDecisionId &&
    actual.creditOfferId === expected.creditOfferId &&
    actual.creditOfferAcceptanceId === expected.creditOfferAcceptanceId &&
    actual.authorityType === "mandate" &&
    actual.authorityId === manifest.mandateId &&
    actual.assetId === expected.assetId &&
    actual.originalPrincipalMinor === expected.originalPrincipalMinor &&
    actual.sandboxOnly === true &&
    actual.productionFundsMoved === false
  );
}

function assertAcceptance(result, offerReceipt, manifest, acknowledgementHash) {
  const response = result.response;
  const acceptance = response?.acceptance;
  const obligation = response?.obligation;
  const offer = offerReceipt.offer;
  if (
    response?.schemaVersion !== "tenant_credit_offer_accepted.v1" ||
    response.offerStatus !== "accepted" ||
    response.executionCreated !== false ||
    response.fundsAuthority !== false ||
    acceptance?.creditOfferId !== offer.creditOfferId ||
    acceptance.creditOfferHash !== offer.creditOfferHash ||
    acceptance.termsHash !== offer.termsHash ||
    acceptance.creditIntentId !== offer.creditIntentId ||
    acceptance.riskDecisionId !== offer.riskDecisionId ||
    acceptance.subjectId !== manifest.subjectId ||
    acceptance.authorityType !== "mandate" ||
    acceptance.authorityId !== manifest.mandateId ||
    acceptance.acknowledgementHash !== acknowledgementHash ||
    acceptance.sandboxOnly !== true ||
    acceptance.productionAuthority !== false ||
    obligation?.creditOfferAcceptanceId !== acceptance.creditOfferAcceptanceId ||
    obligation.obligationId.length === 0 ||
    obligation.subjectId !== manifest.subjectId ||
    obligation.creditIntentId !== offer.creditIntentId ||
    obligation.riskDecisionId !== offer.riskDecisionId ||
    obligation.creditOfferId !== offer.creditOfferId ||
    obligation.authorityType !== "mandate" ||
    obligation.authorityId !== manifest.mandateId ||
    obligation.assetId !== offer.assetId ||
    obligation.originalPrincipalMinor !== offer.approvedPrincipalMinor ||
    obligation.executionStatus !== "pending" ||
    obligation.status !== "created" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false
  ) workflowDrift();
}

function assertExecution(result, acceptedObligation) {
  const response = result.response;
  const obligation = response?.obligation;
  const executionReceipt = response?.executionReceipt;
  if (
    response?.schemaVersion !== "tenant_sandbox_obligation_executed.v1" ||
    response.sandboxOnly !== true ||
    response.productionFundsMoved !== false ||
    response.withdrawable !== false ||
    !sameObligationIdentity(obligation, acceptedObligation, {
      subjectId: acceptedObligation.subjectId,
      mandateId: acceptedObligation.authorityId
    }) ||
    obligation.executionStatus !== "executed" ||
    obligation.status !== "active" ||
    obligation.withdrawable !== false ||
    executionReceipt?.obligationId !== acceptedObligation.obligationId ||
    executionReceipt.assetId !== acceptedObligation.assetId ||
    executionReceipt.amountMinor !== acceptedObligation.originalPrincipalMinor ||
    executionReceipt.sandboxOnly !== true ||
    executionReceipt.productionFundsMoved !== false ||
    executionReceipt.withdrawable !== false ||
    typeof response.principalLedgerTransactionId !== "string" ||
    response.principalLedgerTransactionId.length === 0
  ) workflowDrift();
}

function assertRepayment(result, executedObligation, repaymentInput, manifest) {
  const response = result.response;
  const obligation = response?.obligation;
  const repayment = response?.repayment;
  if (
    response?.schemaVersion !== "tenant_sandbox_repayment_posted.v1" ||
    response.sandboxOnly !== true ||
    response.productionFundsMoved !== false ||
    response.withdrawable !== false ||
    !sameObligationIdentity(obligation, executedObligation, manifest) ||
    obligation.executionStatus !== "executed" ||
    !new Set(["partially_repaid", "fully_repaid"]).has(obligation.status) ||
    obligation.withdrawable !== false ||
    repayment?.obligationId !== executedObligation.obligationId ||
    repayment.subjectId !== manifest.subjectId ||
    repayment.assetId !== executedObligation.assetId ||
    repayment.requestedMinor !== repaymentInput.amountMinor ||
    repayment.sourceCode !== repaymentInput.sourceCode ||
    repayment.remainingPrincipalMinor !== obligation.outstandingPrincipalMinor ||
    repayment.remainingInterestMinor !== obligation.outstandingInterestMinor ||
    repayment.remainingFeesMinor !== obligation.outstandingFeesMinor ||
    repayment.sandboxOnly !== true ||
    repayment.productionFundsMoved !== false
  ) workflowDrift();
}

function stepReceipt(sequence, result, requestId) {
  return {
    sequence,
    operationId: result.operationId,
    requestId,
    replayed: result.replayed,
    responseSchemaVersion: result.response.schemaVersion
  };
}

async function executeObligationWorkflow({
  acknowledgementHash,
  execute,
  manifest,
  offerReceipt,
  repayment,
  workflowId
}) {
  const correlationId = workflowIdentifier(workflowId, "correlation", "credit");
  const acceptCommand = tenantCommand(
    workflowId,
    correlationId,
    1,
    "pilotAcceptCreditOffer",
    { resourceType: "credit_offer", resourceId: offerReceipt.offer.creditOfferId },
    {
      expectedOfferHash: offerReceipt.offer.creditOfferHash,
      expectedTermsHash: offerReceipt.offer.termsHash,
      acknowledgementHash
    }
  );
  const acceptResult = await executeCommand(execute, acceptCommand, "pilotAcceptCreditOffer");
  assertAcceptance(acceptResult, offerReceipt, manifest, acknowledgementHash);

  const acceptedObligation = acceptResult.response.obligation;
  const executionCommand = tenantCommand(
    workflowId,
    correlationId,
    2,
    "pilotExecuteSandboxObligation",
    { resourceType: "obligation", resourceId: acceptedObligation.obligationId },
    {}
  );
  const executionResult = await executeCommand(
    execute,
    executionCommand,
    "pilotExecuteSandboxObligation"
  );
  assertExecution(executionResult, acceptedObligation);

  const repaymentCommand = tenantCommand(
    workflowId,
    correlationId,
    3,
    "pilotPostSandboxRepayment",
    { resourceType: "obligation", resourceId: acceptedObligation.obligationId },
    repayment
  );
  const repaymentResult = await executeCommand(
    execute,
    repaymentCommand,
    "pilotPostSandboxRepayment"
  );
  assertRepayment(repaymentResult, executionResult.response.obligation, repayment, manifest);

  const receipt = structuredClone({
    schemaVersion: "agent_sandbox_obligation_workflow_receipt.v1",
    status: "repayment_posted",
    transportProfile: "local_in_process",
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    workflowId,
    correlationId,
    subjectId: manifest.subjectId,
    mandateId: manifest.mandateId,
    creditIntentId: offerReceipt.offer.creditIntentId,
    creditOfferId: offerReceipt.offer.creditOfferId,
    acceptance: acceptResult.response.acceptance,
    obligation: repaymentResult.response.obligation,
    executionReceipt: executionResult.response.executionReceipt,
    principalLedgerTransactionId: executionResult.response.principalLedgerTransactionId,
    repayment: repaymentResult.response.repayment,
    steps: [
      stepReceipt(1, acceptResult, acceptCommand.requestId),
      stepReceipt(2, executionResult, executionCommand.requestId),
      stepReceipt(3, repaymentResult, repaymentCommand.requestId)
    ]
  });
  try {
    assertAgentSandboxObligationWorkflowReceipt(receipt);
  } catch {
    workflowDrift();
  }
  return deepFreeze(receipt);
}

export class IpoOneAgentSandboxObligationClient {
  #execute;
  #manifest;

  constructor(input) {
    assertClientConfig(input);
    this.#execute = input.execute;
    this.#manifest = structuredClone(input.manifest);
  }

  async runObligationWorkflow(input) {
    assertWorkflowInput(input, this.#manifest);
    return await executeObligationWorkflow({
      acknowledgementHash: input.acknowledgementHash,
      execute: this.#execute,
      manifest: this.#manifest,
      offerReceipt: input.offerReceipt,
      repayment: input.repayment,
      workflowId: input.workflowId
    });
  }
}

export function runAgentSandboxObligationWorkflow(input) {
  if (!hasExactDataKeys(input, FUNCTION_INPUT_KEYS)) invalidWorkflow();
  const client = new IpoOneAgentSandboxObligationClient({
    execute: input.execute,
    manifest: input.manifest,
    transportProfile: input.transportProfile
  });
  return client.runObligationWorkflow({
    acknowledgementHash: input.acknowledgementHash,
    offerReceipt: input.offerReceipt,
    repayment: input.repayment,
    workflowId: input.workflowId
  });
}
