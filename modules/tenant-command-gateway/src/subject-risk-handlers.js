import {
  CreditEventType,
  DomainError,
  SubjectStatus,
  SubjectTransitions,
  SubjectType,
  assertTransition,
  createCreditEvent
} from "../../../packages/domain/src/index.js";
import { PROTECTIVE_REASON_CODES } from "../../authorization/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const PROTECTIVE_SUBJECT_FREEZE_REASONS = new Set(PROTECTIVE_REASON_CODES);

function normalizeEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError("invalid_tenant_command_payload", "Subject freeze payload must be empty");
  }
}

export function freezeAgentSubjectCommandHandler() {
  return Object.freeze({
    operationId: "pilotFreezeSubject",
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      reasonCode,
      now,
      requestId,
      correlationId
    }) {
      normalizeEmptyPayload(payload);
      if (
        authorizationDecision.resourceType !== "subject" ||
        !PROTECTIVE_SUBJECT_FREEZE_REASONS.has(reasonCode)
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const state = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = state?.value;
      if (
        !subject ||
        subject.subjectId !== authorizationDecision.resourceId ||
        subject.subjectType !== SubjectType.AGENT
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      assertTransition("Subject", SubjectTransitions, subject.status, SubjectStatus.SUSPENDED);
      const frozen = {
        ...subject,
        status: SubjectStatus.SUSPENDED,
        updatedAt: now.toISOString()
      };
      const event = createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId: subject.subjectId,
        payload: {
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          previousStatus: subject.status,
          nextStatus: frozen.status,
          reasonCode,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "subject",
        aggregateId: subject.subjectId,
        events: [{
          aggregateType: "subject",
          aggregateId: subject.subjectId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.SUBJECT, value: frozen, eventId: event.eventId }],
        response: {
          subjectId: frozen.subjectId,
          subjectHash: frozen.subjectHash,
          previousStatus: subject.status,
          status: frozen.status,
          reasonCode,
          updatedAt: frozen.updatedAt,
          schemaVersion: "tenant_agent_subject_frozen.v1"
        }
      };
    }
  });
}

export function createSubjectRiskHandlers() {
  return Object.freeze([freezeAgentSubjectCommandHandler()]);
}
