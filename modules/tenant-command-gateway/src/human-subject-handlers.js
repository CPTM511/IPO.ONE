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

export function createHumanSubjectHandlers(options) {
  return Object.freeze([
    createHumanSubjectCommandHandler(),
    readHumanSelfQueryHandler(),
    activateSandboxHumanSubjectCommandHandler(options)
  ]);
}

// WEB-027K1: explicit, exact local Human activation; never an identity-provider side effect.
export function activateSandboxHumanSubjectCommandHandler({ localSandboxHumanActivation = false } = {}) {
  return Object.freeze({
    operationId: "pilotActivateSandboxHumanSubject",
    kind: "command",
    async plan({ client, coreRepository, payload, authenticationContext, authorizationDecision, now, requestId, correlationId }) {
      const reject = () => { throw new DomainError("sandbox_human_activation_rejected", "Refresh the profile and confirm an active scoped Consent and local synthetic identity reference."); };
      if (!localSandboxHumanActivation || authenticationContext.actorType !== "human" ||
          !authenticationContext.roles?.includes("human_borrower") || authorizationDecision.resourceType !== "subject" ||
          !payload || Object.keys(payload).sort().join(",") !== "acknowledgement,consentId,expectedSubjectUpdatedAt,identityReferenceId" ||
          payload.acknowledgement !== "activate_synthetic_profile_no_credit_or_funds") reject();
      // Runtime flag alone cannot enable this operation on any hosted or unrelated database.
      const database = await client.query("SELECT current_database() AS name");
      if (!["ipo_one_web027_candidate", "ipo_one_web027_proof"].includes(database.rows[0]?.name)) reject();
      const state = await coreRepository.getProjectionStateInTransaction(client, CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId, { lock: true });
      const subject = state?.value;
      if (!subject || subject.subjectId !== authorizationDecision.resourceId || subject.subjectType !== SubjectType.HUMAN ||
          subject.status !== "pending" || subject.prototypeOnly !== true ||
          subject.updatedAt !== payload.expectedSubjectUpdatedAt || state.rootAggregateType !== "subject" ||
          state.rootAggregateId !== subject.subjectId || !Number.isSafeInteger(state.aggregateVersion)) reject();
      const principal = await coreRepository.getProjectionInTransaction(client, CoreProjectionType.PRINCIPAL,
        subject.primaryPrincipalId, { lock: true });
      const consent = await coreRepository.getConsentRecordInTransaction(client, payload.consentId);
      const reference = await coreRepository.getProjectionInTransaction(client, CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
        payload.identityReferenceId, { lock: true });
      const current = value => value && value.status === "active" &&
        new Date(value.validFrom).getTime() <= now.getTime() && new Date(value.expiresAt).getTime() > now.getTime();
      if (!principal || principal.status !== PrincipalStatus.ACTIVE || principal.principalType !== PrincipalType.HUMAN_SELF ||
          !current(consent) || consent.subjectId !== subject.subjectId || consent.principalId !== principal.principalId ||
          consent.sandboxOnly !== true || consent.productionAuthority !== false ||
          !["identity_reference_use", "credit_decision"].every(p => consent.purposes.includes(p)) ||
          !current(reference) || reference.subjectId !== subject.subjectId || reference.principalId !== principal.principalId ||
          reference.consentId !== consent.consentId || reference.consentHash !== consent.consentHash ||
          reference.syntheticOnly !== true || reference.productionVerified !== false ||
          reference.providerRef !== "urn:ipo.one:private-pilot:synthetic-identity-provider:v1" ||
          reference.providerVersion !== "private_pilot_synthetic_provider.v1" ||
          reference.assuranceLevel !== "synthetic_provider_asserted" ||
          !["identity_reference_use", "credit_decision"].every(p => reference.purposeCodes.includes(p))) reject();
      const adverse = await client.query(`SELECT id FROM obligations WHERE subject_id=$1
        AND status IN ('overdue','delinquent','defaulted','restructured','repurchased','written_off')
        UNION ALL SELECT id FROM credit_lines WHERE subject_id=$1 AND status='frozen'`, [subject.subjectId]);
      if (adverse.rowCount > 0) reject();
      const activated = { ...subject, status: "active", updatedAt: now.toISOString() };
      const event = createCreditEvent({ eventType: CreditEventType.SUBJECT_STATUS_CHANGED, subjectId: subject.subjectId,
        payload: { subjectId: subject.subjectId, previousStatus: "pending", nextStatus: "active",
          consentId: consent.consentId, identityReferenceId: reference.identityReferenceId,
          sandboxOnly: true, productionAuthority: false, reasonCode: "explicit_local_synthetic_activation",
          actorId: authenticationContext.actorId, causationId: requestId, correlationId }, now });
      return { aggregateType: "subject", aggregateId: subject.subjectId,
        events: [{ aggregateType: "subject", aggregateId: subject.subjectId, expectedVersion: state.aggregateVersion, event }],
        writes: [{ type: CoreProjectionType.SUBJECT, value: activated, eventId: event.eventId }],
        response: { principalId: principal.principalId, subjectId: subject.subjectId, subjectHash: subject.subjectHash,
          subjectType: "human", status: "active", prototypeOnly: true, consentId: consent.consentId,
          identityReferenceId: reference.identityReferenceId, updatedAt: activated.updatedAt,
          schemaVersion: "tenant_sandbox_human_subject_activated.v1" } };
    }
  });
}
