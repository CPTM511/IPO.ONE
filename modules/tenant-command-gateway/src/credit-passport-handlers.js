import {
  CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION,
  CREDIT_PASSPORT_CLAIM_ALLOWLIST,
  CREDIT_PASSPORT_DEFAULT_LIFETIME_SECONDS,
  CREDIT_PASSPORT_MAX_LIFETIME_SECONDS,
  CREDIT_PASSPORT_PURPOSE,
  CreditEventType,
  CreditPassportArtifactStatus,
  DomainError,
  createCreditEvent,
  createCreditPassportArtifact,
  hashId,
  revokeCreditPassportArtifact,
  verifyCreditPassportArtifact
} from "../../../packages/domain/src/index.js";
import { ResourceKind } from "../../abuse-control/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const CREATE_PAYLOAD_KEYS = new Set([
  "creditIntentId",
  "verifierActorId",
  "claimSelectors",
  "lifetimeSeconds",
  "schemaVersion"
]);
const VERIFY_PAYLOAD_KEYS = new Set([
  "artifactHash",
  "artifactVersion",
  "purpose",
  "schemaVersion"
]);
const CLAIM_SET = new Set(CREDIT_PASSPORT_CLAIM_ALLOWLIST);
const OWNER_RELATIONSHIPS = new Set(["owner", "controller", "subject"]);

function unavailable() {
  throw new DomainError("tenant_resource_unavailable", "The requested resource is not available.");
}

function exactObject(payload, keys) {
  return (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.getPrototypeOf(payload) === Object.prototype &&
    Object.keys(payload).length === keys.size &&
    Object.keys(payload).every((key) => keys.has(key))
  );
}

function normalizeCreatePayload(payload) {
  if (
    !exactObject(payload, CREATE_PAYLOAD_KEYS) ||
    payload.schemaVersion !== "credit_passport_artifact_create.v1" ||
    typeof payload.creditIntentId !== "string" ||
    !IDENTIFIER_PATTERN.test(payload.creditIntentId) ||
    typeof payload.verifierActorId !== "string" ||
    !IDENTIFIER_PATTERN.test(payload.verifierActorId) ||
    !Array.isArray(payload.claimSelectors) ||
    payload.claimSelectors.length < 1 ||
    payload.claimSelectors.length > CREDIT_PASSPORT_CLAIM_ALLOWLIST.length ||
    payload.claimSelectors.some((claim) => !CLAIM_SET.has(claim)) ||
    new Set(payload.claimSelectors).size !== payload.claimSelectors.length ||
    !Number.isSafeInteger(payload.lifetimeSeconds) ||
    payload.lifetimeSeconds < 60 ||
    payload.lifetimeSeconds > CREDIT_PASSPORT_MAX_LIFETIME_SECONDS
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Credit Passport creation payload is invalid"
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

function normalizeVerifyPayload(payload) {
  if (
    !exactObject(payload, VERIFY_PAYLOAD_KEYS) ||
    payload.schemaVersion !== "credit_passport_verification_request.v1" ||
    typeof payload.artifactHash !== "string" ||
    !HASH_PATTERN.test(payload.artifactHash) ||
    !Number.isSafeInteger(payload.artifactVersion) ||
    payload.artifactVersion < 1 ||
    payload.purpose !== CREDIT_PASSPORT_PURPOSE
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Credit Passport verification payload is invalid"
    );
  }
  return structuredClone(payload);
}

function hmacRef(referenceHasher, namespace, value) {
  if (typeof referenceHasher?.hash !== "function") {
    throw new DomainError(
      "invalid_tenant_command_handler",
      "Credit Passport reference hashing is unavailable"
    );
  }
  return `0x${Buffer.from(referenceHasher.hash(namespace, value), "base64url").toString("hex")}`;
}

function artifactView(artifact, now) {
  const effectiveStatus =
    artifact.status === CreditPassportArtifactStatus.REVOKED
      ? "revoked"
      : now >= new Date(artifact.expiresAt)
        ? "expired"
        : "active";
  return {
    ...artifact,
    effectiveStatus,
    asOf: now.toISOString(),
    schemaVersion: CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION
  };
}

async function requireActiveVerifier(client, verifierActorId, now) {
  const result = await client.query(
    `SELECT a.id, a.actor_type
       FROM actors a
       JOIN memberships m
         ON m.actor_id = a.id
      WHERE m.tenant_id = current_app_tenant_id()
        AND a.id = $1
        AND a.status = 'active'
        AND m.status = 'active'
        AND m.valid_from <= $2
        AND (m.expires_at IS NULL OR m.expires_at > $2)
      LIMIT 2
      FOR SHARE OF a, m`,
    [verifierActorId, now]
  );
  if (result.rowCount !== 1) unavailable();
  return {
    actorId: result.rows[0].id,
    actorType: result.rows[0].actor_type
  };
}

async function requireRelationship(directory, {
  actorId,
  allowedRelationships,
  resourceType,
  resourceId,
  now
}) {
  const bindings = await directory.listActiveResourceBindings({
    resourceType,
    resourceId,
    now
  });
  const binding = bindings.find(({ actorId: boundActorId }) => boundActorId === actorId);
  if (!binding || !allowedRelationships.has(binding.relationship)) unavailable();
  return { binding, bindings };
}

async function loadArtifactState(client, coreRepository, resourceId, { lock }) {
  const state = await coreRepository.getProjectionStateInTransaction(
    client,
    CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
    resourceId,
    { lock }
  );
  if (
    !state ||
    state.value.creditPassportArtifactId !== resourceId ||
    state.value.schemaVersion !== CREDIT_PASSPORT_ARTIFACT_SCHEMA_VERSION ||
    state.value.sandboxOnly !== true ||
    state.value.productionAuthority !== false
  ) unavailable();
  return state;
}

async function passportCapacity({ client, coreRepository }) {
  return {
    [ResourceKind.CREDIT_PASSPORT_ARTIFACTS]:
      await coreRepository.countCreditPassportArtifactsForCapacityInTransaction(client)
  };
}

export function createCreditPassportArtifactCommandHandler() {
  return Object.freeze({
    operationId: "pilotCreateCreditPassportArtifact",
    kind: "command",
    preflight({ payload }) {
      normalizeCreatePayload(payload);
    },
    resourceDeltas() {
      return { [ResourceKind.CREDIT_PASSPORT_ARTIFACTS]: 1 };
    },
    loadResourceBaselines: passportCapacity,
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
      if (
        authorizationDecision.resourceType !== "subject" ||
        authorizationDecision.resourceId.length < 1 ||
        authenticationContext.actorType !== ActorType.HUMAN
      ) unavailable();
      const subjectId = authorizationDecision.resourceId;
      const { binding: creatorBinding, bindings: subjectBindings } =
        await requireRelationship(directory, {
          actorId: authenticationContext.actorId,
          allowedRelationships: new Set(["owner", "controller"]),
          resourceType: "subject",
          resourceId: subjectId,
          now
        });
      const decision = await coreRepository.findRiskDecisionByCreditIntentInTransaction(
        client,
        input.creditIntentId,
        { lock: true }
      );
      if (
        !decision ||
        decision.subjectId !== subjectId ||
        decision.schemaVersion !== "risk_decision.v3" ||
        decision.sandboxOnly !== true ||
        decision.productionAuthority !== false
      ) unavailable();
      const verifier = await requireActiveVerifier(client, input.verifierActorId, now);
      const controllerActorRefHash = hmacRef(
        referenceHasher,
        "credit_passport.controller_actor",
        authenticationContext.actorId
      );
      const verifierActorRefHash = hmacRef(
        referenceHasher,
        "credit_passport.verifier_actor",
        verifier.actorId
      );
      const identityHash = hashId("credit_passport_artifact_identity", {
        sourceDecisionPassportHash: decision.decisionPassport.decisionPassportHash,
        controllerActorRefHash,
        verifierActorRefHash,
        purpose: CREDIT_PASSPORT_PURPOSE
      });
      const creditPassportArtifactId = `credit_passport_artifact_${identityHash.slice(2)}`;
      const previousState = await coreRepository.getProjectionStateInTransaction(
        client,
        CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
        creditPassportArtifactId,
        { lock: true }
      );
      const previousArtifact = previousState?.value;
      if (
        previousArtifact &&
        (
          previousArtifact.sourceDecisionPassportHash !==
            decision.decisionPassport.decisionPassportHash ||
          previousArtifact.controllerActorRefHash !== controllerActorRefHash ||
          previousArtifact.verifierActorRefHash !== verifierActorRefHash ||
          previousArtifact.purpose !== CREDIT_PASSPORT_PURPOSE ||
          previousArtifact.status !== CreditPassportArtifactStatus.ACTIVE
        )
      ) unavailable();
      const existingAuthorizationResource = previousArtifact
        ? await directory.resolveResource({
            resourceType: "credit_passport_artifact",
            resourceId: creditPassportArtifactId,
            tenantId: authenticationContext.tenantId,
            actorId: authenticationContext.actorId
          })
        : undefined;
      if (
        previousArtifact &&
        (
          !existingAuthorizationResource ||
          existingAuthorizationResource.status !== "active" ||
          existingAuthorizationResource.actorAuthorized !== true ||
          !new Set(["owner", "controller"]).has(
            existingAuthorizationResource.bindingRelationship
          )
        )
      ) unavailable();
      const artifact = createCreditPassportArtifact({
        creditPassportArtifactId,
        decision,
        controllerActorRefHash,
        verifierActorRefHash,
        claimSelectors: input.claimSelectors,
        lifetimeSeconds: input.lifetimeSeconds ?? CREDIT_PASSPORT_DEFAULT_LIFETIME_SECONDS,
        ...(previousArtifact ? { previousArtifact } : {}),
        now
      });
      const event = createCreditEvent({
        eventType: previousArtifact
          ? CreditEventType.CREDIT_PASSPORT_ARTIFACT_SUPERSEDED
          : CreditEventType.CREDIT_PASSPORT_ARTIFACT_ISSUED,
        subjectId,
        payload: {
          creditPassportArtifactId,
          artifactHash: artifact.artifactHash,
          artifactVersion: artifact.version,
          ...(previousArtifact
            ? {
                supersededArtifactHash: previousArtifact.artifactHash,
                supersededVersion: previousArtifact.version
              }
            : {}),
          sourceDecisionPassportHash: artifact.sourceDecisionPassportHash,
          claimManifestHash: artifact.claimManifestHash,
          selectedClaims: artifact.selectedClaims,
          issuerVersion: artifact.issuer.version,
          purpose: artifact.purpose,
          verifierActorRefHash,
          issuedAt: artifact.issuedAt,
          expiresAt: artifact.expiresAt,
          status: artifact.status,
          pointInTime: true,
          nonAuthorizing: true,
          sandboxOnly: true,
          productionAuthority: false,
          piiIncluded: false,
          rawTransactionDataIncluded: false,
          scoreAuthoritative: false,
          causationId: requestId,
          correlationId
        },
        now
      });
      const actorBindings = [];
      const addBinding = (candidate) => {
        if (!actorBindings.some(({ actorId }) => actorId === candidate.actorId)) {
          actorBindings.push(candidate);
        }
      };
      addBinding({
        actorId: authenticationContext.actorId,
        actorType: authenticationContext.actorType,
        relationship: creatorBinding.relationship === "owner" ? "owner" : "controller"
      });
      for (const binding of subjectBindings.filter(
        ({ relationship, actorType }) =>
          relationship === "subject" && actorType === ActorType.AGENT
      )) {
        addBinding({
          actorId: binding.actorId,
          actorType: binding.actorType,
          relationship: "subject",
          controllerActorId: authenticationContext.actorId
        });
      }
      addBinding({
        actorId: verifier.actorId,
        actorType: verifier.actorType,
        relationship: "verifier"
      });
      if (existingAuthorizationResource) {
        await directory.advanceResourceVersion({
          resourceType: "credit_passport_artifact",
          resourceId: creditPassportArtifactId,
          expectedVersion: existingAuthorizationResource.version,
          now
        });
      }
      return {
        aggregateType: "credit_passport_artifact",
        aggregateId: creditPassportArtifactId,
        events: [{
          aggregateType: "credit_passport_artifact",
          aggregateId: creditPassportArtifactId,
          expectedVersion: previousState?.aggregateVersion ?? 0,
          event
        }],
        writes: [{
          type: CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
          value: artifact,
          eventId: event.eventId
        }],
        resourceBaselines: await passportCapacity({ client, coreRepository }),
        response: {
          artifact: artifactView(artifact, now),
          replaced: previousArtifact !== undefined,
          schemaVersion: "tenant_credit_passport_artifact_created.v1"
        },
        ...(previousArtifact
          ? {}
          : {
              authorizationResource: {
                resourceType: "credit_passport_artifact",
                resourceId: creditPassportArtifactId,
                actorBindings
              }
            })
      };
    }
  });
}

export function readOwnCreditPassportArtifactQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadOwnCreditPassportArtifact",
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
      if (resource?.resourceType !== "credit_passport_artifact") unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        allowedRelationships: OWNER_RELATIONSHIPS,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      const state = await loadArtifactState(
        client,
        coreRepository,
        resource.resourceId,
        { lock: false }
      );
      return {
        artifact: artifactView(state.value, now),
        schemaVersion: "tenant_owned_credit_passport_artifact_view.v1"
      };
    }
  });
}

export function verifyCreditPassportArtifactQueryHandler() {
  return Object.freeze({
    operationId: "pilotVerifyCreditPassportArtifact",
    kind: "query",
    async execute({
      client,
      coreRepository,
      directory,
      authenticationContext,
      referenceHasher,
      resource,
      payload,
      now
    }) {
      const input = normalizeVerifyPayload(payload);
      if (resource?.resourceType !== "credit_passport_artifact") unavailable();
      const state = await loadArtifactState(
        client,
        coreRepository,
        resource.resourceId,
        { lock: false }
      );
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        allowedRelationships: new Set(["owner", "controller", "subject", "verifier"]),
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        now
      });
      if (
        hmacRef(
          referenceHasher,
          "credit_passport.verifier_actor",
          authenticationContext.actorId
        ) !== state.value.verifierActorRefHash ||
        input.purpose !== state.value.purpose
      ) unavailable();
      if (
        input.artifactHash !== state.value.artifactHash ||
        input.artifactVersion !== state.value.version
      ) unavailable();
      const sourceDecision = await coreRepository.getProjectionInTransaction(
        client,
        CoreProjectionType.RISK_DECISION,
        state.value.sourceRiskDecisionId,
        { lock: false }
      );
      const verification = verifyCreditPassportArtifact({
        artifact: state.value,
        presentedArtifactHash: input.artifactHash,
        presentedVersion: input.artifactVersion,
        sourceDecision,
        now
      });
      return {
        verification,
        ...(verification.verified ? { artifact: artifactView(state.value, now) } : {}),
        schemaVersion: "tenant_credit_passport_verification_result.v1"
      };
    }
  });
}

export function revokeCreditPassportArtifactCommandHandler() {
  return Object.freeze({
    operationId: "pilotRevokeCreditPassportArtifact",
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
      if (
        authorizationDecision.resourceType !== "credit_passport_artifact" ||
        authenticationContext.actorType !== ActorType.HUMAN
      ) unavailable();
      await requireRelationship(directory, {
        actorId: authenticationContext.actorId,
        allowedRelationships: new Set(["owner", "controller"]),
        resourceType: authorizationDecision.resourceType,
        resourceId: authorizationDecision.resourceId,
        now
      });
      const state = await loadArtifactState(
        client,
        coreRepository,
        authorizationDecision.resourceId,
        { lock: true }
      );
      if (
        hmacRef(
          referenceHasher,
          "credit_passport.controller_actor",
          authenticationContext.actorId
        ) !== state.value.controllerActorRefHash
      ) unavailable();
      const artifact = revokeCreditPassportArtifact({
        artifact: state.value,
        reasonCode,
        now
      });
      const event = createCreditEvent({
        eventType: CreditEventType.CREDIT_PASSPORT_ARTIFACT_REVOKED,
        subjectId: artifact.subjectId,
        payload: {
          creditPassportArtifactId: artifact.creditPassportArtifactId,
          artifactHash: artifact.artifactHash,
          previousArtifactHash: state.value.artifactHash,
          artifactVersion: artifact.version,
          sourceDecisionPassportHash: artifact.sourceDecisionPassportHash,
          verifierActorRefHash: artifact.verifierActorRefHash,
          purpose: artifact.purpose,
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
        aggregateType: "credit_passport_artifact",
        aggregateId: artifact.creditPassportArtifactId,
        events: [{
          aggregateType: "credit_passport_artifact",
          aggregateId: artifact.creditPassportArtifactId,
          expectedVersion: state.aggregateVersion,
          event
        }],
        writes: [{
          type: CoreProjectionType.CREDIT_PASSPORT_ARTIFACT,
          value: artifact,
          eventId: event.eventId
        }],
        response: {
          artifact: artifactView(artifact, now),
          schemaVersion: "tenant_credit_passport_artifact_revoked.v1"
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

export function createCreditPassportHandlers() {
  return Object.freeze([
    createCreditPassportArtifactCommandHandler(),
    readOwnCreditPassportArtifactQueryHandler(),
    verifyCreditPassportArtifactQueryHandler(),
    revokeCreditPassportArtifactCommandHandler()
  ]);
}
