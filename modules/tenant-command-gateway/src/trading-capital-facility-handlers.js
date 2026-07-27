import {
  CreditEventType,
  DomainError,
  TRADING_FACILITY_SCHEMA_VERSION,
  TRADING_MATCH_PROPOSAL_SCHEMA_VERSION,
  TRADING_ORDER_INTENT_SCHEMA_VERSION,
  activateTradingFacility,
  cancelTradingOrderIntent,
  contributeTradingSubjectCollateral,
  createCreditEvent,
  createTradingFacility,
  evaluateTradingFacilityRisk,
  flattenTradingFacility,
  pauseTradingFacilityNewRisk,
  recordTradingProviderFunding,
  submitTradingOrderIntent,
  tradingFacilityRiskEvaluationView,
  tradingFacilityView,
  tradingOrderIntentView
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const OWNER_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const CREATE_KEYS = Object.freeze(["obligationId", "proposalHash"]);
const CONTRIBUTION_KEYS = Object.freeze([
  "amountMinor",
  "expectedStateHash",
  "expectedVersion"
]);
const STATE_KEYS = Object.freeze(["expectedStateHash", "expectedVersion"]);
const SUBMIT_ORDER_KEYS = Object.freeze([
  "direction",
  "expectedStateHash",
  "expectedVersion",
  "syntheticNotionalMinor"
]);
const CANCEL_ORDER_KEYS = Object.freeze([
  "expectedFacilityStateHash",
  "expectedFacilityVersion",
  "expectedOrderIntentHash",
  "expectedOrderVersion"
]);

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

async function loadState(
  client,
  coreRepository,
  type,
  resourceId,
  schemaVersion,
  { lock, requireTradingSafetyEnvelope = true }
) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    type,
    resourceId,
    { lock }
  );
  if (
    !state ||
    state.value?.schemaVersion !== schemaVersion
  ) unavailable();
  if (
    requireTradingSafetyEnvelope &&
    (
      state.value?.sandboxOnly !== true ||
      state.value?.syntheticOnly !== true ||
      state.value?.productionAuthority !== false ||
      state.value?.fundsAuthority !== false
    )
  ) unavailable();
  return state;
}

async function requireActorBindings(directory, {
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
  if (
    !bindings.some(
      (binding) =>
        binding.actorId === actorId &&
        OWNER_RELATIONSHIPS.has(binding.relationship)
    )
  ) unavailable();
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

function eventFor({
  eventType,
  subjectId,
  facility,
  orderIntent,
  riskEvaluation,
  actorId,
  requestId,
  correlationId,
  reasonCode,
  now
}) {
  return createCreditEvent({
    eventType,
    subjectId,
    payload: {
      ...(facility
        ? {
            tradingFacilityId: facility.tradingFacilityId,
            facilityHash: facility.facilityHash,
            facilityStateHash: facility.stateHash,
            facilityVersion: facility.version,
            lifecycleStatus: facility.lifecycleStatus,
            riskState: facility.riskState,
            obligationId: facility.obligationId,
            matchProposalId: facility.matchProposalId,
            syntheticCapitalMinor: facility.syntheticCapitalMinor,
            syntheticExposureMinor: facility.syntheticExposureMinor,
            syntheticEquityMinor: facility.syntheticEquityMinor,
            openOrderCount: facility.openOrderCount
          }
        : {}),
      ...(orderIntent
        ? {
            tradingOrderIntentId: orderIntent.tradingOrderIntentId,
            orderIntentHash: orderIntent.orderIntentHash,
            orderStateHash: orderIntent.orderStateHash,
            orderVersion: orderIntent.version,
            orderStatus: orderIntent.status
          }
        : {}),
      ...(riskEvaluation
        ? {
            tradingFacilityRiskEvaluationId:
              riskEvaluation.tradingFacilityRiskEvaluationId,
            evaluationHash: riskEvaluation.evaluationHash,
            previousRiskState: riskEvaluation.previousRiskState,
            evaluatedRiskState: riskEvaluation.evaluatedRiskState,
            freshness: riskEvaluation.freshness,
            riskReasonCodes: riskEvaluation.reasonCodes
          }
        : {}),
      ...(reasonCode === undefined ? {} : { reasonCode }),
      actorId,
      causationId: requestId,
      correlationId,
      nonRedeemable: true,
      withdrawable: false,
      transferable: false,
      externalSystemQueried: false,
      externalOrderSubmitted: false,
      productionAuthority: false,
      fundsAuthority: false,
      productionFundsMoved: false,
      realFunding: false
    },
    now
  });
}

function facilityEventPlan({
  state,
  next,
  eventType,
  actorId,
  requestId,
  correlationId,
  reasonCode,
  now
}) {
  const event = eventFor({
    eventType,
    subjectId: next.subjectId,
    facility: next,
    actorId,
    requestId,
    correlationId,
    reasonCode,
    now
  });
  return {
    event,
    eventWrite: {
      aggregateType: "trading_facility",
      aggregateId: next.tradingFacilityId,
      expectedVersion: state.aggregateVersion,
      event
    },
    projectionWrite: {
      type: CoreProjectionType.TRADING_FACILITY,
      value: next,
      eventId: event.eventId
    }
  };
}

export function createTradingFacilityHandler() {
  return Object.freeze({
    operationId: "tradingCreateFacility",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, CREATE_KEYS);
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
      closedPayload(payload, CREATE_KEYS);
      if (
        authorizationDecision.resourceType !== "trading_match_proposal" ||
        ![ActorType.HUMAN, ActorType.AGENT].includes(
          authenticationContext.actorType
        )
      ) unavailable();
      const bindings = await requireActorBindings(directory, {
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
      if (proposal.value.proposalHash !== payload.proposalHash) unavailable();
      const obligation = await loadState(
        client,
        coreRepository,
        CoreProjectionType.OBLIGATION,
        payload.obligationId,
        "obligation.v2",
        { lock: true, requireTradingSafetyEnvelope: false }
      );
      const facility = createTradingFacility({
        matchProposal: proposal.value,
        obligation: obligation.value,
        createdByActorId: authenticationContext.actorId,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_CREATED,
        subjectId: facility.subjectId,
        facility,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: facility.tradingFacilityId,
        events: [{
          aggregateType: "trading_facility",
          aggregateId: facility.tradingFacilityId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_FACILITY,
          value: facility,
          eventId: event.eventId
        }],
        response: {
          facility: tradingFacilityView(facility),
          schemaVersion: "tenant_trading_facility_created.v1"
        },
        authorizationResource: {
          resourceType: "trading_facility",
          resourceId: facility.tradingFacilityId,
          actorBindings: bindings
        }
      };
    }
  });
}

function contributionHandler({
  operationId,
  actorTypes,
  eventType,
  apply,
  responseSchemaVersion
}) {
  return Object.freeze({
    operationId,
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, CONTRIBUTION_KEYS);
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
      closedPayload(payload, CONTRIBUTION_KEYS);
      if (
        authorizationDecision.resourceType !== "trading_facility" ||
        !actorTypes.has(authenticationContext.actorType)
      ) unavailable();
      await requireActorBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const next = apply(state.value, {
        actorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const planned = facilityEventPlan({
        state,
        next,
        eventType,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: next.tradingFacilityId,
        events: [planned.eventWrite],
        writes: [planned.projectionWrite],
        response: {
          facility: tradingFacilityView(next),
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

export function contributeTradingSubjectCollateralHandler() {
  return contributionHandler({
    operationId: "tradingContributeSubjectCollateral",
    actorTypes: new Set([ActorType.HUMAN, ActorType.AGENT]),
    eventType:
      CreditEventType.TRADING_FACILITY_SUBJECT_COLLATERAL_RECORDED,
    apply: (facility, { actorId, ...input }) =>
      contributeTradingSubjectCollateral(facility, {
        contributedByActorId: actorId,
        ...input
      }),
    responseSchemaVersion:
      "tenant_trading_subject_collateral_recorded.v1"
  });
}

export function recordTradingProviderFundingHandler() {
  return contributionHandler({
    operationId: "tradingRecordProviderFunding",
    actorTypes: new Set([ActorType.PROVIDER]),
    eventType:
      CreditEventType.TRADING_FACILITY_PROVIDER_FUNDING_RECORDED,
    apply: (facility, { actorId, ...input }) =>
      recordTradingProviderFunding(facility, {
        fundedByActorId: actorId,
        ...input
      }),
    responseSchemaVersion:
      "tenant_trading_provider_funding_recorded.v1"
  });
}

export function activateTradingFacilityHandler() {
  return Object.freeze({
    operationId: "tradingActivateFacility",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, STATE_KEYS);
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
      closedPayload(payload, STATE_KEYS);
      if (authorizationDecision.resourceType !== "trading_facility") {
        unavailable();
      }
      await requireActorBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const proposal = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_MATCH_PROPOSAL,
        state.value.matchProposalId,
        TRADING_MATCH_PROPOSAL_SCHEMA_VERSION,
        { lock: true }
      );
      const obligation = await loadState(
        client,
        coreRepository,
        CoreProjectionType.OBLIGATION,
        state.value.obligationId,
        "obligation.v2",
        { lock: true, requireTradingSafetyEnvelope: false }
      );
      const next = activateTradingFacility(state.value, {
        matchProposal: proposal.value,
        obligation: obligation.value,
        activatedByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const planned = facilityEventPlan({
        state,
        next,
        eventType: CreditEventType.TRADING_FACILITY_ACTIVATED,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: next.tradingFacilityId,
        events: [planned.eventWrite],
        writes: [planned.projectionWrite],
        response: {
          facility: tradingFacilityView(next),
          schemaVersion: "tenant_trading_facility_activated.v1"
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

export function submitTradingOrderIntentHandler() {
  return Object.freeze({
    operationId: "tradingSubmitOrderIntent",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, SUBMIT_ORDER_KEYS);
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
      closedPayload(payload, SUBMIT_ORDER_KEYS);
      if (authorizationDecision.resourceType !== "trading_facility") {
        unavailable();
      }
      const bindings = await requireActorBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const result = submitTradingOrderIntent(state.value, {
        submittedByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const facilityEvent = eventFor({
        eventType: CreditEventType.TRADING_ORDER_INTENT_SUBMITTED,
        subjectId: result.facility.subjectId,
        facility: result.facility,
        orderIntent: result.orderIntent,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      const orderEvent = eventFor({
        eventType: CreditEventType.TRADING_ORDER_INTENT_SUBMITTED,
        subjectId: result.facility.subjectId,
        orderIntent: result.orderIntent,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: result.facility.tradingFacilityId,
        events: [
          {
            aggregateType: "trading_facility",
            aggregateId: result.facility.tradingFacilityId,
            expectedVersion: state.aggregateVersion,
            event: facilityEvent
          },
          {
            aggregateType: "trading_order_intent",
            aggregateId: result.orderIntent.tradingOrderIntentId,
            expectedVersion: 0,
            event: orderEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: result.facility,
            eventId: facilityEvent.eventId
          },
          {
            type: CoreProjectionType.TRADING_ORDER_INTENT,
            value: result.orderIntent,
            eventId: orderEvent.eventId
          }
        ],
        response: {
          facility: tradingFacilityView(result.facility),
          orderIntent: tradingOrderIntentView(result.orderIntent),
          schemaVersion: "tenant_trading_order_intent_submitted.v1"
        },
        authorizationResource: {
          resourceType: "trading_order_intent",
          resourceId: result.orderIntent.tradingOrderIntentId,
          actorBindings: bindings.filter(
            ({ actorType }) =>
              actorType === ActorType.HUMAN ||
              actorType === ActorType.AGENT
          )
        }
      };
    }
  });
}

export function cancelTradingOrderIntentHandler() {
  return Object.freeze({
    operationId: "tradingCancelOrderIntent",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, CANCEL_ORDER_KEYS);
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
      closedPayload(payload, CANCEL_ORDER_KEYS);
      if (authorizationDecision.resourceType !== "trading_order_intent") {
        unavailable();
      }
      await requireActorBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const orderState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_ORDER_INTENT,
        authorizationDecision.resourceId,
        TRADING_ORDER_INTENT_SCHEMA_VERSION,
        { lock: true }
      );
      const facilityState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        orderState.value.facilityId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const result = cancelTradingOrderIntent(
        facilityState.value,
        orderState.value,
        {
          canceledByActorId: authenticationContext.actorId,
          ...payload,
          now
        }
      );
      const facilityEvent = eventFor({
        eventType: CreditEventType.TRADING_ORDER_INTENT_CANCELED,
        subjectId: result.facility.subjectId,
        facility: result.facility,
        orderIntent: result.orderIntent,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      const orderEvent = eventFor({
        eventType: CreditEventType.TRADING_ORDER_INTENT_CANCELED,
        subjectId: result.facility.subjectId,
        orderIntent: result.orderIntent,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: result.facility.tradingFacilityId,
        events: [
          {
            aggregateType: "trading_facility",
            aggregateId: result.facility.tradingFacilityId,
            expectedVersion: facilityState.aggregateVersion,
            event: facilityEvent
          },
          {
            aggregateType: "trading_order_intent",
            aggregateId: result.orderIntent.tradingOrderIntentId,
            expectedVersion: orderState.aggregateVersion,
            event: orderEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: result.facility,
            eventId: facilityEvent.eventId
          },
          {
            type: CoreProjectionType.TRADING_ORDER_INTENT,
            value: result.orderIntent,
            eventId: orderEvent.eventId
          }
        ],
        response: {
          facility: tradingFacilityView(result.facility),
          orderIntent: tradingOrderIntentView(result.orderIntent),
          schemaVersion: "tenant_trading_order_intent_canceled.v1"
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

export function readTradingFacilityStateHandler() {
  return Object.freeze({
    operationId: "tradingReadFacilityState",
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
      closedPayload(payload, []);
      if (resource?.resourceType !== "trading_facility") unavailable();
      await requireActorBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        resource.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: false }
      );
      const orderIntents =
        await coreRepository.listTradingOrderIntentsInTransaction(client, {
          facilityId: state.value.tradingFacilityId,
          limit: 20
        });
      return {
        facility: tradingFacilityView(state.value),
        orderIntents: orderIntents.map(tradingOrderIntentView),
        page: {
          count: orderIntents.length,
          limit: 20,
          truncated: false
        },
        schemaVersion: "trading_facility_state.v1"
      };
    }
  });
}

export function evaluateTradingFacilityRiskHandler() {
  return Object.freeze({
    operationId: "tradingEvaluateRisk",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, STATE_KEYS);
    },
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      payload,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, STATE_KEYS);
      if (authorizationDecision.resourceType !== "trading_facility") {
        unavailable();
      }
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const result = evaluateTradingFacilityRisk(state.value, {
        evaluatedByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const facilityEvent = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_RISK_EVALUATED,
        subjectId: result.facility.subjectId,
        facility: result.facility,
        riskEvaluation: result.riskEvaluation,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      const evaluationEvent = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_RISK_EVALUATED,
        subjectId: result.facility.subjectId,
        riskEvaluation: result.riskEvaluation,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: result.facility.tradingFacilityId,
        events: [
          {
            aggregateType: "trading_facility",
            aggregateId: result.facility.tradingFacilityId,
            expectedVersion: state.aggregateVersion,
            event: facilityEvent
          },
          {
            aggregateType: "trading_facility_risk_evaluation",
            aggregateId:
              result.riskEvaluation.tradingFacilityRiskEvaluationId,
            expectedVersion: 0,
            event: evaluationEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: result.facility,
            eventId: facilityEvent.eventId
          },
          {
            type:
              CoreProjectionType.TRADING_FACILITY_RISK_EVALUATION,
            value: result.riskEvaluation,
            eventId: evaluationEvent.eventId
          }
        ],
        response: {
          facility: tradingFacilityView(result.facility),
          riskEvaluation: tradingFacilityRiskEvaluationView(
            result.riskEvaluation
          ),
          schemaVersion: "tenant_trading_facility_risk_evaluated.v1"
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

export function pauseTradingFacilityNewRiskHandler() {
  return Object.freeze({
    operationId: "tradingPauseNewRisk",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, STATE_KEYS);
    },
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      payload,
      reasonCode,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, STATE_KEYS);
      if (authorizationDecision.resourceType !== "trading_facility") {
        unavailable();
      }
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const next = pauseTradingFacilityNewRisk(state.value, {
        pausedByActorId: authenticationContext.actorId,
        reasonCode,
        ...payload,
        now
      });
      const planned = facilityEventPlan({
        state,
        next,
        eventType: CreditEventType.TRADING_FACILITY_NEW_RISK_PAUSED,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        reasonCode,
        now
      });
      return {
        aggregateType: "trading_facility",
        aggregateId: next.tradingFacilityId,
        events: [planned.eventWrite],
        writes: [planned.projectionWrite],
        response: {
          facility: tradingFacilityView(next),
          schemaVersion: "tenant_trading_facility_new_risk_paused.v1"
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

export function flattenTradingFacilityHandler() {
  return Object.freeze({
    operationId: "tradingFlattenFacility",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, STATE_KEYS);
    },
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      payload,
      reasonCode,
      now,
      requestId,
      correlationId
    }) {
      closedPayload(payload, STATE_KEYS);
      if (authorizationDecision.resourceType !== "trading_facility") {
        unavailable();
      }
      const state = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const openOrders =
        await coreRepository.listTradingOrderIntentsInTransaction(client, {
          facilityId: state.value.tradingFacilityId,
          status: "open",
          limit: 20
        });
      const orderStates = [];
      for (const order of openOrders) {
        orderStates.push(await loadState(
          client,
          coreRepository,
          CoreProjectionType.TRADING_ORDER_INTENT,
          order.tradingOrderIntentId,
          TRADING_ORDER_INTENT_SCHEMA_VERSION,
          { lock: true }
        ));
      }
      const result = flattenTradingFacility(
        state.value,
        orderStates.map(({ value }) => value),
        {
          flattenedByActorId: authenticationContext.actorId,
          reasonCode,
          ...payload,
          now
        }
      );
      const facilityEvent = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_FLATTENED,
        subjectId: result.facility.subjectId,
        facility: result.facility,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        reasonCode,
        now
      });
      const orderEvents = result.orderIntents.map((orderIntent) =>
        eventFor({
          eventType: CreditEventType.TRADING_FACILITY_FLATTENED,
          subjectId: result.facility.subjectId,
          orderIntent,
          actorId: authenticationContext.actorId,
          requestId,
          correlationId,
          reasonCode,
          now
        })
      );
      return {
        aggregateType: "trading_facility",
        aggregateId: result.facility.tradingFacilityId,
        events: [
          {
            aggregateType: "trading_facility",
            aggregateId: result.facility.tradingFacilityId,
            expectedVersion: state.aggregateVersion,
            event: facilityEvent
          },
          ...result.orderIntents.map((orderIntent, index) => ({
            aggregateType: "trading_order_intent",
            aggregateId: orderIntent.tradingOrderIntentId,
            expectedVersion: orderStates[index].aggregateVersion,
            event: orderEvents[index]
          }))
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: result.facility,
            eventId: facilityEvent.eventId
          },
          ...result.orderIntents.map((orderIntent, index) => ({
            type: CoreProjectionType.TRADING_ORDER_INTENT,
            value: orderIntent,
            eventId: orderEvents[index].eventId
          }))
        ],
        response: {
          facility: tradingFacilityView(result.facility),
          flattenedOrderIntents:
            result.orderIntents.map(tradingOrderIntentView),
          schemaVersion: "tenant_trading_facility_flattened.v1"
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

export function createTradingCapitalFacilityHandlers() {
  return Object.freeze([
    createTradingFacilityHandler(),
    contributeTradingSubjectCollateralHandler(),
    recordTradingProviderFundingHandler(),
    activateTradingFacilityHandler(),
    submitTradingOrderIntentHandler(),
    cancelTradingOrderIntentHandler(),
    readTradingFacilityStateHandler(),
    evaluateTradingFacilityRiskHandler(),
    pauseTradingFacilityNewRiskHandler(),
    flattenTradingFacilityHandler()
  ]);
}
