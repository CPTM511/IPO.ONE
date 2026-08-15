import { DomainError } from "../../../packages/domain/src/index.js";
import { ActorType } from "../../authentication/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { loadPassport } from "./capital-partner-handlers.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{0,255}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const INBOX_LIMIT = 16;

function unavailable() {
  throw new DomainError(
    "workspace_recovery_unavailable",
    "The authenticated Capital Partner workspace cannot be recovered."
  );
}

function assertEmptyPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 0
  ) {
    throw new DomainError(
      "invalid_tenant_command_payload",
      "Capital Partner workspace recovery payload must be empty"
    );
  }
}

async function activeProfile({ client, coreRepository, directory, authenticationContext }) {
  if (authenticationContext.actorType !== ActorType.HUMAN) unavailable();
  const profile = await coreRepository.getCapitalPartnerProfileByOperatorInTransaction(
    client,
    authenticationContext.actorId,
    { lock: false }
  );
  if (
    !profile ||
    profile.tenantId !== authenticationContext.tenantId ||
    profile.operatorActorId !== authenticationContext.actorId ||
    profile.status !== "active" ||
    profile.invitationOnly !== true ||
    profile.sameTenantOnly !== true ||
    profile.sandboxOnly !== true ||
    profile.productionFundsAuthority !== false ||
    profile.schemaVersion !== "capital_partner_profile.v1"
  ) unavailable();
  const resource = await directory.resolveResource({
    resourceType: "capital_partner_profile",
    resourceId: profile.capitalPartnerId,
    tenantId: authenticationContext.tenantId,
    actorId: authenticationContext.actorId
  });
  if (
    !resource ||
    resource.status !== "active" ||
    resource.actorAuthorized !== true ||
    resource.bindingRelationship !== "owner"
  ) unavailable();
  return profile;
}

function exactCandidate(row) {
  const descriptors = row && typeof row === "object"
    ? Object.getOwnPropertyDescriptors(row)
    : undefined;
  return (
    row &&
    typeof row === "object" &&
    !Array.isArray(row) &&
    Object.getPrototypeOf(row) === Object.prototype &&
    Reflect.ownKeys(row).length === 3 &&
    Object.hasOwn(row, "artifact_id") &&
    Object.hasOwn(row, "artifact_hash") &&
    Object.hasOwn(row, "artifact_version") &&
    Object.values(descriptors).every((descriptor) => (
      Object.hasOwn(descriptor, "value") &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    )) &&
    typeof row.artifact_id === "string" &&
    IDENTIFIER.test(row.artifact_id) &&
    typeof row.artifact_hash === "string" &&
    HASH.test(row.artifact_hash) &&
    Number.isSafeInteger(row.artifact_version) &&
    row.artifact_version >= 1
  );
}

export function readCapitalPartnerSelfQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCapitalPartnerSelf",
    kind: "query",
    async execute({ client, coreRepository, directory, authenticationContext, payload }) {
      assertEmptyPayload(payload);
      const profile = await activeProfile({
        client,
        coreRepository,
        directory,
        authenticationContext
      });
      return {
        resource: {
          resourceType: "capital_partner_profile",
          resourceId: profile.capitalPartnerId
        },
        profile: {
          capitalPartnerId: profile.capitalPartnerId,
          displayName: profile.displayName
        },
        fundsAuthority: false,
        serverTruth: true,
        readOnly: true,
        schemaVersion: "tenant_capital_partner_self_view.v1"
      };
    }
  });
}

export function readCapitalPartnerPassportInboxQueryHandler() {
  return Object.freeze({
    operationId: "pilotReadCapitalPartnerPassportInbox",
    kind: "query",
    async execute({
      client,
      coreRepository,
      directory,
      authenticationContext,
      referenceHasher,
      payload,
      now
    }) {
      assertEmptyPayload(payload);
      await activeProfile({
        client,
        coreRepository,
        directory,
        authenticationContext
      });
      if (typeof referenceHasher?.hash !== "function") unavailable();
      const expectedVerifierHash = `0x${Buffer.from(
        referenceHasher.hash(
          "credit_passport.verifier_actor",
          authenticationContext.actorId
        ),
        "base64url"
      ).toString("hex")}`;
      const candidates = await client.query(
        `SELECT a.id AS artifact_id,
                a.artifact_hash,
                a.version::int AS artifact_version
           FROM authorization_resource_bindings AS b
           JOIN authorization_resources AS r
             ON r.tenant_id = b.tenant_id
            AND r.resource_type = b.resource_type
            AND r.resource_id = b.resource_id
           JOIN credit_passport_artifacts AS a
             ON a.tenant_id = b.tenant_id
            AND a.id = b.resource_id
          WHERE b.tenant_id = current_app_tenant_id()
            AND b.actor_id = current_app_actor_id()
            AND b.resource_type = 'credit_passport_artifact'
            AND b.relationship = 'verifier'
            AND b.status = 'active'
            AND r.status = 'active'
            AND a.status = 'active'
            AND a.expires_at > $2
            AND a.verifier_actor_ref_hash = $1
            AND a.purpose = 'private_credit_review'
            AND a.same_tenant_only = TRUE
            AND a.sandbox_only = TRUE
            AND a.production_authority = FALSE
          ORDER BY a.issued_at DESC, a.id ASC
          LIMIT $3`,
        [expectedVerifierHash, now, INBOX_LIMIT + 1]
      );
      if (
        !Array.isArray(candidates?.rows) ||
        !Number.isSafeInteger(candidates.rowCount) ||
        candidates.rowCount !== candidates.rows.length ||
        candidates.rows.length > INBOX_LIMIT ||
        candidates.rows.some((row) => !exactCandidate(row)) ||
        new Set(candidates.rows.map(({ artifact_id: artifactId }) => artifactId)).size !==
          candidates.rows.length
      ) unavailable();

      const items = [];
      for (const candidate of candidates.rows) {
        try {
          const { artifact, sourceDecision } = await loadPassport({
            client,
            coreRepository,
            artifactId: candidate.artifact_id,
            artifactHash: candidate.artifact_hash,
            artifactVersion: candidate.artifact_version,
            operatorActorId: authenticationContext.actorId,
            referenceHasher,
            now,
            lock: false
          });
          const intent = await coreRepository.getProjectionInTransaction(
            client,
            CoreProjectionType.CREDIT_INTENT,
            sourceDecision.creditIntentId,
            { lock: false }
          );
          if (
            !intent ||
            intent.schemaVersion !== "credit_intent.v1" ||
            intent.creditIntentId !== sourceDecision.creditIntentId ||
            intent.subjectId !== artifact.subjectId ||
            intent.status !== "decided" ||
            intent.sandboxOnly !== true ||
            intent.productionFundsRequested !== false ||
            !Array.isArray(artifact.selectedClaims) ||
            artifact.selectedClaims.length < 1 ||
            artifact.selectedClaims.length > 9
          ) unavailable();
          items.push({
            resource: {
              resourceType: "credit_passport_artifact",
              resourceId: artifact.creditPassportArtifactId
            },
            reviewContext: {
              creditIntentId: intent.creditIntentId,
              artifactHash: artifact.artifactHash,
              artifactVersion: artifact.version
            },
            summary: {
              claimCount: artifact.selectedClaims.length,
              purpose: artifact.purpose,
              issuedAt: artifact.issuedAt,
              expiresAt: artifact.expiresAt
            }
          });
        } catch {
          unavailable();
        }
      }
      return {
        items,
        count: items.length,
        hasMore: false,
        fundsAuthority: false,
        serverTruth: true,
        readOnly: true,
        schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
      };
    }
  });
}

export function createCapitalPartnerWorkspaceHandlers() {
  return Object.freeze([
    readCapitalPartnerSelfQueryHandler(),
    readCapitalPartnerPassportInboxQueryHandler()
  ]);
}
