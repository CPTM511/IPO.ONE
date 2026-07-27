import {
  CreditEventType,
  DomainError,
  TRADING_CAPITAL_REQUEST_SCHEMA_VERSION,
  TRADING_MATCH_PROPOSAL_SCHEMA_VERSION,
  TRADING_PROVIDER_MANDATE_SCHEMA_VERSION,
  acceptTradingMatchAsProvider,
  acceptTradingMatchAsSubject,
  createCreditEvent,
  createTradingCapitalRequest,
  createTradingMatchProposal,
  createTradingProviderMandate,
  listCompatibleTradingProviderMandates,
  tradingCapitalRequestView,
  tradingMatchProposalView,
  tradingProviderMandateView
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const OWNER_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const CAPITAL_REQUEST_KEYS = Object.freeze([
  "assetId",
  "durationDays",
  "requestedAmountMinor",
  "strategyClass",
  "templateType"
]);
const PROVIDER_MANDATE_KEYS = Object.freeze([
  "allowedStrategyClasses",
  "allowedSubjectTypes",
  "assetId",
  "maxAmountMinor",
  "maxDurationDays",
  "minAmountMinor",
  "minDurationDays",
  "supportedTemplateTypes"
]);
const MATCH_PROPOSAL_KEYS = Object.freeze([
  "mandateHash",
  "providerMandateId",
  "requestHash"
]);
const ACCEPTANCE_KEYS = Object.freeze(["proposalHash", "termsHash"]);

function unavailable() {
  throw new DomainError(
    "tenant_resource_unavailable",
    "The requested resource is not available."
  );
}

function closedPayload(payload, keys) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) unavailable();
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) unavailable();
  return payload;
}

function emptyPayload(payload) {
  return closedPayload(payload, []);
}

async function requireRelationship(directory, {
  actorId,
  resourceType,
  resourceId,
  now
}) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType,
    resourceId,
    now
  });
  const binding = bindings.find(
    (candidate) =>
      candidate.actorId === actorId &&
      OWNER_RELATIONSHIPS.has(candidate.relationship)
  );
  if (!binding) unavailable();
  return { binding, bindings };
}

function actorBindings(bindings) {
  return bindings
    .filter(({ relationship }) => OWNER_RELATIONSHIPS.has(relationship))
    .map((binding) => ({
      actorId: binding.actorId,
      actorType: binding.actorType,
      relationship: binding.relationship,
      ...(binding.controllerActorId
        ? { controllerActorId: binding.controllerActorId }
        : {})
    }));
}

async function loadState(
  client,
  coreRepository,
  type,
  resourceId,
  schemaVersion,
  { lock }
) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    type,
    resourceId,
    { lock }
  );
  if (
    !state ||
    state.value?.schemaVersion !== schemaVersion ||
    state.value?.sandboxOnly !== true ||
    state.value?.productionAuthority !== false ||
    state.value?.fundsAuthority !== false
  ) unavailable();
  return state;
}

function eventFor({
  eventType,
  aggregate,
  actorId,
  requestId,
  correlationId,
  now
}) {
  return createCreditEvent({
    eventType,
    subjectId: aggregate.subjectId,
    payload: {
      ...(aggregate.tradingCapitalRequestId
        ? {
            tradingCapitalRequestId: aggregate.tradingCapitalRequestId,
            requestHash: aggregate.requestHash,
            requestVersion: aggregate.version,
            tradingCreditProfileId: aggregate.tradingCreditProfileId,
            evidenceSnapshotHash:
              aggregate.evidenceEligibility?.evidenceSnapshotHash
          }
        : {}),
      ...(aggregate.tradingProviderMandateId
        ? {
            tradingProviderMandateId: aggregate.tradingProviderMandateId,
            mandateHash: aggregate.mandateHash,
            mandateVersion: aggregate.version,
            providerId: aggregate.providerId
          }
        : {}),
      ...(aggregate.tradingMatchProposalId
        ? {
            tradingMatchProposalId: aggregate.tradingMatchProposalId,
            proposalHash: aggregate.proposalHash,
            proposalVersion: aggregate.version,
            capitalRequestId: aggregate.capitalRequestId,
            providerMandateId: aggregate.providerMandateId,
            termsHash: aggregate.termsHash,
            status: aggregate.status,
            providerAccepted: aggregate.providerAcceptance !== null,
            subjectAccepted: aggregate.subjectAcceptance !== null,
            bilaterallyAccepted: aggregate.status === "bilaterally_accepted"
          }
        : {}),
      actorId,
      causationId: requestId,
      correlationId,
      autoAccepted: false,
      sandboxOnly: true,
      syntheticOnly: true,
      productionAuthority: false,
      fundsAuthority: false,
      realPricing: false,
      realFunding: false,
      externalSystemQueried: false
    },
    now
  });
}

export function createTradingCapitalRequestHandler() {
  return Object.freeze({
    operationId: "tradingCreateCapitalRequest",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, CAPITAL_REQUEST_KEYS);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, CAPITAL_REQUEST_KEYS);
      if (authorizationDecision.resourceType !== "trading_credit_profile") {
        unavailable();
      }
      const relationship = await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const profile = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_CREDIT_PROFILE,
        authorizationDecision.resourceId,
        "trading_credit_profile.v1",
        { lock: true }
      );
      const capitalRequest = createTradingCapitalRequest({
        tradingCreditProfile: profile.value,
        requestedByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_CAPITAL_REQUEST_CREATED,
        aggregate: capitalRequest,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_capital_request",
        aggregateId: capitalRequest.tradingCapitalRequestId,
        events: [{
          aggregateType: "trading_capital_request",
          aggregateId: capitalRequest.tradingCapitalRequestId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_CAPITAL_REQUEST,
          value: capitalRequest,
          eventId: event.eventId
        }],
        response: {
          capitalRequest: tradingCapitalRequestView(capitalRequest),
          schemaVersion: "tenant_trading_capital_request_created.v1"
        },
        authorizationResource: {
          resourceType: "trading_capital_request",
          resourceId: capitalRequest.tradingCapitalRequestId,
          actorBindings: actorBindings(relationship.bindings)
        }
      };
    }
  });
}

export function createTradingProviderMandateHandler() {
  return Object.freeze({
    operationId: "tradingCreateProviderMandate",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, PROVIDER_MANDATE_KEYS);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, PROVIDER_MANDATE_KEYS);
      if (
        authorizationDecision.resourceType !== "provider" ||
        authenticationContext.actorType !== ActorType.PROVIDER
      ) unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const provider = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PROVIDER,
        authorizationDecision.resourceId,
        { lock: true }
      );
      if (
        !provider ||
        provider.value.providerId !== authorizationDecision.resourceId ||
        provider.value.status !== "allowlisted"
      ) unavailable();
      const mandate = createTradingProviderMandate({
        provider: provider.value,
        providerActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_PROVIDER_MANDATE_CREATED,
        aggregate: mandate,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_provider_mandate",
        aggregateId: mandate.tradingProviderMandateId,
        events: [{
          aggregateType: "trading_provider_mandate",
          aggregateId: mandate.tradingProviderMandateId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_PROVIDER_MANDATE,
          value: mandate,
          eventId: event.eventId
        }],
        response: {
          providerMandate: tradingProviderMandateView(mandate),
          schemaVersion: "tenant_trading_provider_mandate_created.v1"
        },
        authorizationResource: {
          resourceType: "trading_provider_mandate",
          resourceId: mandate.tradingProviderMandateId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }]
        }
      };
    }
  });
}

export function listCompatibleTradingMandatesHandler() {
  return Object.freeze({
    operationId: "tradingListCompatibleMandates",
    kind: "query",
    async execute({
      client,
      coreRepository,
      directory,
      authenticationContext,
      resource,
      payload,
      now
    }) {
      emptyPayload(payload);
      if (resource?.resourceType !== "trading_capital_request") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const request = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_CAPITAL_REQUEST,
        resource.resourceId,
        TRADING_CAPITAL_REQUEST_SCHEMA_VERSION,
        { lock: false }
      );
      const candidates =
        await coreRepository.listTradingProviderMandatesInTransaction(
          client,
          { limit: 100 }
        );
      const verified = [];
      for (const candidate of candidates) {
        const state = await loadState(
          client,
          coreRepository,
          CoreProjectionType.TRADING_PROVIDER_MANDATE,
          candidate.tradingProviderMandateId,
          TRADING_PROVIDER_MANDATE_SCHEMA_VERSION,
          { lock: false }
        );
        verified.push(state.value);
      }
      return listCompatibleTradingProviderMandates({
        capitalRequest: request.value,
        providerMandates: verified,
        now
      });
    }
  });
}

export function createTradingMatchProposalHandler() {
  return Object.freeze({
    operationId: "tradingCreateMatchProposal",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, MATCH_PROPOSAL_KEYS);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, MATCH_PROPOSAL_KEYS);
      if (authorizationDecision.resourceType !== "trading_capital_request") {
        unavailable();
      }
      const requestRelationship = await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const request = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_CAPITAL_REQUEST,
        authorizationDecision.resourceId,
        TRADING_CAPITAL_REQUEST_SCHEMA_VERSION,
        { lock: true }
      );
      const mandate = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_PROVIDER_MANDATE,
        payload.providerMandateId,
        TRADING_PROVIDER_MANDATE_SCHEMA_VERSION,
        { lock: true }
      );
      const providerBindings = await directory.listActiveResourceBindings({
        resourceType: "trading_provider_mandate",
        resourceId: payload.providerMandateId,
        now
      });
      const providerBinding = providerBindings.find(
        ({ actorType, relationship }) =>
          actorType === ActorType.PROVIDER &&
          OWNER_RELATIONSHIPS.has(relationship)
      );
      if (!providerBinding) unavailable();
      const proposal = createTradingMatchProposal({
        capitalRequest: request.value,
        providerMandate: mandate.value,
        requestedRequestHash: payload.requestHash,
        requestedMandateHash: payload.mandateHash,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_MATCH_PROPOSAL_CREATED,
        aggregate: proposal,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      const bindings = actorBindings(requestRelationship.bindings);
      if (!bindings.some(({ actorId }) => actorId === providerBinding.actorId)) {
        bindings.push({
          actorId: providerBinding.actorId,
          actorType: providerBinding.actorType,
          relationship: "owner"
        });
      }
      return {
        aggregateType: "trading_match_proposal",
        aggregateId: proposal.tradingMatchProposalId,
        events: [{
          aggregateType: "trading_match_proposal",
          aggregateId: proposal.tradingMatchProposalId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_MATCH_PROPOSAL,
          value: proposal,
          eventId: event.eventId
        }],
        response: {
          matchProposal: tradingMatchProposalView(proposal),
          schemaVersion: "tenant_trading_match_proposal_created.v1"
        },
        authorizationResource: {
          resourceType: "trading_match_proposal",
          resourceId: proposal.tradingMatchProposalId,
          actorBindings: bindings
        }
      };
    }
  });
}

function acceptanceHandler({
  operationId,
  actorTypes,
  eventType,
  accept,
  responseSchemaVersion
}) {
  return Object.freeze({
    operationId,
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, ACCEPTANCE_KEYS);
    },
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, ACCEPTANCE_KEYS);
      if (
        authorizationDecision.resourceType !== "trading_match_proposal" ||
        !actorTypes.has(authenticationContext.actorType)
      ) unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const proposal = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_MATCH_PROPOSAL,
        authorizationDecision.resourceId,
        TRADING_MATCH_PROPOSAL_SCHEMA_VERSION,
        { lock: true }
      );
      const capitalRequest = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_CAPITAL_REQUEST,
        proposal.value.capitalRequestId,
        TRADING_CAPITAL_REQUEST_SCHEMA_VERSION,
        { lock: true }
      );
      const providerMandate = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_PROVIDER_MANDATE,
        proposal.value.providerMandateId,
        TRADING_PROVIDER_MANDATE_SCHEMA_VERSION,
        { lock: true }
      );
      const next = accept({
        proposal: proposal.value,
        capitalRequest: capitalRequest.value,
        providerMandate: providerMandate.value,
        acceptedByActorId: authenticationContext.actorId,
        acceptedProposalHash: payload.proposalHash,
        acceptedTermsHash: payload.termsHash,
        now
      });
      const event = eventFor({
        eventType,
        aggregate: next,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_match_proposal",
        aggregateId: next.tradingMatchProposalId,
        events: [{
          aggregateType: "trading_match_proposal",
          aggregateId: next.tradingMatchProposalId,
          expectedVersion: proposal.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_MATCH_PROPOSAL,
          value: next,
          eventId: event.eventId
        }],
        response: {
          matchProposal: tradingMatchProposalView(next),
          schemaVersion: responseSchemaVersion
        },
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "active",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function acceptTradingMatchAsProviderHandler() {
  return acceptanceHandler({
    operationId: "tradingAcceptMatchAsProvider",
    actorTypes: new Set([ActorType.PROVIDER]),
    eventType: CreditEventType.TRADING_MATCH_PROVIDER_ACCEPTED,
    accept: acceptTradingMatchAsProvider,
    responseSchemaVersion: "tenant_trading_match_provider_accepted.v1"
  });
}

export function acceptTradingMatchAsSubjectHandler() {
  return acceptanceHandler({
    operationId: "tradingAcceptMatchAsSubject",
    actorTypes: new Set([ActorType.HUMAN, ActorType.AGENT]),
    eventType: CreditEventType.TRADING_MATCH_SUBJECT_ACCEPTED,
    accept: acceptTradingMatchAsSubject,
    responseSchemaVersion: "tenant_trading_match_subject_accepted.v1"
  });
}

export function createTradingCapitalMatchingHandlers() {
  return Object.freeze([
    createTradingCapitalRequestHandler(),
    createTradingProviderMandateHandler(),
    listCompatibleTradingMandatesHandler(),
    createTradingMatchProposalHandler(),
    acceptTradingMatchAsProviderHandler(),
    acceptTradingMatchAsSubjectHandler()
  ]);
}
