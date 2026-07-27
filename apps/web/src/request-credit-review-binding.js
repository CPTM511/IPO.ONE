export const REQUEST_CREDIT_REVIEW_BINDING_SCHEMA_VERSION =
  "request_credit_review_binding.v1";

const INPUT_KEYS = Object.freeze(["entryMode", "receipt"]);
const CURRENT_KEYS = Object.freeze([
  "authorityId",
  "creditRequest",
  "entryMode",
  "subjectId"
]);
const CREDIT_REQUEST_KEYS = Object.freeze([
  "assetId",
  "installmentCount",
  "purposeCode",
  "repaymentFrequency",
  "requestedPrincipalMinor",
  "requestedTermDays"
]);
const HUMAN_RECEIPT_KEYS = Object.freeze([
  "consentId",
  "correlationId",
  "creditIntent",
  "credentialsIncluded",
  "decision",
  "fundsAuthority",
  "identityReferenceId",
  "nonAuthorizing",
  "offer",
  "productionFundsApproved",
  "publicEndpointEnabled",
  "remoteMcpEnabled",
  "sandboxOnly",
  "schemaVersion",
  "status",
  "steps",
  "subjectId",
  "transportProfile",
  "workflowId"
]);
const AGENT_RECEIPT_KEYS = Object.freeze([
  "correlationId",
  "creditIntent",
  "credentialsIncluded",
  "decision",
  "fundsAuthority",
  "mandateId",
  "nonAuthorizing",
  "offer",
  "productionFundsApproved",
  "publicEndpointEnabled",
  "remoteMcpEnabled",
  "sandboxOnly",
  "schemaVersion",
  "status",
  "steps",
  "subjectId",
  "transportProfile",
  "workflowId"
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const CANONICAL_MINOR = /^(0|[1-9][0-9]{0,77})$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;
const PURPOSE = /^[a-z][a-z0-9_.-]{1,63}$/;
const REPAYMENT_FREQUENCIES = new Set([
  "weekly",
  "biweekly",
  "monthly",
  "end_of_term"
]);
const ENTRY_PROFILES = Object.freeze({
  human: Object.freeze({
    authorityKey: "consentId",
    authorityType: "consent",
    receiptKeys: HUMAN_RECEIPT_KEYS,
    receiptSchema: "human_credit_offer_workflow_receipt.v1",
    transportProfile: "authenticated_http_loopback"
  }),
  agent: Object.freeze({
    authorityKey: "mandateId",
    authorityType: "mandate",
    receiptKeys: AGENT_RECEIPT_KEYS,
    receiptSchema: "agent_credit_offer_workflow_receipt.v1",
    transportProfile: "mcp_stdio_local"
  })
});
const EXPECTED_STEPS = Object.freeze([
  Object.freeze({
    operationId: null,
    responseSchemaVersion: null
  }),
  Object.freeze({
    operationId: "pilotRequestCredit",
    responseSchemaVersion: "tenant_credit_intent_created.v1"
  }),
  Object.freeze({
    operationId: "pilotReadCreditApplication",
    responseSchemaVersion: "tenant_credit_application_view.v1"
  }),
  Object.freeze({
    operationId: "pilotEvaluateCreditApplication",
    responseSchemaVersion: "tenant_credit_application_evaluated.v2"
  })
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
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) {
    return false;
  }
  const actual = keys.sort();
  const required = [...expected].sort();
  return actual.length === required.length &&
    actual.every((key, index) => key === required[index]);
}

function invalidBinding() {
  throw new Error("invalid_request_credit_review_binding");
}

function validCreditRequest(request) {
  return (
    hasExactDataKeys(request, CREDIT_REQUEST_KEYS) &&
    IDENTIFIER.test(request.assetId ?? "") &&
    POSITIVE_MINOR.test(request.requestedPrincipalMinor ?? "") &&
    PURPOSE.test(request.purposeCode ?? "") &&
    Number.isInteger(request.requestedTermDays) &&
    request.requestedTermDays >= 1 &&
    request.requestedTermDays <= 3_660 &&
    REPAYMENT_FREQUENCIES.has(request.repaymentFrequency) &&
    Number.isInteger(request.installmentCount) &&
    request.installmentCount >= 1 &&
    request.installmentCount <= 520
  );
}

function creditRequestFromIntent(intent) {
  return {
    assetId: intent.assetId,
    installmentCount: intent.installmentCount,
    purposeCode: intent.purposeCode,
    repaymentFrequency: intent.repaymentFrequency,
    requestedPrincipalMinor: intent.requestedPrincipalMinor,
    requestedTermDays: intent.requestedTermDays
  };
}

function assertReceiptSteps(steps, entryMode) {
  if (!Array.isArray(steps) || steps.length !== EXPECTED_STEPS.length) invalidBinding();
  const firstOperation = entryMode === "human" ? "pilotReadHumanSelf" : "pilotReadAgentSelf";
  const firstSchema = entryMode === "human"
    ? "tenant_human_subject_view.v1"
    : "tenant_agent_subject_view.v2";
  for (const [index, expected] of EXPECTED_STEPS.entries()) {
    const step = steps[index];
    const expectedOperation = index === 0 ? firstOperation : expected.operationId;
    const expectedSchema = index === 0 ? firstSchema : expected.responseSchemaVersion;
    if (
      !step ||
      step.sequence !== index + 1 ||
      step.operationId !== expectedOperation ||
      step.responseSchemaVersion !== expectedSchema ||
      typeof step.replayed !== "boolean" ||
      !IDENTIFIER.test(step.requestId ?? "")
    ) invalidBinding();
  }
}

function assertOfferReceipt(receipt, entryMode, profile) {
  if (
    !hasExactDataKeys(receipt, profile.receiptKeys) ||
    receipt.schemaVersion !== profile.receiptSchema ||
    receipt.transportProfile !== profile.transportProfile ||
    receipt.status !== "offer_ready" ||
    receipt.nonAuthorizing !== true ||
    receipt.sandboxOnly !== true ||
    receipt.productionFundsApproved !== false ||
    receipt.fundsAuthority !== false ||
    receipt.credentialsIncluded !== false ||
    receipt.publicEndpointEnabled !== false ||
    receipt.remoteMcpEnabled !== false ||
    !IDENTIFIER.test(receipt.subjectId ?? "") ||
    !IDENTIFIER.test(receipt[profile.authorityKey] ?? "")
  ) invalidBinding();
  assertReceiptSteps(receipt.steps, entryMode);

  const authorityId = receipt[profile.authorityKey];
  const intent = receipt.creditIntent;
  const decision = receipt.decision;
  const offer = receipt.offer;
  const creditRequest = creditRequestFromIntent(intent ?? {});
  if (
    !validCreditRequest(creditRequest) ||
    intent.subjectId !== receipt.subjectId ||
    intent.authorityType !== profile.authorityType ||
    intent.authorityId !== authorityId ||
    intent.sandboxOnly !== true ||
    intent.productionFundsRequested !== false ||
    decision?.status !== "approved" ||
    decision.subjectId !== receipt.subjectId ||
    decision.authorityType !== profile.authorityType ||
    decision.authorityId !== authorityId ||
    decision.creditIntentId !== intent.creditIntentId ||
    decision.assetId !== intent.assetId ||
    decision.policyVersion !== "credit-application-rules.v1" ||
    decision.sandboxOnly !== true ||
    decision.productionAuthority !== false ||
    !HASH.test(decision.decisionHash ?? "") ||
    !HASH.test(decision.decisionPassport?.decisionPassportHash ?? "") ||
    offer?.status !== "offered" ||
    offer.subjectId !== receipt.subjectId ||
    offer.creditIntentId !== intent.creditIntentId ||
    offer.riskDecisionId !== decision.riskDecisionId ||
    offer.assetId !== intent.assetId ||
    offer.approvedPrincipalMinor !== decision.approvedPrincipalMinor ||
    !POSITIVE_MINOR.test(offer.approvedPrincipalMinor ?? "") ||
    BigInt(offer.approvedPrincipalMinor) > BigInt(intent.requestedPrincipalMinor) ||
    !Number.isInteger(offer.annualRateBps) ||
    offer.annualRateBps < 0 ||
    !CANONICAL_MINOR.test(offer.originationFeeMinor ?? "") ||
    offer.repaymentFrequency !== intent.repaymentFrequency ||
    offer.installmentCount !== intent.installmentCount ||
    !IDENTIFIER.test(offer.disclosureRef ?? "") ||
    offer.termsVersion !== "credit_terms.v1" ||
    !HASH.test(offer.creditOfferHash ?? "") ||
    !HASH.test(offer.termsHash ?? "") ||
    offer.sandboxOnly !== true ||
    offer.productionFundsApproved !== false
  ) invalidBinding();
  return { authorityId, creditRequest, decision, intent, offer };
}

export function createRequestCreditReviewBinding(input) {
  if (!hasExactDataKeys(input, INPUT_KEYS)) invalidBinding();
  const profile = ENTRY_PROFILES[input.entryMode];
  if (!profile) invalidBinding();
  const { authorityId, creditRequest, decision, offer } = assertOfferReceipt(
    input.receipt,
    input.entryMode,
    profile
  );
  const binding = structuredClone({
    schemaVersion: REQUEST_CREDIT_REVIEW_BINDING_SCHEMA_VERSION,
    entryMode: input.entryMode,
    subjectId: input.receipt.subjectId,
    authorityType: profile.authorityType,
    authorityId,
    creditRequest,
    decision: {
      riskDecisionId: decision.riskDecisionId,
      decisionHash: decision.decisionHash,
      decisionPassportHash: decision.decisionPassport.decisionPassportHash,
      policyVersion: decision.policyVersion
    },
    offer: {
      creditOfferId: offer.creditOfferId,
      creditOfferHash: offer.creditOfferHash,
      termsHash: offer.termsHash,
      approvedPrincipalMinor: offer.approvedPrincipalMinor,
      annualRateBps: offer.annualRateBps,
      originationFeeMinor: offer.originationFeeMinor,
      repaymentFrequency: offer.repaymentFrequency,
      installmentCount: offer.installmentCount,
      firstPaymentAt: offer.firstPaymentAt,
      maturityAt: offer.maturityAt,
      disclosureRef: offer.disclosureRef,
      termsVersion: offer.termsVersion,
      validUntil: offer.validUntil
    },
    serverReceipts: input.receipt.steps.map((step) => ({
      sequence: step.sequence,
      operationId: step.operationId,
      requestId: step.requestId,
      replayed: step.replayed,
      responseSchemaVersion: step.responseSchemaVersion
    })),
    sandboxOnly: true,
    productionFundsApproved: false,
    fundsAuthority: false,
    credentialsIncluded: false
  });
  return deepFreeze(binding);
}

function sameCreditRequest(left, right) {
  return CREDIT_REQUEST_KEYS.every((key) => left[key] === right[key]);
}

export function evaluateRequestCreditReviewBinding(binding, current) {
  if (
    !binding ||
    binding.schemaVersion !== REQUEST_CREDIT_REVIEW_BINDING_SCHEMA_VERSION ||
    binding.sandboxOnly !== true ||
    binding.productionFundsApproved !== false ||
    binding.fundsAuthority !== false ||
    binding.credentialsIncluded !== false ||
    !hasExactDataKeys(current, CURRENT_KEYS) ||
    !validCreditRequest(current.creditRequest)
  ) {
    return Object.freeze({
      current: false,
      reasonCode: "review_binding_invalid"
    });
  }
  if (current.entryMode !== binding.entryMode) {
    return Object.freeze({ current: false, reasonCode: "entry_mode_changed" });
  }
  if (current.subjectId !== binding.subjectId) {
    return Object.freeze({ current: false, reasonCode: "subject_changed" });
  }
  if (current.authorityId !== binding.authorityId) {
    return Object.freeze({ current: false, reasonCode: "authority_changed" });
  }
  if (!sameCreditRequest(current.creditRequest, binding.creditRequest)) {
    return Object.freeze({
      current: false,
      reasonCode: "request_economics_changed"
    });
  }
  return Object.freeze({ current: true, reasonCode: "current" });
}

export function assertRequestCreditReviewCurrent(binding, current) {
  const result = evaluateRequestCreditReviewBinding(binding, current);
  if (!result.current) throw new Error(`stale_request_credit_review:${result.reasonCode}`);
  return binding;
}
