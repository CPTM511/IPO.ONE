import {
  CreditEventType,
  createCreditEvent,
  createHumanIdentityReference,
  hashId
} from "../../../packages/domain/src/index.js";
import { PostgresAuthorizationDirectory } from "../../../modules/authorization/src/index.js";
import {
  PostgresCoreRepository,
  PostgresEventRepository,
  createTenantSecurityContextFromAuthentication
} from "../../../modules/persistence/src/index.js";

const SYNTHETIC_IDENTITY_PROFILES = Object.freeze({
  local: Object.freeze({
    lockNamespace: "private_pilot_synthetic_identity",
    providerRef: "urn:ipo.one:private-pilot:synthetic-identity-provider:v1",
    providerVersion: "private_pilot_synthetic_provider.v1",
    referencePrefix: "urn:ipo.one:private-pilot:synthetic-evidence",
    idempotencyPrefix: "private-pilot-synthetic-identity-v2",
    hashNamespace: "private_pilot_synthetic_identity"
  }),
  production_sandbox: Object.freeze({
    lockNamespace: "production_sandbox_synthetic_identity",
    providerRef: "urn:ipo.one:closed-pilot:synthetic-identity-provider:v1",
    providerVersion: "closed_pilot_synthetic_provider.v1",
    referencePrefix: "urn:ipo.one:closed-pilot:synthetic-evidence",
    idempotencyPrefix: "production-sandbox-synthetic-identity-v1",
    hashNamespace: "production_sandbox_synthetic_identity"
  })
});

function createSyntheticIdentityProvider({ pool, profile }) {
  const configuration = SYNTHETIC_IDENTITY_PROFILES[profile];
  if (!configuration || typeof pool?.connect !== "function") {
    throw new TypeError("Synthetic identity Provider configuration is invalid");
  }
  return Object.freeze({
    async ensure({ authenticationContext, subjectId, consentId }) {
      const tenantContext =
        createTenantSecurityContextFromAuthentication(authenticationContext);
      const lockKey =
        `${configuration.lockNamespace}:${authenticationContext.tenantId}:${consentId}`;
      const eventRepository = new PostgresEventRepository({ pool, tenantContext });
      const coreRepository = new PostgresCoreRepository({ pool, eventRepository });
      return coreRepository.withTenantTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
        const page = await coreRepository.listHumanIdentityReferencesForSubjectInTransaction(
          client,
          subjectId,
          { limit: 50 }
        );
        const requiredPurposes = [
          "identity_reference_use",
          "credit_decision",
          "credit_offer_acceptance"
        ];
        const existing = page.items.find((item) => (
          item.consentId === consentId &&
          item.status === "active" &&
          requiredPurposes.every((purpose) => item.purposeCodes.includes(purpose))
        ));
        if (existing) return existing;

        const consent = await coreRepository.getConsentRecordInTransaction(client, consentId);
        // The Consent timestamp is derived from the database-backed admission lock.
        // Reuse the database clock here so small host/database clock skew cannot make
        // an immediately issued Consent appear to be in the future.
        const clock = await client.query("SELECT clock_timestamp() AS now");
        const now = new Date(clock.rows[0].now);
        const expiresAt = new Date(Math.min(
          new Date(consent.expiresAt).getTime(),
          now.getTime() + 30 * 86_400_000
        ));
        const reference = createHumanIdentityReference({
          subjectId,
          principalId: consent.principalId,
          consent,
          referenceType: "kyc_reference",
          providerRef: configuration.providerRef,
          providerVersion: configuration.providerVersion,
          referenceRef: `${configuration.referencePrefix}:${consentId}`,
          assuranceLevel: "synthetic_provider_asserted",
          purposeCodes: requiredPurposes,
          validFrom: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          now
        });
        const event = createCreditEvent({
          eventType: CreditEventType.IDENTITY_REFERENCE_RECORDED,
          subjectId,
          payload: {
            identityReferenceId: reference.identityReferenceId,
            identityReferenceHash: reference.identityReferenceHash,
            referenceEvidenceHash: reference.referenceEvidenceHash,
            consentId,
            syntheticOnly: true,
            productionVerified: false,
            actorId: authenticationContext.actorId
          },
          now
        });
        await coreRepository.commitCommandInTransaction(client, {
          aggregateType: "human_identity_reference",
          aggregateId: reference.identityReferenceId,
          idempotencyKey: `${configuration.idempotencyPrefix}-${consentId}`,
          commandHash: hashId(configuration.hashNamespace, {
            tenantId: authenticationContext.tenantId,
            subjectId,
            consentId
          }),
          events: [{
            aggregateType: "human_identity_reference",
            aggregateId: reference.identityReferenceId,
            expectedVersion: 0,
            event
          }],
          writes: [{
            type: "human_identity_reference",
            value: reference,
            eventId: event.eventId
          }],
          response: { identityReferenceId: reference.identityReferenceId }
        });
        const directory = new PostgresAuthorizationDirectory({
          client,
          authenticationContext
        });
        await directory.registerResource({
          resourceType: "human_identity_reference",
          resourceId: reference.identityReferenceId,
          actorBindings: [{
            actorId: authenticationContext.actorId,
            actorType: authenticationContext.actorType,
            relationship: "owner"
          }],
          now
        });
        return reference;
      });
    }
  });
}

export function createLocalSyntheticIdentityProvider({ pool }) {
  return createSyntheticIdentityProvider({ pool, profile: "local" });
}

export function createProductionSyntheticIdentityProvider({ pool }) {
  return createSyntheticIdentityProvider({
    pool,
    profile: "production_sandbox"
  });
}

export function createSyntheticIdentityGateway({ gateway, syntheticIdentity }) {
  if (
    typeof gateway?.execute !== "function" ||
    typeof syntheticIdentity?.ensure !== "function"
  ) {
    throw new TypeError("Synthetic identity Gateway configuration is invalid");
  }
  return Object.freeze({
    async execute(command) {
      if (
        command.operationId === "pilotRequestCredit" &&
        command.authenticationContext?.actorType === "human"
      ) {
        await syntheticIdentity.ensure({
          authenticationContext: command.authenticationContext,
          subjectId: command.resource.resourceId,
          consentId: command.payload.authorityId
        });
      }
      const result = await gateway.execute(command);
      if (
        command.operationId === "pilotCreateConsent" &&
        command.authenticationContext?.actorType === "human"
      ) {
        await syntheticIdentity.ensure({
          authenticationContext: command.authenticationContext,
          subjectId: result.response.subjectId,
          consentId: result.response.consent.consentId
        });
      }
      return result;
    }
  });
}
