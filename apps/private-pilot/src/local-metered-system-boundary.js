import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import { DomainError } from "../../../packages/domain/src/index.js";

// The worker is already enrolled by local bootstrap. Resolve that durable
// credential for every admission, so revocation and expiry remain effective.
export function createLocalMeteredSystemBoundary({ credentialRegistry, identity, referenceHasher }) {
  return Object.freeze({
    async createContext() {
      const context = identity.createContext();
      const credential = await credentialRegistry.findBySubject({
        tenantId: context.tenantId,
        issuer: "https://metered-usage-worker.local.ipo.one",
        externalSubject: "urn:ipo.one:local-worker:metered-usage",
        clientId: context.clientId,
        now: context.authenticatedAt
      });
      const expectedSender = referenceHasher.hash("sender.constraint",
        referenceHasher.hash("local.metered-usage-worker", context.actorId));
      if (credential.tenantId !== context.tenantId || credential.actorId !== context.actorId ||
          credential.actorType !== "system_worker" || credential.clientId !== context.clientId ||
          credential.policyVersion !== context.policyVersion || credential.status !== "active" ||
          credential.clientAuthenticationMethod !== "private_key_jwt" ||
          credential.senderConstraint?.method !== "dpop" || credential.senderConstraint.thumbprint !== expectedSender ||
          JSON.stringify(credential.roles) !== JSON.stringify(context.roles) ||
          JSON.stringify(credential.allowedCapabilities) !== JSON.stringify(context.capabilities)) {
        throw new DomainError("local_metered_worker_binding_rejected", "The enrolled local metered worker binding is unavailable");
      }
      return createAuthenticationContext({ ...context,
        credentialId: credential.credentialId, credentialVersion: credential.version });
    }
  });
}
