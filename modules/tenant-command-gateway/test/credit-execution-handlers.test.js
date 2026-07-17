import assert from "node:assert/strict";
import test from "node:test";
import { ActorType } from "../../authentication/src/index.js";
import {
  ApprovalProjectionType,
  ApprovalProposalStatus
} from "../../approval/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  ConsentPurpose,
  CreditAuthorityType,
  createAcceptedOfferObligation,
  createConsentRecord,
  createCreditOfferAcceptance,
  createCreditIntent,
  createDeterministicCreditDecisionOutcome,
  hashId
} from "../../../packages/domain/src/index.js";
import {
  advanceSandboxServicingCommandHandler,
  executeSandboxObligationCommandHandler,
  postSandboxRepaymentCommandHandler,
  sandboxServicingResolutionCommandHandler
} from "../src/index.js";

const START = new Date("2026-07-16T00:00:00.000Z");
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";

function humanFixture() {
  const subject = {
    subjectId: "subject_human_sandbox_execution",
    subjectType: "human",
    primaryPrincipalId: "principal_human_sandbox_execution",
    status: "active"
  };
  const principal = { principalId: subject.primaryPrincipalId, status: "active" };
  const consent = createConsentRecord({
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    purposes: [
      ConsentPurpose.CREDIT_APPLICATION,
      ConsentPurpose.CREDIT_DECISION,
      ConsentPurpose.CREDIT_OFFER_ACCEPTANCE,
      ConsentPurpose.OBLIGATION_SERVICING
    ],
    allowedAssetIds: [ASSET_ID],
    allowedCreditPurposeCodes: ["working_capital"],
    allowedRepaymentFrequencies: ["monthly"],
    maxRequestedPrincipalMinor: "100000",
    maxRequestedTermDays: 90,
    maxInstallmentCount: 3,
    termsRef: "urn:ipo.one:terms:sandbox-execution:v1",
    termsVersion: "sandbox_execution_terms.v1",
    dataUsageRef: "urn:ipo.one:data-usage:sandbox-execution:v1",
    dataUsageVersion: "sandbox_execution_data_usage.v1",
    disclosureRef: "urn:ipo.one:disclosure:no-real-funds:v1",
    validFrom: START.toISOString(),
    expiresAt: "2027-01-16T00:00:00.000Z",
    now: START
  });
  const intent = createCreditIntent({
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: consent.consentId,
    assetId: ASSET_ID,
    requestedPrincipalMinor: "10000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2,
    now: START
  });
  const { decision, offer } = createDeterministicCreditDecisionOutcome({ intent, now: START });
  const decidedIntent = { ...intent, status: "decided", updatedAt: START.toISOString() };
  const acceptance = createCreditOfferAcceptance({
    offer,
    intent: decidedIntent,
    decision,
    authorityType: CreditAuthorityType.CONSENT,
    authorityRef: consent.consentId,
    acknowledgementHash: `0x${"ab".repeat(32)}`,
    acceptedByActorId: "actor_human_sandbox_execution",
    now: START
  });
  const obligation = createAcceptedOfferObligation({
    offer,
    intent: decidedIntent,
    decision,
    acceptance,
    now: START
  });
  return { subject, principal, consent, obligation };
}

function repository(
  fixture,
  { obligation = fixture.obligation, accounts = [], receipt, proposal } = {}
) {
  const values = new Map([
    [`${CoreProjectionType.OBLIGATION}:${obligation.obligationId}`, { aggregateVersion: 7, value: obligation }],
    [`${CoreProjectionType.SUBJECT}:${fixture.subject.subjectId}`, { aggregateVersion: 2, value: fixture.subject }],
    [`${CoreProjectionType.PRINCIPAL}:${fixture.principal.principalId}`, { aggregateVersion: 1, value: fixture.principal }],
    [`${CoreProjectionType.CONSENT_RECORD}:${fixture.consent.consentId}`, { aggregateVersion: 3, value: fixture.consent }],
    ...accounts.map((value) => [
      `${CoreProjectionType.LEDGER_ACCOUNT}:${value.ledgerAccountId}`,
      { aggregateVersion: 1, value }
    ]),
    ...(proposal ? [[
      `${ApprovalProjectionType.APPROVAL_PROPOSAL}:${proposal.approvalProposalId}`,
      { aggregateVersion: proposal.version, value: proposal }
    ]] : [])
  ]);
  return {
    async getProjectionStateInTransaction(_client, type, id, options) {
      assert.deepEqual(options, { lock: true });
      return values.get(`${type}:${id}`);
    },
    async getCreditApplicationRiskStateInTransaction() {
      return { frozenCreditLineCount: 0, liveStateVersion: 1 };
    },
    async findSandboxExecutionReceiptByObligationInTransaction() {
      return receipt;
    }
  };
}

function approvedServicingProposal(operationId) {
  const commandActorId = "actor_operations_servicing_001";
  return {
    approvalProposalId: `approval_proposal_${operationId}`,
    tenantId: "tenant_servicing_001",
    operationId,
    action: `servicing.${operationId}`,
    resourceType: "obligation",
    resourceId: "obligation_servicing_001",
    commandActorId,
    commandHash: `0x${"22".repeat(32)}`,
    proposalHash: `0x${"33".repeat(32)}`,
    status: ApprovalProposalStatus.APPROVED,
    version: 2,
    updatedAt: "2026-10-20T00:00:00.000Z"
  };
}

function approvedServicingDecision(obligation, proposal) {
  return {
    decisionId: "authorization_decision_servicing_001",
    tenantId: proposal.tenantId,
    actorId: proposal.commandActorId,
    resourceType: "obligation",
    resourceId: obligation.obligationId,
    approvalProposalId: proposal.approvalProposalId,
    approvalProposalVersion: proposal.version,
    commandHash: proposal.commandHash,
    idempotencyKeyHash: `0x${"44".repeat(32)}`,
    approvalIds: ["approval_decision_risk_001", "approval_decision_operations_001"]
  };
}

function context(obligation, now) {
  return {
    client: {},
    payload: {},
    authenticationContext: {
      actorId: "actor_human_sandbox_execution",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: obligation.obligationId
    },
    now,
    requestId: "request-sandbox-execution-0001",
    correlationId: "correlation-sandbox-execution-0001"
  };
}

test("Human sandbox execution plans one signed receipt, eight accounts, balanced ledger, and active Obligation", async () => {
  const fixture = humanFixture();
  const now = new Date("2026-07-16T00:01:00.000Z");
  const plan = await executeSandboxObligationCommandHandler().plan({
    ...context(fixture.obligation, now),
    coreRepository: repository(fixture)
  });
  assert.deepEqual(plan.events.map(({ expectedVersion }) => expectedVersion), [7, 8, 9]);
  assert.equal(plan.writes.filter(({ type }) => type === CoreProjectionType.LEDGER_ACCOUNT).length, 8);
  assert.equal(plan.writes.filter(({ type }) => type === CoreProjectionType.SANDBOX_EXECUTION_RECEIPT).length, 1);
  assert.equal(plan.response.obligation.status, "active");
  assert.equal(plan.response.executionReceipt.amountMinor, "10000");
  assert.equal(plan.response.withdrawable, false);
  assert.equal(plan.response.productionFundsMoved, false);

  const executed = plan.writes.find(({ type }) => type === CoreProjectionType.OBLIGATION).value;
  const accounts = plan.writes
    .filter(({ type }) => type === CoreProjectionType.LEDGER_ACCOUNT)
    .map(({ value }) => value);
  const repaymentPlan = await postSandboxRepaymentCommandHandler().plan({
    ...context(executed, new Date("2026-07-17T00:01:00.000Z")),
    payload: { amountMinor: "5000", sourceCode: "synthetic_wallet" },
    coreRepository: repository(fixture, { obligation: executed, accounts })
  });
  assert.equal(repaymentPlan.response.repayment.appliedPrincipalMinor, "4998");
  assert.equal(repaymentPlan.response.repayment.appliedInterestMinor, "2");
  assert.equal(repaymentPlan.response.obligation.status, "partially_repaid");
  assert.equal(repaymentPlan.response.productionFundsMoved, false);
  assert.deepEqual(repaymentPlan.events.map(({ expectedVersion }) => expectedVersion), [7, 8, 9, 10]);
});

test("sandbox execution fails closed before any write when the signed rail is unavailable", async () => {
  const fixture = humanFixture();
  const adapter = {
    async execute() {
      throw Object.assign(new Error("rail unavailable"), { code: "sandbox_rail_unavailable" });
    },
    verify() {
      throw new Error("unreachable");
    }
  };
  await assert.rejects(
    () => executeSandboxObligationCommandHandler({ sandboxRailAdapter: adapter }).plan({
      ...context(fixture.obligation, new Date("2026-07-16T00:01:00.000Z")),
      coreRepository: repository(fixture)
    }),
    (error) => error.code === "sandbox_rail_unavailable"
  );
});

test("trusted worker default and dual-controlled restructure produce one atomic servicing plan", async () => {
  const fixture = humanFixture();
  const executedPlan = await executeSandboxObligationCommandHandler().plan({
    ...context(fixture.obligation, new Date("2026-07-16T00:01:00.000Z")),
    coreRepository: repository(fixture)
  });
  const executed = executedPlan.writes.find(
    ({ type }) => type === CoreProjectionType.OBLIGATION
  ).value;
  const accounts = executedPlan.writes
    .filter(({ type }) => type === CoreProjectionType.LEDGER_ACCOUNT)
    .map(({ value }) => value);
  const defaultAt = new Date(new Date(executed.maturityAt).getTime() + 95 * 86_400_000);
  const workerPlan = await advanceSandboxServicingCommandHandler().plan({
    client: {},
    coreRepository: repository(fixture, { obligation: executed, accounts }),
    payload: {},
    authenticationContext: {
      actorId: "system_worker_servicing_001",
      actorType: ActorType.SYSTEM_WORKER
    },
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: executed.obligationId
    },
    now: defaultAt,
    requestId: "request-servicing-worker-001",
    correlationId: "correlation-servicing-worker-001"
  });
  assert.equal(workerPlan.response.changed, true);
  assert.equal(workerPlan.response.obligation.status, "defaulted");
  assert.equal(workerPlan.response.obligation.servicingClassification, "defaulted");
  assert.equal(workerPlan.response.servicingAction.source, "system_worker");
  assert.deepEqual(
    workerPlan.writes.map(({ type }) => type),
    [CoreProjectionType.OBLIGATION, CoreProjectionType.SANDBOX_SERVICING_ACTION]
  );

  const defaulted = workerPlan.writes.find(
    ({ type }) => type === CoreProjectionType.OBLIGATION
  ).value;
  const operationId = "pilotRestructureSandboxObligation";
  const proposal = approvedServicingProposal(operationId);
  const authorizationDecision = approvedServicingDecision(defaulted, proposal);
  const resolutionPlan = await sandboxServicingResolutionCommandHandler(operationId).plan({
    client: {},
    coreRepository: repository(fixture, { obligation: defaulted, accounts, proposal }),
    payload: {
      expectedServicingStateHash: hashId("sandbox_servicing_state", defaulted),
      additionalTermDays: 30
    },
    reasonCode: "sandbox_hardship_restructure",
    authenticationContext: {
      actorId: proposal.commandActorId,
      actorType: ActorType.OPERATIONS_OPERATOR
    },
    authorizationDecision,
    now: new Date(defaultAt.getTime() + 86_400_000),
    requestId: "request-servicing-restructure-001",
    correlationId: "correlation-servicing-restructure-001"
  });
  assert.equal(resolutionPlan.response.obligation.status, "restructured");
  assert.equal(resolutionPlan.response.obligation.scheduleSequence, 2);
  assert.equal(resolutionPlan.response.servicingAction.source, "dual_control");
  assert.equal(
    resolutionPlan.response.servicingAction.approvalExecutionId,
    resolutionPlan.response.approvalExecutionId
  );
  assert.deepEqual(
    resolutionPlan.events.map(({ aggregateType }) => aggregateType),
    ["obligation", ApprovalProjectionType.APPROVAL_EXECUTION, ApprovalProjectionType.APPROVAL_PROPOSAL]
  );
  assert.deepEqual(
    resolutionPlan.writes.map(({ type }) => type),
    [
      CoreProjectionType.OBLIGATION,
      CoreProjectionType.SANDBOX_SERVICING_ACTION,
      ApprovalProjectionType.APPROVAL_EXECUTION,
      ApprovalProjectionType.APPROVAL_PROPOSAL
    ]
  );
  assert.equal(
    resolutionPlan.writes.find(({ type }) => type === ApprovalProjectionType.APPROVAL_PROPOSAL)
      .value.status,
    ApprovalProposalStatus.EXECUTED
  );

  await assert.rejects(
    () => sandboxServicingResolutionCommandHandler(operationId).plan({
      client: {},
      coreRepository: repository(fixture, { obligation: defaulted, accounts, proposal }),
      payload: { expectedServicingStateHash: `0x${"00".repeat(32)}`, additionalTermDays: 30 },
      reasonCode: "sandbox_hardship_restructure",
      authenticationContext: { actorId: proposal.commandActorId, actorType: ActorType.OPERATIONS_OPERATOR },
      authorizationDecision,
      now: new Date(defaultAt.getTime() + 86_400_000),
      requestId: "request-servicing-restructure-stale-001",
      correlationId: "correlation-servicing-restructure-stale-001"
    }),
    (error) => error.code === "stale_servicing_state"
  );
});
