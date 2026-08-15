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
  createTenantSecurityContext,
  setTenantTransactionContext
} from "../../../modules/persistence/src/index.js";

async function withTenantTransaction(pool, context, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setTenantTransactionContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createLocalSyntheticIdentityProvider({ pool }) {
  return Object.freeze({
    async ensure({ authenticationContext, subjectId, consentId }) {
      const tenantContext = createTenantSecurityContext({
        tenantId: authenticationContext.tenantId,
        actorId: authenticationContext.actorId,
        policyVersion: authenticationContext.policyVersion,
        source: "local_test"
      });
      const lockClient = await pool.connect();
      const lockKey = `private_pilot_synthetic_identity:${authenticationContext.tenantId}:${consentId}`;
      try {
        await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
        const eventRepository = new PostgresEventRepository({ pool, tenantContext });
        const coreRepository = new PostgresCoreRepository({ pool, eventRepository });
        const page = await coreRepository.withTenantTransaction((client) => (
          coreRepository.listHumanIdentityReferencesForSubjectInTransaction(client, subjectId, { limit: 50 })
        ));
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

        const consent = await coreRepository.getConsentRecord(consentId);
        const now = new Date();
        const expiresAt = new Date(Math.min(
          new Date(consent.expiresAt).getTime(),
          now.getTime() + 30 * 86_400_000
        ));
        const reference = createHumanIdentityReference({
          subjectId,
          principalId: consent.principalId,
          consent,
          referenceType: "kyc_reference",
          providerRef: "urn:ipo.one:private-pilot:synthetic-identity-provider:v1",
          providerVersion: "private_pilot_synthetic_provider.v1",
          referenceRef: `urn:ipo.one:private-pilot:synthetic-evidence:${consentId}`,
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
        await coreRepository.commitCommand({
          aggregateType: "human_identity_reference",
          aggregateId: reference.identityReferenceId,
          idempotencyKey: `private-pilot-synthetic-identity-v2-${consentId}`,
          commandHash: hashId("private_pilot_synthetic_identity", {
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
        await withTenantTransaction(pool, tenantContext, async (client) => {
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
        });
        return reference;
      } finally {
        try {
          await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
        } finally {
          lockClient.release();
        }
      }
    }
  });
}
