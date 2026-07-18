import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertHumanCreditOfferWorkflowReceipt,
  isHumanCreditOfferWorkflowReceipt
} from "../../../packages/api-contract/src/index.js";
import { createHumanCreditOfferWorkflowReceipt } from "../src/human-credit-offer-workflow-receipt.js";

const fixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const validReceipt = fixtures.valid[0];

function result(operationId, response, replayed = false) {
  return {
    operationId,
    replayed,
    response,
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function workflowInput() {
  const consentHash = `0x${"8".repeat(64)}`;
  const correlationId = validReceipt.correlationId;
  const step = (index, value) => ({
    correlationId,
    requestId: validReceipt.steps[index].requestId,
    result: value
  });
  const consent = {
    consentId: validReceipt.consentId,
    consentHash,
    status: "active",
    purposes: ["credit_application", "credit_decision", "identity_reference_use"],
    allowedAssetIds: [validReceipt.creditIntent.assetId],
    allowedCreditPurposeCodes: [validReceipt.creditIntent.purposeCode],
    allowedRepaymentFrequencies: [validReceipt.creditIntent.repaymentFrequency],
    maxRequestedPrincipalMinor: validReceipt.creditIntent.requestedPrincipalMinor,
    maxRequestedTermDays: validReceipt.creditIntent.requestedTermDays,
    maxInstallmentCount: validReceipt.creditIntent.installmentCount
  };
  const selfResponse = {
    subject: {
      subjectId: validReceipt.subjectId,
      subjectType: "human",
      status: "pending",
      prototypeOnly: true
    },
    consents: [consent],
    identityReferences: [{
      identityReferenceId: validReceipt.identityReferenceId,
      consentId: validReceipt.consentId,
      consentHash,
      status: "active",
      purposeCodes: ["credit_decision", "identity_reference_use"],
      syntheticOnly: true,
      productionVerified: false
    }],
    schemaVersion: "tenant_human_subject_view.v1"
  };
  const requestResponse = {
    creditIntent: { ...validReceipt.creditIntent, status: "submitted" },
    schemaVersion: "tenant_credit_intent_created.v1"
  };
  const readResponse = {
    creditIntent: { ...validReceipt.creditIntent, status: "submitted" },
    decision: null,
    offer: null,
    schemaVersion: "tenant_credit_application_view.v1"
  };
  const evaluationResponse = {
    creditIntent: validReceipt.creditIntent,
    decision: validReceipt.decision,
    offer: validReceipt.offer,
    schemaVersion: "tenant_credit_application_evaluated.v2"
  };
  return {
    consentId: validReceipt.consentId,
    creditRequest: {
      assetId: validReceipt.creditIntent.assetId,
      installmentCount: validReceipt.creditIntent.installmentCount,
      purposeCode: validReceipt.creditIntent.purposeCode,
      repaymentFrequency: validReceipt.creditIntent.repaymentFrequency,
      requestedPrincipalMinor: validReceipt.creditIntent.requestedPrincipalMinor,
      requestedTermDays: validReceipt.creditIntent.requestedTermDays
    },
    evaluationStep: step(3, result("pilotEvaluateCreditApplication", evaluationResponse)),
    readStep: step(2, result("pilotReadCreditApplication", readResponse)),
    requestStep: step(1, result("pilotRequestCredit", requestResponse)),
    selfStep: step(0, result("pilotReadHumanSelf", selfResponse)),
    subjectId: validReceipt.subjectId,
    workflowId: validReceipt.workflowId
  };
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("Human browser workflow builds the exact immutable conformance receipt", () => {
  const receipt = createHumanCreditOfferWorkflowReceipt(workflowInput());
  assert.deepEqual(receipt, validReceipt);
  assert.equal(isHumanCreditOfferWorkflowReceipt(receipt), true);
  assert.doesNotThrow(() => assertHumanCreditOfferWorkflowReceipt(receipt));
  assert.equal(deeplyFrozen(receipt), true);
});

test("Human browser workflow fails closed before Intent without decision Consent or identity evidence", () => {
  const missingPurpose = workflowInput();
  missingPurpose.selfStep.result.response.consents[0].purposes = [
    "credit_application",
    "identity_reference_use"
  ];
  assert.throws(
    () => createHumanCreditOfferWorkflowReceipt(missingPurpose),
    /invalid_human_credit_offer_workflow_receipt/
  );

  const missingIdentity = workflowInput();
  missingIdentity.selfStep.result.response.identityReferences = [];
  assert.throws(
    () => createHumanCreditOfferWorkflowReceipt(missingIdentity),
    /invalid_human_credit_offer_workflow_receipt/
  );
});

test("Human browser workflow rejects authority, correlation, economics, and config drift", () => {
  const mandate = workflowInput();
  mandate.evaluationStep.result.response.creditIntent.authorityType = "mandate";
  assert.throws(() => createHumanCreditOfferWorkflowReceipt(mandate));

  const correlation = workflowInput();
  correlation.readStep.correlationId = "correlation_drifted_workflow_0001";
  assert.throws(() => createHumanCreditOfferWorkflowReceipt(correlation));

  const economics = workflowInput();
  economics.evaluationStep.result.response.offer.installmentCount += 1;
  assert.throws(() => createHumanCreditOfferWorkflowReceipt(economics));

  const unknown = { ...workflowInput(), accessToken: "prohibited" };
  assert.throws(() => createHumanCreditOfferWorkflowReceipt(unknown));
});
