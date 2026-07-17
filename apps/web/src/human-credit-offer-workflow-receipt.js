export const HUMAN_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION =
  "human_credit_offer_workflow_receipt.v1";

const INPUT_KEYS = Object.freeze([
  "consentId",
  "creditRequest",
  "evaluationStep",
  "readStep",
  "requestStep",
  "selfStep",
  "subjectId",
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
const STEP_KEYS = Object.freeze(["correlationId", "requestId", "result"]);
const WORKFLOW_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,71}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PURPOSE_CODE = /^[a-z][a-z0-9_.-]{1,63}$/;
const POSITIVE_MINOR_UNITS = /^[1-9][0-9]{0,77}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REPAYMENT_FREQUENCIES = new Set(["weekly", "biweekly", "monthly", "end_of_term"]);
const REQUIRED_CONSENT_PURPOSES = Object.freeze([
  "credit_application",
  "credit_decision",
  "identity_reference_use"
]);
const REQUIRED_IDENTITY_PURPOSES = Object.freeze([
  "credit_decision",
  "identity_reference_use"
]);

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

function invalidReceipt() {
  throw new Error("invalid_human_credit_offer_workflow_receipt");
}

function includesAll(actual, expected) {
  return Array.isArray(actual) && expected.every((value) => actual.includes(value));
}

function minorUnitsAtMost(value, limit) {
  try {
    return POSITIVE_MINOR_UNITS.test(value) && /^[0-9]{1,78}$/.test(limit) && BigInt(value) <= BigInt(limit);
  } catch {
    return false;
  }
}

function assertCreditRequest(request) {
  if (!hasExactDataKeys(request, CREDIT_REQUEST_KEYS)) invalidReceipt();
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
  ) invalidReceipt();
}

function assertStep(step, operationId, responseSchemaVersion, correlationId) {
  if (!hasExactDataKeys(step, STEP_KEYS)) invalidReceipt();
  if (
    !REQUEST_IDENTIFIER.test(step.requestId) ||
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

function assertIntent(intent, subjectId, consentId, request, statuses) {
  if (
    !intent ||
    intent.subjectId !== subjectId ||
    intent.authorityType !== "consent" ||
    intent.authorityId !== consentId ||
    intent.assetId !== request.assetId ||
    intent.requestedPrincipalMinor !== request.requestedPrincipalMinor ||
    intent.purposeCode !== request.purposeCode ||
    intent.requestedTermDays !== request.requestedTermDays ||
    intent.repaymentFrequency !== request.repaymentFrequency ||
    intent.installmentCount !== request.installmentCount ||
    intent.sandboxOnly !== true ||
    intent.productionFundsRequested !== false ||
    !statuses.has(intent.status)
  ) invalidReceipt();
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
    passport.sourceEvidence.length < 5 ||
    !["credit_intent", "subject", "principal", "authority", "human_identity_reference"]
      .every((role) => sourceRoles.has(role)) ||
    !Array.isArray(passport.reasonLineage) ||
    passport.reasonLineage.length !== decision.reasonCodes.length ||
    passport.reasonLineage.some((lineage, index) =>
      lineage.reasonCode !== decision.reasonCodes[index] ||
      !Array.isArray(lineage.featureKeys) || lineage.featureKeys.length < 1 ||
      !Array.isArray(lineage.sourceRoles) || lineage.sourceRoles.length < 1
    )
  ) invalidReceipt();
}

function assertApplication(application, subjectId, consentId, request, creditIntentId, evaluated) {
  assertIntent(
    application?.creditIntent,
    subjectId,
    consentId,
    request,
    evaluated ? new Set(["decided"]) : new Set(["submitted", "decided"])
  );
  if (application.creditIntent.creditIntentId !== creditIntentId) invalidReceipt();
  if (!evaluated && application.decision === null && application.offer !== null) invalidReceipt();
  if (application.decision !== null) {
    const decision = application.decision;
    if (
      decision.creditIntentId !== creditIntentId ||
      decision.subjectId !== subjectId ||
      decision.authorityType !== "consent" ||
      decision.authorityId !== consentId ||
      decision.assetId !== request.assetId ||
      decision.policyVersion !== "credit-application-rules.v1" ||
      decision.sandboxOnly !== true ||
      decision.productionAuthority !== false
    ) invalidReceipt();
    if (evaluated) assertDecisionPassport(decision);
  } else if (evaluated) invalidReceipt();
  if (application.offer !== null) {
    const offer = application.offer;
    if (
      !application.decision ||
      offer.creditIntentId !== creditIntentId ||
      offer.riskDecisionId !== application.decision.riskDecisionId ||
      offer.subjectId !== subjectId ||
      offer.assetId !== request.assetId ||
      application.decision.status !== "approved" ||
      offer.approvedPrincipalMinor !== application.decision.approvedPrincipalMinor ||
      offer.repaymentFrequency !== request.repaymentFrequency ||
      offer.installmentCount !== request.installmentCount ||
      offer.status !== "offered" ||
      offer.sandboxOnly !== true ||
      offer.productionFundsApproved !== false
    ) invalidReceipt();
  } else if (evaluated && !new Set(["rejected", "frozen"]).has(application.decision.status)) invalidReceipt();
}

function assertHumanPreflight(self, subjectId, consentId, request) {
  if (
    self.subject?.subjectId !== subjectId ||
    self.subject.subjectType !== "human" ||
    !new Set(["pending", "active"]).has(self.subject.status) ||
    self.subject.prototypeOnly !== true
  ) invalidReceipt();
  const consent = self.consents?.find((item) => item.consentId === consentId);
  if (
    !consent ||
    consent.status !== "active" ||
    !includesAll(consent.purposes, REQUIRED_CONSENT_PURPOSES) ||
    !consent.allowedAssetIds.includes(request.assetId) ||
    !consent.allowedCreditPurposeCodes.includes(request.purposeCode) ||
    !consent.allowedRepaymentFrequencies.includes(request.repaymentFrequency) ||
    !minorUnitsAtMost(request.requestedPrincipalMinor, consent.maxRequestedPrincipalMinor) ||
    request.requestedTermDays > consent.maxRequestedTermDays ||
    request.installmentCount > consent.maxInstallmentCount
  ) invalidReceipt();
  const identityReference = self.identityReferences?.find((item) =>
    item.consentId === consentId &&
    item.consentHash === consent.consentHash &&
    item.status === "active" &&
    item.syntheticOnly === true &&
    item.productionVerified === false &&
    includesAll(item.purposeCodes, REQUIRED_IDENTITY_PURPOSES)
  );
  if (!identityReference) invalidReceipt();
  return identityReference;
}

function stepReceipt(sequence, operationId, step) {
  return {
    sequence,
    operationId,
    requestId: step.requestId,
    replayed: step.result.replayed,
    responseSchemaVersion: step.result.response.schemaVersion
  };
}

export function createHumanCreditOfferWorkflowReceipt(input) {
  if (!hasExactDataKeys(input, INPUT_KEYS)) invalidReceipt();
  if (
    !WORKFLOW_ID.test(input.workflowId) ||
    !IDENTIFIER.test(input.subjectId) ||
    !IDENTIFIER.test(input.consentId)
  ) invalidReceipt();
  assertCreditRequest(input.creditRequest);
  const correlationId = input.selfStep?.correlationId;
  const selfResult = assertStep(
    input.selfStep,
    "pilotReadHumanSelf",
    "tenant_human_subject_view.v1",
    correlationId
  );
  const identityReference = assertHumanPreflight(
    selfResult.response,
    input.subjectId,
    input.consentId,
    input.creditRequest
  );
  const requestResult = assertStep(
    input.requestStep,
    "pilotRequestCredit",
    "tenant_credit_intent_created.v1",
    correlationId
  );
  assertIntent(
    requestResult.response.creditIntent,
    input.subjectId,
    input.consentId,
    input.creditRequest,
    new Set(["submitted", "decided"])
  );
  const creditIntentId = requestResult.response.creditIntent.creditIntentId;
  const readResult = assertStep(
    input.readStep,
    "pilotReadCreditApplication",
    "tenant_credit_application_view.v1",
    correlationId
  );
  assertApplication(
    readResult.response,
    input.subjectId,
    input.consentId,
    input.creditRequest,
    creditIntentId,
    false
  );
  const evaluationResult = assertStep(
    input.evaluationStep,
    "pilotEvaluateCreditApplication",
    "tenant_credit_application_evaluated.v2",
    correlationId
  );
  assertApplication(
    evaluationResult.response,
    input.subjectId,
    input.consentId,
    input.creditRequest,
    creditIntentId,
    true
  );
  const receipt = structuredClone({
    schemaVersion: HUMAN_CREDIT_OFFER_WORKFLOW_RECEIPT_SCHEMA_VERSION,
    status: evaluationResult.response.offer === null ? "decision_complete" : "offer_ready",
    transportProfile: "authenticated_http_loopback",
    nonAuthorizing: true,
    sandboxOnly: true,
    productionFundsApproved: false,
    fundsAuthority: false,
    credentialsIncluded: false,
    publicEndpointEnabled: false,
    remoteMcpEnabled: false,
    workflowId: input.workflowId,
    correlationId,
    subjectId: input.subjectId,
    consentId: input.consentId,
    identityReferenceId: identityReference.identityReferenceId,
    creditIntent: evaluationResult.response.creditIntent,
    decision: evaluationResult.response.decision,
    offer: evaluationResult.response.offer,
    steps: [
      stepReceipt(1, "pilotReadHumanSelf", input.selfStep),
      stepReceipt(2, "pilotRequestCredit", input.requestStep),
      stepReceipt(3, "pilotReadCreditApplication", input.readStep),
      stepReceipt(4, "pilotEvaluateCreditApplication", input.evaluationStep)
    ]
  });
  return deepFreeze(receipt);
}
