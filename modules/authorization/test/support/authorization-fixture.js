import { randomBytes } from "node:crypto";
import { hashId } from "../../../../packages/domain/src/index.js";
import {
  ActorType,
  ClientAuthenticationMethod,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  SenderConstraintMethod,
  createReferenceHasher
} from "../../../authentication/src/index.js";
import { createAuthenticationContext } from "../../../authentication/src/authentication-context.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  AuthorizationPolicyRegistry,
  AuthorizationService,
  InMemoryAuthorizationAuditStore,
  InMemoryAuthorizationDirectory,
  InMemoryLivePolicyAdapter
} from "../../src/index.js";

export const FIXED_NOW = new Date("2026-07-13T12:00:00.000Z");

const HUMAN_ACTORS = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);

export function createAuthorizationHarness({
  maximumAuditEvents = 25_000,
  approvalVerifier,
  authorizationAuditStore
} = {}) {
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const authenticationEvents = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore: authenticationEvents,
    actorDirectory
  });
  const directory = new InMemoryAuthorizationDirectory();
  const auditStore = authorizationAuditStore ?? new InMemoryAuthorizationAuditStore({
    maximumEvents: maximumAuditEvents
  });
  const livePolicyAdapter = new InMemoryLivePolicyAdapter();
  const policyRegistry = new AuthorizationPolicyRegistry();
  const service = new AuthorizationService({
    policyRegistry,
    directory,
    credentialRegistry,
    auditStore,
    referenceHasher,
    livePolicyAdapter,
    approvalVerifier
  });

  function addIdentity({
    tenantId,
    actorId,
    actorType,
    roleBundle,
    capabilities,
    clientId = `client_${actorId}`,
    externalSubject = `subject_${actorId}`,
    membershipId = `membership_${actorId}`,
    now = FIXED_NOW
  }) {
    actorDirectory.register({ actorId, actorType });
    const human = HUMAN_ACTORS.has(actorType);
    const credential = credentialRegistry.register({
      tenantId,
      actorId,
      actorType,
      issuer: "https://issuer.local.test",
      externalSubject,
      clientId,
      clientAuthenticationMethod: human
        ? ClientAuthenticationMethod.OIDC_PKCE_BFF
        : ClientAuthenticationMethod.PRIVATE_KEY_JWT,
      senderConstraint: {
        method: human ? SenderConstraintMethod.HOST_SESSION : SenderConstraintMethod.DPOP,
        thumbprint: "t".repeat(43)
      },
      roles: [roleBundle],
      allowedCapabilities: capabilities,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      performedByActorId: "actor_security_admin",
      reasonCode: "local_authorization_fixture",
      now
    });
    const membership = directory.registerMembership({
      membershipId,
      tenantId,
      actorId,
      actorType,
      roleBundle,
      capabilities,
      clientIds: [clientId],
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      validFrom: now,
      now
    });
    const authenticationContext = createAuthenticationContext({
      tenantId,
      actorId,
      actorType,
      clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      capabilities,
      roles: [roleBundle],
      tokenJtiHash: referenceHasher.hash("token.jti", `jti_${actorId}`),
      authenticationMethod: credential.clientAuthenticationMethod,
      senderConstraintMethod: credential.senderConstraint.method,
      authenticatedAt: now,
      authTime: human ? now : undefined,
      acr: human ? "urn:ipo-one:local:phishing-resistant" : undefined,
      amr: human ? ["webauthn"] : []
    });
    return { authenticationContext, credential, membership };
  }

  return {
    actorDirectory,
    addIdentity,
    auditStore,
    credentialRegistry,
    directory,
    livePolicyAdapter,
    policyRegistry,
    referenceHasher,
    service
  };
}

export function authorizationRequest(authenticationContext, operationId, overrides = {}) {
  return {
    authenticationContext,
    operationId,
    requestId: `request_${operationId}_001`,
    correlationId: `correlation_${operationId}_001`,
    commandPayloadHash: hashId("authorization_test_command_payload", {
      operationId,
      fixture: "default"
    }),
    now: FIXED_NOW,
    ...overrides
  };
}
