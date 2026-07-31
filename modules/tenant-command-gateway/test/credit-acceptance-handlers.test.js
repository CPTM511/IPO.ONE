import assert from "node:assert/strict";
import test from "node:test";
import {
  ConsentPurpose,
  CreditAuthorityType,
  MandateCapability,
  RepaymentFrequency,
  SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
  activateSandboxMandate,
  createConsentRecord,
  createCreditIntent,
  createDeterministicCreditDecisionOutcome,
  createHumanIdentityReference,
  createMandate
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  acceptCreditOfferCommandHandler,
  createAuthenticatedProtocolActionConfirmation
} from "../src/index.js";

const CREATED_AT = new Date("2026-07-16T00:00:00.000Z");
const ACCEPTED_AT = new Date("2026-07-16T00:01:00.000Z");
const ASSET_ID = "urn:ipo-one:sandbox-asset:usd-cent";
const ACKNOWLEDGEMENT_HASH = `0x${"ab".repeat(32)}`;

function creditApplication(authorityType, authorityRef) {
  const submitted = createCreditIntent({
    subjectId: `subject_accept_${authorityType}`,
    principalId: `principal_accept_${authorityType}`,
    authorityType,
    authorityRef,
    assetId: ASSET_ID,
    requestedPrincipalMinor: "12001",
    purposeCode: "working_capital",
    requestedTermDays: 60,
    repaymentFrequency: RepaymentFrequency.MONTHLY,
    installmentCount: 2,
    now: CREATED_AT
  });
  const { decision, offer } = createDeterministicCreditDecisionOutcome({
    intent: submitted,
    now: CREATED_AT
  });
  return {
    intent: {
      ...submitted,
      status: "decided",
      updatedAt: CREATED_AT.toISOString()
    },
    decision,
    offer
  };
}

function humanAuthority(subjectId, principalId) {
  const consent = createConsentRecord({
    subjectId,
    principalId,
    purposes: [
      ConsentPurpose.CREDIT_APPLICATION,
      ConsentPurpose.CREDIT_DECISION,
      ConsentPurpose.CREDIT_OFFER_ACCEPTANCE,
      ConsentPurpose.OBLIGATION_SERVICING,
      ConsentPurpose.IDENTITY_REFERENCE_USE
    ],
    allowedAssetIds: [ASSET_ID],
    allowedCreditPurposeCodes: ["working_capital"],
    allowedRepaymentFrequencies: [RepaymentFrequency.MONTHLY],
    maxRequestedPrincipalMinor: "50000",
    maxRequestedTermDays: 90,
    maxInstallmentCount: 3,
    termsRef: "urn:ipo.one:sandbox:consent-terms:v1",
    termsVersion: "credit_consent_terms.v1",
    dataUsageRef: "urn:ipo.one:sandbox:data-usage:v1",
    dataUsageVersion: "credit_data_usage.v1",
    disclosureRef: "urn:ipo.one:sandbox:human-disclosure:v1",
    validFrom: CREATED_AT.toISOString(),
    expiresAt: "2026-10-16T00:00:00.000Z",
    now: CREATED_AT
  });
  const identityReference = createHumanIdentityReference({
    subjectId,
    principalId,
    consent,
    referenceType: "verifiable_credential_reference",
    providerRef: "urn:ipo.one:mock:identity-provider:v1",
    providerVersion: "mock_identity_provider.v1",
    referenceRef: "urn:ipo.one:mock:identity-evidence:acceptance:v1",
    assuranceLevel: "synthetic_provider_asserted",
    purposeCodes: [
      ConsentPurpose.IDENTITY_REFERENCE_USE,
      ConsentPurpose.CREDIT_DECISION,
      ConsentPurpose.CREDIT_OFFER_ACCEPTANCE
    ],
    validFrom: CREATED_AT.toISOString(),
    expiresAt: "2026-09-16T00:00:00.000Z",
    now: CREATED_AT
  });
  return { authority: consent, identityReference };
}

function agentAuthority(subjectId, principalId) {
  const draft = createMandate({
    principalId,
    subjectId,
    capabilities: [
      MandateCapability.REQUEST_CREDIT,
      MandateCapability.ACCEPT_CREDIT_OFFER,
      MandateCapability.EXECUTE_SANDBOX_CREDIT
    ],
    assetIds: [ASSET_ID],
    perActionLimitMinor: "50000",
    aggregateLimitMinor: "50000",
    validFrom: CREATED_AT.toISOString(),
    expiresAt: "2026-10-16T00:00:00.000Z",
    nonce: "acceptance-test-agent-nonce",
    termsRef: "urn:ipo.one:sandbox:mandate-terms:v1",
    now: CREATED_AT
  });
  return activateSandboxMandate(draft, {
    expectedMandateHash: draft.mandateHash,
    acknowledgedTermsHash: draft.termsHash,
    acknowledgementCode: SANDBOX_MANDATE_ACKNOWLEDGEMENT_CODE,
    activatedByActorId: "actor_agent_controller",
    now: new Date(CREATED_AT.getTime() + 1)
  });
}

function fixture(actorType) {
  const human = actorType === ActorType.HUMAN;
  const authorityType = human ? CreditAuthorityType.CONSENT : CreditAuthorityType.MANDATE;
  const subjectId = `subject_accept_${authorityType}`;
  const principalId = `principal_accept_${authorityType}`;
  const authorityResult = human
    ? humanAuthority(subjectId, principalId)
    : { authority: agentAuthority(subjectId, principalId) };
  const authorityId = human
    ? authorityResult.authority.consentId
    : authorityResult.authority.mandateId;
  const initial = creditApplication(authorityType, authorityId);
  const values = new Map([
    [`${CoreProjectionType.CREDIT_OFFER}:${initial.offer.creditOfferId}`, initial.offer],
    [`${CoreProjectionType.CREDIT_INTENT}:${initial.intent.creditIntentId}`, initial.intent],
    [`${CoreProjectionType.RISK_DECISION}:${initial.decision.riskDecisionId}`, initial.decision],
    [`${CoreProjectionType.SUBJECT}:${initial.intent.subjectId}`, {
      subjectId: initial.intent.subjectId,
      subjectType: human ? "human" : "agent",
      primaryPrincipalId: initial.intent.principalId,
      status: human ? "pending" : "active"
    }],
    [`${CoreProjectionType.PRINCIPAL}:${initial.intent.principalId}`, {
      principalId: initial.intent.principalId,
      status: "active"
    }],
    [`${human ? CoreProjectionType.CONSENT_RECORD : CoreProjectionType.MANDATE}:${authorityId}`,
      authorityResult.authority]
  ]);
  const repository = {
    async getProjectionStateInTransaction(_client, type, id, options) {
      assert.deepEqual(options, { lock: true });
      const value = values.get(`${type}:${id}`);
      return value ? { aggregateVersion: 1, value } : undefined;
    },
    async listHumanIdentityReferencesForSubjectInTransaction(_client, subjectId, options) {
      assert.equal(subjectId, initial.intent.subjectId);
      assert.deepEqual(options, { limit: 50 });
      return { items: [authorityResult.identityReference], hasMore: false };
    },
    async getCreditApplicationRiskStateInTransaction() {
      return { adverseObligationCount: 0, frozenCreditLineCount: 0, liveStateVersion: 3 };
    },
    async findCreditOfferAcceptanceByOfferInTransaction() { return undefined; },
    async findObligationByCreditOfferInTransaction() { return undefined; },
    async countOpenObligationsForCapacityInTransaction() { return 2; }
  };
  return {
    ...initial,
    repository,
    projectionValues: values,
    authorityId,
    authorityType,
    actorType,
    actorId: human ? "actor_human_acceptance" : "actor_agent_acceptance"
  };
}

async function planAcceptanceWith(values, actorType, payload = {}) {
  const controllerActorId = "actor_agent_controller";
  const requestId = `request_accept_${actorType}`;
  const resource = {
    resourceType: "credit_offer",
    resourceId: values.offer.creditOfferId
  };
  const businessPayload = {
    expectedOfferHash: values.offer.creditOfferHash,
    expectedTermsHash: values.offer.termsHash,
    acknowledgementHash: ACKNOWLEDGEMENT_HASH,
    ...payload
  };
  return acceptCreditOfferCommandHandler().plan({
    client: {},
    coreRepository: values.repository,
    directory: {
      async listActiveResourceBindings(input) {
        assert.deepEqual(input, {
          resourceType: "subject",
          resourceId: values.intent.subjectId,
          now: ACCEPTED_AT
        });
        return [
          {
            actorId: values.actorId,
            actorType: ActorType.AGENT,
            relationship: "subject",
            controllerActorId
          },
          {
            actorId: controllerActorId,
            actorType: ActorType.HUMAN,
            relationship: "controller"
          }
        ];
      }
    },
    payload: {
      ...businessPayload,
      actionConfirmation: createAuthenticatedProtocolActionConfirmation({
        operationId: "pilotAcceptCreditOffer",
        payload: businessPayload,
        resource,
        requestId
      })
    },
    authenticationContext: {
      actorId: values.actorId,
      actorType,
      authenticationMethod: actorType === ActorType.AGENT
        ? "private_key_jwt"
        : "oidc_pkce_bff"
    },
    authorizationDecision: resource,
    now: ACCEPTED_AT,
    requestId,
    correlationId: `correlation_accept_${actorType}`
  });
}

async function planAcceptance(actorType) {
  const values = fixture(actorType);
  const plan = await planAcceptanceWith(values, actorType);
  return { ...values, plan };
}

test("Human and Agent acceptance plans create one atomic shared Obligation contract", async () => {
  const human = await planAcceptance(ActorType.HUMAN);
  const agent = await planAcceptance(ActorType.AGENT);
  for (const { plan, offer, actorId, actorType } of [human, agent]) {
    assert.deepEqual(plan.writes.map((write) => write.type), [
      CoreProjectionType.CREDIT_OFFER_ACCEPTANCE,
      CoreProjectionType.CREDIT_OFFER,
      CoreProjectionType.OBLIGATION
    ]);
    assert.deepEqual(plan.events.map((event) => event.event.eventType), [
      "credit_offer_acceptance_recorded",
      "credit_offer_accepted",
      "obligation_created"
    ]);
    assert.equal(plan.events[1].expectedVersion, 1);
    assert.equal(plan.response.offerStatus, "accepted");
    assert.equal(plan.response.executionCreated, false);
    assert.equal(plan.response.fundsAuthority, false);
    assert.equal(plan.response.obligation.creditOfferId, offer.creditOfferId);
    assert.equal(plan.response.obligation.executionStatus, "pending");
    assert.equal(plan.response.obligation.productionFundsMoved, false);
    assert.deepEqual(plan.response.obligation.installments.map(
      (row) => row.scheduledPrincipalMinor
    ), ["6000", "6001"]);
    assert.deepEqual(plan.resourceBaselines, { open_obligations: 2 });
    const controlledActorBindings = [{ actorId, actorType, relationship: "owner" }];
    if (actorType === ActorType.AGENT) controlledActorBindings.push({
      actorId: "actor_agent_controller",
      actorType: ActorType.HUMAN,
      relationship: "controller"
    });
    assert.deepEqual(plan.authorizationResource, {
      resourceType: "obligation",
      resourceId: plan.response.obligation.obligationId,
      actorBindings: controlledActorBindings
    });
    assert.deepEqual(plan.additionalAuthorizationResources, [{
      resourceType: "evidence",
      resourceId: plan.response.obligation.obligationId,
      actorBindings: controlledActorBindings
    }]);
  }
  const economicShape = (plan) => ({
    assetId: plan.response.obligation.assetId,
    originalPrincipalMinor: plan.response.obligation.originalPrincipalMinor,
    annualRateBps: plan.response.obligation.annualRateBps,
    repaymentFrequency: plan.response.obligation.repaymentFrequency,
    installmentCount: plan.response.obligation.installmentCount,
    firstPaymentAt: plan.response.obligation.firstPaymentAt,
    maturityAt: plan.response.obligation.maturityAt,
    installmentAmounts: plan.response.obligation.installments.map(
      (row) => row.scheduledPrincipalMinor
    ),
    executionStatus: plan.response.obligation.executionStatus,
    sandboxOnly: plan.response.obligation.sandboxOnly
  });
  assert.deepEqual(economicShape(human.plan), economicShape(agent.plan));
});

test("Human and Agent Offer acceptance fail closed when either reviewed hash is stale", async () => {
  for (const actorType of [ActorType.HUMAN, ActorType.AGENT]) {
    const values = fixture(actorType);
    for (const payload of [
      { expectedOfferHash: `0x${"cd".repeat(32)}` },
      { expectedTermsHash: `0x${"ef".repeat(32)}` }
    ]) {
      await assert.rejects(
        () => planAcceptanceWith(values, actorType, payload),
        (error) => error.code === "offer_terms_mismatch"
      );
    }
  }
});

test("Human Consent and Agent Mandate must remain current at Offer acceptance", async () => {
  for (const actorType of [ActorType.HUMAN, ActorType.AGENT]) {
    const values = fixture(actorType);
    const projectionType = actorType === ActorType.HUMAN
      ? CoreProjectionType.CONSENT_RECORD
      : CoreProjectionType.MANDATE;
    const key = `${projectionType}:${values.authorityId}`;
    values.projectionValues.set(key, {
      ...structuredClone(values.projectionValues.get(key)),
      status: "revoked"
    });
    await assert.rejects(
      () => planAcceptanceWith(values, actorType),
      (error) => error.code === "authority_not_current"
    );
  }
});
