import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DomainError } from "../../domain/src/index.js";
import {
  ApiBoundaryError,
  TENANT_PROTOCOL_CATALOG,
  assertAgentCreditOfferWorkflowReceipt,
  assertAgentSandboxObligationWorkflowReceipt,
  assertDualNativeCreditOfferParity,
  assertDualNativeSandboxObligationParity,
  assertHumanCreditOfferWorkflowReceipt,
  assertHumanSandboxObligationWorkflowReceipt,
  assertSandboxObligationPortabilityReceipt,
  assertTenantProtocolRequest,
  assertTenantProtocolResult,
  createProblemDetails,
  createRequestId,
  isTenantProtocolCatalog,
  isTenantProtocolRequest,
  isTenantProtocolResult,
  isAgentCreditOfferWorkflowReceipt,
  isAgentSandboxObligationWorkflowReceipt,
  isHumanCreditOfferWorkflowReceipt,
  isHumanSandboxObligationWorkflowReceipt,
  isSandboxObligationPortabilityReceipt,
  isValidRequestId
} from "../src/index.js";

const fixtures = JSON.parse(await readFile(
  join(process.cwd(), "api", "tenant-protocol", "conformance", "tenant-protocol.v1.fixtures.json"),
  "utf8"
));
const workflowReceiptFixtures = JSON.parse(await readFile(
  join(
    process.cwd(),
    "api",
    "tenant-protocol",
    "conformance",
    "agent-credit-offer-workflow-receipt.v1.fixtures.json"
  ),
  "utf8"
));
const humanWorkflowReceiptFixtures = JSON.parse(await readFile(
  join(
    process.cwd(),
    "api",
    "tenant-protocol",
    "conformance",
    "human-credit-offer-workflow-receipt.v1.fixtures.json"
  ),
  "utf8"
));
const agentSandboxObligationWorkflowReceiptFixtures = JSON.parse(await readFile(
  join(
    process.cwd(),
    "api",
    "tenant-protocol",
    "conformance",
    "agent-sandbox-obligation-workflow-receipt.v1.fixtures.json"
  ),
  "utf8"
));
const humanSandboxObligationWorkflowReceiptFixtures = JSON.parse(await readFile(
  join(
    process.cwd(),
    "api",
    "tenant-protocol",
    "conformance",
    "human-sandbox-obligation-workflow-receipt.v1.fixtures.json"
  ),
  "utf8"
));
const sandboxObligationPortabilityReceiptFixtures = JSON.parse(await readFile(
  join(
    process.cwd(),
    "api",
    "tenant-protocol",
    "conformance",
    "sandbox-obligation-portability-receipt.v1.fixtures.json"
  ),
  "utf8"
));

function isDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

function applyFixtureMutation(source, mutation) {
  const result = structuredClone(source);
  let target = result;
  for (const segment of mutation.path.slice(0, -1)) target = target[segment];
  target[mutation.path.at(-1)] = mutation.value;
  return result;
}

test("Agent Credit Offer workflow receipts enforce one closed no-funds contract", () => {
  for (const receipt of workflowReceiptFixtures.valid) {
    assert.equal(isAgentCreditOfferWorkflowReceipt(receipt), true);
    const before = structuredClone(receipt);
    assertAgentCreditOfferWorkflowReceipt(receipt);
    assert.deepEqual(receipt, before);
  }

  const valid = workflowReceiptFixtures.valid[0];
  for (const mutation of workflowReceiptFixtures.invalidMutations) {
    const invalid = applyFixtureMutation(valid, mutation);
    assert.equal(isAgentCreditOfferWorkflowReceipt(invalid), false, mutation.name);
  }

  assert.throws(
    () => assertAgentCreditOfferWorkflowReceipt(
      applyFixtureMutation(valid, workflowReceiptFixtures.invalidMutations[0])
    ),
    (error) => (
      error.code === "invalid_agent_credit_offer_workflow_receipt" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("Agent sandbox Obligation receipts enforce one closed no-funds contract", () => {
  for (const receipt of agentSandboxObligationWorkflowReceiptFixtures.valid) {
    assert.equal(isAgentSandboxObligationWorkflowReceipt(receipt), true);
    const before = structuredClone(receipt);
    assertAgentSandboxObligationWorkflowReceipt(receipt);
    assert.deepEqual(receipt, before);
  }

  const valid = agentSandboxObligationWorkflowReceiptFixtures.valid[0];
  for (const mutation of agentSandboxObligationWorkflowReceiptFixtures.invalidMutations) {
    const invalid = applyFixtureMutation(valid, mutation);
    assert.equal(isAgentSandboxObligationWorkflowReceipt(invalid), false, mutation.name);
  }

  assert.throws(
    () => assertAgentSandboxObligationWorkflowReceipt(
      applyFixtureMutation(
        valid,
        agentSandboxObligationWorkflowReceiptFixtures.invalidMutations[0]
      )
    ),
    (error) => (
      error.code === "invalid_agent_sandbox_obligation_workflow_receipt" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("Human sandbox Obligation receipts enforce one closed no-funds contract", () => {
  for (const receipt of humanSandboxObligationWorkflowReceiptFixtures.valid) {
    assert.equal(isHumanSandboxObligationWorkflowReceipt(receipt), true);
    const before = structuredClone(receipt);
    assertHumanSandboxObligationWorkflowReceipt(receipt);
    assert.deepEqual(receipt, before);
  }

  const valid = humanSandboxObligationWorkflowReceiptFixtures.valid[0];
  for (const mutation of humanSandboxObligationWorkflowReceiptFixtures.invalidMutations) {
    const invalid = applyFixtureMutation(valid, mutation);
    assert.equal(isHumanSandboxObligationWorkflowReceipt(invalid), false, mutation.name);
  }

  assert.throws(
    () => assertHumanSandboxObligationWorkflowReceipt(
      applyFixtureMutation(
        valid,
        humanSandboxObligationWorkflowReceiptFixtures.invalidMutations[0]
      )
    ),
    (error) => (
      error.code === "invalid_human_sandbox_obligation_workflow_receipt" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("Sandbox Obligation portability receipts enforce chain-neutral identity and integrity", () => {
  for (const receipt of sandboxObligationPortabilityReceiptFixtures.valid) {
    assert.equal(isSandboxObligationPortabilityReceipt(receipt), true);
    const before = structuredClone(receipt);
    assertSandboxObligationPortabilityReceipt(receipt);
    assert.deepEqual(receipt, before);
  }

  const valid = sandboxObligationPortabilityReceiptFixtures.valid[0];
  for (const mutation of sandboxObligationPortabilityReceiptFixtures.invalidMutations) {
    const invalid = applyFixtureMutation(valid, mutation);
    assert.equal(isSandboxObligationPortabilityReceipt(invalid), false, mutation.name);
  }

  assert.throws(
    () => assertSandboxObligationPortabilityReceipt(
      applyFixtureMutation(valid, sandboxObligationPortabilityReceiptFixtures.invalidMutations[0])
    ),
    (error) => (
      error.code === "invalid_sandbox_obligation_portability_receipt" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("Human and Agent entries preserve one shared Obligation, ledger, and repayment economy", () => {
  const humanReceipt = humanSandboxObligationWorkflowReceiptFixtures.valid[0];
  const agentReceipt = agentSandboxObligationWorkflowReceiptFixtures.valid[0];
  const parity = assertDualNativeSandboxObligationParity({ humanReceipt, agentReceipt });
  assert.equal(isDeeplyFrozen(parity), true);
  assert.equal(parity.schemaVersion, "dual_native_obligation_economics.v1");
  assert.equal(parity.matched, true);
  assert.deepEqual(parity.entries, {
    human: "consent_authenticated_http_loopback",
    agent: "mandate_local_in_process"
  });
  assert.equal(parity.economics.obligation.originalPrincipalMinor, "12000");
  assert.equal(parity.economics.obligation.outstandingPrincipalMinor, "9000");
  assert.equal(parity.economics.execution.amountMinor, "12000");
  assert.equal(parity.economics.repayment.appliedPrincipalMinor, "3000");
  assert.equal(parity.economics.obligation.installments[0].status, "partial");
  const serializedParity = JSON.stringify(parity);
  for (const identifier of [
    humanReceipt.subjectId,
    humanReceipt.consentId,
    humanReceipt.identityReferenceId,
    humanReceipt.obligation.obligationId,
    humanReceipt.principalLedgerTransactionId,
    agentReceipt.subjectId,
    agentReceipt.mandateId,
    agentReceipt.obligation.obligationId,
    agentReceipt.principalLedgerTransactionId
  ]) {
    assert.equal(serializedParity.includes(identifier), false);
  }
  assert.doesNotMatch(serializedParity, /0x[0-9a-f]{64}|synthetic_bank|synthetic_revenue/);

  const timeShiftedAgent = structuredClone(agentReceipt);
  const shift = (value) => new Date(new Date(value).getTime() + 86_400_000).toISOString();
  timeShiftedAgent.acceptance.acceptedAt = shift(timeShiftedAgent.acceptance.acceptedAt);
  timeShiftedAgent.obligation.firstPaymentAt = shift(timeShiftedAgent.obligation.firstPaymentAt);
  timeShiftedAgent.obligation.maturityAt = shift(timeShiftedAgent.obligation.maturityAt);
  for (const installment of timeShiftedAgent.obligation.installments) {
    installment.dueAt = shift(installment.dueAt);
  }
  timeShiftedAgent.executionReceipt.executedAt = shift(timeShiftedAgent.executionReceipt.executedAt);
  timeShiftedAgent.repayment.occurredAt = shift(timeShiftedAgent.repayment.occurredAt);
  assert.equal(
    assertDualNativeSandboxObligationParity({
      humanReceipt,
      agentReceipt: timeShiftedAgent
    }).matched,
    true
  );

  for (const mutate of [
    (receipt) => { receipt.obligation.annualRateBps += 1; },
    (receipt) => { receipt.executionReceipt.amountMinor = "11999"; },
    (receipt) => { receipt.repayment.appliedPrincipalMinor = "2999"; },
    (receipt) => { receipt.obligation.installments[0].status = "paid"; }
  ]) {
    const drifted = structuredClone(agentReceipt);
    mutate(drifted);
    assert.throws(
      () => assertDualNativeSandboxObligationParity({ humanReceipt, agentReceipt: drifted }),
      (error) => (
        error.code === "dual_native_sandbox_obligation_parity_mismatch" &&
        Object.keys(error.details).length === 0 &&
        !error.message.includes("12000") &&
        !error.message.includes("instancePath")
      )
    );
  }

  assert.throws(
    () => assertDualNativeSandboxObligationParity({
      humanReceipt,
      agentReceipt,
      accessToken: "prohibited"
    }),
    (error) => error.code === "invalid_dual_native_obligation_parity_input"
  );
  const getterInput = { humanReceipt, agentReceipt };
  Object.defineProperty(getterInput, "accessToken", {
    enumerable: true,
    get() { throw new Error("must not execute"); }
  });
  assert.throws(
    () => assertDualNativeSandboxObligationParity(getterInput),
    (error) => error.code === "invalid_dual_native_obligation_parity_input"
  );
  const symbolInput = { humanReceipt, agentReceipt };
  symbolInput[Symbol("authority")] = "prohibited";
  assert.throws(
    () => assertDualNativeSandboxObligationParity(symbolInput),
    (error) => error.code === "invalid_dual_native_obligation_parity_input"
  );
});

test("Human Credit Offer workflow receipts enforce one closed no-funds contract", () => {
  for (const receipt of humanWorkflowReceiptFixtures.valid) {
    assert.equal(isHumanCreditOfferWorkflowReceipt(receipt), true);
    const before = structuredClone(receipt);
    assertHumanCreditOfferWorkflowReceipt(receipt);
    assert.deepEqual(receipt, before);
  }

  const valid = humanWorkflowReceiptFixtures.valid[0];
  for (const mutation of humanWorkflowReceiptFixtures.invalidMutations) {
    const invalid = applyFixtureMutation(valid, mutation);
    assert.equal(isHumanCreditOfferWorkflowReceipt(invalid), false, mutation.name);
  }

  assert.throws(
    () => assertHumanCreditOfferWorkflowReceipt(
      applyFixtureMutation(valid, humanWorkflowReceiptFixtures.invalidMutations[0])
    ),
    (error) => (
      error.code === "invalid_human_credit_offer_workflow_receipt" &&
      Object.keys(error.details).length === 0 &&
      !error.message.includes("instancePath")
    )
  );
});

test("Human HTTP and Agent MCP Offer receipts enforce one economic parity profile", () => {
  const humanReceipt = humanWorkflowReceiptFixtures.valid[0];
  const agentReceipt = workflowReceiptFixtures.valid[0];
  const parity = assertDualNativeCreditOfferParity({ humanReceipt, agentReceipt });
  assert.equal(isDeeplyFrozen(parity), true);
  assert.equal(parity.schemaVersion, "dual_native_offer_economics.v1");
  assert.equal(parity.matched, true);
  assert.deepEqual(parity.entries, {
    human: "consent_authenticated_http_loopback",
    agent: "mandate_mcp_stdio_local"
  });
  assert.equal(parity.economics.creditIntent.requestedPrincipalMinor, "12000");
  assert.equal(parity.economics.decision.approvedPrincipalMinor, "12000");
  assert.equal(parity.economics.offer.annualRateBps, 900);
  assert.equal(parity.economics.offer.firstPaymentOffsetMs, 30 * 86_400_000);
  assert.equal(parity.economics.offer.maturityOffsetMs, 60 * 86_400_000);
  assert.equal(parity.economics.offer.validityOffsetMs, 86_400_000);
  const serializedParity = JSON.stringify(parity);
  for (const identifier of [
    humanReceipt.subjectId,
    humanReceipt.consentId,
    humanReceipt.identityReferenceId,
    humanReceipt.creditIntent.creditIntentId,
    humanReceipt.decision.riskDecisionId,
    humanReceipt.offer.creditOfferId,
    agentReceipt.subjectId,
    agentReceipt.mandateId,
    agentReceipt.creditIntent.creditIntentId,
    agentReceipt.decision.riskDecisionId,
    agentReceipt.offer.creditOfferId
  ]) {
    assert.equal(serializedParity.includes(identifier), false);
  }
  assert.doesNotMatch(serializedParity, /0x[0-9a-f]{64}|"reasonCodes"/);

  const timeShiftedAgent = structuredClone(agentReceipt);
  for (const [target, property] of [
    [timeShiftedAgent.decision, "decidedAt"],
    [timeShiftedAgent.offer, "firstPaymentAt"],
    [timeShiftedAgent.offer, "maturityAt"],
    [timeShiftedAgent.offer, "validUntil"],
    [timeShiftedAgent.offer, "createdAt"],
    [timeShiftedAgent.offer, "updatedAt"]
  ]) {
    target[property] = new Date(new Date(target[property]).getTime() + 86_400_000).toISOString();
  }
  assert.equal(
    assertDualNativeCreditOfferParity({ humanReceipt, agentReceipt: timeShiftedAgent }).matched,
    true
  );

  for (const mutate of [
    (receipt) => { receipt.creditIntent.purposeCode = "inventory"; },
    (receipt) => { receipt.offer.annualRateBps += 1; },
    (receipt) => {
      receipt.offer.firstPaymentAt = new Date(
        new Date(receipt.offer.firstPaymentAt).getTime() + 86_400_000
      ).toISOString();
    }
  ]) {
    const drifted = structuredClone(agentReceipt);
    mutate(drifted);
    assert.throws(
      () => assertDualNativeCreditOfferParity({ humanReceipt, agentReceipt: drifted }),
      (error) => (
        error.code === "dual_native_credit_offer_parity_mismatch" &&
        Object.keys(error.details).length === 0 &&
        !error.message.includes("12000") &&
        !error.message.includes("instancePath")
      )
    );
  }

  assert.throws(
    () => assertDualNativeCreditOfferParity({
      humanReceipt,
      agentReceipt,
      accessToken: "prohibited"
    }),
    (error) => error.code === "invalid_dual_native_offer_parity_input"
  );
  const getterInput = { humanReceipt, agentReceipt };
  Object.defineProperty(getterInput, "accessToken", {
    enumerable: true,
    get() { throw new Error("must not execute"); }
  });
  assert.throws(
    () => assertDualNativeCreditOfferParity(getterInput),
    (error) => error.code === "invalid_dual_native_offer_parity_input"
  );
  const symbolInput = { humanReceipt, agentReceipt };
  symbolInput[Symbol("authority")] = "prohibited";
  assert.throws(
    () => assertDualNativeCreditOfferParity(symbolInput),
    (error) => error.code === "invalid_dual_native_offer_parity_input"
  );
});

test("Tenant protocol fixtures enforce every closed request and result branch", () => {
  for (const request of fixtures.validRequests) assert.equal(isTenantProtocolRequest(request), true);
  for (const request of fixtures.invalidRequests) assert.equal(isTenantProtocolRequest(request), false);
  for (const result of fixtures.validResults) assert.equal(isTenantProtocolResult(result), true);
  for (const result of fixtures.invalidResults) assert.equal(isTenantProtocolResult(result), false);
  assert.equal(isTenantProtocolCatalog(TENANT_PROTOCOL_CATALOG), true);
});

test("Tenant protocol validation is mutation-free and errors expose no validator internals", () => {
  const validRequest = structuredClone(fixtures.validRequests[0]);
  const requestBefore = structuredClone(validRequest);
  assertTenantProtocolRequest(validRequest);
  assert.deepEqual(validRequest, requestBefore);

  const validResult = structuredClone(fixtures.validResults[0]);
  const resultBefore = structuredClone(validResult);
  assertTenantProtocolResult(validResult);
  assert.deepEqual(validResult, resultBefore);

  assert.throws(
    () => assertTenantProtocolRequest(fixtures.invalidRequests[0]),
    (error) => {
      assert.equal(error.code, "invalid_tenant_protocol_request");
      assert.deepEqual(error.details, {});
      assert.equal(error.message.includes("instancePath"), false);
      assert.equal(error.message.includes("must"), false);
      return true;
    }
  );
  assert.throws(
    () => assertTenantProtocolResult(fixtures.invalidResults[0]),
    (error) => error.code === "invalid_tenant_protocol_result" && Object.keys(error.details).length === 0
  );
  assert.equal(isDeeplyFrozen(TENANT_PROTOCOL_CATALOG), true);
});

test("request IDs accept a bounded safe value and replace unsafe input", () => {
  assert.equal(createRequestId({ "x-request-id": "pilot-request-001" }), "pilot-request-001");
  assert.equal(isValidRequestId(createRequestId({ "x-request-id": "bad value\nreflected" })), true);
  assert.equal(isValidRequestId("short"), false);
});

test("domain and boundary errors map to stable Problem Details", () => {
  const conflict = createProblemDetails(
    new DomainError("rail_idempotency_conflict", "key was reused"),
    { requestId: "pilot-request-001" }
  );
  assert.deepEqual(conflict, {
    type: "urn:ipo-one:problem:rail_idempotency_conflict",
    title: "Conflict",
    status: 409,
    detail: "key was reused",
    instance: "urn:ipo-one:request:pilot-request-001",
    code: "rail_idempotency_conflict",
    requestId: "pilot-request-001",
    schemaVersion: "problem_details.v1"
  });

  const tooLarge = createProblemDetails(
    new ApiBoundaryError("payload_too_large", "Request body exceeds 64 KiB."),
    { requestId: "pilot-request-002" }
  );
  assert.equal(tooLarge.status, 413);

  const unsupported = createProblemDetails(
    new ApiBoundaryError("unsupported_media_type", "JSON is required."),
    { requestId: "pilot-request-003" }
  );
  assert.equal(unsupported.status, 415);
  assert.equal(unsupported.title, "Unsupported Media Type");

  const rateLimited = createProblemDetails(
    new ApiBoundaryError("sandbox_mutation_limit_exceeded", "Reset the sandbox."),
    { requestId: "pilot-request-004" }
  );
  assert.equal(rateLimited.status, 429);

  const denied = createProblemDetails(
    new DomainError("authorization_denied", "The requested operation is not available."),
    { requestId: "pilot-request-005" }
  );
  assert.equal(denied.status, 404);
  assert.equal(denied.title, "Not Found");
  assert.equal(denied.detail, "The requested operation is not available.");

  const unavailable = createProblemDetails(
    new DomainError("authorization_unavailable", "Authorization is temporarily unavailable."),
    { requestId: "pilot-request-006" }
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.title, "Service Unavailable");

  const budget = createProblemDetails(
    new DomainError(
      "request_budget_exceeded",
      "The request budget is temporarily unavailable.",
      { retryAfterClass: "short", configuredLimit: 30, tenantUtilization: 29 }
    ),
    { requestId: "pilot-request-007" }
  );
  assert.equal(budget.status, 429);
  assert.equal(budget.retryAfterClass, "short");
  assert.equal(Object.hasOwn(budget, "configuredLimit"), false);
  assert.equal(Object.hasOwn(budget, "tenantUtilization"), false);

  const retryProhibited = createProblemDetails(
    new DomainError(
      "automatic_retry_prohibited",
      "Automatic retry is not permitted for this operation.",
      { retryAfterClass: "manual" }
    ),
    { requestId: "pilot-request-008" }
  );
  assert.equal(retryProhibited.status, 409);
  assert.equal(retryProhibited.retryAfterClass, "manual");

  const unrelatedMetadata = createProblemDetails(
    new DomainError("invalid_request_field", "field is invalid", { retryAfterClass: "short" }),
    { requestId: "pilot-request-009" }
  );
  assert.equal(Object.hasOwn(unrelatedMetadata, "retryAfterClass"), false);
});

test("unexpected errors are redacted", () => {
  const problem = createProblemDetails(new Error("password=secret at /private/path"), {
    requestId: "pilot-request-003"
  });
  assert.equal(problem.status, 500);
  assert.equal(problem.code, "internal_error");
  assert.equal(problem.detail.includes("secret"), false);
  assert.equal(problem.detail.includes("/private"), false);
});
