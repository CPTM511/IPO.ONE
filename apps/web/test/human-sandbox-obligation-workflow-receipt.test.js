import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertHumanSandboxObligationWorkflowReceipt,
  isHumanSandboxObligationWorkflowReceipt
} from "../../../packages/api-contract/src/index.js";
import { createHumanSandboxObligationWorkflowReceipt } from "../src/human-sandbox-obligation-workflow-receipt.js";

const offerFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const obligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const offerReceipt = offerFixtures.valid[0];
const validReceipt = obligationFixtures.valid[0];

function obligationAt(stage) {
  const obligation = structuredClone(validReceipt.obligation);
  if (stage === "accepted") {
    obligation.outstandingPrincipalMinor = obligation.originalPrincipalMinor;
    obligation.totalRepaidMinor = "0";
    obligation.executionStatus = "pending";
    obligation.status = "created";
    for (const key of [
      "sandboxExecutionReceiptId",
      "executedAt",
      "lastAccruedAt",
      "interestAccrualRemainder",
      "withdrawable"
    ]) delete obligation[key];
    for (const installment of obligation.installments) {
      installment.paidPrincipalMinor = "0";
      installment.paidInterestMinor = "0";
      installment.paidFeeMinor = "0";
      installment.status = "scheduled";
    }
  }
  if (stage === "executed") {
    obligation.outstandingPrincipalMinor = obligation.originalPrincipalMinor;
    obligation.totalRepaidMinor = "0";
    obligation.status = "active";
    for (const installment of obligation.installments) {
      installment.paidPrincipalMinor = "0";
      installment.paidInterestMinor = "0";
      installment.paidFeeMinor = "0";
      installment.status = "scheduled";
    }
  }
  return obligation;
}

function protocolResult(operationId, response, replayed = false) {
  return {
    operationId,
    replayed,
    response,
    schemaVersion: "tenant_protocol_result.v1"
  };
}

function workflowInput() {
  const acceptedObligation = obligationAt("accepted");
  const executedObligation = obligationAt("executed");
  const step = (index, result) => ({
    correlationId: validReceipt.correlationId,
    requestId: validReceipt.steps[index].requestId,
    result
  });
  return {
    acceptanceStep: step(0, protocolResult("pilotAcceptCreditOffer", {
      acceptance: structuredClone(validReceipt.acceptance),
      obligation: acceptedObligation,
      offerStatus: "accepted",
      executionCreated: false,
      fundsAuthority: false,
      schemaVersion: "tenant_credit_offer_accepted.v1"
    })),
    executionStep: step(1, protocolResult("pilotExecuteSandboxObligation", {
      obligation: executedObligation,
      executionReceipt: structuredClone(validReceipt.executionReceipt),
      principalLedgerTransactionId: validReceipt.principalLedgerTransactionId,
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_obligation_executed.v1"
    })),
    offerReceipt: structuredClone(offerReceipt),
    repaymentStep: step(2, protocolResult("pilotPostSandboxRepayment", {
      obligation: structuredClone(validReceipt.obligation),
      repayment: structuredClone(validReceipt.repayment),
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      schemaVersion: "tenant_sandbox_repayment_posted.v1"
    })),
    repaymentSequence: 1,
    workflowId: validReceipt.workflowId
  };
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

test("Human browser builds the exact immutable sandbox Obligation receipt", () => {
  const receipt = createHumanSandboxObligationWorkflowReceipt(workflowInput());
  assert.deepEqual(receipt, validReceipt);
  assert.equal(isHumanSandboxObligationWorkflowReceipt(receipt), true);
  assert.doesNotThrow(() => assertHumanSandboxObligationWorkflowReceipt(receipt));
  assert.equal(deeplyFrozen(receipt), true);
});

test("Human browser rejects authority, correlation, lifecycle, and safety drift", () => {
  const authority = workflowInput();
  authority.acceptanceStep.result.response.acceptance.authorityType = "mandate";
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(authority));

  const correlation = workflowInput();
  correlation.executionStep.correlationId = "correlation_drifted_human_obligation_0001";
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(correlation));

  const resource = workflowInput();
  resource.repaymentStep.result.response.repayment.obligationId = "obligation_other";
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(resource));

  const funds = workflowInput();
  funds.executionStep.result.response.productionFundsMoved = true;
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(funds));

  const unknown = { ...workflowInput(), csrfToken: "prohibited" };
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(unknown));

  const symbolInput = workflowInput();
  symbolInput[Symbol("credential")] = "prohibited";
  assert.throws(() => createHumanSandboxObligationWorkflowReceipt(symbolInput));

  const secondRepayment = workflowInput();
  secondRepayment.repaymentSequence = 2;
  secondRepayment.repaymentStep.requestId =
    secondRepayment.repaymentStep.requestId.replace(":03-01", ":03-02");
  const secondReceipt = createHumanSandboxObligationWorkflowReceipt(secondRepayment);
  assert.equal(secondReceipt.repaymentSequence, 2);
  assert.equal(secondReceipt.steps[2].requestId.endsWith(":03-02"), true);
  assert.equal(isHumanSandboxObligationWorkflowReceipt(secondReceipt), true);
});
