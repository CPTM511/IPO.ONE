import assert from "node:assert/strict";
import test from "node:test";
import {
  ActorType,
  ClientAuthenticationMethod,
  SenderConstraintMethod
} from "../../authentication/src/index.js";
import { createAuthenticationContext } from "../../authentication/src/authentication-context.js";
import {
  CreditAuthorityType,
  MandateCapability,
  SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
  createConsentRecord,
  createCreditIntent,
  createMandate
} from "../../../packages/domain/src/index.js";
import {
  AgentTenantCommandClient,
  activateSandboxMandateCommandHandler,
  HumanTenantCommandClient,
  OperatorTenantCommandClient,
  RiskTenantQueryClient,
  TenantCommandHandlerRegistry,
  createAgentSubjectCommandHandler,
  createConsentCommandHandler,
  createHumanSubjectCommandHandler,
  createDraftMandateCommandHandler,
  createPostgresTenantLivePolicyAdapter,
  evaluateCreditApplicationCommandHandler,
  requestCreditIntentCommandHandler,
  readCreditApplicationQueryHandler,
  createTenantFoundationHandlers,
  freezeAgentSubjectCommandHandler,
  normalizeDraftMandatePayload,
  readAgentSelfQueryHandler,
  readConsentQueryHandler,
  readHumanSelfQueryHandler,
  readHumanIdentityReferenceQueryHandler,
  readMandateQueryHandler,
  readObligationEvidenceQueryHandler,
  readOwnedObligationQueryHandler,
  readPilotHealthQueryHandler,
  readTenantRiskPortfolioQueryHandler,
  revokeConsentCommandHandler,
  revokeDraftMandateCommandHandler
} from "../src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

function authenticationContext(actorType, actorId) {
  const humanActor = new Set([
    ActorType.HUMAN,
    ActorType.RISK_OPERATOR,
    ActorType.OPERATIONS_OPERATOR,
    ActorType.AUDITOR
  ]).has(actorType);
  return createAuthenticationContext({
    tenantId: "tenant_gateway_test",
    actorId,
    actorType,
    clientId: `client_${actorId}`,
    credentialId: `credential_${actorId}`,
    credentialVersion: 1,
    policyVersion: "security_001.v1",
    capabilities: [],
    roles: [],
    tokenJtiHash: "token_jti_hash_gateway_test_00000000000000000000",
    authenticationMethod: humanActor
      ? ClientAuthenticationMethod.OIDC_PKCE_BFF
      : ClientAuthenticationMethod.PRIVATE_KEY_JWT,
    senderConstraintMethod: humanActor
      ? SenderConstraintMethod.HOST_SESSION
      : SenderConstraintMethod.MTLS,
    authenticatedAt: "2026-07-14T00:00:00.000Z",
    ...(humanActor
      ? {
          authTime: "2026-07-14T00:00:00.000Z",
          acr: "urn:ipo-one:local:phishing-resistant",
          amr: ["webauthn"]
        }
      : {})
  });
}

test("handler registry is closed, unique, and distinguishes commands from queries", () => {
  const handlers = [
    activateSandboxMandateCommandHandler(),
    createAgentSubjectCommandHandler(),
    createConsentCommandHandler(),
    createDraftMandateCommandHandler(),
    createHumanSubjectCommandHandler(),
    evaluateCreditApplicationCommandHandler(),
    freezeAgentSubjectCommandHandler(),
    requestCreditIntentCommandHandler(),
    readAgentSelfQueryHandler(),
    readCreditApplicationQueryHandler(),
    readConsentQueryHandler(),
    readHumanSelfQueryHandler(),
    readHumanIdentityReferenceQueryHandler(),
    readMandateQueryHandler(),
    readOwnedObligationQueryHandler(),
    readObligationEvidenceQueryHandler(),
    readObligationEvidenceQueryHandler({ operationId: "pilotReadOwnObligationEvidence" }),
    readPilotHealthQueryHandler(),
    readTenantRiskPortfolioQueryHandler(),
    revokeConsentCommandHandler(),
    revokeDraftMandateCommandHandler()
  ];
  const registry = new TenantCommandHandlerRegistry(handlers);
  assert.deepEqual(registry.listOperationIds(), [
    "pilotActivateSandboxMandate",
    "pilotCreateAgentSubject",
    "pilotCreateConsent",
    "pilotCreateDraftMandate",
    "pilotCreateHumanSubject",
    "pilotEvaluateCreditApplication",
    "pilotFreezeSubject",
    "pilotReadAgentSelf",
    "pilotReadConsent",
    "pilotReadCreditApplication",
    "pilotReadEvidence",
    "pilotReadHumanSelf",
    "pilotReadIdentityReference",
    "pilotReadMandate",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence",
    "pilotReadPilotHealth",
    "pilotReadTenantRisk",
    "pilotRequestCredit",
    "pilotRevokeConsent",
    "pilotRevokeDraftMandate"
  ]);
  assert.equal(registry.require("pilotCreateAgentSubject").kind, "command");
  assert.equal(registry.require("pilotReadAgentSelf").kind, "query");
  assert.throws(
    () => new TenantCommandHandlerRegistry([...handlers, handlers[0]]),
    (error) => error.code === "invalid_tenant_command_handler"
  );
  assert.throws(
    () => registry.require("unknownOperation"),
    (error) => error.code === "tenant_operation_unavailable"
  );
});

test("foundation registry exposes only the reviewed durable operations", () => {
  const registry = new TenantCommandHandlerRegistry(createTenantFoundationHandlers());
  assert.deepEqual(registry.listOperationIds(), [
    "pilotAcceptCreditOffer",
    "pilotAcknowledgeProviderIntent",
    "pilotActivateSandboxMandate",
    "pilotCreateAgentAccountChallenge",
    "pilotCreateAgentSubject",
    "pilotCreateConsent",
    "pilotCreateDraftMandate",
    "pilotCreateHumanSubject",
    "pilotEvaluateCreditApplication",
    "pilotExecuteSandboxObligation",
    "pilotFreezeSubject",
    "pilotPostSandboxRepayment",
    "pilotReadAgentAccountBinding",
    "pilotReadAgentSelf",
    "pilotReadConsent",
    "pilotReadCreditApplication",
    "pilotReadEvidence",
    "pilotReadHumanSelf",
    "pilotReadIdentityReference",
    "pilotReadMandate",
    "pilotReadOwnObligation",
    "pilotReadOwnObligationEvidence",
    "pilotReadPilotFeedbackSummary",
    "pilotReadPilotHealth",
    "pilotReadProviderIntent",
    "pilotReadServicingQueue",
    "pilotReadTenantRisk",
    "pilotReadWorkspaceResume",
    "pilotRepurchaseSandboxObligation",
    "pilotRequestCredit",
    "pilotRestructureSandboxObligation",
    "pilotRevokeConsent",
    "pilotRevokeDraftMandate",
    "pilotSubmitAgentAccountProof",
    "pilotSubmitPilotFeedback",
    "pilotWriteOffSandboxObligation",
    "workerAdvanceSandboxServicing",
    "workerProcessInbox"
  ]);
});

test("Human Consent and Agent draft Mandate converge on one sandbox Credit Intent shape", async () => {
  const now = new Date("2026-07-14T02:00:00.000Z");
  const assetId = "urn:ipo-one:sandbox-asset:usd-cent";
  const humanSubject = {
    subjectId: "subject_human_credit",
    subjectType: "human",
    primaryPrincipalId: "principal_human_credit",
    status: "pending",
    prototypeOnly: true
  };
  const humanPrincipal = { principalId: humanSubject.primaryPrincipalId, status: "active" };
  const consent = createConsentRecord({
    subjectId: humanSubject.subjectId,
    principalId: humanPrincipal.principalId,
    purposes: ["credit_application"],
    allowedAssetIds: [assetId],
    allowedCreditPurposeCodes: ["working_capital"],
    allowedRepaymentFrequencies: ["monthly"],
    maxRequestedPrincipalMinor: "25000",
    maxRequestedTermDays: 90,
    maxInstallmentCount: 3,
    termsRef: "urn:ipo.one:terms:human-credit-sandbox:v1",
    termsVersion: "human_credit_terms.v1",
    dataUsageRef: "urn:ipo.one:data-usage:human-credit-sandbox:v1",
    dataUsageVersion: "human_credit_data_usage.v1",
    disclosureRef: "urn:ipo.one:disclosure:no-real-funds:v1",
    validFrom: now.toISOString(),
    expiresAt: "2026-10-14T02:00:00.000Z",
    now
  });
  const agentSubject = {
    subjectId: "subject_agent_credit",
    subjectType: "agent",
    primaryPrincipalId: "principal_agent_credit",
    status: "active",
    prototypeOnly: false
  };
  const agentPrincipal = { principalId: agentSubject.primaryPrincipalId, status: "active" };
  const mandate = {
    mandateId: "mandate_agent_credit",
    subjectId: agentSubject.subjectId,
    principalId: agentPrincipal.principalId,
    status: "draft",
    capabilities: ["request_credit"],
    assetIds: [assetId],
    perActionLimitMinor: "20000",
    aggregateLimitMinor: "50000",
    utilizedMinor: "0",
    validFrom: now.toISOString(),
    expiresAt: "2027-01-14T02:00:00.000Z"
  };

  function repository({ subject, principal, authority, risk = {} }) {
    return {
      async getProjectionStateInTransaction(_client, type, id, options) {
        assert.deepEqual(options, { lock: true });
        if (type === CoreProjectionType.SUBJECT && id === subject.subjectId) {
          return { aggregateVersion: 2, value: subject };
        }
        if (type === CoreProjectionType.PRINCIPAL && id === principal.principalId) {
          return { aggregateVersion: 3, value: principal };
        }
        if (
          [CoreProjectionType.CONSENT_RECORD, CoreProjectionType.MANDATE].includes(type) &&
          id === (authority.consentId ?? authority.mandateId)
        ) {
          return { aggregateVersion: 4, value: authority };
        }
        return undefined;
      },
      async getCreditApplicationRiskStateInTransaction(_client, subjectId, requestedAssetId) {
        assert.equal(subjectId, subject.subjectId);
        assert.equal(requestedAssetId, assetId);
        return {
          adverseObligationCount: risk.adverseObligationCount ?? 0,
          frozenCreditLineCount: risk.frozenCreditLineCount ?? 0,
          liveStateVersion: risk.liveStateVersion ?? 1
        };
      },
      async findCreditIntentByHashInTransaction() {
        return undefined;
      },
      async countCreditIntentsForCapacityInTransaction() {
        return 0;
      },
      async findRiskDecisionByCreditIntentInTransaction() {
        return undefined;
      },
      async findCreditOfferByIntentInTransaction() {
        return undefined;
      }
    };
  }

  const humanPayload = {
    authorityId: consent.consentId,
    assetId,
    requestedPrincipalMinor: "12000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2
  };
  const agentPayload = {
    authorityId: mandate.mandateId,
    assetId,
    requestedPrincipalMinor: "12000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2
  };
  const handler = requestCreditIntentCommandHandler();
  const common = {
    client: {},
    now,
    requestId: "request_credit_intent_001",
    correlationId: "correlation_credit_intent_001"
  };
  const humanRepository = repository({ subject: humanSubject, principal: humanPrincipal, authority: consent });
  const humanPlan = await handler.plan({
    ...common,
    coreRepository: humanRepository,
    payload: humanPayload,
    authenticationContext: { actorId: "actor_human_credit", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "subject", resourceId: humanSubject.subjectId }
  });
  const agentPlan = await handler.plan({
    ...common,
    coreRepository: repository({ subject: agentSubject, principal: agentPrincipal, authority: mandate }),
    payload: agentPayload,
    authenticationContext: { actorId: "actor_agent_credit", actorType: ActorType.AGENT },
    authorizationDecision: { resourceType: "subject", resourceId: agentSubject.subjectId }
  });
  const humanIntent = humanPlan.response.creditIntent;
  const agentIntent = agentPlan.response.creditIntent;
  assert.deepEqual(Object.keys(humanIntent), Object.keys(agentIntent));
  assert.equal(humanIntent.authorityType, "consent");
  assert.equal(agentIntent.authorityType, "mandate");
  assert.equal(humanIntent.sandboxOnly, true);
  assert.equal(agentIntent.productionFundsRequested, false);
  assert.deepEqual(humanPlan.resourceBaselines, { credit_intents: 0 });
  assert.equal(humanPlan.authorizationResource.resourceType, "credit_intent");

  const view = await readCreditApplicationQueryHandler().execute({
    client: {},
    coreRepository: {
      async getProjectionInTransaction(_client, type, id, options) {
        assert.equal(type, CoreProjectionType.CREDIT_INTENT);
        assert.equal(id, humanIntent.creditIntentId);
        assert.deepEqual(options, { lock: false });
        return humanPlan.writes[0].value;
      },
      async findRiskDecisionByCreditIntentInTransaction() {
        return undefined;
      },
      async findCreditOfferByIntentInTransaction() {
        return undefined;
      }
    },
    resource: { resourceType: "credit_intent", resourceId: humanIntent.creditIntentId },
    payload: {}
  });
  assert.equal(view.creditIntent.creditIntentHash, humanIntent.creditIntentHash);
  assert.equal(view.decision, null);
  assert.equal(view.offer, null);

  const adapter = createPostgresTenantLivePolicyAdapter({
    client: { query: async () => ({}) },
    coreRepository: humanRepository,
    handler,
    payload: humanPayload
  });
  assert.deepEqual(await adapter.evaluate({
    policy: {
      operationId: "pilotRequestCredit",
      liveChecks: ["credit_authority", "risk", "cap", "freeze"]
    },
    resource: { resourceType: "subject", resourceId: humanSubject.subjectId },
    authenticationContext: { actorType: ActorType.HUMAN },
    now
  }), {
    liveStateVersion: 10,
    evaluatedChecks: ["credit_authority", "risk", "cap", "freeze"]
  });

  await assert.rejects(
    () => handler.plan({
      ...common,
      coreRepository: repository({
        subject: humanSubject,
        principal: humanPrincipal,
        authority: consent,
        risk: { adverseObligationCount: 1, liveStateVersion: 2 }
      }),
      payload: humanPayload,
      authenticationContext: { actorId: "actor_human_credit", actorType: ActorType.HUMAN },
      authorizationDecision: { resourceType: "subject", resourceId: humanSubject.subjectId }
    }),
    (error) => error.code === "credit_risk_state_rejected"
  );
});

test("Agent self-evaluation atomically plans one Decision, Offer, and decided Intent", async () => {
  const now = new Date("2026-07-15T00:00:00.000Z");
  const assetId = "urn:ipo-one:sandbox-asset:usd-cent";
  const intent = createCreditIntent({
    subjectId: "subject_agent_decision",
    principalId: "principal_agent_decision",
    authorityType: CreditAuthorityType.MANDATE,
    authorityRef: "mandate_agent_decision",
    assetId,
    requestedPrincipalMinor: "12000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2,
    now: new Date("2026-07-14T00:00:00.000Z")
  });
  const mandate = {
    mandateId: intent.authorityRef,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    status: "draft",
    capabilities: ["request_credit"],
    assetIds: [assetId],
    perActionLimitMinor: "50000",
    aggregateLimitMinor: "50000",
    utilizedMinor: "0",
    validFrom: "2026-07-14T00:00:00.000Z",
    expiresAt: "2027-01-14T00:00:00.000Z"
  };
  const evidencedState = (value, aggregateVersion, suffix) => ({
    aggregateVersion,
    value,
    entityHash: `0x${suffix.repeat(64)}`,
    sourceEventId: `credit_event_evidence_${suffix}`,
    sourceEvidenceHash: `0x${suffix.repeat(64)}`,
    sourceFinality: "finalized"
  });
  const values = new Map([
    [`credit_intent:${intent.creditIntentId}`, evidencedState(intent, 1, "1")],
    [`subject:${intent.subjectId}`, {
      ...evidencedState({
        subjectId: intent.subjectId,
        subjectType: "agent",
        primaryPrincipalId: intent.principalId,
        status: "active"
      }, 2, "2")
    }],
    [`principal:${intent.principalId}`, evidencedState(
      { principalId: intent.principalId, status: "active" },
      1,
      "3"
    )],
    [`mandate:${mandate.mandateId}`, evidencedState(mandate, 1, "4")]
  ]);
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id) {
      return values.get(`${type}:${id}`);
    },
    async findRiskDecisionByCreditIntentInTransaction() { return undefined; },
    async findCreditOfferByIntentInTransaction() { return undefined; },
    async getCreditApplicationRiskStateInTransaction() {
      return {
        adverseObligationCount: 0,
        frozenCreditLineCount: 0,
        liveStateVersion: 1,
        queryVersion: "credit-application-risk-state.v1",
        stateHash: `0x${"5".repeat(64)}`
      };
    },
    async countCreditDecisionsForCapacityInTransaction() { return 0; }
  };
  const plan = await evaluateCreditApplicationCommandHandler().plan({
    client: {},
    coreRepository,
    payload: {},
    authenticationContext: { actorId: "actor_agent_decision", actorType: ActorType.AGENT },
    authorizationDecision: { resourceType: "credit_intent", resourceId: intent.creditIntentId },
    now,
    requestId: "request-evaluate-agent-001",
    correlationId: "correlation-evaluate-agent-001"
  });
  assert.equal(plan.response.creditIntent.status, "decided");
  assert.equal(plan.response.decision.status, "approved");
  assert.equal(plan.response.decision.decisionPassport.featureSetVersion,
    "credit-application-evidence-features.v1");
  assert.equal(plan.response.schemaVersion, "tenant_credit_application_evaluated.v2");
  assert.equal(plan.response.offer.annualRateBps, 900);
  assert.equal(plan.response.offer.originationFeeMinor, "0");
  assert.equal(plan.events.length, 3);
  assert.deepEqual(plan.resourceBaselines, { credit_decisions: 0 });
  assert.deepEqual(plan.authorizationResource, {
    resourceType: "credit_offer",
    resourceId: plan.response.offer.creditOfferId,
    actorBindings: [{
      actorId: "actor_agent_decision",
      actorType: ActorType.AGENT,
      relationship: "owner"
    }]
  });
  assert.deepEqual(plan.writes.map((write) => write.type), [
    CoreProjectionType.CREDIT_INTENT,
    CoreProjectionType.RISK_DECISION,
    CoreProjectionType.CREDIT_OFFER
  ]);
});

test("only the exact Human controller can plan sandbox Mandate activation", async () => {
  const now = new Date("2026-07-15T00:00:00.000Z");
  const mandate = createMandate({
    principalId: "principal_activation",
    subjectId: "subject_activation",
    capabilities: [
      MandateCapability.REQUEST_CREDIT,
      MandateCapability.ACCEPT_CREDIT_OFFER,
      MandateCapability.EXECUTE_SANDBOX_CREDIT
    ],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "10000",
    aggregateLimitMinor: "50000",
    validFrom: "2026-07-14T00:00:00.000Z",
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-activation-gateway-0001",
    termsRef: "urn:ipo.one:terms:mandate-activation-gateway:v1",
    now: new Date("2026-07-14T00:00:00.000Z")
  });
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id) {
      if (type === CoreProjectionType.MANDATE && id === mandate.mandateId) {
        return { aggregateVersion: 1, value: mandate };
      }
      if (type === CoreProjectionType.SUBJECT && id === mandate.subjectId) {
        return {
          aggregateVersion: 2,
          value: {
            subjectId: mandate.subjectId,
            subjectType: "agent",
            primaryPrincipalId: mandate.principalId,
            status: "active"
          }
        };
      }
      if (type === CoreProjectionType.PRINCIPAL && id === mandate.principalId) {
        return { aggregateVersion: 1, value: { principalId: mandate.principalId, status: "active" } };
      }
      return undefined;
    }
  };
  const directory = {
    async listActiveResourceBindings() {
      return [
        { relationship: "controller", actorType: ActorType.HUMAN, actorId: "actor_controller" },
        {
          relationship: "subject",
          actorType: ActorType.AGENT,
          actorId: "actor_agent",
          controllerActorId: "actor_controller"
        }
      ];
    }
  };
  const plan = await activateSandboxMandateCommandHandler().plan({
    client: {},
    coreRepository,
    directory,
    payload: {
      expectedMandateHash: mandate.mandateHash,
      acknowledgedTermsHash: mandate.termsHash,
      acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE
    },
    authenticationContext: { actorId: "actor_controller", actorType: ActorType.HUMAN },
    authorizationDecision: { resourceType: "mandate", resourceId: mandate.mandateId },
    now,
    requestId: "request-activate-mandate-001",
    correlationId: "correlation-activate-mandate-001"
  });
  assert.equal(plan.response.mandate.status, "active");
  assert.equal(plan.response.mandate.productionAuthority, false);
  assert.equal(plan.writes[0].value.activationAcknowledgement.activatedByActorId, "actor_controller");

  await assert.rejects(() => activateSandboxMandateCommandHandler().plan({
    client: {},
    coreRepository,
    directory,
    payload: {
      expectedMandateHash: mandate.mandateHash,
      acknowledgedTermsHash: mandate.termsHash,
      acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE
    },
    authenticationContext: { actorId: "actor_agent", actorType: ActorType.AGENT },
    authorizationDecision: { resourceType: "mandate", resourceId: mandate.mandateId },
    now,
    requestId: "request-activate-mandate-002",
    correlationId: "correlation-activate-mandate-002"
  }), (error) => error.code === "tenant_resource_unavailable");
});

test("Tenant risk query returns only bounded aggregate portfolio data", async () => {
  const now = new Date("2026-07-14T02:00:00.000Z");
  const portfolio = {
    subjects: {
      totalCount: 1,
      pendingCount: 1,
      activeCount: 0,
      suspendedCount: 0,
      closedCount: 0
    },
    creditLines: {
      totalCount: 0,
      requestedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      frozenCount: 0,
      closedCount: 0,
      limitMinor: "0",
      utilizedMinor: "0"
    },
    obligations: {
      totalCount: 0,
      openCount: 0,
      createdCount: 0,
      activeCount: 0,
      partiallyRepaidCount: 0,
      fullyRepaidCount: 0,
      overdueCount: 0,
      defaultedCount: 0,
      delinquentCount: 0,
      restructuredCount: 0,
      repurchasedCount: 0,
      writtenOffCount: 0,
      closedCount: 0,
      principalMinor: "0",
      outstandingPrincipalMinor: "0",
      accruedFeesMinor: "0",
      repaidAmountMinor: "0",
      writtenOffPrincipalMinor: "0",
      writtenOffInterestMinor: "0",
      writtenOffFeesMinor: "0"
    },
    assetExposures: [],
    hasMoreAssetExposures: false
  };
  const calls = [];
  const coreRepository = {
    async getTenantRiskPortfolioInTransaction(client, options) {
      calls.push({ client, options });
      return portfolio;
    }
  };
  const client = {};
  const result = await readTenantRiskPortfolioQueryHandler().execute({
    client,
    coreRepository,
    authorizationDecision: {
      resourceType: "risk_portfolio",
      resourceId: "risk_portfolio_gateway_test"
    },
    payload: {},
    now
  });
  assert.deepEqual(calls, [{ client, options: { assetLimit: 50 } }]);
  assert.deepEqual(result, {
    portfolioId: "risk_portfolio_gateway_test",
    asOf: now.toISOString(),
    ...portfolio,
    schemaVersion: "tenant_risk_portfolio_view.v1"
  });
  assert.equal(JSON.stringify(result).includes("subjectId"), false);

  await assert.rejects(
    () => readTenantRiskPortfolioQueryHandler().execute({
      client,
      coreRepository,
      authorizationDecision: {
        resourceType: "subject",
        resourceId: "risk_portfolio_gateway_test"
      },
      payload: {},
      now
    }),
    (error) => error.code === "tenant_resource_unavailable"
  );
  await assert.rejects(
    () => readTenantRiskPortfolioQueryHandler().execute({
      client,
      coreRepository,
      authorizationDecision: {
        resourceType: "risk_portfolio",
        resourceId: "risk_portfolio_gateway_test"
      },
      payload: { tenantId: "tenant_attacker" },
      now
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Evidence query returns a bounded redacted Obligation timeline with a stable cursor", async () => {
  const now = new Date("2026-07-14T02:00:00.000Z");
  const obligationId = "obligation_evidence_alpha";
  const calls = [];
  const rows = [1, 2].map((version) => ({
    evidenceId: `event_evidence_${version}`,
    evidenceHash: "0x" + String(version).repeat(64),
    eventType: version === 1 ? "obligation_created" : "sandbox_obligation_executed",
    aggregateType: "obligation",
    aggregateId: obligationId,
    aggregateVersion: version,
    obligationId,
    sourceFinality: "finalized",
    payloadHash: "0x" + String(version + 2).repeat(64),
    occurredAt: `2026-07-14T00:00:0${version}.000Z`,
    recordedAt: `2026-07-14T00:00:0${version}.100Z`,
    schemaVersion: "evidence_event.v2",
    payload: { mustNotLeak: true },
    actorRef: "must-not-leak",
    idempotencyKey: "must-not-leak"
  }));
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id) {
      assert.equal(type, CoreProjectionType.OBLIGATION);
      return id === obligationId ? { value: { obligationId } } : undefined;
    },
    async listObligationEvidenceInTransaction(client, options) {
      calls.push({ client, options });
      return options.afterEvidenceId === undefined ? rows : rows.slice(1);
    }
  };
  const client = {};
  const first = await readObligationEvidenceQueryHandler().execute({
    client,
    coreRepository,
    authorizationDecision: { resourceType: "evidence", resourceId: obligationId },
    payload: { limit: 1 },
    now
  });
  assert.equal(first.items.length, 1);
  assert.equal(first.hasMore, true);
  assert.match(first.nextCursor, /^[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(first).includes("mustNotLeak"), false);
  assert.equal(JSON.stringify(first).includes("actorRef"), false);
  assert.equal(JSON.stringify(first).includes("idempotencyKey"), false);

  const owned = await readObligationEvidenceQueryHandler({
    operationId: "pilotReadOwnObligationEvidence"
  }).execute({
    client,
    coreRepository,
    authorizationDecision: { resourceType: "evidence", resourceId: obligationId },
    payload: { limit: 1 },
    now
  });
  assert.deepEqual(owned.items, first.items);
  assert.equal(owned.obligationId, first.obligationId);
  assert.equal(owned.asOf, first.asOf);
  assert.equal(owned.hasMore, first.hasMore);
  assert.equal(owned.nextCursor, first.nextCursor);
  assert.equal(owned.schemaVersion, "tenant_owned_obligation_evidence_view.v1");

  const second = await readObligationEvidenceQueryHandler().execute({
    client,
    coreRepository,
    authorizationDecision: { resourceType: "evidence", resourceId: obligationId },
    payload: { limit: 1, cursor: first.nextCursor },
    now
  });
  assert.equal(second.items[0].evidenceId, "event_evidence_2");
  assert.equal(second.hasMore, false);
  assert.equal(Object.hasOwn(second, "nextCursor"), false);
  assert.equal(calls[0].options.limit, 2);
  assert.equal(calls[2].options.afterEvidenceId, "event_evidence_1");

  await assert.rejects(
    () => readObligationEvidenceQueryHandler().execute({
      client,
      coreRepository,
      authorizationDecision: { resourceType: "evidence", resourceId: obligationId },
      payload: { limit: 51 },
      now
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("protective Subject freeze plans one reason-coded terminal restriction", async () => {
  const now = new Date("2026-07-14T02:00:00.000Z");
  const subject = {
    subjectId: "subject_freeze_alpha",
    subjectHash: "0x" + "f".repeat(64),
    subjectType: "agent",
    displayName: "Freeze Test Agent",
    primaryPrincipalId: "principal_freeze_alpha",
    status: "active",
    riskTier: "tier_2",
    metadataRef: undefined,
    prototypeOnly: false,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    schemaVersion: "subject.v1"
  };
  const handler = freezeAgentSubjectCommandHandler();
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type, id, options) {
      assert.equal(type, CoreProjectionType.SUBJECT);
      assert.equal(id, subject.subjectId);
      assert.deepEqual(options, { lock: true });
      return { aggregateVersion: 7, value: subject };
    }
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    payload: {},
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_risk_operator",
      actorType: ActorType.RISK_OPERATOR
    },
    authorizationDecision: { resourceType: "subject", resourceId: subject.subjectId },
    reasonCode: "risk_limit_breach",
    now,
    requestId: "request_freeze_subject_001",
    correlationId: "correlation_freeze_subject_001"
  });
  assert.equal(plan.aggregateType, "subject");
  assert.equal(plan.events[0].expectedVersion, 7);
  assert.equal(plan.events[0].event.eventType, "subject_status_changed");
  assert.equal(plan.events[0].event.payload.previousStatus, "active");
  assert.equal(plan.events[0].event.payload.nextStatus, "suspended");
  assert.equal(plan.events[0].event.payload.reasonCode, "risk_limit_breach");
  assert.equal(plan.writes[0].value.status, "suspended");
  assert.deepEqual(plan.response, {
    subjectId: subject.subjectId,
    subjectHash: subject.subjectHash,
    previousStatus: "active",
    status: "suspended",
    reasonCode: "risk_limit_breach",
    updatedAt: now.toISOString(),
    schemaVersion: "tenant_agent_subject_frozen.v1"
  });
  assert.equal(Object.hasOwn(plan, "authorizationResourceTransition"), false);

  await assert.rejects(
    () => handler.plan({
      client: {},
      coreRepository,
      payload: { unfreeze: true },
      authenticationContext: { actorId: "actor_risk_operator" },
      authorizationDecision: { resourceType: "subject", resourceId: subject.subjectId },
      reasonCode: "operator_request",
      now,
      requestId: "request_freeze_subject_002",
      correlationId: "correlation_freeze_subject_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Agent Subject plan binds Human controller and Agent subject without caller Tenant authority", async () => {
  const handler = createAgentSubjectCommandHandler();
  const coreRepository = {
    countAgentSubjectsForCapacityInTransaction: async () => 7,
    findPrincipalByHashInTransaction: async () => undefined
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    payload: {
      subjectActorId: "actor_agent_alpha",
      displayName: "Alpha Treasury Agent",
      jurisdiction: "US"
    },
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    now: new Date("2026-07-14T00:00:00.000Z"),
    requestId: "request_create_agent_001",
    correlationId: "correlation_create_agent_001"
  });
  assert.equal(plan.aggregateType, "subject");
  assert.equal(plan.events.length, 2);
  assert.equal(plan.writes.length, 2);
  assert.equal(plan.response.subjectType, "agent");
  assert.deepEqual(handler.resourceDeltas(), { agent_subjects: 1 });
  assert.deepEqual(plan.resourceBaselines, { agent_subjects: 7 });
  assert.deepEqual(plan.authorizationResource.actorBindings, [
    { actorId: "actor_human_owner", actorType: ActorType.HUMAN, relationship: "controller" },
    {
      actorId: "actor_agent_alpha",
      actorType: ActorType.AGENT,
      relationship: "subject",
      controllerActorId: "actor_human_owner"
    }
  ]);
  await assert.rejects(
    () => handler.plan({
      client: {},
      coreRepository,
      payload: {
        tenantId: "tenant_attacker",
        subjectActorId: "actor_agent_alpha",
        displayName: "Alpha"
      },
      authenticationContext: {
        tenantId: "tenant_gateway_test",
        actorId: "actor_human_owner",
        actorType: ActorType.HUMAN
      },
      now: new Date("2026-07-14T00:00:00.000Z"),
      requestId: "request_create_agent_002",
      correlationId: "correlation_create_agent_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Human self-service creates one pseudonymous prototype Subject and returns bounded summaries", async () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const handler = createHumanSubjectCommandHandler();
  const coreRepository = {
    async findPrincipalByHashInTransaction() {
      return undefined;
    },
    async findHumanSubjectByPrincipalInTransaction() {
      return undefined;
    }
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    payload: {},
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_borrower",
      actorType: ActorType.HUMAN
    },
    now,
    requestId: "request_create_human_001",
    correlationId: "correlation_create_human_001"
  });
  assert.equal(plan.response.subjectType, "human");
  assert.equal(plan.response.prototypeOnly, true);
  assert.equal(plan.writes[0].value.principalType, "human_self");
  assert.equal(plan.writes[1].value.displayName, "Human Credit Profile");
  assert.equal(plan.writes[1].value.prototypeOnly, true);
  assert.deepEqual(plan.authorizationResource.actorBindings, [{
    actorId: "actor_human_borrower",
    actorType: ActorType.HUMAN,
    relationship: "owner"
  }]);
  assert.equal(JSON.stringify(plan).includes("actor_human_borrower"), true);
  assert.equal(JSON.stringify(plan).includes("tenant_gateway_test"), false);

  await assert.rejects(
    () => handler.plan({
      client: {},
      coreRepository,
      payload: { displayName: "Sensitive Human Name" },
      authenticationContext: {
        tenantId: "tenant_gateway_test",
        actorId: "actor_human_borrower",
        actorType: ActorType.HUMAN
      },
      now,
      requestId: "request_create_human_002",
      correlationId: "correlation_create_human_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );

  const subject = plan.writes[1].value;
  const view = await readHumanSelfQueryHandler().execute({
    client: {},
    coreRepository: {
      async getProjectionInTransaction() {
        return subject;
      },
      async listConsentRecordsForSubjectInTransaction() {
        return {
          items: [{
            consentId: "consent_human_001",
            consentHash: "0x" + "a".repeat(64),
            termsHash: "0x" + "b".repeat(64),
            dataUsageHash: "0x" + "c".repeat(64),
            status: "active",
            purposes: ["credit_application"],
            allowedAssetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
            allowedCreditPurposeCodes: ["working_capital"],
            allowedRepaymentFrequencies: ["monthly"],
            maxRequestedPrincipalMinor: "10000",
            maxRequestedTermDays: 30,
            maxInstallmentCount: 1,
            termsRef: "urn:must-not-leak:terms",
            dataUsageRef: "urn:must-not-leak:data",
            validFrom: now.toISOString(),
            expiresAt: "2026-08-14T00:00:00.000Z",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
          }],
          hasMore: false
        };
      },
      async listHumanIdentityReferencesForSubjectInTransaction() {
        return {
          items: [{
            identityReferenceId: "identity_reference_human_001",
            identityReferenceHash: "0x" + "d".repeat(64),
            referenceEvidenceHash: "0x" + "e".repeat(64),
            consentId: "consent_human_001",
            consentHash: "0x" + "a".repeat(64),
            referenceType: "kyc_vc",
            providerRef: "provider-ref-must-not-leak",
            providerVersion: "synthetic.v1",
            referenceRef: "urn:must-not-leak:reference",
            assuranceLevel: "synthetic",
            purposeCodes: ["identity_reference_use"],
            validFrom: now.toISOString(),
            expiresAt: "2026-08-14T00:00:00.000Z",
            syntheticOnly: true,
            productionVerified: false,
            status: "active",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
          }],
          hasMore: false
        };
      }
    },
    resource: { resourceType: "subject", resourceId: subject.subjectId },
    payload: {}
  });
  assert.equal(view.subject.subjectType, "human");
  assert.equal(view.consents.length, 1);
  assert.equal(view.identityReferences.length, 1);
  const serialized = JSON.stringify(view);
  for (const prohibited of ["termsRef", "dataUsageRef", "providerRef", "referenceRef", "must-not-leak"]) {
    assert.equal(serialized.includes(prohibited), false);
  }
});

test("Human Consent lifecycle derives authority from Self state and never returns raw references", async () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const subject = {
    subjectId: "subject_human_consent",
    subjectHash: "0x" + "1".repeat(64),
    subjectType: "human",
    displayName: "Human Credit Profile",
    primaryPrincipalId: "principal_human_consent",
    status: "pending",
    riskTier: "unrated",
    prototypeOnly: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "subject.v1"
  };
  const principal = {
    principalId: subject.primaryPrincipalId,
    status: "active"
  };
  const payload = {
    purposes: ["credit_application", "identity_reference_use"],
    allowedAssetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    allowedCreditPurposeCodes: ["working_capital"],
    allowedRepaymentFrequencies: ["monthly"],
    maxRequestedPrincipalMinor: "25000",
    maxRequestedTermDays: 90,
    maxInstallmentCount: 3,
    termsRef: "urn:ipo.one:terms:human-credit-sandbox:v1",
    termsVersion: "human_credit_terms.v1",
    dataUsageRef: "urn:ipo.one:data-usage:human-credit-sandbox:v1",
    dataUsageVersion: "human_credit_data_usage.v1",
    disclosureRef: "urn:ipo.one:disclosure:no-real-funds:v1",
    validFrom: now.toISOString(),
    expiresAt: "2026-10-14T00:00:00.000Z"
  };
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type) {
      if (type === CoreProjectionType.SUBJECT) return { aggregateVersion: 2, value: subject };
      if (type === CoreProjectionType.PRINCIPAL) return { aggregateVersion: 1, value: principal };
      throw new Error(`unexpected projection type: ${type}`);
    },
    async findConsentRecordByHashInTransaction() {
      return undefined;
    }
  };
  const createPlan = await createConsentCommandHandler().plan({
    client: {},
    coreRepository,
    payload,
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_borrower",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: { resourceType: "subject", resourceId: subject.subjectId },
    now,
    requestId: "request_create_consent_001",
    correlationId: "correlation_create_consent_001"
  });
  const consent = createPlan.writes[0].value;
  assert.equal(consent.subjectId, subject.subjectId);
  assert.equal(consent.principalId, principal.principalId);
  assert.equal(consent.sandboxOnly, true);
  assert.equal(consent.productionAuthority, false);
  assert.equal(createPlan.events[0].event.eventType, "consent_recorded");
  assert.deepEqual(createPlan.authorizationResource.actorBindings, [{
    actorId: "actor_human_borrower",
    actorType: ActorType.HUMAN,
    relationship: "owner"
  }]);
  assert.equal(JSON.stringify(createPlan.response).includes("termsRef"), false);
  assert.equal(JSON.stringify(createPlan.response).includes("dataUsageRef"), false);

  const consentView = await readConsentQueryHandler().execute({
    client: {},
    coreRepository: {
      async getProjectionInTransaction(_client, type, id, options) {
        assert.equal(type, CoreProjectionType.CONSENT_RECORD);
        assert.equal(id, consent.consentId);
        assert.deepEqual(options, { lock: false });
        return consent;
      }
    },
    resource: { resourceType: "consent", resourceId: consent.consentId },
    payload: {}
  });
  assert.equal(consentView.consent.consentId, consent.consentId);
  assert.equal(consentView.schemaVersion, "tenant_consent_view.v1");

  const revokePlan = await revokeConsentCommandHandler().plan({
    client: {},
    coreRepository: {
      async getProjectionStateInTransaction(_client, type, id, options) {
        assert.equal(type, CoreProjectionType.CONSENT_RECORD);
        assert.equal(id, consent.consentId);
        assert.deepEqual(options, { lock: true });
        return { aggregateVersion: 1, value: consent };
      }
    },
    payload: {},
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_borrower",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: { resourceType: "consent", resourceId: consent.consentId },
    reasonCode: "human_withdrawal",
    now: new Date("2026-07-14T01:00:00.000Z"),
    requestId: "request_revoke_consent_001",
    correlationId: "correlation_revoke_consent_001"
  });
  assert.equal(revokePlan.events[0].expectedVersion, 1);
  assert.equal(revokePlan.events[0].event.eventType, "consent_status_changed");
  assert.equal(revokePlan.writes[0].value.status, "revoked");
  assert.equal(revokePlan.response.reasonCode, "human_withdrawal");
  assert.equal(Object.hasOwn(revokePlan, "authorizationResourceTransition"), false);
  assert.equal(JSON.stringify(revokePlan.response).includes("revocationEvidenceRef"), false);

  const identityReference = {
    identityReferenceId: "identity_ref_human_consent",
    identityReferenceHash: "0x" + "2".repeat(64),
    referenceEvidenceHash: "0x" + "3".repeat(64),
    subjectId: subject.subjectId,
    principalId: principal.principalId,
    consentId: consent.consentId,
    consentHash: consent.consentHash,
    referenceType: "kyc_reference",
    providerRef: "urn:must-not-leak:provider",
    providerVersion: "synthetic_provider.v1",
    referenceRef: "urn:must-not-leak:identity-evidence",
    assuranceLevel: "synthetic_provider_asserted",
    purposeCodes: ["identity_reference_use"],
    validFrom: now.toISOString(),
    expiresAt: "2026-10-14T00:00:00.000Z",
    syntheticOnly: true,
    productionVerified: false,
    status: "active",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    schemaVersion: "human_identity_reference.v1"
  };
  const identityView = await readHumanIdentityReferenceQueryHandler().execute({
    client: {},
    coreRepository: {
      async getProjectionInTransaction() {
        return identityReference;
      }
    },
    resource: {
      resourceType: "human_identity_reference",
      resourceId: identityReference.identityReferenceId
    },
    payload: {}
  });
  assert.equal(identityView.identityReference.identityReferenceId, identityReference.identityReferenceId);
  const serializedIdentity = JSON.stringify(identityView);
  for (const prohibited of ["providerRef", "referenceRef", "must-not-leak"]) {
    assert.equal(serializedIdentity.includes(prohibited), false);
  }
});

test("draft Mandate normalizes bounded terms and derives all authority from durable state", async () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const payload = {
    capabilities: ["provider_spend", "request_credit"],
    allowedProviderIds: ["provider_alpha"],
    allowedCategories: ["compute"],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "100",
    aggregateLimitMinor: "1000",
    validFrom: now.toISOString(),
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-nonce-alpha-0001",
    termsRef: "urn:ipo.one:terms:mandate-alpha:v1"
  };
  const handler = createDraftMandateCommandHandler();
  const coreRepository = {
    async getProjectionStateInTransaction(_client, type) {
      if (type === CoreProjectionType.SUBJECT) {
        return {
          aggregateVersion: 1,
          value: {
            subjectId: "subject_alpha",
            subjectType: "agent",
            primaryPrincipalId: "principal_owner",
            status: "pending"
          }
        };
      }
      return {
        aggregateVersion: 1,
        value: { principalId: "principal_owner", status: "active" }
      };
    },
    findMandateByPrincipalNonceInTransaction: async () => undefined,
    countMandatesForCapacityInTransaction: async () => 3
  };
  const directory = {
    async listActiveResourceBindings() {
      return [
        {
          actorId: "actor_human_owner",
          actorType: ActorType.HUMAN,
          relationship: "controller",
          version: 1
        },
        {
          actorId: "actor_agent_alpha",
          actorType: ActorType.AGENT,
          relationship: "subject",
          controllerActorId: "actor_human_owner",
          version: 1
        }
      ];
    }
  };
  const plan = await handler.plan({
    client: {},
    coreRepository,
    directory,
    payload,
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: { resourceType: "subject", resourceId: "subject_alpha" },
    now,
    requestId: "request_mandate_001",
    correlationId: "correlation_mandate_001"
  });
  assert.equal(plan.writes[0].value.subjectId, "subject_alpha");
  assert.equal(plan.writes[0].value.principalId, "principal_owner");
  assert.equal(plan.writes[0].value.status, "draft");
  assert.deepEqual(plan.writes[0].value.capabilities, ["provider_spend", "request_credit"]);
  assert.deepEqual(handler.resourceDeltas(), { mandates: 1 });
  assert.deepEqual(plan.resourceBaselines, { mandates: 3 });
  assert.deepEqual(plan.authorizationResource.actorBindings, [
    { actorId: "actor_human_owner", actorType: ActorType.HUMAN, relationship: "controller" },
    {
      actorId: "actor_agent_alpha",
      actorType: ActorType.AGENT,
      relationship: "subject",
      controllerActorId: "actor_human_owner"
    }
  ]);

  assert.throws(
    () => normalizeDraftMandatePayload({ ...payload, subjectId: "subject_attacker" }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      capabilities: ["request_credit"],
      allowedProviderIds: ["provider_alpha"]
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      termsRef: "https://user@example.com/mandate"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      termsRef: "https://example.com/mandate?tenant=secret"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  assert.throws(
    () => normalizeDraftMandatePayload({
      ...payload,
      validFrom: "2026-08-14T00:00:00.000Z"
    }, now),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("draft Mandate management reads exact state and plans terminal resource closure", async () => {
  const now = new Date("2026-07-14T01:00:00.000Z");
  const mandate = {
    mandateId: "mandate_alpha",
    mandateHash: "0x" + "a".repeat(64),
    principalId: "principal_owner",
    subjectId: "subject_alpha",
    capabilities: ["request_credit", "provider_spend"],
    allowedProviderIds: ["provider_alpha"],
    allowedCategories: ["compute"],
    assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
    perActionLimitMinor: "100",
    aggregateLimitMinor: "1000",
    utilizedMinor: "0",
    validFrom: "2026-07-14T00:00:00.000Z",
    expiresAt: "2027-01-14T00:00:00.000Z",
    nonce: "mandate-nonce-alpha-0001",
    termsRef: "urn:ipo.one:terms:mandate-alpha:v1",
    status: "draft",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    schemaVersion: "mandate.v2"
  };
  const reads = [];
  const coreRepository = {
    async getProjectionInTransaction(_client, type, id, options) {
      reads.push({ kind: "read", type, id, options });
      return mandate;
    },
    async getProjectionStateInTransaction(_client, type, id, options) {
      reads.push({ kind: "state", type, id, options });
      return { aggregateVersion: 4, value: mandate };
    }
  };
  const resource = { resourceType: "mandate", resourceId: mandate.mandateId };
  const view = await readMandateQueryHandler().execute({
    client: {},
    coreRepository,
    resource,
    payload: {}
  });
  assert.equal(view.schemaVersion, "tenant_mandate_view.v1");
  assert.deepEqual(view.mandate, mandate);
  assert.notEqual(view.mandate.capabilities, mandate.capabilities);

  const plan = await revokeDraftMandateCommandHandler().plan({
    client: {},
    coreRepository,
    payload: {},
    authenticationContext: {
      tenantId: "tenant_gateway_test",
      actorId: "actor_human_owner",
      actorType: ActorType.HUMAN
    },
    authorizationDecision: {
      resourceType: "mandate",
      resourceId: mandate.mandateId,
      resourceVersion: 3
    },
    reasonCode: "operator_request",
    now,
    requestId: "request_revoke_mandate_001",
    correlationId: "correlation_revoke_mandate_001"
  });
  assert.equal(plan.aggregateType, "mandate");
  assert.equal(plan.aggregateId, mandate.mandateId);
  assert.equal(plan.events[0].expectedVersion, 4);
  assert.equal(plan.events[0].event.eventType, "mandate_status_changed");
  assert.equal(plan.events[0].event.payload.previousStatus, "draft");
  assert.equal(plan.events[0].event.payload.nextStatus, "revoked");
  assert.equal(plan.events[0].event.payload.reasonCode, "operator_request");
  assert.equal(plan.writes[0].value.status, "revoked");
  assert.equal(plan.response.status, "revoked");
  assert.deepEqual(plan.authorizationResourceTransition, {
    resourceType: "mandate",
    resourceId: mandate.mandateId,
    expectedStatus: "active",
    nextStatus: "closed",
    expectedVersion: 3
  });
  assert.deepEqual(reads, [
    { kind: "read", type: CoreProjectionType.MANDATE, id: mandate.mandateId, options: { lock: false } },
    { kind: "state", type: CoreProjectionType.MANDATE, id: mandate.mandateId, options: { lock: true } }
  ]);

  await assert.rejects(
    () => revokeDraftMandateCommandHandler().plan({
      client: {},
      coreRepository,
      payload: { activate: true },
      authenticationContext: { actorId: "actor_human_owner" },
      authorizationDecision: { resourceType: "mandate", resourceId: mandate.mandateId },
      reasonCode: "operator_request",
      now,
      requestId: "request_revoke_mandate_002",
      correlationId: "correlation_revoke_mandate_002"
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

test("Human, Operator, Risk, and Agent clients inject only their verified context into one protocol", async () => {
  const calls = [];
  let authenticationContextLookups = 0;
  let networkContextLookups = 0;
  const gateway = {
    async execute(command) {
      calls.push(command);
      return { response: { accepted: true } };
    }
  };
  const humanContext = authenticationContext(ActorType.HUMAN, "actor_human_owner");
  const agentContext = authenticationContext(ActorType.AGENT, "actor_agent_alpha");
  const operatorContext = authenticationContext(ActorType.RISK_OPERATOR, "actor_risk_alpha");
  const auditorContext = authenticationContext(ActorType.AUDITOR, "actor_auditor_alpha");
  const human = new HumanTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => {
      authenticationContextLookups += 1;
      return humanContext;
    },
    networkContextProvider: async () => {
      networkContextLookups += 1;
      return { source: "trusted_test_adapter" };
    }
  });
  const agent = new AgentTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => agentContext
  });
  const operator = new OperatorTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => operatorContext
  });
  const risk = new RiskTenantQueryClient({
    gateway,
    authenticationContextProvider: async () => auditorContext
  });

  await human.createAgentSubject({
    payload: { subjectActorId: "actor_agent_alpha", displayName: "Alpha" },
    idempotencyKey: "create-agent-alpha-0001",
    requestId: "request_human_001",
    correlationId: "correlation_human_001"
  });
  await human.createDraftMandate({
    subjectId: "subject_alpha",
    payload: {
      capabilities: ["provider_spend", "request_credit"],
      allowedProviderIds: ["provider_alpha"],
      allowedCategories: ["compute"],
      assetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      perActionLimitMinor: "100",
      aggregateLimitMinor: "1000",
      validFrom: "2026-07-14T00:00:00.000Z",
      expiresAt: "2027-01-14T00:00:00.000Z",
      nonce: "mandate-nonce-alpha-0002",
      termsRef: "urn:ipo.one:terms:mandate-alpha:v1"
    },
    idempotencyKey: "create-mandate-alpha-0001",
    requestId: "request_human_002",
    correlationId: "correlation_human_002"
  });
  await human.getMandate({
    mandateId: "mandate_alpha",
    requestId: "request_human_003",
    correlationId: "correlation_human_003"
  });
  await human.revokeDraftMandate({
    mandateId: "mandate_alpha",
    reasonCode: "operator_request",
    idempotencyKey: "revoke-mandate-alpha-0001",
    requestId: "request_human_004",
    correlationId: "correlation_human_004"
  });
  await operator.freezeSubject({
    subjectId: "subject_alpha",
    reasonCode: "risk_limit_breach",
    idempotencyKey: "freeze-subject-alpha-0001",
    requestId: "request_operator_001",
    correlationId: "correlation_operator_001"
  });
  await agent.getSelf({
    subjectId: "subject_alpha",
    requestId: "request_agent_001",
    correlationId: "correlation_agent_001"
  });
  await risk.getPortfolio({
    portfolioId: "risk_portfolio_alpha",
    requestId: "request_risk_001",
    correlationId: "correlation_risk_001"
  });
  await risk.getPilotHealth({
    portfolioId: "risk_portfolio_alpha",
    requestId: "request_risk_002",
    correlationId: "correlation_risk_002"
  });

  assert.equal(calls[0].authenticationContext, humanContext);
  assert.deepEqual(calls[0].networkContext, { source: "trusted_test_adapter" });
  assert.equal(calls[0].operationId, "pilotCreateAgentSubject");
  assert.equal(calls[1].authenticationContext, humanContext);
  assert.equal(calls[1].operationId, "pilotCreateDraftMandate");
  assert.deepEqual(calls[1].resource, { resourceType: "subject", resourceId: "subject_alpha" });
  assert.equal(calls[2].operationId, "pilotReadMandate");
  assert.deepEqual(calls[2].resource, { resourceType: "mandate", resourceId: "mandate_alpha" });
  assert.equal(calls[3].operationId, "pilotRevokeDraftMandate");
  assert.equal(calls[3].reasonCode, "operator_request");
  assert.deepEqual(calls[3].payload, {});
  assert.equal(calls[4].authenticationContext, operatorContext);
  assert.equal(calls[4].operationId, "pilotFreezeSubject");
  assert.equal(calls[4].reasonCode, "risk_limit_breach");
  assert.deepEqual(calls[4].payload, {});
  assert.equal(calls[5].authenticationContext, agentContext);
  assert.equal(calls[5].operationId, "pilotReadAgentSelf");
  assert.equal(calls[6].authenticationContext, auditorContext);
  assert.equal(calls[6].operationId, "pilotReadTenantRisk");
  assert.deepEqual(calls[6].resource, {
    resourceType: "risk_portfolio",
    resourceId: "risk_portfolio_alpha"
  });
  assert.deepEqual(calls[6].payload, {});
  assert.equal(calls[7].operationId, "pilotReadPilotHealth");
  assert.deepEqual(calls[7].resource, {
    resourceType: "risk_portfolio",
    resourceId: "risk_portfolio_alpha"
  });
  assert.deepEqual(calls[7].payload, {});
  assert.equal(Object.hasOwn(calls[0], "tenantId"), false);
  assert.equal(Object.hasOwn(calls[5], "actorId"), false);
  assert.equal(calls.every((call) => call.schemaVersion === "tenant_protocol_request.v1"), true);
  assert.equal(authenticationContextLookups, 4);
  assert.equal(networkContextLookups, 4);

  const lookupsBeforeInvalidRequest = authenticationContextLookups;
  await assert.rejects(
    () => human.execute({
      operationId: "pilotCreateAgentSubject",
      payload: { subjectActorId: "actor_agent_alpha", displayName: "Alpha" },
      idempotencyKey: "create-agent-alpha-invalid-0001",
      requestId: "request_human_invalid_001",
      correlationId: "correlation_human_invalid_001",
      authenticationContext: { tenantId: "caller_controlled" }
    }),
    (error) => error.code === "invalid_tenant_protocol_request"
  );
  assert.equal(authenticationContextLookups, lookupsBeforeInvalidRequest);
  assert.equal(calls.length, 8);
});

test("Human client exposes the approved self-service Subject and Consent operations without caller authority fields", async () => {
  const calls = [];
  const context = authenticationContext(ActorType.HUMAN, "actor_human_borrower");
  const human = new HumanTenantCommandClient({
    gateway: {
      async execute(command) {
        calls.push(command);
        return { response: { accepted: true } };
      }
    },
    authenticationContextProvider: async () => context
  });
  await human.createHumanSubject({
    idempotencyKey: "create-human-self-0001",
    requestId: "request_human_self_001",
    correlationId: "correlation_human_self_001"
  });
  await human.getHumanSelf({
    subjectId: "subject_human_self",
    requestId: "request_human_self_002",
    correlationId: "correlation_human_self_002"
  });
  await human.createConsent({
    subjectId: "subject_human_self",
    payload: {
      purposes: ["credit_application", "identity_reference_use"],
      allowedAssetIds: ["urn:ipo-one:sandbox-asset:usd-cent"],
      allowedCreditPurposeCodes: ["working_capital"],
      allowedRepaymentFrequencies: ["monthly"],
      maxRequestedPrincipalMinor: "25000",
      maxRequestedTermDays: 90,
      maxInstallmentCount: 3,
      termsRef: "urn:ipo.one:terms:human-credit-sandbox:v1",
      termsVersion: "human_credit_terms.v1",
      dataUsageRef: "urn:ipo.one:data-usage:human-credit-sandbox:v1",
      dataUsageVersion: "human_credit_data_usage.v1",
      disclosureRef: "urn:ipo.one:disclosure:no-real-funds:v1",
      validFrom: "2026-07-14T00:00:00.000Z",
      expiresAt: "2026-10-14T00:00:00.000Z"
    },
    idempotencyKey: "create-human-consent-0001",
    requestId: "request_human_self_003",
    correlationId: "correlation_human_self_003"
  });
  await human.getConsent({
    consentId: "consent_human_self",
    requestId: "request_human_self_004",
    correlationId: "correlation_human_self_004"
  });
  await human.getIdentityReference({
    identityReferenceId: "identity_ref_human_self",
    requestId: "request_human_self_005",
    correlationId: "correlation_human_self_005"
  });
  await human.revokeConsent({
    consentId: "consent_human_self",
    idempotencyKey: "revoke-human-consent-0001",
    requestId: "request_human_self_006",
    correlationId: "correlation_human_self_006"
  });
  assert.equal(calls[0].operationId, "pilotCreateHumanSubject");
  assert.deepEqual(calls[0].payload, {});
  assert.equal(Object.hasOwn(calls[0], "resource"), false);
  assert.equal(calls[1].operationId, "pilotReadHumanSelf");
  assert.deepEqual(calls[1].resource, {
    resourceType: "subject",
    resourceId: "subject_human_self"
  });
  assert.equal(calls[2].operationId, "pilotCreateConsent");
  assert.deepEqual(calls[2].resource, {
    resourceType: "subject",
    resourceId: "subject_human_self"
  });
  assert.equal(calls[3].operationId, "pilotReadConsent");
  assert.deepEqual(calls[3].resource, {
    resourceType: "consent",
    resourceId: "consent_human_self"
  });
  assert.equal(calls[4].operationId, "pilotReadIdentityReference");
  assert.deepEqual(calls[4].resource, {
    resourceType: "human_identity_reference",
    resourceId: "identity_ref_human_self"
  });
  assert.equal(calls[5].operationId, "pilotRevokeConsent");
  assert.equal(calls[5].reasonCode, "human_withdrawal");
  assert.equal(calls.every((call) => call.authenticationContext === context), true);
  assert.equal(calls.some((call) => Object.hasOwn(call, "tenantId")), false);
});

test("Human and Agent clients emit the same closed credit application protocol", async () => {
  const calls = [];
  const gateway = {
    async execute(command) {
      calls.push(command);
      return { response: { accepted: true } };
    }
  };
  const human = new HumanTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => authenticationContext(ActorType.HUMAN, "actor_credit_human")
  });
  const agent = new AgentTenantCommandClient({
    gateway,
    authenticationContextProvider: async () => authenticationContext(ActorType.AGENT, "actor_credit_agent")
  });
  const commonPayload = {
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    requestedPrincipalMinor: "12000",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: "monthly",
    installmentCount: 2
  };
  await human.requestCredit({
    subjectId: "subject_credit_human",
    payload: { ...commonPayload, authorityId: "consent_credit_human" },
    idempotencyKey: "request-credit-human-0001",
    requestId: "request_credit_human_001",
    correlationId: "correlation_credit_human_001"
  });
  await agent.requestCredit({
    subjectId: "subject_credit_agent",
    payload: { ...commonPayload, authorityId: "mandate_credit_agent" },
    idempotencyKey: "request-credit-agent-0001",
    requestId: "request_credit_agent_001",
    correlationId: "correlation_credit_agent_001"
  });
  await human.getCreditApplication({
    creditIntentId: "credit_intent_human",
    requestId: "request_credit_human_002",
    correlationId: "correlation_credit_human_002"
  });
  await agent.getCreditApplication({
    creditIntentId: "credit_intent_agent",
    requestId: "request_credit_agent_002",
    correlationId: "correlation_credit_agent_002"
  });
  assert.deepEqual(calls.map((call) => call.operationId), [
    "pilotRequestCredit",
    "pilotRequestCredit",
    "pilotReadCreditApplication",
    "pilotReadCreditApplication"
  ]);
  assert.deepEqual(Object.keys(calls[0].payload), Object.keys(calls[1].payload));
  assert.deepEqual(calls[0].resource, { resourceType: "subject", resourceId: "subject_credit_human" });
  assert.deepEqual(calls[1].resource, { resourceType: "subject", resourceId: "subject_credit_agent" });
  assert.deepEqual(calls[2].resource, { resourceType: "credit_intent", resourceId: "credit_intent_human" });
  assert.deepEqual(calls[3].resource, { resourceType: "credit_intent", resourceId: "credit_intent_agent" });
  assert.equal(calls.every((call) => Object.hasOwn(call, "actorId") === false), true);
});
