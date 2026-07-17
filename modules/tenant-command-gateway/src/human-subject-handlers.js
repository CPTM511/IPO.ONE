import {
  CreditEventType,
  DomainError,
  PrincipalStatus,
  PrincipalType,
  SubjectType,
  createCreditEvent,
  createPrincipal,
  createSubject,
  hashId
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  summarizeHumanConsent,
  summarizeHumanIdentityReference
} from "./human-self-summaries.js";

function assertEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Human self-service payload must be empty");
  }
}

export function createHumanSubjectCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateHumanSubject",
    kind: "command",
    async plan({ client, coreRepository, payload, authenticationContext, now, requestId, correlationId }) {
      assertEmptyPayload(payload);
      const principalAuthorityRef = hashId("tenant_human_self_authority", {
        tenantId: authenticationContext.tenantId,
        actorId: authenticationContext.actorId
      });
      const candidatePrincipal = createPrincipal({
        principalType: PrincipalType.HUMAN_SELF,
        jurisdiction: "US",
        legalEntityRef: principalAuthorityRef,
        now
      });
      const existingPrincipal = await coreRepository.findPrincipalByHashInTransaction(
        client,
        candidatePrincipal.principalHash
      );
      if (existingPrincipal && existingPrincipal.status !== PrincipalStatus.ACTIVE) {
        throw new DomainError("principal_not_active", "Human Subject creation requires an active Principal");
      }
      const principal = existingPrincipal ?? candidatePrincipal;
      const existingSubject = await coreRepository.findHumanSubjectByPrincipalInTransaction(
        client,
        principal.principalId
      );
      if (existingSubject) {
        throw new DomainError("human_subject_already_exists", "The Human Actor already owns a Human Subject");
      }
      const subject = createSubject({
        subjectType: SubjectType.HUMAN,
        primaryPrincipalId: principal.principalId,
        displayName: "Human Credit Profile",
        prototypeOnly: true,
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
          prototypeOnly: true,
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
          prototypeOnly: true,
          schemaVersion: "tenant_human_subject_created.v1"
        },
        authorizationResource: {
          resourceType: "subject",
          resourceId: subject.subjectId,
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

export function readHumanSelfQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadHumanSelf",
    kind: "query",
    async execute({ coreRepository, client, resource, payload }) {
      assertEmptyPayload(payload);
      const subject = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        resource.resourceId,
        { lock: false }
      );
      if (
        !subject ||
        subject.subjectType !== SubjectType.HUMAN ||
        subject.prototypeOnly !== true
      ) {
        throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
      }
      const consentPage = await coreRepository.listConsentRecordsForSubjectInTransaction(
        client,
        subject.subjectId,
        { limit: 50 }
      );
      const identityReferencePage = await coreRepository.listHumanIdentityReferencesForSubjectInTransaction(
        client,
        subject.subjectId,
        { limit: 50 }
      );
      return {
        subject,
        consents: consentPage.items.map(summarizeHumanConsent),
        identityReferences: identityReferencePage.items.map(summarizeHumanIdentityReference),
        hasMoreConsents: consentPage.hasMore,
        hasMoreIdentityReferences: identityReferencePage.hasMore,
        schemaVersion: "tenant_human_subject_view.v1"
      };
    }
  });
}

export function createHumanSubjectHandlers() {
  return Object.freeze([
    createHumanSubjectCommandHandler(),
    readHumanSelfQueryHandler()
  ]);
}
