export const HUMAN_SANDBOX_OBLIGATION_WORKFLOW_RECEIPT_SCHEMA_VERSION =
  "human_sandbox_obligation_workflow_receipt.v1";

const INPUT_KEYS = Object.freeze([
  "acceptanceStep",
  "executionStep",
  "offerReceipt",
  "repaymentStep",
  "repaymentSequence",
  "workflowId"
]);
const STEP_KEYS = Object.freeze(["correlationId", "requestId", "result"]);
const WORKFLOW_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

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

function invalidReceipt() {
  throw new Error("invalid_human_sandbox_obligation_workflow_receipt");
}

function assertOfferReceipt(receipt) {
  const offer = receipt?.offer;
  const intent = receipt?.creditIntent;
  const decision = receipt?.decision;
  if (
    receipt?.schemaVersion !== "human_credit_offer_workflow_receipt.v1" ||
    receipt.status !== "offer_ready" ||
    receipt.transportProfile !== "authenticated_http_loopback" ||
    receipt.nonAuthorizing !== true ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsApproved !== false ||
    receipt.fundsAuthority !== false ||
    receipt.credentialsIncluded !== false ||
    receipt.publicEndpointEnabled !== false ||
    receipt.remoteMcpEnabled !== false ||
    !IDENTIFIER.test(receipt.subjectId ?? "") ||
    !IDENTIFIER.test(receipt.consentId ?? "") ||
    !IDENTIFIER.test(receipt.identityReferenceId ?? "") ||
    intent?.subjectId !== receipt.subjectId ||
    intent.authorityType !== "consent" ||
    intent.authorityId !== receipt.consentId ||
    decision?.subjectId !== receipt.subjectId ||
    decision.authorityType !== "consent" ||
    decision.authorityId !== receipt.consentId ||
    decision.creditIntentId !== intent.creditIntentId ||
    decision.status !== "approved" ||
    offer?.subjectId !== receipt.subjectId ||
    offer.creditIntentId !== intent.creditIntentId ||
    offer.riskDecisionId !== decision.riskDecisionId ||
    offer.assetId !== intent.assetId ||
    offer.status !== "offered" ||
    offer.sandboxOnly !== true ||
    offer.productionFundsApproved !== false
  ) invalidReceipt();
}

function workflowIdentifier(workflowId, kind, step) {
  return `${kind}_human_obligation:${workflowId}:${step}`;
}

function assertStep(step, operationId, responseSchemaVersion, correlationId, expectedRequestId) {
  if (!hasExactDataKeys(step, STEP_KEYS)) invalidReceipt();
  if (
    !REQUEST_IDENTIFIER.test(step.requestId) ||
    step.requestId !== expectedRequestId ||
    step.correlationId !== correlationId ||
    !REQUEST_IDENTIFIER.test(step.correlationId) ||
    !step.result ||
    step.result.operationId !== operationId ||
    step.result.schemaVersion !== "tenant_protocol_result.v1" ||
    typeof step.result.replayed !== "boolean" ||
    step.result.response?.schemaVersion !== responseSchemaVersion
  ) invalidReceipt();
  return step.result;
}

function sameObligationIdentity(actual, expected, offerReceipt) {
  return (
    actual?.obligationId === expected.obligationId &&
    actual.subjectId === offerReceipt.subjectId &&
    actual.principalId === expected.principalId &&
    actual.creditIntentId === expected.creditIntentId &&
    actual.riskDecisionId === expected.riskDecisionId &&
    actual.creditOfferId === expected.creditOfferId &&
    actual.creditOfferAcceptanceId === expected.creditOfferAcceptanceId &&
    actual.authorityType === "consent" &&
    actual.authorityId === offerReceipt.consentId &&
    actual.assetId === expected.assetId &&
    actual.originalPrincipalMinor === expected.originalPrincipalMinor &&
    actual.sandboxOnly === true &&
    actual.productionFundsMoved === false
  );
}

function assertAcceptance(response, offerReceipt) {
  const acceptance = response?.acceptance;
  const obligation = response?.obligation;
  const offer = offerReceipt.offer;
  if (
    response?.offerStatus !== "accepted" ||
    response.executionCreated !== false ||
    response.fundsAuthority !== false ||
    acceptance?.creditOfferId !== offer.creditOfferId ||
    acceptance.creditOfferHash !== offer.creditOfferHash ||
    acceptance.termsHash !== offer.termsHash ||
    acceptance.creditIntentId !== offer.creditIntentId ||
    acceptance.riskDecisionId !== offer.riskDecisionId ||
    acceptance.subjectId !== offerReceipt.subjectId ||
    acceptance.authorityType !== "consent" ||
    acceptance.authorityId !== offerReceipt.consentId ||
    acceptance.sandboxOnly !== true ||
    acceptance.productionAuthority !== false ||
    obligation?.creditOfferAcceptanceId !== acceptance.creditOfferAcceptanceId ||
    obligation.subjectId !== offerReceipt.subjectId ||
    obligation.creditIntentId !== offer.creditIntentId ||
    obligation.riskDecisionId !== offer.riskDecisionId ||
    obligation.creditOfferId !== offer.creditOfferId ||
    obligation.authorityType !== "consent" ||
    obligation.authorityId !== offerReceipt.consentId ||
    obligation.assetId !== offer.assetId ||
    obligation.originalPrincipalMinor !== offer.approvedPrincipalMinor ||
    obligation.executionStatus !== "pending" ||
    obligation.status !== "created" ||
    obligation.sandboxOnly !== true ||
    obligation.productionFundsMoved !== false
  ) invalidReceipt();
}

function assertExecution(response, acceptedObligation, offerReceipt) {
  const obligation = response?.obligation;
  const executionReceipt = response?.executionReceipt;
  if (
    response?.sandboxOnly !== true ||
    response.productionFundsMoved !== false ||
    response.withdrawable !== false ||
    !sameObligationIdentity(obligation, acceptedObligation, offerReceipt) ||
    obligation.executionStatus !== "executed" ||
    obligation.status !== "active" ||
    obligation.withdrawable !== false ||
    executionReceipt?.obligationId !== acceptedObligation.obligationId ||
    executionReceipt.assetId !== acceptedObligation.assetId ||
    executionReceipt.amountMinor !== acceptedObligation.originalPrincipalMinor ||
    executionReceipt.sandboxOnly !== true ||
    executionReceipt.productionFundsMoved !== false ||
    executionReceipt.withdrawable !== false ||
    !IDENTIFIER.test(response.principalLedgerTransactionId ?? "")
  ) invalidReceipt();
}

function assertRepayment(response, executedObligation, offerReceipt) {
  const obligation = response?.obligation;
  const repayment = response?.repayment;
  if (
    response?.sandboxOnly !== true ||
    response.productionFundsMoved !== false ||
    response.withdrawable !== false ||
    !sameObligationIdentity(obligation, executedObligation, offerReceipt) ||
    obligation.executionStatus !== "executed" ||
    !new Set(["partially_repaid", "fully_repaid"]).has(obligation.status) ||
    obligation.withdrawable !== false ||
    repayment?.obligationId !== executedObligation.obligationId ||
    repayment.subjectId !== offerReceipt.subjectId ||
    repayment.assetId !== executedObligation.assetId ||
    repayment.remainingPrincipalMinor !== obligation.outstandingPrincipalMinor ||
    repayment.remainingInterestMinor !== obligation.outstandingInterestMinor ||
    repayment.remainingFeesMinor !== obligation.outstandingFeesMinor ||
    repayment.sandboxOnly !== true ||
    repayment.productionFundsMoved !== false
  ) invalidReceipt();
}

function stepReceipt(sequence, step) {
  return {
    sequence,
    operationId: step.result.operationId,
    requestId: step.requestId,
    replayed: step.result.replayed,
    responseSchemaVersion: step.result.response.schemaVersion
  };
}

export function createHumanSandboxObligationWorkflowReceipt(input) {
  if (!hasExactDataKeys(input, INPUT_KEYS)) invalidReceipt();
  if (
    !WORKFLOW_ID.test(input.workflowId) ||
    !Number.isSafeInteger(input.repaymentSequence) ||
    input.repaymentSequence < 1 ||
    input.repaymentSequence > 99
  ) invalidReceipt();
  assertOfferReceipt(input.offerReceipt);
  const correlationId = input.acceptanceStep?.correlationId;
  if (correlationId !== workflowIdentifier(input.workflowId, "correlation", "credit")) {
    invalidReceipt();
  }
  const acceptanceResult = assertStep(
    input.acceptanceStep,
    "pilotAcceptCreditOffer",
    "tenant_credit_offer_accepted.v1",
    correlationId,
    workflowIdentifier(input.workflowId, "request", "01")
  );
  assertAcceptance(acceptanceResult.response, input.offerReceipt);
  const executionResult = assertStep(
    input.executionStep,
    "pilotExecuteSandboxObligation",
    "tenant_sandbox_obligation_executed.v1",
    correlationId,
    workflowIdentifier(input.workflowId, "request", "02")
  );
  assertExecution(
    executionResult.response,
    acceptanceResult.response.obligation,
    input.offerReceipt
  );
  const repaymentResult = assertStep(
    input.repaymentStep,
    "pilotPostSandboxRepayment",
    "tenant_sandbox_repayment_posted.v1",
    correlationId,
    workflowIdentifier(
      input.workflowId,
      "request",
      `03-${String(input.repaymentSequence).padStart(2, "0")}`
    )
  );
  assertRepayment(
    repaymentResult.response,
    executionResult.response.obligation,
    input.offerReceipt
  );

  const receipt = structuredClone({
    schemaVersion: HUMAN_SANDBOX_OBLIGATION_WORKFLOW_RECEIPT_SCHEMA_VERSION,
    status: "repayment_posted",
    transportProfile: "authenticated_http_loopback",
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsMoved: false,
    withdrawable: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    workflowId: input.workflowId,
    correlationId,
    subjectId: input.offerReceipt.subjectId,
    consentId: input.offerReceipt.consentId,
    identityReferenceId: input.offerReceipt.identityReferenceId,
    creditIntentId: input.offerReceipt.offer.creditIntentId,
    creditOfferId: input.offerReceipt.offer.creditOfferId,
    repaymentSequence: input.repaymentSequence,
    acceptance: acceptanceResult.response.acceptance,
    obligation: repaymentResult.response.obligation,
    executionReceipt: executionResult.response.executionReceipt,
    principalLedgerTransactionId: executionResult.response.principalLedgerTransactionId,
    repayment: repaymentResult.response.repayment,
    steps: [
      stepReceipt(1, input.acceptanceStep),
      stepReceipt(2, input.executionStep),
      stepReceipt(3, input.repaymentStep)
    ]
  });
  return deepFreeze(receipt);
}
