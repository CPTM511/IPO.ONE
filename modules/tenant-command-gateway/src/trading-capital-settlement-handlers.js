import {
  CreditEventType,
  DomainError,
  TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION,
  TRADING_FACILITY_SCHEMA_VERSION,
  TRADING_PERFORMANCE_PROOF_SCHEMA_VERSION,
  TRADING_SETTLEMENT_SCHEMA_VERSION,
  createCreditEvent,
  createTradingFacilityEvidenceView,
  issueTradingPerformanceProof,
  requestTradingFacilityClose,
  runTradingSettlement,
  tradingFacilityCloseRequestView,
  tradingFacilityView,
  tradingPerformanceProofView,
  tradingSettlementView
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const BOUND_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);
const FACILITY_STATE_KEYS = Object.freeze([
  "expectedStateHash",
  "expectedVersion"
]);
const SETTLEMENT_KEYS = Object.freeze([
  "expectedCloseRequestHash",
  "expectedFacilityStateHash",
  "expectedFacilityVersion"
]);
const PROOF_KEYS = Object.freeze(["expectedSettlementHash"]);

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
  { lock, requireTradingSafetyEnvelope = true } = {}
) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    type,
    resourceId,
    { lock }
  );
  if (!state || state.value?.schemaVersion !== schemaVersion) unavailable();
  if (
    requireTradingSafetyEnvelope &&
    (
      state.value?.sandboxOnly !== true ||
      state.value?.syntheticOnly !== true ||
      state.value?.nonRedeemable !== true ||
      state.value?.productionAuthority !== false ||
      state.value?.fundsAuthority !== false
    )
  ) unavailable();
  return state;
}

async function requireBindings(directory, {
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
        BOUND_RELATIONSHIPS.has(binding.relationship)
    )
  ) unavailable();
  return bindings
    .filter(({ relationship }) => BOUND_RELATIONSHIPS.has(relationship))
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
  facility,
  closeRequest,
  settlement,
  performanceProof,
  actorId,
  requestId,
  correlationId,
  now
}) {
  return createCreditEvent({
    eventType,
    subjectId: facility.subjectId,
    payload: {
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
      openOrderCount: facility.openOrderCount,
      ...(closeRequest
        ? {
            tradingFacilityCloseRequestId:
              closeRequest.tradingFacilityCloseRequestId,
            closeRequestHash: closeRequest.requestHash,
            closeRequestStatus: closeRequest.status
          }
        : {}),
      ...(settlement
        ? {
            tradingSettlementId: settlement.tradingSettlementId,
            settlementHash: settlement.settlementHash,
            settlementStatus: settlement.status,
            finalSyntheticEquityMinor:
              settlement.finalSyntheticEquityMinor,
            totalAllocatedMinor: settlement.totalAllocatedMinor,
            realizedPnlMinor: "0",
            ipoOneFeeMinor: "0",
            waterfallBalanced: true,
            canonicalLedgerMutationCreated: false
          }
        : {}),
      ...(performanceProof
        ? {
            tradingPerformanceProofId:
              performanceProof.tradingPerformanceProofId,
            performanceProofHash: performanceProof.proofHash,
            claimSetHash: performanceProof.claimSetHash,
            proofVersion: performanceProof.proofVersion,
            expiresAt: performanceProof.expiresAt,
            officialReport: false,
            realProfitClaimed: false
          }
        : {}),
      actorId,
      causationId: requestId,
      correlationId,
      strategyDataIncluded: false,
      rawHistoryIncluded: false,
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

export function requestTradingFacilityCloseHandler() {
  return Object.freeze({
    operationId: "tradingRequestClose",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, FACILITY_STATE_KEYS);
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
      closedPayload(payload, FACILITY_STATE_KEYS);
      if (
        authorizationDecision.resourceType !== "trading_facility" ||
        ![ActorType.HUMAN, ActorType.AGENT].includes(
          authenticationContext.actorType
        )
      ) unavailable();
      const bindings = await requireBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const existing = await client.query(
        "SELECT id FROM trading_facility_close_requests WHERE facility_id = $1 LIMIT 1 FOR UPDATE",
        [authorizationDecision.resourceId]
      );
      if (existing.rowCount !== 0) unavailable();
      const facilityState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        authorizationDecision.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const closeRequest = requestTradingFacilityClose({
        facility: facilityState.value,
        requestedByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_CLOSE_REQUESTED,
        facility: facilityState.value,
        closeRequest,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_facility_close_request",
        aggregateId: closeRequest.tradingFacilityCloseRequestId,
        events: [{
          aggregateType: "trading_facility_close_request",
          aggregateId: closeRequest.tradingFacilityCloseRequestId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_FACILITY_CLOSE_REQUEST,
          value: closeRequest,
          eventId: event.eventId
        }],
        response: {
          closeRequest: tradingFacilityCloseRequestView(closeRequest),
          schemaVersion: "tenant_trading_facility_close_requested.v1"
        },
        authorizationResource: {
          resourceType: "trading_facility_close_request",
          resourceId: closeRequest.tradingFacilityCloseRequestId,
          actorBindings: bindings
        }
      };
    }
  });
}

export function runTradingSettlementHandler() {
  return Object.freeze({
    operationId: "tradingRunSettlement",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, SETTLEMENT_KEYS);
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
      closedPayload(payload, SETTLEMENT_KEYS);
      if (
        authorizationDecision.resourceType !==
          "trading_facility_close_request" ||
        authenticationContext.actorType !== ActorType.SYSTEM_WORKER
      ) unavailable();
      const closeState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY_CLOSE_REQUEST,
        authorizationDecision.resourceId,
        TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION,
        { lock: true }
      );
      const existing = await client.query(
        "SELECT id FROM trading_settlements WHERE close_request_id = $1 LIMIT 1 FOR UPDATE",
        [closeState.value.tradingFacilityCloseRequestId]
      );
      if (existing.rowCount !== 0) unavailable();
      const facilityState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        closeState.value.facilityId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: true }
      );
      const obligationState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.OBLIGATION,
        facilityState.value.obligationId,
        "obligation.v2",
        { lock: true, requireTradingSafetyEnvelope: false }
      );
      const bindings = (
        await directory.listActiveResourceBindings({
          resourceType: "trading_facility",
          resourceId: facilityState.value.tradingFacilityId,
          now
        })
      )
        .filter(({ relationship }) => BOUND_RELATIONSHIPS.has(relationship))
        .map((binding) => ({
          actorId: binding.actorId,
          actorType: binding.actorType,
          relationship: binding.relationship,
          ...(binding.controllerActorId
            ? { controllerActorId: binding.controllerActorId }
            : {})
        }));
      if (bindings.length < 2) unavailable();
      const result = runTradingSettlement({
        facility: facilityState.value,
        closeRequest: closeState.value,
        obligation: obligationState.value,
        settledByActorId: authenticationContext.actorId,
        ...payload,
        now
      });
      const facilityEvent = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_SETTLED,
        facility: result.facility,
        closeRequest: closeState.value,
        settlement: result.settlement,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      const settlementEvent = eventFor({
        eventType: CreditEventType.TRADING_FACILITY_SETTLED,
        facility: result.facility,
        closeRequest: closeState.value,
        settlement: result.settlement,
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
            aggregateType: "trading_settlement",
            aggregateId: result.settlement.tradingSettlementId,
            expectedVersion: 0,
            event: settlementEvent
          }
        ],
        writes: [
          {
            type: CoreProjectionType.TRADING_FACILITY,
            value: result.facility,
            eventId: facilityEvent.eventId
          },
          {
            type: CoreProjectionType.TRADING_SETTLEMENT,
            value: result.settlement,
            eventId: settlementEvent.eventId
          }
        ],
        response: {
          facility: tradingFacilityView(result.facility),
          settlement: tradingSettlementView(result.settlement),
          schemaVersion: "tenant_trading_settlement_finalized.v1"
        },
        authorizationResource: {
          resourceType: "trading_settlement",
          resourceId: result.settlement.tradingSettlementId,
          actorBindings: bindings
        }
      };
    }
  });
}

export function readTradingSettlementHandler() {
  return Object.freeze({
    operationId: "tradingReadSettlement",
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
      if (resource?.resourceType !== "trading_settlement") unavailable();
      await requireBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const settlementState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_SETTLEMENT,
        resource.resourceId,
        TRADING_SETTLEMENT_SCHEMA_VERSION,
        { lock: false }
      );
      return {
        settlement: tradingSettlementView(settlementState.value),
        schemaVersion: "trading_settlement_view.v1"
      };
    }
  });
}

export function issueTradingPerformanceProofHandler() {
  return Object.freeze({
    operationId: "tradingIssuePerformanceProof",
    kind: "command",
    preflight({ payload }) {
      closedPayload(payload, PROOF_KEYS);
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
      closedPayload(payload, PROOF_KEYS);
      if (authorizationDecision.resourceType !== "trading_settlement") {
        unavailable();
      }
      const bindings = await requireBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const settlementState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_SETTLEMENT,
        authorizationDecision.resourceId,
        TRADING_SETTLEMENT_SCHEMA_VERSION,
        { lock: true }
      );
      if (settlementState.value.settlementHash !== payload.expectedSettlementHash) {
        unavailable();
      }
      const existing = await client.query(
        "SELECT id FROM trading_performance_proofs WHERE settlement_id = $1 LIMIT 1 FOR UPDATE",
        [settlementState.value.tradingSettlementId]
      );
      if (existing.rowCount !== 0) unavailable();
      const facilityState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        settlementState.value.facilityId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: false }
      );
      const obligationState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.OBLIGATION,
        settlementState.value.obligationId,
        "obligation.v2",
        { lock: false, requireTradingSafetyEnvelope: false }
      );
      const proof = issueTradingPerformanceProof({
        settlement: settlementState.value,
        facility: facilityState.value,
        obligation: obligationState.value,
        issuedByActorId: authenticationContext.actorId,
        now
      });
      const event = eventFor({
        eventType: CreditEventType.TRADING_PERFORMANCE_PROOF_ISSUED,
        facility: facilityState.value,
        settlement: settlementState.value,
        performanceProof: proof,
        actorId: authenticationContext.actorId,
        requestId,
        correlationId,
        now
      });
      return {
        aggregateType: "trading_performance_proof",
        aggregateId: proof.tradingPerformanceProofId,
        events: [{
          aggregateType: "trading_performance_proof",
          aggregateId: proof.tradingPerformanceProofId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.TRADING_PERFORMANCE_PROOF,
          value: proof,
          eventId: event.eventId
        }],
        response: {
          performanceProof: tradingPerformanceProofView(proof),
          schemaVersion: "tenant_trading_performance_proof_issued.v1"
        },
        authorizationResource: {
          resourceType: "trading_performance_proof",
          resourceId: proof.tradingPerformanceProofId,
          actorBindings: bindings
        }
      };
    }
  });
}

function evidenceSummary(item) {
  return {
    evidenceId: item.evidenceId,
    evidenceHash: item.evidenceHash,
    eventType: item.eventType,
    aggregateType: item.aggregateType,
    aggregateId: item.aggregateId,
    aggregateVersion: item.aggregateVersion,
    obligationId: item.obligationId,
    sourceFinality: item.sourceFinality,
    payloadHash: item.payloadHash,
    occurredAt: item.occurredAt,
    recordedAt: item.recordedAt,
    schemaVersion: "trading_facility_evidence_summary.v1"
  };
}

export function readTradingFacilityEvidenceHandler() {
  return Object.freeze({
    operationId: "tradingReadFacilityEvidence",
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
      await requireBindings(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const facilityState = await loadState(
        client,
        coreRepository,
        CoreProjectionType.TRADING_FACILITY,
        resource.resourceId,
        TRADING_FACILITY_SCHEMA_VERSION,
        { lock: false }
      );
      const closeId = await client.query(
        "SELECT id FROM trading_facility_close_requests WHERE facility_id = $1 LIMIT 1",
        [facilityState.value.tradingFacilityId]
      );
      const closeState = closeId.rowCount === 0
        ? null
        : await loadState(
            client,
            coreRepository,
            CoreProjectionType.TRADING_FACILITY_CLOSE_REQUEST,
            closeId.rows[0].id,
            TRADING_FACILITY_CLOSE_REQUEST_SCHEMA_VERSION,
            { lock: false }
          );
      const settlementId = await client.query(
        "SELECT id FROM trading_settlements WHERE facility_id = $1 LIMIT 1",
        [facilityState.value.tradingFacilityId]
      );
      const settlementState = settlementId.rowCount === 0
        ? null
        : await loadState(
            client,
            coreRepository,
            CoreProjectionType.TRADING_SETTLEMENT,
            settlementId.rows[0].id,
            TRADING_SETTLEMENT_SCHEMA_VERSION,
            { lock: false }
          );
      const proofId = await client.query(
        "SELECT id FROM trading_performance_proofs WHERE facility_id = $1 LIMIT 1",
        [facilityState.value.tradingFacilityId]
      );
      const proofState = proofId.rowCount === 0
        ? null
        : await loadState(
            client,
            coreRepository,
            CoreProjectionType.TRADING_PERFORMANCE_PROOF,
            proofId.rows[0].id,
            TRADING_PERFORMANCE_PROOF_SCHEMA_VERSION,
            { lock: false }
          );
      const evidence = await coreRepository.listObligationEvidenceInTransaction(
        client,
        {
          obligationId: facilityState.value.obligationId,
          limit: 51
        }
      );
      if (evidence.length > 50) unavailable();
      return createTradingFacilityEvidenceView({
        facility: facilityState.value,
        closeRequest: closeState?.value ?? null,
        settlement: settlementState?.value ?? null,
        performanceProof: proofState?.value ?? null,
        evidenceItems: evidence.map(evidenceSummary),
        asOf: now.toISOString()
      });
    }
  });
}

export function createTradingCapitalSettlementHandlers() {
  return Object.freeze([
    requestTradingFacilityCloseHandler(),
    runTradingSettlementHandler(),
    readTradingSettlementHandler(),
    issueTradingPerformanceProofHandler(),
    readTradingFacilityEvidenceHandler()
  ]);
}
