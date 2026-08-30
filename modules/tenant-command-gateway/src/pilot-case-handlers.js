import {
  CreditEventType,
  DomainError,
  PilotCaseTransition,
  SubjectStatus,
  SubjectType,
  assignPilotCase,
  createCreditEvent,
  createPilotCase,
  hashId,
  normalizePilotCaseFilePayload,
  normalizePilotCaseTransitionPayload,
  resolvePilotCase
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const ACTIVE_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);
const TARGET_PROJECTION_TYPES = Object.freeze({
  decision: CoreProjectionType.RISK_DECISION,
  offer_disclosure: CoreProjectionType.CREDIT_OFFER,
  payment: CoreProjectionType.REPAYMENT,
  servicing_action: CoreProjectionType.SANDBOX_SERVICING_ACTION
});

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function hmacRef(referenceHasher, namespace, value) {
  if (typeof referenceHasher?.hash !== "function") {
    throw new DomainError("invalid_tenant_command_handler", "Pilot case reference hashing is unavailable");
  }
  return `0x${Buffer.from(referenceHasher.hash(namespace, value), "base64url").toString("hex")}`;
}

function emptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Pilot case list payload must be empty");
  }
}

function caseView(value, { operator = false } = {}) {
  return {
    pilotCaseId: value.pilotCaseId,
    entryMode: value.entryMode,
    targetType: value.targetType,
    targetId: value.targetId,
    reasonCode: value.reasonCode,
    status: value.status,
    sequence: value.sequence,
    filedAt: value.filedAt,
    updatedAt: value.updatedAt,
    assigned: value.assignedOwnerRefHash !== null,
    resolution: value.resolution,
    correctionCode: value.correction?.correctionCode ?? null,
    safety: {
      originalRecordImmutable: true,
      additiveCorrectionOnly: true,
      freeTextAccepted: false,
      piiIncluded: false,
      sandboxOnly: true,
      productionAuthority: false,
      economicMutationAuthorized: false
    },
    ...(operator ? { subjectId: value.subjectId } : {}),
    schemaVersion: "tenant_pilot_case_view.v1"
  };
}

async function loadSubject(client, coreRepository, subjectId, actorType, { lock = false } = {}) {
  const expectedType = actorType === ActorType.HUMAN
    ? SubjectType.HUMAN
    : actorType === ActorType.AGENT
      ? SubjectType.AGENT
      : undefined;
  if (!expectedType) unavailable();
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.SUBJECT,
    subjectId,
    { lock }
  );
  const subject = state?.value;
  if (
    !subject ||
    subject.subjectId !== subjectId ||
    subject.subjectType !== expectedType ||
    !ACTIVE_SUBJECT_STATUSES.has(subject.status) ||
    (expectedType === SubjectType.HUMAN && subject.prototypeOnly !== true)
  ) unavailable();
  return subject;
}

async function loadOwnedTarget(client, coreRepository, subjectId, targetType, targetId) {
  if (targetType === "evidence_item") {
    const result = await client.query(
      "SELECT evidence_hash, subject_id FROM evidence_envelopes WHERE id = $1",
      [targetId]
    );
    if (result.rowCount !== 1 || result.rows[0].subject_id !== subjectId) unavailable();
    return result.rows[0].evidence_hash;
  }
  if (targetType === "report") {
    const reportState = await coreRepository.getProjectionStateInTransaction(
      client,
      CoreProjectionType.OFFICIAL_REPORT_ARTIFACT,
      targetId
    );
    const obligation = reportState
      ? await coreRepository.getProjectionInTransaction(
          client,
          CoreProjectionType.OBLIGATION,
          reportState.value.sourceObligationId
        )
      : undefined;
    if (!reportState || obligation?.subjectId !== subjectId) unavailable();
    return reportState.entityHash;
  }
  const projectionType = TARGET_PROJECTION_TYPES[targetType];
  if (!projectionType) unavailable();
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    projectionType,
    targetId
  );
  if (!state || state.value.subjectId !== subjectId) unavailable();
  return state.entityHash;
}

async function pilotCaseCapacity({ client, coreRepository }) {
  return {
    [ResourceKind.PILOT_CASES]:
      await coreRepository.countPilotCasesForCapacityInTransaction(client)
  };
}

export function filePilotCaseCommandHandler() {
  return Object.freeze({
    operationId: "pilotFileCase",
    kind: "command",
    preflight({ payload }) {
      normalizePilotCaseFilePayload(payload);
    },
    resourceDeltas() {
      return { [ResourceKind.PILOT_CASES]: 1 };
    },
    loadResourceBaselines: pilotCaseCapacity,
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      referenceHasher,
      payload,
      now,
      requestId,
      correlationId
    }) {
      if (authorizationDecision?.resourceType !== "subject") unavailable();
      const input = normalizePilotCaseFilePayload(payload);
      const subjectId = authorizationDecision.resourceId;
      const subject = await loadSubject(
        client,
        coreRepository,
        subjectId,
        authenticationContext.actorType,
        { lock: true }
      );
      const targetRefHash = await loadOwnedTarget(
        client,
        coreRepository,
        subjectId,
        input.targetType,
        input.targetId
      );
      const filerActorRefHash = hmacRef(
        referenceHasher,
        "pilot_case.filer_actor",
        authenticationContext.actorId
      );
      const identityHash = hashId("pilot_case_request", {
        requestId,
        subjectId,
        targetType: input.targetType,
        targetId: input.targetId,
        reasonCode: input.reasonCode
      });
      const pilotCaseId = `pilot_case_${identityHash.slice(2)}`;
      const event = createCreditEvent({
        eventType: CreditEventType.PILOT_CASE_FILED,
        subjectId,
        payload: {
          pilotCaseId,
          targetType: input.targetType,
          targetRefHash,
          reasonCode: input.reasonCode,
          entryMode: subject.subjectType,
          filerActorRefHash,
          additiveCorrectionOnly: true,
          economicMutationAuthorized: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const pilotCase = createPilotCase({
        pilotCaseId,
        subjectId,
        entryMode: subject.subjectType,
        filerActorRefHash,
        targetType: input.targetType,
        targetId: input.targetId,
        targetRefHash,
        reasonCode: input.reasonCode,
        eventId: event.eventId,
        now
      });
      return {
        aggregateType: "pilot_case",
        aggregateId: pilotCaseId,
        events: [{
          aggregateType: "pilot_case",
          aggregateId: pilotCaseId,
          expectedVersion: 0,
          event
        }],
        writes: [{ type: CoreProjectionType.PILOT_CASE, value: pilotCase, eventId: event.eventId }],
        resourceBaselines: await pilotCaseCapacity({ client, coreRepository }),
        authorizationResource: {
          resourceType: "pilot_case",
          resourceId: pilotCaseId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }]
        },
        response: {
          pilotCase: caseView(pilotCase),
          schemaVersion: "tenant_pilot_case_filed.v1"
        }
      };
    }
  });
}

export function listOwnPilotCasesQueryHandler() {
  return Object.freeze({
    operationId: "pilotListOwnCases",
    kind: "query",
    async execute({ client, coreRepository, authenticationContext, authorizationDecision, payload }) {
      emptyPayload(payload);
      if (authorizationDecision?.resourceType !== "subject") unavailable();
      const subjectId = authorizationDecision.resourceId;
      await loadSubject(client, coreRepository, subjectId, authenticationContext.actorType);
      const rows = await coreRepository.listPilotCasesForSubjectInTransaction(client, subjectId, { limit: 51 });
      return {
        items: rows.slice(0, 50).map((item) => caseView(item)),
        hasMore: rows.length > 50,
        schemaVersion: "tenant_pilot_case_list.v1"
      };
    }
  });
}

export function readPilotCaseQueueQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCaseQueue",
    kind: "query",
    async execute({ client, coreRepository, authorizationDecision, payload, now }) {
      emptyPayload(payload);
      if (authorizationDecision?.resourceType !== "risk_portfolio") unavailable();
      const rows = await coreRepository.listPilotCaseQueueInTransaction(client, { limit: 101 });
      return {
        asOf: now.toISOString(),
        items: rows.slice(0, 100).map((item) => caseView(item, { operator: true })),
        hasMore: rows.length > 100,
        safety: {
          freeTextIncluded: false,
          piiIncluded: false,
          sandboxOnly: true,
          productionAuthority: false
        },
        schemaVersion: "tenant_pilot_case_queue.v1"
      };
    }
  });
}

export function transitionPilotCaseCommandHandler() {
  return Object.freeze({
    operationId: "pilotTransitionCase",
    kind: "command",
    preflight({ payload }) {
      normalizePilotCaseTransitionPayload(payload);
    },
    async plan({
      client,
      coreRepository,
      authenticationContext,
      authorizationDecision,
      referenceHasher,
      payload,
      now,
      requestId,
      correlationId
    }) {
      if (authorizationDecision?.resourceType !== "pilot_case") unavailable();
      const input = normalizePilotCaseTransitionPayload(payload);
      const state = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PILOT_CASE,
        authorizationDecision.resourceId,
        { lock: true }
      );
      if (!state || state.value.pilotCaseId !== authorizationDecision.resourceId) unavailable();
      const operatorActorRefHash = hmacRef(
        referenceHasher,
        "pilot_case.operator_actor",
        authenticationContext.actorId
      );
      // PostgreSQL records sub-millisecond clock precision while the protocol
      // timestamp is millisecond ISO. Two consecutive commands can therefore
      // share one serialized millisecond; keep the additive transition strictly
      // monotonic as required by the durable projection guard.
      const previousUpdatedAt = new Date(state.value.updatedAt).getTime();
      const transitionNow = now.getTime() > previousUpdatedAt
        ? now
        : new Date(previousUpdatedAt + 1);
      const event = createCreditEvent({
        eventType: input.transition === PilotCaseTransition.ASSIGN
          ? CreditEventType.PILOT_CASE_ASSIGNED
          : CreditEventType.PILOT_CASE_RESOLVED,
        subjectId: state.value.subjectId,
        payload: {
          pilotCaseId: state.value.pilotCaseId,
          transition: input.transition,
          previousStatus: state.value.status,
          ...(input.correctionCode ? { correctionCode: input.correctionCode } : {}),
          operatorActorRefHash,
          originalTargetRefHash: state.value.targetRefHash,
          additiveCorrectionOnly: true,
          economicMutationAuthorized: false,
          causationId: requestId,
          correlationId
        },
        now: transitionNow
      });
      const pilotCase = input.transition === PilotCaseTransition.ASSIGN
        ? assignPilotCase(state.value, {
            ownerActorRefHash: operatorActorRefHash,
            operatorActorRefHash,
            eventId: event.eventId,
            now: transitionNow
          })
        : resolvePilotCase(state.value, {
            resolution: input.transition,
            correctionCode: input.correctionCode ?? null,
            resolverActorRefHash: operatorActorRefHash,
            eventId: event.eventId,
            now: transitionNow
          });
      return {
        aggregateType: state.rootAggregateType,
        aggregateId: state.rootAggregateId,
        events: [{
          aggregateType: state.rootAggregateType,
          aggregateId: state.rootAggregateId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.PILOT_CASE, value: pilotCase, eventId: event.eventId }],
        response: {
          pilotCase: caseView(pilotCase, { operator: true }),
          schemaVersion: "tenant_pilot_case_transitioned.v1"
        }
      };
    }
  });
}

export function createPilotCaseHandlers() {
  return Object.freeze([
    filePilotCaseCommandHandler(),
    listOwnPilotCasesQueryHandler(),
    readPilotCaseQueueQueryHandler(),
    transitionPilotCaseCommandHandler()
  ]);
}
