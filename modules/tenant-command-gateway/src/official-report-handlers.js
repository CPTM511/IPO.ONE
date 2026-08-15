import {
  CreditEventType,
  DomainError,
  OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION,
  OFFICIAL_REPORT_MAX_EVIDENCE_ITEMS,
  createCreditEvent,
  createOfficialReportArtifact,
  hashId,
  officialReportEffectiveStatus,
  revokeOfficialReportArtifact,
  verifyOfficialReportContent
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const CREATE_PAYLOAD_KEYS = new Set(["format", "lifetimeSeconds", "schemaVersion"]);
const OWNER_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function exactObject(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function normalizeCreatePayload(payload) {
  if (
    !exactObject(payload, CREATE_PAYLOAD_KEYS) ||
    payload.schemaVersion !== "official_report_create.v1" ||
    !new Set(["json", "csv"]).has(payload.format) ||
    !Number.isSafeInteger(payload.lifetimeSeconds) ||
    payload.lifetimeSeconds < 60 ||
    payload.lifetimeSeconds > 3600
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "official report creation payload is invalid"
    );
  }
  return structuredClone(payload);
}

function normalizeEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) unavailable();
}

function hmacRef(referenceHasher, namespace, value) {
  if (typeof referenceHasher?.hash !== "function") {
    throw new DomainError(
      "invalid_tenant_command_handler",
      "official report reference hashing is unavailable"
    );
  }
  return `0x${Buffer.from(referenceHasher.hash(namespace, value), "base64url").toString("hex")}`;
}

function reportView(artifact, now) {
  const {
    contentBase64: _contentBase64,
    ...metadata
  } = artifact;
  return {
    ...metadata,
    effectiveStatus: officialReportEffectiveStatus(artifact, now),
    asOf: now.toISOString()
  };
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
  const binding = bindings.find(({ actorId: candidate }) => candidate === actorId);
  if (!binding || !OWNER_RELATIONSHIPS.has(binding.relationship)) unavailable();
  return { binding, bindings };
}

async function loadReport(client, coreRepository, reportId, { lock = false } = {}) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.OFFICIAL_REPORT_ARTIFACT,
    reportId,
    { lock }
  );
  if (
    !state ||
    state.value.officialReportId !== reportId ||
    state.value.schemaVersion !== OFFICIAL_REPORT_ARTIFACT_SCHEMA_VERSION ||
    state.value.sandboxOnly !== true ||
    state.value.productionAuthority !== false ||
    state.value.browserAuthored !== false
  ) unavailable();
  return state;
}

async function reportCapacity({ client, coreRepository }) {
  return {
    [ResourceKind.OFFICIAL_REPORT_ARTIFACTS]:
      await coreRepository.countOfficialReportArtifactsForCapacityInTransaction(client)
  };
}

export function createOfficialReportCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateOfficialReport",
    kind: "command",
    preflight({ payload }) {
      normalizeCreatePayload(payload);
    },
    resourceDeltas() {
      return { [ResourceKind.OFFICIAL_REPORT_ARTIFACTS]: 1 };
    },
    loadResourceBaselines: reportCapacity,
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      referenceHasher,
      payload,
      now,
      requestId,
      correlationId
    }) {
      const input = normalizeCreatePayload(payload);
      if (authorizationDecision.resourceType !== "obligation") unavailable();
      const source = await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: "obligation",
        resourceId: authorizationDecision.resourceId,
        now
      });
      const obligationState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.OBLIGATION,
        authorizationDecision.resourceId,
        { lock: true }
      );
      const obligation = obligationState?.value;
      if (
        !obligation ||
        obligation.obligationId !== authorizationDecision.resourceId ||
        obligation.schemaVersion !== "obligation.v2" ||
        obligation.sandboxOnly !== true ||
        obligation.productionFundsMoved !== false
      ) unavailable();
      const evidencePage = await coreRepository.listObligationEvidenceInTransaction(client, {
        obligationId: obligation.obligationId,
        limit: OFFICIAL_REPORT_MAX_EVIDENCE_ITEMS + 1
      });
      if (
        evidencePage.length < 1 ||
        evidencePage.length > OFFICIAL_REPORT_MAX_EVIDENCE_ITEMS
      ) {
        throw new DomainError(
          "official_report_source_out_of_bounds",
          "The official report source exceeds the bounded export profile."
        );
      }
      const controllerActorRefHash = hmacRef(
        referenceHasher,
        "official_report.controller_actor",
        authenticationContext.actorId
      );
      const reportIdentity = hashId("official_report_identity", {
        obligationId: obligation.obligationId,
        requestId,
        format: input.format,
        controllerActorRefHash
      });
      const officialReportId = `official_report_${reportIdentity.slice(2)}`;
      const artifact = createOfficialReportArtifact({
        reportId: officialReportId,
        format: input.format,
        obligation,
        evidence: evidencePage,
        controllerActorRefHash,
        lifetimeSeconds: input.lifetimeSeconds,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.OFFICIAL_REPORT_ARTIFACT_ISSUED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          officialReportId,
          reportKind: artifact.reportKind,
          format: artifact.format,
          contentSha256: artifact.contentSha256,
          artifactHash: artifact.artifactHash,
          sourceObligationId: artifact.sourceObligationId,
          sourceEvidenceCount: artifact.sourceEvidenceCount,
          generatedAt: artifact.generatedAt,
          expiresAt: artifact.expiresAt,
          authorizationRevalidationRequired: true,
          objectAccessExpires: true,
          signedUrlIssued: false,
          browserAuthored: false,
          piiIncluded: false,
          secretsIncluded: false,
          sandboxOnly: true,
          productionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const actorBindings = source.bindings
        .filter(({ relationship }) => OWNER_RELATIONSHIPS.has(relationship))
        .map(({ actorId, actorType, relationship, controllerActorId }) => ({
          actorId,
          actorType,
          relationship,
          ...(controllerActorId ? { controllerActorId } : {})
        }));
      return {
        aggregateType: "official_report_artifact",
        aggregateId: officialReportId,
        events: [{
          aggregateType: "official_report_artifact",
          aggregateId: officialReportId,
          expectedVersion: 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.OFFICIAL_REPORT_ARTIFACT,
          value: artifact,
          eventId: event.eventId
        }],
        resourceBaselines: await reportCapacity({ client, coreRepository }),
        response: {
          report: reportView(artifact, now),
          schemaVersion: "tenant_official_report_created.v1"
        },
        authorizationResource: {
          resourceType: "official_report",
          resourceId: officialReportId,
          actorBindings
        }
      };
    }
  });
}

export function readOfficialReportQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadOfficialReport",
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
      normalizeEmptyPayload(payload);
      if (resource?.resourceType !== "official_report") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const state = await loadReport(client, coreRepository, resource.resourceId);
      return {
        report: reportView(state.value, now),
        schemaVersion: "tenant_official_report_view.v1"
      };
    }
  });
}

export function retrieveOfficialReportQueryHandler() {
  return Object.freeze({
    operationId: "pilotRetrieveOfficialReport",
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
      normalizeEmptyPayload(payload);
      if (resource?.resourceType !== "official_report") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const state = await loadReport(client, coreRepository, resource.resourceId);
      if (officialReportEffectiveStatus(state.value, now) !== "active") unavailable();
      const verification = verifyOfficialReportContent(state.value);
      if (!verification.verified) {
        throw new DomainError(
          "official_report_integrity_mismatch",
          "The official report failed its server integrity check."
        );
      }
      return {
        report: reportView(state.value, now),
        contentBase64: state.value.contentBase64,
        integrityVerified: true,
        authorizationRevalidatedAt: now.toISOString(),
        schemaVersion: "tenant_official_report_retrieval.v1"
      };
    }
  });
}

export function revokeOfficialReportCommandHandler() {
  return Object.freeze({
    operationId: "pilotRevokeOfficialReport",
    kind: "command",
    async plan({
      client,
      coreRepository,
      directory,
      authenticationContext,
      authorizationDecision,
      referenceHasher,
      payload,
      reasonCode,
      now,
      requestId,
      correlationId
    }) {
      normalizeEmptyPayload(payload);
      if (authorizationDecision.resourceType !== "official_report") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadReport(
        client,
        coreRepository,
        authorizationDecision.resourceId,
        { lock: true }
      );
      if (
        hmacRef(
          referenceHasher,
          "official_report.controller_actor",
          authenticationContext.actorId
        ) !== state.value.controllerActorRefHash
      ) unavailable();
      const artifact = revokeOfficialReportArtifact({
        artifact: state.value,
        reasonCode,
        now
      });
      const obligation = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.OBLIGATION,
        artifact.sourceObligationId,
        { lock: false }
      );
      if (!obligation?.subjectId) unavailable();
      const event = createCreditEvent({
        eventType: CreditEventType.OFFICIAL_REPORT_ARTIFACT_REVOKED,
        subjectId: obligation.subjectId,
        obligationId: obligation.obligationId,
        payload: {
          officialReportId: artifact.officialReportId,
          artifactHash: artifact.artifactHash,
          contentSha256: artifact.contentSha256,
          sourceObligationId: artifact.sourceObligationId,
          status: artifact.status,
          revokedAt: artifact.revokedAt,
          revocationReasonCode: artifact.revocationReasonCode,
          sandboxOnly: true,
          productionAuthority: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      return {
        aggregateType: "official_report_artifact",
        aggregateId: artifact.officialReportId,
        events: [{
          aggregateType: "official_report_artifact",
          aggregateId: artifact.officialReportId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.OFFICIAL_REPORT_ARTIFACT,
          value: artifact,
          eventId: event.eventId
        }],
        response: {
          report: reportView(artifact, now),
          schemaVersion: "tenant_official_report_revoked.v1"
        },
        authorizationResourceTransition: {
          resourceType: authorizationDecision.resourceType,
          resourceId: authorizationDecision.resourceId,
          expectedStatus: "active",
          nextStatus: "closed",
          expectedVersion: authorizationDecision.resourceVersion
        }
      };
    }
  });
}

export function createOfficialReportHandlers() {
  return Object.freeze([
    createOfficialReportCommandHandler(),
    readOfficialReportQueryHandler(),
    retrieveOfficialReportQueryHandler(),
    revokeOfficialReportCommandHandler()
  ]);
}
