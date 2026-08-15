import {
  ConsentStatus,
  CreditEventType,
  DomainError,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  createConsentRecord,
  createCreditEvent,
  revokeConsentRecord
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  summarizeHumanConsent,
  summarizeHumanIdentityReference
} from "./human-self-summaries.js";

const HUMAN_WITHDRAWAL_REASON = "human_withdrawal";
const HUMAN_CONSENT_SUBJECT_STATUSES = new Set([SubjectStatus.PENDING, SubjectStatus.ACTIVE]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function assertEmptyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    throw new DomainError("invalid_tenant_command_payload", "Human Consent management payload must be empty");
  }
}

function assertHumanSubject(subject, resourceId) {
  if (
    !subject ||
    subject.subjectId !== resourceId ||
    subject.subjectType !== SubjectType.HUMAN ||
    subject.prototypeOnly !== true ||
    !HUMAN_CONSENT_SUBJECT_STATUSES.has(subject.status)
  ) {
    unavailable();
  }
}

export function createConsentCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateConsent",
    kind: "command",
    async plan({
      client,
      coreRepository,
      payload,
      authenticationContext,
      authorizationDecision,
      now,
      requestId,
      correlationId
    }) {
      if (authorizationDecision.resourceType !== "subject") unavailable();
      const subjectState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.SUBJECT,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const subject = subjectState?.value;
      assertHumanSubject(subject, authorizationDecision.resourceId);
      const principalState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.PRINCIPAL,
        subject.primaryPrincipalId,
        { lock: true }
      );
      const principal = principalState?.value;
      if (!principal || principal.principalId !== subject.primaryPrincipalId || principal.status !== PrincipalStatus.ACTIVE) {
        throw new DomainError("principal_not_active", "Human Consent requires an active Principal");
      }
      const consent = createConsentRecord({
        ...payload,
        subjectId: subject.subjectId,
        principalId: principal.principalId,
        now
      });
      const existing = await coreRepository.findConsentRecordByHashInTransaction(
        client,
        consent.consentHash
      );
      if (existing) {
        throw new DomainError("consent_already_exists", "An equivalent Human Consent already exists");
      }
      const event = createCreditEvent({
        eventType: CreditEventType.CONSENT_RECORDED,
        subjectId: consent.subjectId,
        payload: {
          consentId: consent.consentId,
          consentHash: consent.consentHash,
          termsHash: consent.termsHash,
          dataUsageHash: consent.dataUsageHash,
          principalId: consent.principalId,
          status: consent.status,
          expiresAt: consent.expiresAt,
          sandboxOnly: true,
          productionAuthority: false,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "consent",
        aggregateId: consent.consentId,
        events: [{
          aggregateType: "consent",
          aggregateId: consent.consentId,
          expectedVersion: 0,
          event
        }],
        writes: [{ type: CoreProjectionType.CONSENT_RECORD, value: consent, eventId: event.eventId }],
        response: {
          subjectId: consent.subjectId,
          consent: summarizeHumanConsent(consent),
          schemaVersion: "tenant_consent_created.v1"
        },
        authorizationResource: {
          resourceType: "consent",
          resourceId: consent.consentId,
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

export function readConsentQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadConsent",
    kind: "query",
    async execute({ client, coreRepository, resource, payload }) {
      assertEmptyPayload(payload);
      if (resource?.resourceType !== "consent") unavailable();
      const consent = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.CONSENT_RECORD,
        resource.resourceId,
        { lock: false }
      );
      if (
        !consent ||
        consent.consentId !== resource.resourceId ||
        consent.sandboxOnly !== true ||
        consent.productionAuthority !== false
      ) {
        unavailable();
      }
      return {
        consent: summarizeHumanConsent(consent),
        schemaVersion: "tenant_consent_view.v1"
      };
    }
  });
}

export function revokeConsentCommandHandler() {
  return Object.freeze({
    operationId: "pilotRevokeConsent",
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
      assertEmptyPayload(payload);
      if (
        authorizationDecision.resourceType !== "consent" ||
        reasonCode !== HUMAN_WITHDRAWAL_REASON
      ) {
        unavailable();
      }
      const state = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CONSENT_RECORD,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const consent = state?.value;
      if (
        !consent ||
        consent.consentId !== authorizationDecision.resourceId ||
        consent.status !== ConsentStatus.ACTIVE ||
        consent.sandboxOnly !== true ||
        consent.productionAuthority !== false
      ) {
        unavailable();
      }
      const revoked = revokeConsentRecord(consent, {
        reasonCode,
        evidenceRef: `urn:ipo.one:evidence:consent-revocation:${requestId}`,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.CONSENT_STATUS_CHANGED,
        subjectId: consent.subjectId,
        payload: {
          consentId: consent.consentId,
          consentHash: consent.consentHash,
          previousStatus: consent.status,
          nextStatus: revoked.status,
          reasonCode,
          actorId: authenticationContext.actorId,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "consent",
        aggregateId: consent.consentId,
        events: [{
          aggregateType: "consent",
          aggregateId: consent.consentId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{ type: CoreProjectionType.CONSENT_RECORD, value: revoked, eventId: event.eventId }],
        response: {
          consent: summarizeHumanConsent(revoked),
          reasonCode,
          schemaVersion: "tenant_consent_revoked.v1"
        }
      };
    }
  });
}

export function readHumanIdentityReferenceQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadIdentityReference",
    kind: "query",
    async execute({ client, coreRepository, resource, payload }) {
      assertEmptyPayload(payload);
      if (resource?.resourceType !== "human_identity_reference") unavailable();
      const reference = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.HUMAN_IDENTITY_REFERENCE,
        resource.resourceId,
        { lock: false }
      );
      if (
        !reference ||
        reference.identityReferenceId !== resource.resourceId ||
        reference.syntheticOnly !== true ||
        reference.productionVerified !== false
      ) {
        unavailable();
      }
      return {
        identityReference: summarizeHumanIdentityReference(reference),
        schemaVersion: "tenant_human_identity_reference_view.v1"
      };
    }
  });
}

export function createHumanConsentHandlers() {
  return Object.freeze([
    createConsentCommandHandler(),
    readConsentQueryHandler(),
    revokeConsentCommandHandler(),
    readHumanIdentityReferenceQueryHandler()
  ]);
}
