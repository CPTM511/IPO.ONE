import {
  CreditEventType,
  DomainError,
  PrincipalType,
  PrincipalStatus,
  SubjectType,
  assertNoRawPiiReference,
  createCreditEvent,
  createPrincipal,
  createSubject,
  hashId
} from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

function assertBoundedText(name, value, { minimum = 1, maximum = 128, pattern } = {}) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    (pattern && !pattern.test(value))
  ) {
    throw new DomainError("invalid_tenant_command_payload", `${name} is invalid`);
  }
  return value;
}

function normalizeCreateAgentPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => !["subjectActorId", "displayName", "jurisdiction"].includes(key))
  ) {
    throw new DomainError("invalid_tenant_command_payload", "create Agent payload is invalid");
  }
  const normalized = {
    subjectActorId: assertBoundedText("subjectActorId", payload.subjectActorId, {
      maximum: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
    }),
    displayName: assertBoundedText("displayName", payload.displayName, { maximum: 120 }),
    jurisdiction: payload.jurisdiction === undefined
      ? "US"
      : assertBoundedText("jurisdiction", payload.jurisdiction, {
          maximum: 32,
          pattern: /^[A-Z][A-Z0-9-]*$/
        })
  };
  assertNoRawPiiReference(normalized, "createAgentSubject");
  return normalized;
}

export function createAgentSubjectCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateAgentSubject",
    kind: "command",
    async plan({ client, coreRepository, payload, authenticationContext, now, requestId, correlationId }) {
      const input = normalizeCreateAgentPayload(payload);
      const principalAuthorityRef = hashId("tenant_principal_authority", {
        tenantId: authenticationContext.tenantId,
        actorId: authenticationContext.actorId
      });
      const candidatePrincipal = createPrincipal({
        principalType: PrincipalType.DEVELOPER,
        jurisdiction: input.jurisdiction,
        legalEntityRef: principalAuthorityRef,
        now
      });
      const existingPrincipal = await coreRepository.findPrincipalByHashInTransaction(
        client,
        candidatePrincipal.principalHash
      );
      if (existingPrincipal && existingPrincipal.status !== PrincipalStatus.ACTIVE) {
        throw new DomainError("principal_not_active", "Agent creation requires an active Principal");
      }
      const principal = existingPrincipal ?? candidatePrincipal;
      const subject = createSubject({
        subjectType: SubjectType.AGENT,
        primaryPrincipalId: principal.principalId,
        displayName: input.displayName,
        now
      });
      const principalEvent = existingPrincipal
        ? undefined
        : createCreditEvent({
            eventType: CreditEventType.PRINCIPAL_CREATED,
            payload: {
              principalId: principal.principalId,
              principalHash: principal.principalHash,
              actorId: authenticationContext.actorId,
              causationId: requestId,
              correlationId
            },
            now
          });
      const subjectEvent = createCreditEvent({
        eventType: CreditEventType.SUBJECT_CREATED,
        subjectId: subject.subjectId,
        payload: {
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          subjectType: subject.subjectType,
          primaryPrincipalId: subject.primaryPrincipalId,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "subject",
        aggregateId: subject.subjectId,
        events: [
          ...(principalEvent
            ? [{
                aggregateType: "principal",
                aggregateId: principal.principalId,
                expectedVersion: 0,
                event: principalEvent
              }]
            : []),
          {
            aggregateType: "subject",
            aggregateId: subject.subjectId,
            expectedVersion: 0,
            event: subjectEvent
          }
        ],
        writes: [
          ...(principalEvent
            ? [{ type: CoreProjectionType.PRINCIPAL, value: principal, eventId: principalEvent.eventId }]
            : []),
          { type: CoreProjectionType.SUBJECT, value: subject, eventId: subjectEvent.eventId }
        ],
        response: {
          principalId: principal.principalId,
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          subjectType: subject.subjectType,
          status: subject.status,
          schemaVersion: "tenant_agent_subject_created.v1"
        },
        authorizationResource: {
          resourceType: "subject",
          resourceId: subject.subjectId,
          actorBindings: [
            {
              actorId: authenticationContext.actorId,
              actorType: authenticationContext.actorType,
              relationship: "controller"
            },
            {
              actorId: input.subjectActorId,
              actorType: ActorType.AGENT,
              relationship: "subject",
              controllerActorId: authenticationContext.actorId
            }
          ]
        }
      };
    }
  });
}

export function readAgentSelfQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadAgentSelf",
    kind: "query",
    async execute({ coreRepository, client, resource }) {
      const subject = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        resource.resourceId,
        { lock: false }
      );
      if (!subject || subject.subjectType !== SubjectType.AGENT) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      return {
        subject,
        schemaVersion: "tenant_agent_subject_view.v1"
      };
    }
  });
}

export function createAgentSubjectHandlers() {
  return Object.freeze([
    createAgentSubjectCommandHandler(),
    readAgentSelfQueryHandler()
  ]);
}
