import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IpoOneAgentSandboxObligationClient,
  IpoOneAgentSdkError,
  runAgentSandboxObligationWorkflow
} from "../src/index.js";

const handoffFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-handoff-manifest.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const offerFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const obligationFixtures = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/agent-sandbox-obligation-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
));
const readyHandoff = handoffFixtures.valid.find((fixture) => fixture.status === "ready");
const applicationHandoff = handoffFixtures.valid.find(
  (fixture) => fixture.status === "application_ready"
);

function offerReceipt() {
  const receipt = structuredClone(offerFixtures.valid[0]);
  receipt.subjectId = readyHandoff.subjectId;
  receipt.mandateId = readyHandoff.mandateId;
  receipt.creditIntent.subjectId = readyHandoff.subjectId;
  receipt.creditIntent.authorityId = readyHandoff.mandateId;
  receipt.decision.subjectId = readyHandoff.subjectId;
  receipt.decision.authorityId = readyHandoff.mandateId;
  receipt.offer.subjectId = readyHandoff.subjectId;
  return receipt;
}

function obligationForStage(stage, offer) {
  const target = obligationFixtures.valid[0];
  const obligation = structuredClone(target.obligation);
  Object.assign(obligation, {
    subjectId: readyHandoff.subjectId,
    creditIntentId: offer.creditIntentId,
    riskDecisionId: offer.riskDecisionId,
    creditOfferId: offer.creditOfferId,
    authorityId: readyHandoff.mandateId,
    originalPrincipalMinor: offer.approvedPrincipalMinor
  });
  for (const installment of obligation.installments) {
    installment.obligationId = obligation.obligationId;
  }
  if (stage === "accepted") {
    obligation.outstandingPrincipalMinor = offer.approvedPrincipalMinor;
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
    obligation.outstandingPrincipalMinor = offer.approvedPrincipalMinor;
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

function workflowRuntime({ driftOperation = false } = {}) {
  const calls = [];
  const counts = new Map();
  const offer = offerReceipt().offer;
  const target = obligationFixtures.valid[0];

  async function execute(command) {
    calls.push(structuredClone(command));
    const replayed = (counts.get(command.operationId) ?? 0) > 0;
    counts.set(command.operationId, (counts.get(command.operationId) ?? 0) + 1);
    let response;
    if (command.operationId === "pilotAcceptCreditOffer") {
      const obligation = obligationForStage("accepted", offer);
      response = {
        acceptance: {
          ...structuredClone(target.acceptance),
          creditOfferId: offer.creditOfferId,
          creditOfferHash: offer.creditOfferHash,
          termsHash: offer.termsHash,
          creditIntentId: offer.creditIntentId,
          riskDecisionId: offer.riskDecisionId,
          subjectId: readyHandoff.subjectId,
          authorityId: readyHandoff.mandateId,
          acknowledgementHash: command.payload.acknowledgementHash
        },
        obligation,
        offerStatus: "accepted",
        executionCreated: false,
        fundsAuthority: false,
        schemaVersion: "tenant_credit_offer_accepted.v1"
      };
      response.obligation.creditOfferAcceptanceId = response.acceptance.creditOfferAcceptanceId;
    } else if (command.operationId === "pilotExecuteSandboxObligation") {
      const obligation = obligationForStage("executed", offer);
      response = {
        obligation,
        executionReceipt: {
          ...structuredClone(target.executionReceipt),
          obligationId: obligation.obligationId,
          assetId: obligation.assetId,
          amountMinor: obligation.originalPrincipalMinor
        },
        principalLedgerTransactionId: target.principalLedgerTransactionId,
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        schemaVersion: "tenant_sandbox_obligation_executed.v1"
      };
    } else {
      const obligation = obligationForStage("repaid", offer);
      obligation.outstandingPrincipalMinor = "9000";
      obligation.totalRepaidMinor = "3000";
      response = {
        obligation,
        repayment: {
          ...structuredClone(target.repayment),
          obligationId: obligation.obligationId,
          subjectId: readyHandoff.subjectId,
          assetId: obligation.assetId,
          requestedMinor: command.payload.amountMinor,
          sourceCode: command.payload.sourceCode
        },
        sandboxOnly: true,
        productionFundsMoved: false,
        withdrawable: false,
        schemaVersion: "tenant_sandbox_repayment_posted.v1"
      };
    }
    return {
      operationId: driftOperation && calls.length === 2
        ? "pilotAcceptCreditOffer"
        : command.operationId,
      replayed,
      response,
      schemaVersion: "tenant_protocol_result.v1"
    };
  }

  return { calls, execute };
}

function workflowInput(workflowId = "agent-sandbox-obligation-sdk-workflow-0001") {
  return {
    acknowledgementHash: `0x${"ab".repeat(32)}`,
    offerReceipt: offerReceipt(),
    repayment: {
      amountMinor: "3000",
      sourceCode: "synthetic_revenue"
    },
    workflowId
  };
}

test("Agent SDK completes the shared Obligation, execution, accounting, and repayment workflow", async () => {
  const runtime = workflowRuntime();
  const client = new IpoOneAgentSandboxObligationClient({
    execute: runtime.execute,
    manifest: readyHandoff,
    transportProfile: "local_in_process"
  });
  const input = workflowInput();
  const receipt = await client.runObligationWorkflow(input);
  assert.equal(receipt.schemaVersion, "agent_sandbox_obligation_workflow_receipt.v1");
  assert.equal(receipt.status, "repayment_posted");
  assert.equal(receipt.subjectId, readyHandoff.subjectId);
  assert.equal(receipt.mandateId, readyHandoff.mandateId);
  assert.equal(receipt.obligation.schemaVersion, "obligation.v2");
  assert.equal(receipt.obligation.authorityType, "mandate");
  assert.equal(receipt.obligation.status, "partially_repaid");
  assert.equal(receipt.obligation.outstandingPrincipalMinor, "9000");
  assert.equal(receipt.executionReceipt.withdrawable, false);
  assert.equal(receipt.repayment.sourceCode, "synthetic_revenue");
  assert.equal(receipt.productionFundsMoved, false);
  assert.equal(receipt.fundsAuthority, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.obligation), true);
  assert.equal(Object.isFrozen(receipt.steps), true);
  assert.deepEqual(
    receipt.steps.map((step) => step.operationId),
    [
      "pilotAcceptCreditOffer",
      "pilotExecuteSandboxObligation",
      "pilotPostSandboxRepayment"
    ]
  );
  assert.deepEqual(
    runtime.calls.map(({ operationId, resource }) => ({ operationId, resource })),
    [
      {
        operationId: "pilotAcceptCreditOffer",
        resource: { resourceType: "credit_offer", resourceId: input.offerReceipt.offer.creditOfferId }
      },
      {
        operationId: "pilotExecuteSandboxObligation",
        resource: { resourceType: "obligation", resourceId: receipt.obligation.obligationId }
      },
      {
        operationId: "pilotPostSandboxRepayment",
        resource: { resourceType: "obligation", resourceId: receipt.obligation.obligationId }
      }
    ]
  );
  assert.equal(JSON.stringify(runtime.calls).includes("authorityId"), false);
  assert.equal(JSON.stringify(runtime.calls).includes("accessToken"), false);

  const replay = await client.runObligationWorkflow(input);
  assert.equal(replay.obligation.obligationId, receipt.obligation.obligationId);
  assert.equal(replay.steps.every((step) => step.replayed), true);
});

test("Agent Obligation SDK configuration requires a scoped active handoff", () => {
  const runtime = workflowRuntime();
  assert.throws(
    () => new IpoOneAgentSandboxObligationClient({
      execute: runtime.execute,
      manifest: readyHandoff,
      transportProfile: "local_in_process",
      accessToken: "prohibited"
    }),
    (error) => (
      error instanceof IpoOneAgentSdkError &&
      error.code === "invalid_agent_obligation_sdk_config"
    )
  );
  assert.throws(
    () => new IpoOneAgentSandboxObligationClient({
      execute: runtime.execute,
      manifest: applicationHandoff,
      transportProfile: "local_in_process"
    }),
    (error) => error.code === "agent_active_handoff_required"
  );
  const missingCapability = structuredClone(readyHandoff);
  missingCapability.authority.capabilities = missingCapability.authority.capabilities.filter(
    (capability) => capability !== "route_repayment"
  );
  assert.throws(
    () => new IpoOneAgentSandboxObligationClient({
      execute: runtime.execute,
      manifest: missingCapability,
      transportProfile: "local_in_process"
    }),
    (error) => error.code === "agent_obligation_workflow_scope_denied"
  );
});

test("Agent Obligation SDK rejects caller authority and response drift", async () => {
  const runtime = workflowRuntime();
  const client = new IpoOneAgentSandboxObligationClient({
    execute: runtime.execute,
    manifest: readyHandoff,
    transportProfile: "local_in_process"
  });
  const input = workflowInput("agent-sandbox-obligation-sdk-workflow-0002");
  await assert.rejects(
    () => client.runObligationWorkflow({ ...input, authorityId: readyHandoff.mandateId }),
    (error) => error.code === "invalid_agent_obligation_workflow"
  );
  assert.equal(runtime.calls.length, 0);

  const wrongSubject = workflowInput("agent-sandbox-obligation-sdk-workflow-0003");
  wrongSubject.offerReceipt.subjectId = "subject_other_agent";
  await assert.rejects(
    () => client.runObligationWorkflow(wrongSubject),
    (error) => error.code === "agent_obligation_workflow_scope_denied"
  );
  assert.equal(runtime.calls.length, 0);

  const drifted = workflowRuntime({ driftOperation: true });
  const driftedClient = new IpoOneAgentSandboxObligationClient({
    execute: drifted.execute,
    manifest: readyHandoff,
    transportProfile: "local_in_process"
  });
  await assert.rejects(
    () => driftedClient.runObligationWorkflow(
      workflowInput("agent-sandbox-obligation-sdk-workflow-0004")
    ),
    (error) => error.code === "agent_obligation_workflow_drift"
  );
  assert.equal(drifted.calls.length, 2);
});

test("Agent Obligation functional SDK entry preserves the same closed contract", async () => {
  const runtime = workflowRuntime();
  const receipt = await runAgentSandboxObligationWorkflow({
    execute: runtime.execute,
    manifest: readyHandoff,
    transportProfile: "local_in_process",
    ...workflowInput("agent-sandbox-obligation-sdk-workflow-0005")
  });
  assert.equal(receipt.steps.length, 3);
  const symbolInput = {
    execute: runtime.execute,
    manifest: readyHandoff,
    transportProfile: "local_in_process",
    ...workflowInput("agent-sandbox-obligation-sdk-workflow-0006")
  };
  symbolInput[Symbol("credential")] = "prohibited";
  assert.throws(
    () => runAgentSandboxObligationWorkflow(symbolInput),
    (error) => error.code === "invalid_agent_obligation_workflow"
  );
});
